# Phase 1 — Foundation · Progress Summary

**Status:** ✅ Complete
**Scope:** Auth/RBAC, audit logging, encrypted credentials, full domain CRUD (billing + network inventory), subscriptions lifecycle, and the admin UI for all of it (including the topology tree + NAP map).

Roadmap: **[Phase 1 Foundation ✅]** → OLT control (Phase 2) → Billing (Phase 3) → Xendit (Phase 4) → Dunning (Phase 5) → Dashboards & hardening (Phase 6).

---

## 1. What Phase 1 delivered (in plain terms)

A working, secured admin console where staff can log in and manage:

- **Billing side (BSS):** service plans, customers, and subscriptions (with a real lifecycle: pending → active → suspended → terminated).
- **Network side (OSS):** the full fiber inventory — OLTs → PON ports → splitters → NAPs → ONUs — plus a visual topology tree and a map of NAP locations.

Everything is behind login + role-based permissions, every sensitive change is written to an immutable audit log, and OLT device credentials are stored encrypted (never plaintext). No device is contacted yet — that's Phase 2.

---

## 2. Key decisions locked in during Phase 1

| Decision         | Choice                                                                | Notes                                                                              |
| ---------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| DB column naming | `snake_case` + `BIGINT UNSIGNED` keys                                 | Matches the implementation plan and frontend standard.                             |
| Repo layout      | Existing `backend/` (Express template) + `frontend/` (React template) | We followed the on-disk templates, not the spec's idealized `apps/*` monorepo.     |
| Auth storage     | `password_hash` on `users` + separate `refresh_tokens` table          | Dropped the template's leftover `credentials` table.                               |
| Email            | Keep everything behind one `sendEmail()` interface                    | Provider (Gmail/SendGrid/SES) stays swappable — deferred to Phase 3.               |
| Frontend design  | Satoshi font + neutral palette (jet/onyx/graphite/ash/platinum)       | Minimalist, monochrome; color reserved for statuses/charts. Ant Design + Tailwind. |
| Money            | `DECIMAL(12,2)` everywhere                                            | Never floating-point.                                                              |

---

## 3. Backend — what was built

### 3.1 Database (Sequelize CLI migrations, MySQL 8 `teranetwork_db`)

Migrations, in order:

1. `20260121000001-create-users` — staff accounts (`role` enum: super_admin/billing/noc/auditor, `status`, optional `totp_secret_enc`).
2. `20260121000002-create-refresh-tokens` — hashed refresh tokens (SHA-256), FK → users.
3. `20260121000003-create-idempotency-keys` — (template-provided) idempotency ledger.
4. `20260121000004-create-audit-logs` — append-only audit trail (actor/entity/action/before/after JSON/ip).
5. `20260121000005-create-plans` — service plans, money as `DECIMAL(12,2)`.
6. `20260121000006-create-customers` — subscribers; required email, generated `account_no` (ACC-000123), optional GPS.
7. `20260121000007-create-olts` — OLTs with `credentials_enc VARBINARY(2048)` (envelope-encrypted), unique `name`.
8. `20260121000008-create-pon-ports` — FK → olts, composite unique `(olt_id, port_index)`.
9. `20260121000009-create-splitters` — polymorphic parent (`parent_type` + `parent_id`), no FK (validated in service layer).
10. `20260121000010-create-naps` — FK → splitters, required GPS.
11. `20260121000011-create-onus` — unique serial + MAC, denormalized `olt_id`/`pon_port_id`, unique `(nap_id, nap_port)`, `provisioning_state`.
12. `20260121000012-create-subscriptions` — FKs → customers/plans/onus (onu_id unique), `statement_day` (1–28), lifecycle `status`.

Seeder: `20260121000001-demo-users` — one `super_admin` (`admin@teranetwork.local` / `Admin123!`, argon2id).

> Dev note: a `noc@teranetwork.local` user (role `noc`, same password) was created directly in the DB during RBAC testing; it is not in a seeder.

### 3.2 Auth & security

