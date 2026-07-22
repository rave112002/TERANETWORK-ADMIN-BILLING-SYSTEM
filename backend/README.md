# TeraNetwork Admin & Billing System — Backend

Node.js / Express API using Sequelize (migrations) + raw `mysql2` pool at runtime, JWT (RS256) auth, and Winston logging.

## Prerequisites

- **Node.js >= 22** (see `.nvmrc.example` / `engines` in `package.json`)
- **MySQL 8.x** running and reachable
- **npm** (ships with Node)

## First-time setup

Run these steps in order from the `backend/` directory.

### 1. Install dependencies

```bash
npm install
```

### 2. Create your environment file

```bash
npm run env:example
```

This copies `.env.example` to `.env` (it won't overwrite an existing `.env`). Then open `.env` and fill in the required values.

**Required variables:**

| Variable | Description |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_DATABASE` | MySQL connection details |
| `jwtAuthPath` | Directory holding the JWT keys (default `./auth-keys`) |
| `jwtAuthPublicPath` | Path to the public key that **verifies** tokens (default `./auth-keys/public.pem`) |
| `jwtAuthPrivatePath` | Path to the decrypted private key that **signs** tokens (default `./auth-keys/decrypted_private_key.pem`) |
| `CSRF_SECRET` | Random 64-char secret |
| `LOG_SALT` | Random 32-char salt |

> **Note:** `jwtAuthPublicPath` and `jwtAuthPrivatePath` must be set. They are read at startup — if either is missing the app crashes on boot with `ERR_INVALID_ARG_TYPE: The "paths[0]" argument must be of type string`.

Generate random secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Generate JWT signing keys

```bash
npm run key:generate
```

This writes `public.pem`, `private.pem`, and `decrypted_private_key.pem` into `./auth-keys` and prints the exact env values to paste into `.env`. The `auth-keys/` folder is git-ignored — never commit these files.

### 4. Create the database

Create an empty MySQL database matching `DB_DATABASE` in your `.env`:

```sql
CREATE DATABASE teranetwork_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 5. Run migrations and seed data

```bash
npm run db:migrate
npm run db:seed
```

Or do both plus a clean slate in one step:

```bash
npm run db:reset
```

## Running the app

```bash
npm run dev     # development, with auto-reload (nodemon)
npm start       # plain node
```

When it boots correctly you'll see startup health checks pass followed by a `✓ SERVER READY` banner. It listens on `PORT` (default `3000`).

## Available scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm start` | Start with node |
| `npm run env:example` | Create `.env` from `.env.example` (skips if `.env` exists) |
| `npm run key:generate` | Generate JWT RSA key pair into `auth-keys/` |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:migrate:undo` | Revert the last migration |
| `npm run db:migrate:undo:all` | Revert all migrations |
| `npm run db:migrate:status` | Show migration status |
| `npm run db:seed` | Run all seeders |
| `npm run db:seed:undo` | Undo all seeders |
| `npm run db:reset` | Undo all → migrate → seed |
| `npm run lint` / `npm run lint:fix` | ESLint |
| `npm run format` / `npm run format:check` | Prettier |

## Troubleshooting

**The server exits immediately with no output.**
Fatal startup errors are now printed to the terminal, but they are also written to `logs/exceptions.log` (uncaught exceptions) and `logs/rejections.log` (unhandled promise rejections). Check those files for the full stack trace. Runtime errors go to `logs/error-*.log` and `logs/combined-*.log`.

**`ERR_INVALID_ARG_TYPE: The "paths[0]" argument must be of type string`.**
A JWT key path env var is missing. Make sure `jwtAuthPublicPath` and `jwtAuthPrivatePath` are set in `.env` and that the key files exist (run `npm run key:generate`).

**`FATAL: Missing required database environment variables`.**
Set `DB_HOST`, `DB_USER`, `DB_PASS`, and `DB_DATABASE` in `.env`.

**Database connection test failed.**
Verify MySQL is running, the credentials are correct, and the database named in `DB_DATABASE` exists.
