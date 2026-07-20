# Backend Standards

Conventions for this Express 5 + MySQL API template. This document describes **how the template is meant to be used** — where code goes, what each layer is responsible for, and the rules every new feature follows.

Stack: Node >= 22, Express 5, ESM (`"type": "module"`), `mysql2/promise` (raw SQL, no ORM at runtime), Sequelize CLI for migrations/seeders only, Passport JWT (RS256), Winston, Zod.

---

## 1. Getting started

```bash
cp .env.example .env          # fill in DB_* and the secrets below
cp .nvmrc.example .nvmrc
npm install
npm run key:generate          # RSA keypair for JWT signing (see §6)
npx sequelize-cli db:migrate
npm run dev                   # nodemon on ./server/bin/www.js
```

The server refuses to start until three startup health checks pass ([www.js:23-95](server/bin/www.js#L23-L95)): database reachable, JWT keys present on disk, and `./logs`, `./public`, `./public/uploads` exist (auto-created). A failure exits the process with code 1 — never start "degraded".

| Script | Purpose |
| --- | --- |
| `npm start` | production start |
| `npm run dev` | nodemon watch |
| `npm run key:generate` | generate JWT RSA keys (§6) |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm run pm2:start` / `pm2:prod` / `pm2:reload` / `pm2:stop` | PM2 via `ecosystem.config.cjs` |

---

## 2. Folder structure

```
backend/
├─ .env.example            # every supported env var, documented, no real values
├─ .sequelizerc            # points sequelize-cli at server/database/*
├─ ecosystem.config.cjs    # PM2
└─ server/
   ├─ bin/
   │  ├─ www.js            # entrypoint: health checks, HTTP/HTTPS, graceful shutdown
   │  └─ generate-keys.js  # `npm run key:generate`
   ├─ config/
   │  ├─ config.cjs        # sequelize-cli DB config (CJS — required by the CLI)
   │  ├─ database.js       # Database class: pool, query(), transactions, healthCheck()
   │  ├─ express.js        # the entire middleware chain + error handlers
   │  └─ logger.js         # Winston: console + daily-rotate files, maskSensitiveData
   ├─ database/
   │  ├─ migrations/       # 2026MMDDnnnnnn-verb-noun.cjs
   │  └─ seeders/          # 2026MMDDnnnnnn-demo-noun.cjs
   └─ src/
      ├─ index.js          # mounts route.js under /api
      ├─ routes/
      │  ├─ route.js       # mounts /v1/* route modules
      │  └─ v1/*.route.js  # one file per domain; mounts controllers
      ├─ controllers/v1/<domain>/*.controller.js
      ├─ middlewares/      # cross-cutting request handling
      ├─ lib/              # third-party integrations (sendgrid, xendit, qr)
      └─ utils/            # pure-ish helpers (no Express coupling where avoidable)
         ├─ file/          # uploads, compression, integrity, unlink
         └─ hashing/       # argon2 (passwords), bcrypt (legacy/secondary)
```

Rules:

- **One responsibility per folder.** A file that talks to a third-party HTTP API belongs in `lib/`, not `utils/`. A file that inspects `req`/`res` belongs in `middlewares/`, not `utils/`.
- **Versioned URLs, versioned folders.** `/api/v1/...` maps to `routes/v1/` and `controllers/v1/`. A breaking change means a `v2` folder, never an in-place edit of `v1`.
- **`server/` is the only source root.** Lint and format globs (`server/**/*.js`) assume it.
- Assets that ship with the code (email templates, QR fonts, badge templates) live next to the module that reads them, under `lib/`.

---

## 3. Request flow

Order matters — this is the chain built in [express.js](server/config/express.js):

```
trust proxy → morgan → securityHeaders (helmet/cors/hpp) → requestId → bot filter
→ json/urlencoded (2mb) → cookieParser → compression → sanitizeMiddleware
→ static /public → passport.initialize → responseWrapper → loggerMiddleware
→ req.db injection → /api routes
→ csrfErrorHandler → APIError normalizer → 404 → final formatter
```

Consequences you must respect when adding middleware:

- Anything that reads `req.body` goes **after** the body parsers and **after** `sanitizeMiddleware`.
- Anything that logs goes **after** `requestIdMiddleware` so `req.requestId` correlates.
- Error handlers must take **four** arguments (`err, req, res, next`) or Express treats them as normal middleware.
- New error handlers go **before** the final formatter, never after.

### Adding an endpoint

1. `server/src/controllers/v1/<domain>/<name>.controller.js` — export an `express.Router()`.
2. `server/src/routes/v1/<domain>.route.js` — `router.use("/<segment>", controller)`.
3. `server/src/routes/route.js` — `router.use("/v1/<domain>", domainRoute)` if the domain is new.

Import paths **must** include the `.js` extension — this is native ESM, not bundled. (`auth.route.js` currently imports `auth.controller` without one; that is a bug, not the pattern.)

---

## 4. Layer contracts

### Controllers

Thin. Validate → call data access → respond. No `try/catch` boilerplate: wrap handlers in `catchAsync` and throw `APIError` for anything the client should see.

```js
import { Router } from "express";
import passport from "passport";
import { catchAsync, validateBody } from "../../../utils/catchAsync.js";
import APIError, { ERROR_CODES } from "../../../utils/APIError.js";

const router = Router();

router.post(
  "/",
  passport.authenticate("jwt", { session: false }),
  validateBody(createUserSchema),
  catchAsync(async (req, res) => {
    const [existing] = await req.db.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [req.body.email]
    );
    if (existing) {
      throw new APIError("Email already registered", 409, ERROR_CODES.DUPLICATE_ENTRY);
    }

    const user = await createUser(req.db, req.body);
    return res.sendSuccess("User created", user, 201);
  })
);

export default router;
```

### Responses

Never call `res.json()` directly. `responseWrapper` attaches:

- `res.sendSuccess(message, data, statusCode = 200)`
- `res.sendError(message, error, statusCode = 400)`

Every response is `{ success, message, data }` or `{ success, message, code, error }`. The `code` is a machine-readable string from `ERROR_CODES` in [APIError.js](server/src/utils/APIError.js) — the frontend branches on `code`, never on `message`. Add new codes to that enum rather than inventing string literals at the throw site.

### Errors

Throw `new APIError(message, status, code)`. Rules enforced by the final handler:

- 4xx messages are shown to the client in all environments — write them for humans.
- 5xx messages are hidden in production unless `isPublic`. Never leak SQL, paths, or stack traces into a 5xx message.
- Stack traces are returned only when `NODE_ENV=development`.

### Validation

Zod at the boundary, via `validateBody(schema)` / the sibling helpers in [catchAsync.js](server/src/utils/catchAsync.js). Schemas live next to the controller that uses them. Validation replaces `req.body` with the parsed value — downstream code can assume types. Never hand-roll `if (!req.body.x)` checks in a controller.

### Database access

`req.db` is the shared `Database` instance ([database.js](server/config/database.js)) — one pool for the process, injected per request. Do not construct a second pool or import the pool directly into a controller.

- `db.query(sql, params, timeout = 30000)` — always parameterized. String interpolation into SQL is prohibited; `multipleStatements` is off, so a "clever" concatenation will simply fail.
- Queries over 1s are logged as slow. Design for indexed lookups and `LIMIT`.
- Transactions: `const conn = await db.beginTransaction()` → work on `conn` → `db.commit(conn)` / `db.rollback(conn)`. Both release the connection; a transaction that escapes without one leaks a pool slot.
- Storage is **UTC** (`timezone: "Z"`). Convert for display only, using `TIMEZONE` and the helpers in [dateUtils.js](server/src/utils/dateUtils.js).
- `namedPlaceholders` is enabled — `:name` params are available when they read better than `?`.

### Migrations & seeders

Sequelize CLI drives schema; the runtime does not use Sequelize models. Files are `.cjs` (the CLI requires CommonJS in an ESM package).

- Name: `<YYYYMMDD><nnnnnn>-<verb>-<table>.cjs`, e.g. `20260121000001-create-users.cjs`.
- Every migration implements a real `down`. Irreversible migrations must say so in a comment and be split so the destructive step is isolated.
- Schema changes ship as migrations only — never `ALTER TABLE` by hand on any environment.
- Seeders create demo/reference data and must be idempotent-safe to re-run against a fresh DB.

### Logging

- `logger` / `httpLogger` from [logger.js](server/config/logger.js); per-request `req.logger` from `loggerMiddleware`. Prefer `req.logger` inside request handling so entries carry the request ID.
- `console.log` is for the `development` branch only. Do not commit it in a code path that runs in production.
- Sensitive fields (`password`, `pin`, `email`, tokens) go through `maskSensitiveData` / [piiSanitizer.js](server/src/utils/piiSanitizer.js) before they reach a log. `LOG_SALT` seeds the hashing of identifiers so they stay correlatable without being readable.
- Levels: `error` = needs attention, `warn` = degraded but handled, `info` = lifecycle/business events, `debug` = development detail.

### Security

Already wired — use it, don't reimplement it:

| Concern | Where |
| --- | --- |
| Headers, CORS, HPP, XSS sanitization | [security.js](server/src/utils/security.js) |
| CSRF (double-submit cookie) | [csrf.middleware.js](server/src/middlewares/csrf.middleware.js) |
| Rate limiting (profiles: api, auth, upload, pwreset, csrf, strict) | [rateLimiter.js](server/src/middlewares/rateLimiter.js) |
| Idempotency for unsafe writes | [idempotency.middleware.js](server/src/middlewares/idempotency.middleware.js) |
| SSRF guard for outbound URLs | [ssrf.middleware.js](server/src/middlewares/ssrf.middleware.js) |
| Circuit breaker for flaky upstreams | [circuitBreaker.js](server/src/utils/circuitBreaker.js) |
| Password hashing | [argonHash.js](server/src/utils/hashing/argonHash.js) — Argon2id for new passwords |
| Upload validation, magic-byte checks, compression | [utils/file/](server/src/utils/file/) |

Apply `csrfProtection` to every state-changing route reachable from a browser. Apply an appropriate rate-limit profile to every public route — `auth` for login/register, `pwreset` for password flows, `upload` for multipart. Apply `idempotencyMiddleware` to any POST that creates money-moving or externally-visible side effects; clients then send an `Idempotency-Key` header.

For clustered deployments (PM2 cluster mode), set `RATE_LIMIT_STORE=redis` or `mysql` — the default `memory` store counts per-process and silently multiplies your limits.

---

## 5. Code style

- ESM only. `.js` for ESM, `.cjs` for the files tooling requires in CommonJS (`config.cjs`, migrations, seeders, `ecosystem.config.cjs`).
- Prettier + ESLint are authoritative; run `npm run lint:fix && npm run format` before committing.
- Naming: files `camelCase.js`, layered files `<name>.<layer>.js` (`auth.controller.js`, `csrf.middleware.js`, `cms.route.js`). Classes `PascalCase`, functions/variables `camelCase`, env vars as they appear in `.env.example`.
- Exports: routers and classes default-export; utilities named-export.
- JSDoc on anything exported from `utils/`, `lib/`, or `middlewares/` — parameters, return, and thrown errors.
- Async everywhere; no callbacks except where a library dictates. No floating promises.
- Never commit merge-conflict markers. (`utils/hashing/argonHash.js` and `utils/file/uploads.js` currently contain unresolved `<<<<<<<` markers — those files will not parse and must be fixed before the template is used.)

---

## 6. JWT keys — `npm run key:generate`

Auth is RS256: the private key signs, the public key verifies ([passport.jwt.config.js](server/src/middlewares/passport.jwt.config.js) pins `algorithms: ['RS256']`, so `alg: none` and HMAC confusion attacks are rejected).

```bash
npm run key:generate                     # ./auth-keys, RSA-2048
npm run key:generate -- --bits 4096      # stronger modulus
npm run key:generate -- --dir ./keys     # custom directory
npm run key:generate -- --force          # rotate (refuses to overwrite otherwise)
```

Produces three files in `auth-keys/`:

| File | Format | Role |
| --- | --- | --- |
| `public.pem` | SPKI | verifies tokens — `jwtAuthPublicPath`. Safe to distribute. |
| `private.pem` | PKCS#8, AES-256-CBC encrypted | at-rest copy. Back this up; useless without the passphrase. |
| `decrypted_private_key.pem` | PKCS#8, plaintext | signs tokens — `jwtAuthPrivatePath`. Secret. |

The passphrase comes from `KEY_PASSPHRASE`; if unset the script generates a random one and prints it **once**. Store it in your secrets manager — it is never written to disk. Files are written `0600` (owner-only) on POSIX.

Then set in `.env`:

```
jwtAuthPath=./auth-keys
jwtAuthPublicPath=./auth-keys/public.pem
jwtAuthPrivatePath=./auth-keys/decrypted_private_key.pem
ISSUER=teranetwork-billing
AUDIENCE=teranetwork-billing-users
EXPIRY=24h
```

> Note: the code reads `jwtAuthPublicPath` and `jwtAuthPrivatePath`; `.env.example` currently only documents `jwtAuthPath`. All three must be present.

Rules:

- `auth-keys/` is git-ignored. Keys never enter version control, a Docker image layer, or a CI log.
- Each environment gets its own keypair. Never copy production keys to staging or a laptop.
- Rotation (`--force`) invalidates every JWT signed with the old key — all sessions end. Plan it, or run a dual-key verification window before flipping the signing key.
- If `decrypted_private_key.pem` is ever exposed, rotate immediately; a leaked signing key lets anyone mint valid tokens for any user.

### Other secrets

`CSRF_SECRET` and `LOG_SALT` are independent of the keypair:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`cryptoKey` (AES-256 for [crypto.js](server/src/utils/crypto.js)) is only needed if you encrypt payloads/URL parameters. All secrets are per-environment and never committed.

---

## 7. Pre-commit checklist

- [ ] `npm run lint` and `npm run format:check` pass
- [ ] No `console.log` outside a `NODE_ENV === "development"` branch
- [ ] All SQL parameterized; transactions commit or roll back on every path
- [ ] New routes: validated, rate-limited, CSRF-protected if browser-reachable
- [ ] Errors thrown as `APIError` with a code from `ERROR_CODES`
- [ ] Schema changes are migrations with a working `down`
- [ ] No secrets, `.env`, or `auth-keys/` in the diff
- [ ] New env vars documented in `.env.example` with a safe placeholder