- **Login** `POST /api/v1/auth/login` — validates email/password (Zod), verifies argon2id hash, issues a JWT access token (RS256, keys from `npm run key:generate`) + a refresh token stored **hashed**. Generic "Invalid email or password" for both unknown-email and bad-password. Rate-limited (`authLimiter`).
- **Protected route** `GET /api/v1/auth/me` — passport JWT strategy (fixed from the template's broken stub) loads the user and checks `status`.
- **RBAC** — `requireRole(...roles)` middleware guards writes by role.
- **Audit** — `writeAudit(conn, entry)` + `getAuditContext(req)`; every mutation writes an audit row **inside the same transaction** as the change (proven atomic: rollback leaves no audit row).
- **Credential encryption** — `utils/credentialCrypto.js`: envelope encryption (per-record AES-256-GCM data key wrapped by a master key `CREDENTIAL_MASTER_KEY`); tamper-detected; never logged or returned by the API.

### 3.3 API surface (all behind JWT auth; writes role-gated; transactional + audited)

- **Billing (`/api/v1/cms`)**
  - `plans` — list/get/create/update, soft-delete (deactivate); roles super_admin/billing.
  - `customers` — list (search + pagination)/get/create/update, soft-delete; generated account_no.
  - `subscriptions` — list (filter customer_id/status + pagination)/get/create/update, plus `POST /:id/status` state-machine endpoint (activate/suspend/reactivate/terminate; terminate frees the ONU). No hard delete.
- **Network (`/api/v1/network`)**
  - `olts` — CRUD, credentials encrypted on write, retire (soft-delete); roles super_admin/noc.
  - `pon-ports` — CRUD (FK to OLT; friendly 400/409 on FK/duplicate).
  - `splitters` — CRUD (polymorphic parent validated in service layer; self-parent blocked).
  - `naps` — CRUD (FK to splitter; required GPS).
  - `onus` — CRUD (MAC normalized/validated; multiple FKs; unique NAP port; search/filter/pagination).

### 3.4 Template bugs fixed along the way

- Resolved Git **merge-conflict markers** in `security.js`, `argonHash.js`, `bcryptHash.js`, and `utils/file/*` (would not parse).
- Standardized argon2 hashing (argon2id hash + verify).
- Fixed passport JWT config (empty query + inverted status check).
- Fixed auth route (missing `.js` extension, double `/auth` mount).

---

## 4. Frontend — what was built

Stack: React 19 + Vite + Ant Design 5 + Tailwind 4 + React Query 5 + Zustand + Axios.

### 4.1 Design system

- **Satoshi** variable font self-hosted (`@font-face` in `index.css`), set as the global + Ant Design font.
- **Palette tokens** (Tailwind `@theme`): `jet` #1A1A1A (primary), `onyx`, `graphite`, `ash`, `platinum` #E0E0E0.
- **Ant Design `ConfigProvider`**: Jet Black primary, dark sider/header, 8px radius. Status colors retained for meaning.

### 4.2 Auth & shell

- `useAuthStore` (Zustand, persisted to sessionStorage): token + user + role.
- `axios.js` wired to the store (fixed the template's broken import paths); 401 → refresh flow (falls back to logout since no refresh endpoint yet).
- Login page (themed, validated) → `useLoginMutation`.
- Route guards `Auth` / `UnAuth`; protected CMS shell with dark sider, user display, logout.
- `CMSLayout` supports **grouped/collapsible** menu sections with auto-open of the active group.

### 4.3 Screens (all: table + search/sort via `useTableColumns`, create/edit modal, status actions)

- **Dashboard** — shows the signed-in user + role.
- **Billing group:** Service Plans, Customers, Subscriptions (lifecycle buttons reflect the state machine).
- **Network group:** Topology, OLTs (credentials sub-form; never displays stored creds), PON Ports, Splitters (dependent parent dropdown), NAPs, ONUs.
- **Topology** — client-built OLT→PON→splitter→NAP→ONU tree (Ant `Tree`) + `NetworkMap` (react-leaflet, CartoDB Voyager tiles) with an expand-to-modal view.

### 4.4 Frontend fixes / additions

- Installed missing libs the template assumed: `zustand`, `axios`, `zod`, `dayjs`, `clsx`, `react-highlight-words`, `he`, `react-leaflet`, `leaflet`.
- Added `@store` / `@services` aliases (Vite + jsconfig).
- Fixed `useTableColumns` broken imports (`heDecode`, `sortHelper`); renamed `itemFormat.js` → `.jsx` (JSX in `.js`).
- React gotcha noted: numeric flags (`1`/`0`) use `x ? … : null`, not `x && …`.

---

## 5. How to run (dev)

**Backend** (`backend/`): MySQL 8 running; `.env` configured; then:

```
npm install
npm run key:generate
npx sequelize-cli db:create
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all
npm run dev            # http://localhost:3000
```

**Frontend** (`frontend/`):

```
npm install
# .env: VITE_BASE_URL=http://localhost:3000
npm run dev            # http://localhost:5173
```

Log in: `admin@teranetwork.local` / `Admin123!`.

---

## 6. Known gaps / deferred to later phases

- **No `/auth/refresh` endpoint yet** — a 401 sends the user back to login (access tokens last 24h in dev). Add a cookie-based refresh later.
- **`provisioning_state` on ONUs is freely settable via CRUD for now** — in Phase 5 the `active`/`suspended` transitions will be restricted to the provisioning worker (only after a confirmed device command).
- **No device communication** — activate/suspend are DB-only lifecycle changes today. Phase 2 introduces the OLT driver + MockOltDriver.
- **Email** — not yet wired; behind a future `sendEmail()` interface (Phase 3).
- Customer/ONU lists load a large page and filter client-side; switch to server-side paging if datasets grow very large.

---

## 7. Definition of Done — Phase 1 checklist

- [x] Auth (login, JWT RS256, hashed refresh tokens) + RBAC guards
- [x] Immutable audit logging in-transaction on every mutation
- [x] Envelope-encrypted OLT credentials (never plaintext/logged/returned)
- [x] CRUD: users(seed), plans, customers, subscriptions (+ lifecycle state machine)
- [x] CRUD: OLTs, PON ports, splitters, NAPs, ONUs (with FK/constraint handling)
- [x] Admin UI for all of the above (themed, searchable tables, modals)
- [x] Topology tree + NAP map
- [x] `docker compose`/local run documented (local MySQL + two dev servers)

_Next: **Phase 2 — OLT control** (driver interface, MockOltDriver, manual activate/deactivate from the UI with logging + dry-run mode)._
