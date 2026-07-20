# ISP Admin & Billing Platform — Implementation Plan
### Companion to `ISP-Admin-Billing-System-Prompt.md` · Written for Claude Opus 4.8 / any capable coding agent

> **How to use this document:** Paste it into the coding agent **together with the master spec**. The master spec is the source of truth for requirements; this document is the execution plan — the order of work, the schema to migrate first, and the definition of done per step. Where the two conflict, the master spec wins. Wherever the spec says "verify against current docs" (Xendit endpoints, OLT CLI syntax), do so before writing code.

---

## 1. Architecture summary

**Pattern:** modular monolith API + separately deployable provisioning worker, coordinating through a **MySQL-backed `jobs` table** (no Redis/BullMQ). The API enqueues jobs (inserts rows); the worker claims and processes them. The API never opens a session to an OLT.

| Component | Runtime | Responsibility | Network placement |
|---|---|---|---|
| `apps/web` | React (Vite) + Ant Design (`antd`) + react-leaflet (Tailwind for layout only) | Admin dashboard, topology tree, NAP map, billing screens | **Local LAN** (served over HTTPS on the on-site box) |
| `apps/api` | Node.js (ES modules, JavaScript) + Express | REST API, RBAC, billing cycle engine, dunning sweep (enqueues only), Xendit webhook, email dispatch, discovery/reconciliation, reporting | **On-site box (local).** Internet: outbound to Xendit + email, inbound only to `/webhook/xendit` (that path only, HTTPS + signature-verified; admin UI stays LAN-only). Webhook is primary; outbound Xendit polling is the safety net. |
| `apps/provisioning-worker` | Node.js worker loop (polls the `jobs` table) | Claims `provisioning` jobs (`SELECT … FOR UPDATE SKIP LOCKED`), resolves ONU→OLT→driver, executes device commands, writes `network_action_logs` | **Same on-site box / LAN as the OLT.** Reaches the OLT management VLAN (e.g. `192.168.88.10`) directly — no VPN needed since everything is local. May even run in the same process as the API for a single-OLT site. |
| `integrations/mikrotik` | RouterOS API client (`node-routeros` / REST) | Reads PPPoE secrets (accounts) + active PPPoE sessions for Discovery (§3.1.1). Read-only for now. | **Local LAN** — reaches the MikroTik router directly |
| `packages/database` | Prisma schema + migrations + seed | Single schema shared by API and worker | — |
| `packages/olt-drivers` | Driver interface + vendor drivers + MockOltDriver | `activateOnu`, `deactivateOnu`, `getOnuStatus`, `listOnus` | Used only by the worker (and dev tools) |
| MySQL 8 | InnoDB, utf8mb4 | System of record | Private |
| `node-cron` (in `apps/api`) | In-process time scheduler | Fires `billing-cycle`, `dunning-sweep`, `reminders`, `reconciliation`, `status-poll` on schedule (Asia/Manila). **Only enqueues jobs** — carries out no device/email work itself. | Runs inside the API process |
| MySQL `jobs` table | Durable work queue (replaces Redis+BullMQ) | Holds `provisioning` and `email` jobs; retries/backoff/dead-letter/cancellation/concurrency live in table columns + worker logic; directly inspectable via SQL | Private (shared by API + worker) |

**Data-flow invariants (enforce these everywhere):**

1. All device I/O goes through a `provisioning` job in the `jobs` table, run by the worker. No OLT calls inside HTTP handlers.
2. State transitions to `suspended`/`active` on an ONU happen **only after** a confirmed device response, inside the worker, in a transaction with the `network_action_logs` insert.
3. Every money value is `DECIMAL(12,2)`. Every timestamp is stored UTC; statement/due/disconnect dates are computed in `Asia/Manila`.
4. Every external event (Xendit webhook, email provider webhook) is recorded raw before processing and de-duplicated by provider event ID.
5. Every sensitive mutation writes an `audit_logs` row (actor, before, after) in the same transaction.
6. **Local/on-prem deployment.** Everything runs on one on-site box on the OLT+MikroTik LAN. Internet is **outbound to Xendit + email, and inbound only for Xendit's webhook** — routed to **only** `/webhook/xendit` (HTTPS, signature-verified, rate-limited; admin UI and the rest of the API stay LAN-only). The webhook is the primary settlement path; a lightweight outbound Xendit **polling reconciliation** runs as a safety net so a rare dropped webhook can't strand a paid customer as suspended.
7. **Discovery is read-only against devices and never auto-creates.** OLT/MikroTik reads land in `discovered_items` staging; live customer/subscription/ONU rows are created only on explicit staff import, with an audit row.

**The disconnect/reconnect flow, end to end:**

```
02:00 Asia/Manila (node-cron trigger, API side)
  └─ dunning sweep: SELECT subscriptions with an invoice in status
     ('issued','overdue') AND due_date + grace_days <= today
     AND no active dunning_exemption
     AND status = 'active'
       └─ per subscription: INSERT a row into `jobs`
          { type: 'deactivate', payload: { onuId, subscriptionId, reason: 'dunning' },
            status: 'queued', attempts: 0, dedupe_key: `deactivate:onu:${onuId}` }
          -- unique-ish dedupe_key guard: skip insert if a queued/processing job
             for the same key already exists (re-sweeps don't double-enqueue)

Worker loop (on OLT network) — polls every few seconds
  └─ claim one due job:
     SELECT ... FROM jobs
       WHERE status='queued' AND next_run_at <= NOW()
       ORDER BY id
       LIMIT 1 FOR UPDATE SKIP LOCKED;      -- atomic claim, no two workers grab it
     then UPDATE it to status='processing', locked_at=NOW(), locked_by=<worker id>
  └─ per-OLT concurrency: at most one in-flight job per OLT
     (global concurrency = 1 is fine for a single lab OLT; scale later with a
      per-OLT lock row or by excluding OLTs already 'processing')
  └─ RE-CHECK preconditions against DB (payment may have landed while queued
     → if invoice now paid or exemption exists: UPDATE job status='cancelled', log, exit)
  └─ if global DRY_RUN flag set: log intended command (network_action_logs action='dry_run'), exit
  └─ driver.deactivateOnu() → capture raw device output
  └─ TX: onu.provisioning_state='suspended', subscription.status='suspended',
     insert network_action_logs (success=1), insert audit_logs, UPDATE job status='succeeded'
  └─ INSERT an email job (type='email') into `jobs`: suspension notice with payment link + QR
  └─ on failure: attempts += 1;
        if attempts < max_attempts → status='queued', next_run_at = NOW() + backoff(attempts)  (exponential + jitter)
        else                        → status='dead' (dead-letter) + NOC alert; DB state UNCHANGED

Xendit webhook (API side)
  └─ verify callback token/signature → 401 if bad
  └─ insert webhook_events (unique on provider event id) → duplicate = 200 OK, stop
  └─ TX: validate amount === invoice.total (mismatch → record + flag for
     staff review, do NOT mark paid), insert payments row, set status 'paid'
  └─ if subscription suspended AND balance settled per business rule:
     INSERT job { type: 'activate', ... } + optionally add reconnection-fee line to next invoice
  └─ CANCEL any queued deactivate job for the same subscription:
     UPDATE jobs SET status='cancelled'
       WHERE dedupe_key = `deactivate:onu:${onuId}` AND status='queued';
     (the worker's precondition re-check above is the backstop for any already mid-flight)
```

---

## 2. Database schema (MySQL 8 DDL)

Implement via Prisma migrations; this DDL is the target shape. All tables `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`. All `created_at`/`updated_at` are `TIMESTAMP` defaults `CURRENT_TIMESTAMP` (+ `ON UPDATE` for updated_at) — omitted below for brevity but required on every table.

```sql
-- ── Staff & auth ────────────────────────────────────────────────
CREATE TABLE users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,               -- argon2id
  role          ENUM('super_admin','billing','noc','auditor') NOT NULL,
  status        ENUM('active','disabled') NOT NULL DEFAULT 'active',
  totp_secret_enc VARBINARY(255) NULL                -- optional 2FA
);

CREATE TABLE refresh_tokens (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,               -- sha256 of token
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ── Customers & plans ───────────────────────────────────────────
CREATE TABLE customers (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  account_no VARCHAR(20) NOT NULL UNIQUE,            -- e.g. ACC-000123
  name       VARCHAR(160) NOT NULL,
  email      VARCHAR(190) NOT NULL,                  -- required: invoices are email-only
  phone      VARCHAR(32)  NULL,
  address    VARCHAR(255) NULL,
  gps_lat    DECIMAL(10,7) NULL,
  gps_lng    DECIMAL(10,7) NULL,
  id_type    VARCHAR(40)  NULL,                      -- KYC
  id_number  VARCHAR(64)  NULL,
  status     ENUM('active','inactive') NOT NULL DEFAULT 'active',
  INDEX idx_customers_email (email)
);

CREATE TABLE plans (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(120) NOT NULL,
  down_mbps        INT UNSIGNED NOT NULL,
  up_mbps          INT UNSIGNED NOT NULL,
  monthly_price    DECIMAL(12,2) NOT NULL,
  currency         CHAR(3) NOT NULL DEFAULT 'PHP',
  reconnection_fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  install_fee      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  is_active        TINYINT(1) NOT NULL DEFAULT 1
);

-- ── Network topology (OSS) ──────────────────────────────────────
CREATE TABLE olts (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(120) NOT NULL UNIQUE,
  vendor          ENUM('hsgq','huawei','zte','fiberhome','vsol','bdcom','mock','other') NOT NULL,
  pon_technology  ENUM('epon','gpon') NOT NULL DEFAULT 'epon',   -- HSGQ XE04I = EPON
  model           VARCHAR(80) NULL,
  host            VARCHAR(190) NOT NULL,
  port            SMALLINT UNSIGNED NOT NULL DEFAULT 23,          -- telnet today; 22 once SSH enabled
  protocol        ENUM('ssh','telnet','snmp','tr069') NOT NULL,
  credentials_enc VARBINARY(2048) NOT NULL,          -- envelope-encrypted JSON, never plaintext
  site            VARCHAR(120) NULL,
  status          ENUM('active','maintenance','retired') NOT NULL DEFAULT 'active',
  max_concurrent_sessions TINYINT UNSIGNED NOT NULL DEFAULT 1     -- XE04I: 250MHz CPU, keep 1
);

CREATE TABLE pon_ports (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  olt_id     BIGINT UNSIGNED NOT NULL,
  port_index VARCHAR(32) NOT NULL,                   -- e.g. '0/1/3' (vendor formats vary)
  capacity   SMALLINT UNSIGNED NOT NULL DEFAULT 64,
  status     ENUM('active','down','reserved') NOT NULL DEFAULT 'active',
  UNIQUE KEY uq_pon (olt_id, port_index),
  FOREIGN KEY (olt_id) REFERENCES olts(id)
);

CREATE TABLE splitters (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  parent_type ENUM('pon_port','splitter') NOT NULL,  -- polymorphic parent (cascading)
  parent_id   BIGINT UNSIGNED NOT NULL,
  ratio       ENUM('1:2','1:4','1:8','1:16','1:32','1:64') NOT NULL,
  label       VARCHAR(120) NULL,
  location    VARCHAR(190) NULL,
  INDEX idx_splitter_parent (parent_type, parent_id)
);

CREATE TABLE naps (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  splitter_id BIGINT UNSIGNED NOT NULL,
  label       VARCHAR(120) NOT NULL,
  total_ports TINYINT UNSIGNED NOT NULL DEFAULT 8,
  gps_lat     DECIMAL(10,7) NOT NULL,
  gps_lng     DECIMAL(10,7) NOT NULL,
  notes       TEXT NULL,
  FOREIGN KEY (splitter_id) REFERENCES splitters(id)
);

CREATE TABLE onus (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  serial_no          VARCHAR(64) NOT NULL UNIQUE,
  mac                VARCHAR(17) NULL UNIQUE,
  model              VARCHAR(80) NULL,
  nap_id             BIGINT UNSIGNED NULL,
  nap_port           TINYINT UNSIGNED NULL,
  olt_id             BIGINT UNSIGNED NULL,            -- denormalized for fast driver resolution
  pon_port_id        BIGINT UNSIGNED NULL,
  onu_index          VARCHAR(32) NULL,                -- vendor-side ONU id on the PON
  provisioning_state ENUM('unprovisioned','active','suspended','offline') NOT NULL DEFAULT 'unprovisioned',
  last_rx_dbm        DECIMAL(5,2) NULL,
  last_tx_dbm        DECIMAL(5,2) NULL,
  last_seen_at       DATETIME NULL,
  UNIQUE KEY uq_nap_port (nap_id, nap_port),          -- one ONU per NAP port
  FOREIGN KEY (nap_id) REFERENCES naps(id),
  FOREIGN KEY (olt_id) REFERENCES olts(id),
  FOREIGN KEY (pon_port_id) REFERENCES pon_ports(id)
);

-- ── Subscriptions ───────────────────────────────────────────────
CREATE TABLE subscriptions (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id   BIGINT UNSIGNED NOT NULL,
  plan_id       BIGINT UNSIGNED NOT NULL,
  onu_id        BIGINT UNSIGNED NULL UNIQUE,          -- one active sub per ONU
  statement_day TINYINT UNSIGNED NOT NULL,            -- 1–28 (clamp to avoid month-end bugs)
  status        ENUM('pending','active','suspended','terminated') NOT NULL DEFAULT 'pending',
  activated_at  DATETIME NULL,
  terminated_at DATETIME NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (plan_id)     REFERENCES plans(id),
  FOREIGN KEY (onu_id)      REFERENCES onus(id),
  INDEX idx_sub_status (status)
);

-- ── Billing ─────────────────────────────────────────────────────
CREATE TABLE invoice_counters (                       -- safe sequential numbering
  year    SMALLINT UNSIGNED PRIMARY KEY,
  next_no INT UNSIGNED NOT NULL DEFAULT 1
);
-- Usage inside the generation TX:
-- INSERT ... ON DUPLICATE KEY UPDATE next_no = LAST_INSERT_ID(next_no) + 1;

CREATE TABLE invoices (
  id                   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_no           VARCHAR(24) NOT NULL UNIQUE,   -- INV-2026-000123
  subscription_id      BIGINT UNSIGNED NOT NULL,
  customer_id          BIGINT UNSIGNED NOT NULL,
  billing_period_start DATE NOT NULL,
  billing_period_end   DATE NOT NULL,
  statement_date       DATE NOT NULL,
  due_date             DATE NOT NULL,
  subtotal             DECIMAL(12,2) NOT NULL,
  fees                 DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  tax                  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total                DECIMAL(12,2) NOT NULL,
  status               ENUM('draft','issued','paid','overdue','void') NOT NULL DEFAULT 'draft',
  public_token         CHAR(32) NOT NULL UNIQUE,     -- crypto-random hex; powers /pay/<token> page
  xendit_ref           VARCHAR(64) NULL UNIQUE,
  xendit_payment_url   VARCHAR(512) NULL,
  pdf_path             VARCHAR(255) NULL,
  UNIQUE KEY uq_period (subscription_id, billing_period_start),  -- never double-bill
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id),
  FOREIGN KEY (customer_id)     REFERENCES customers(id),
  INDEX idx_inv_due (status, due_date)
);

CREATE TABLE invoice_lines (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id BIGINT UNSIGNED NOT NULL,
  kind       ENUM('plan','proration','reconnection_fee','install_fee','credit','debit','discount') NOT NULL,
  description VARCHAR(255) NOT NULL,
  qty        DECIMAL(8,2) NOT NULL DEFAULT 1.00,
  unit_price DECIMAL(12,2) NOT NULL,
  amount     DECIMAL(12,2) NOT NULL,                  -- signed: credits negative
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE TABLE payments (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id        BIGINT UNSIGNED NOT NULL,
  amount            DECIMAL(12,2) NOT NULL,
  channel           VARCHAR(40) NOT NULL,             -- GCASH, MAYA, QRPH, VA, CARD, CASH...
  xendit_payment_id VARCHAR(64) NULL UNIQUE,          -- NULL for manual/cash entries
  recorded_by       BIGINT UNSIGNED NULL,             -- staff user for manual payments
  paid_at           DATETIME NOT NULL,
  raw_payload       JSON NULL,
  FOREIGN KEY (invoice_id)  REFERENCES invoices(id),
  FOREIGN KEY (recorded_by) REFERENCES users(id)
);

CREATE TABLE webhook_events (                         -- idempotency ledger for ALL inbound webhooks
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider      ENUM('xendit','email') NOT NULL,
  event_id      VARCHAR(128) NOT NULL,
  event_type    VARCHAR(80) NOT NULL,
  payload       JSON NOT NULL,
  processed_at  DATETIME NULL,
  process_error TEXT NULL,
  UNIQUE KEY uq_provider_event (provider, event_id)
);

-- ── Dunning & provisioning ──────────────────────────────────────
CREATE TABLE dunning_exemptions (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subscription_id BIGINT UNSIGNED NOT NULL,
  reason          VARCHAR(255) NOT NULL,
  created_by      BIGINT UNSIGNED NOT NULL,
  expires_at      DATETIME NOT NULL,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id),
  FOREIGN KEY (created_by)      REFERENCES users(id),
  INDEX idx_exempt_active (subscription_id, expires_at)
);

CREATE TABLE network_action_logs (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  onu_id          BIGINT UNSIGNED NOT NULL,
  action          ENUM('activate','deactivate','status','dry_run') NOT NULL,
  triggered_by    VARCHAR(40) NOT NULL,               -- 'system:dunning', 'system:payment', 'user:<id>'
  job_id          VARCHAR(64) NULL,
  command         TEXT NULL,
  device_response MEDIUMTEXT NULL,
  success         TINYINT(1) NOT NULL,
  error           TEXT NULL,
  FOREIGN KEY (onu_id) REFERENCES onus(id),
  INDEX idx_nal_onu (onu_id, created_at)
);

-- ── Durable work queue (replaces Redis + BullMQ) ────────────────
-- The heart of the "cron + jobs" approach. cron only *inserts* rows here;
-- the worker loop claims and processes them. Everything BullMQ gave us for
-- free (retries, backoff, dead-letter, cancellation, concurrency) is modelled
-- as columns + logic. You can watch the whole system by `SELECT * FROM jobs`.
CREATE TABLE jobs (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type         ENUM('deactivate','activate','status','email') NOT NULL,
  payload      JSON NOT NULL,                        -- e.g. { onuId, subscriptionId, reason } or email fields
  status       ENUM('queued','processing','succeeded','failed','dead','cancelled')
                 NOT NULL DEFAULT 'queued',
  attempts     INT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts INT UNSIGNED NOT NULL DEFAULT 5,
  next_run_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- backoff: push into the future on retry
  dedupe_key   VARCHAR(120) NULL,                    -- e.g. 'deactivate:onu:12' — for idempotent enqueue + cancellation
  locked_at    DATETIME NULL,                        -- set when a worker claims the row
  locked_by    VARCHAR(64) NULL,                     -- which worker instance holds it
  last_error   TEXT NULL,
  -- Partial-unique behaviour (only one live job per key) is enforced in the
  -- service layer before INSERT, since MySQL lacks partial indexes. This index
  -- makes both the "already queued?" check and the claim query fast.
  INDEX idx_jobs_claim (status, next_run_at, id),
  INDEX idx_jobs_dedupe (dedupe_key, status)
);
-- Claim pattern (worker, inside a short TX):
--   SELECT * FROM jobs
--     WHERE status='queued' AND next_run_at <= NOW()
--     ORDER BY id LIMIT 1
--     FOR UPDATE SKIP LOCKED;
--   UPDATE jobs SET status='processing', locked_at=NOW(), locked_by=? WHERE id=?;
-- SKIP LOCKED (MySQL 8.0+) lets multiple workers run without grabbing the same row.

-- ── Device discovery & first-time sync (bootstrap) ──────────────
-- Discovery reads the OLT (ONUs) and MikroTik (PPPoE accounts/sessions) and
-- stages the results here. Staff review buckets (matched/new/orphaned) and
-- explicitly import; nothing here touches the live tables until they do.
CREATE TABLE discovery_runs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source      ENUM('olt','mikrotik') NOT NULL,
  started_by  BIGINT UNSIGNED NULL,                 -- staff user; NULL = scheduled
  started_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  item_count  INT UNSIGNED NOT NULL DEFAULT 0,
  status      ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
  error       TEXT NULL,
  FOREIGN KEY (started_by) REFERENCES users(id)
);

CREATE TABLE discovered_items (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  run_id        BIGINT UNSIGNED NOT NULL,
  source        ENUM('olt','mikrotik') NOT NULL,
  external_key  VARCHAR(120) NOT NULL,              -- MAC (ONU / caller-id) or PPPoE username — the join key
  raw           JSON NOT NULL,                      -- full parsed record (onu-info row, or pppoe secret/session)
  suggested     JSON NULL,                          -- parsed hints (e.g. name/NAP/port from ONU description)
  match_status  ENUM('matched','new','orphaned') NOT NULL,
  matched_entity VARCHAR(40) NULL,                  -- 'onu' | 'customer' | 'subscription'
  matched_id    BIGINT UNSIGNED NULL,
  imported_at   DATETIME NULL,                      -- set when staff import this candidate
  imported_by   BIGINT UNSIGNED NULL,
  FOREIGN KEY (run_id) REFERENCES discovery_runs(id),
  FOREIGN KEY (imported_by) REFERENCES users(id),
  INDEX idx_disc_run (run_id, match_status),
  INDEX idx_disc_key (external_key)
);

-- ── Audit, email, config ────────────────────────────────────────
CREATE TABLE audit_logs (
  id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id  BIGINT UNSIGNED NULL,                     -- NULL = system
  entity    VARCHAR(60) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  action    VARCHAR(60) NOT NULL,
  before_state JSON NULL,
  after_state  JSON NULL,
  ip        VARCHAR(45) NULL,
  INDEX idx_audit_entity (entity, entity_id),
  INDEX idx_audit_actor (actor_id, created_at)
);
-- App-level rule: audit_logs is INSERT-only. Grant no UPDATE/DELETE to the app DB user.

CREATE TABLE email_events (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id      BIGINT UNSIGNED NULL,
  customer_id     BIGINT UNSIGNED NOT NULL,
  type            ENUM('invoice_issued','reminder','overdue','suspension','reconnection','payment_received') NOT NULL,
  provider_msg_id VARCHAR(128) NULL,
  provider_status ENUM('queued','sent','delivered','bounced','opened','failed') NOT NULL DEFAULT 'queued',
  FOREIGN KEY (invoice_id)  REFERENCES invoices(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE system_settings (                        -- runtime-tunable config
  `key`      VARCHAR(80) PRIMARY KEY,                 -- GRACE_DAYS, DRY_RUN, DUNNING_HOUR, ...
  value      VARCHAR(255) NOT NULL,
  updated_by BIGINT UNSIGNED NULL
);
```

**Notes for the implementer:**

- **No partial payments (client decision):** an invoice is binary — unpaid or paid in full. The settlement transaction validates `payment.amount === invoice.total`; on mismatch it records the payment row, flags it in the reconciliation report for staff, and does NOT mark the invoice paid or trigger reconnection. Dunning selects on `status IN ('issued','overdue')` past `due_date + grace`.
- `invoices.public_token` powers the customer-facing read-only invoice page at `/pay/<token>` (Phase 4 step 3). Generate with 128 bits of crypto randomness; this token — never the raw Xendit URL — is what every email link and QR encodes.
- **EPON (HSGQ) identification:** on EPON the ONU's primary identifier is its **MAC address**, not a GPON serial. For HSGQ-managed ONUs, `onus.mac` is required and `onu_index` stores the `pon/onu-id` pair (e.g. `1/27`). Keep `serial_no` for the inventory label printed on the unit.
- `statement_day` is clamped 1–28 to sidestep 29/30/31 edge cases; document this in the UI.
- `splitters.parent_type/parent_id` is polymorphic — enforce validity in the service layer and with a Prisma-level check, since MySQL can't FK it.
- Encrypt `olts.credentials_enc` with envelope encryption: a data key per row, wrapped by a master key from env/KMS. Never log decrypted credentials.
- **Background work = `node-cron` + the `jobs` table (client decision — no Redis/BullMQ).** cron schedules time-based triggers *inside the API* and only ever inserts job rows; the worker loop claims rows with `FOR UPDATE SKIP LOCKED` and owns all retry/backoff/dead-letter/cancellation/concurrency logic. Wrap it in a small `enqueue/claim/complete/fail/cancel` interface so BullMQ can replace the table later without touching callers. **One caveat to design around:** with cron in-process, running two API replicas would fire each schedule twice — for now run a single API instance (or gate cron behind a `RUN_CRON` env flag / a DB leader-lock) so the sweep runs once.

---

## 3. Implementation steps by phase

Follow the master spec's six phases (§9). Each step below is a discrete unit of work with a done-check. Do not start a phase until the previous phase's exit criteria pass.

### Phase 1 — Foundation

1. **Monorepo scaffold** per spec §6: pnpm workspaces (`apps/api`, `apps/web`, `apps/provisioning-worker`, `packages/database`, `packages/olt-drivers`, `packages/shared`). ESLint + Prettier, ES modules, JSDoc types, Zod (or Joi — pick one, use everywhere) for env + request validation. **No Redis** — background work runs on `node-cron` (scheduling) + the MySQL `jobs` table (durable queue). Docker Compose with MySQL 8, api, web, worker, mailhog (dev SMTP catcher — keeps Gmail quota untouched in dev).
2. **Database package**: Prisma schema implementing §2 above; initial migration; seed script (1 super admin, sample plans, mock OLT + topology + 10 customers).
3. **Auth module**: argon2id password hashing, JWT access (15 min) + rotating refresh tokens (hashed at rest), login rate limiting, RBAC middleware `requireRole(...roles)` and `requirePermission(action)` mapping the four roles from spec §2.
4. **Audit plumbing**: a `withAudit(tx, actor, entity, before, after)` helper used by every mutating service; verify it fires in the same DB transaction.
5. **Credential encryption service**: envelope encryption (AES-256-GCM data key wrapped by master key from env), used by the OLT module; unit tests including tamper detection.
6. **CRUD modules + UI**: users, customers, plans, subscriptions (lifecycle transitions validated by a state machine), OLTs, PON ports, splitters, NAPs, ONUs. Capacity endpoints: free ports per PON/splitter/NAP.
7. **Topology + map UI**: tree component rendering OLT→PON→splitter→NAP→ONU; react-leaflet map of NAPs (and customers with GPS), marker click → detail drawer.

**Exit criteria:** all CRUD works behind RBAC; auditor role can read but not mutate; every mutation produces an audit row; topology tree and map render the seed data; `docker compose up` gives a working stack.

### Phase 2 — OLT control

1. **Driver contract** (`packages/olt-drivers/src/driver.interface.js`): documented JSDoc interface — `activateOnu(ctx)`, `deactivateOnu(ctx)`, `getOnuStatus(ctx)`, `listOnus(ctx)` — where `ctx = { host, port, protocol, credentials, ponPortIndex, onuIndex, serialNo }`. Every method returns `{ success, command, rawResponse, parsed }`. Timeouts and session cleanup are the driver's responsibility.
2. **MockOltDriver**: in-memory ONU state, configurable latency and failure rate (env-driven), realistic fake CLI transcripts — this is the backbone of all e2e tests.
3. **HsgqOltDriver — first real vendor driver (HSGQ XE04I, EPON, BDCOM-derived firmware; see `HSGQ_DOCUMENTATION.md`):**
   - **Transport:** telnet client (raw `net` socket or `telnet-client`) against `host:23` today; design the transport as a swappable layer so it becomes `ssh2` the moment SSH is enabled on the device (`ssh-server enable` — do this as a rollout prerequisite, then disable telnet).
   - **Session state machine:** `login (user root) → enable → configure → interface epon <N>`. **Quirk: most `show` commands only work inside config mode**, not enable mode — bake this into prompt-detection (`Tera-Network>`, `#`, `(config)#`, `(config-epon-N)#`).
   - **Command mapping (candidates — MUST be lab-verified on the XE04I bench before production):**
     - `deactivateOnu` → blacklist the ONU **MAC** + `onu-deregister <id>`. Deregister alone is NOT a suspension — the ONU re-registers via MPCP within seconds (the doc's alarm history shows deregister → re-auth in ~33s). The blacklist is what holds it down.
     - `activateOnu` → remove MAC from blacklist + `onu-authorize` (verify whether re-auth is automatic once un-blacklisted).
     - `getOnuStatus` → parse `show onu-info all` / `show onu-info <id>` (auth/config/online columns) and `show optical-rssi <id>` for Rx power.
     - `listOnus` → `show onu-info all` per EPON interface.
   - **Parsers:** unit-tested against real captured transcripts stored in `docs/vendor-transcripts/hsgq-xe04i/`; capture fresh transcripts from the lab bench for every command the driver issues.
   - **Device quirks to encode:** one session per OLT (`max_concurrent_sessions = 1` — 250 MHz CPU); the device clock is unreliable (stuck in year 2000 until NTP is configured) so **never** persist device-reported timestamps — all `network_action_logs` times are server-side; always issue `save` after state-changing commands if the suspend mechanism relies on persisted config (verify whether blacklist survives reboot without `save`).
   - **Bench acceptance test (run on the real lab OLT + Huawei EG8145V5 ONU 1/27 before Phase 5):** deactivate → confirm ONU loses service and stays down > 10 min → activate → confirm service restores → repeat 5× for idempotency.
4. **Provisioning worker app**: a polling loop over the `jobs` table (no BullMQ). Every few seconds it claims one due job with `SELECT … FOR UPDATE SKIP LOCKED` (see §2 DDL claim pattern), flips it to `processing`, and handles job types `deactivate | activate | status`. Resolve ONU→OLT→driver; run the precondition re-check, dry-run branch, transactional state write, and `network_action_logs` insert exactly as in §1's flow. Retries live in table columns: on failure bump `attempts`, and either requeue with exponential backoff + jitter via `next_run_at` (up to `max_attempts`, default 5) or mark `status='dead'` (the dead-letter state) and fire the NOC alert hook (log/webhook for now). Per-OLT concurrency: global concurrency 1 is fine for the single lab OLT; note in code where a per-OLT lock would go for scale. **Build a small shared queue interface** (`enqueue`, `claim`, `complete`, `fail`, `cancel`) so the table implementation could later be swapped for BullMQ without touching callers.
5. **Manual controls UI**: activate/deactivate/status buttons on the ONU page (NOC + super admin only, confirmation dialog), live job status, and a network-action log viewer showing command + raw device response.
6. **Kill switch**: `DRY_RUN` in `system_settings`, toggleable by super admin, honored by the worker (logs `action='dry_run'`).
7. **Device Discovery & first-time sync (spec §3.1.1)** — the bootstrap importer so staff never hand-enter the ~200 existing modems/accounts:
   - **OLT discovery**: reuse the HSGQ driver's `listOnus` (`show onu-info all` per EPON interface) to read ONU MAC, `pon/onu-id`, auth/config/online state, optical, **and the ONU `description` free-text**; parse the description into suggested name/NAP/port. Write results to `discovery_runs` + `discovered_items` (read-only against the device).
   - **MikroTik integration** (`integrations/mikrotik`): a **RouterOS API** read client (`node-routeros`, or REST on newer RouterOS) that pulls **PPPoE secrets** (accounts) and **active PPPoE sessions** (username, caller-id MAC, IP, uptime). Store the OLT + MikroTik connection details (host, port, encrypted credentials) like an OLT credential row. Read-only; no writes to the router yet.
   - **Reconciliation engine**: bucket every discovered record as **matched / new / orphaned** against the live tables, using **MAC as the ONU↔session join key** and username/serial for the rest; suggest modem↔account↔customer links.
   - **Reconciliation UI + import**: a review screen (billing + super admin) listing the three buckets, letting staff confirm/edit suggested fields and **explicitly import** selected `new` items — which then creates customer/subscription/ONU rows in a transaction, each with an audit entry. Re-runnable; never creates anything silently.
   - **MockMikroTikClient** + a fixture ONU list on the MockOltDriver so the whole discovery→reconcile→import flow is testable without hardware.

**Exit criteria:** with MockOltDriver, an ONU can be manually deactivated and reactivated from the UI; the action log shows command + response; dry-run mode logs without executing; a forced driver failure retries then dead-letters with an alert and leaves DB state unchanged; **and** a discovery run against the mock OLT + mock MikroTik populates the reconciliation screen with matched/new/orphaned buckets, and importing a `new` item creates the linked customer/subscription/ONU records with audit rows and no duplicates on a second run.

### Phase 3 — Billing

1. **Cycle engine**: a **`node-cron` daily trigger** (Asia/Manila) that finds active subscriptions with `statement_day = today` and, per subscription, in one transaction: allocate `invoice_no` via `invoice_counters` and generate `public_token`, insert invoice + lines (plan charge, pending proration/fee lines), status `issued`. The `(subscription_id, billing_period_start)` unique key makes reruns safe — catch the duplicate-key error and skip.
2. **Proration**: mid-cycle activation and plan change produce `proration` lines (daily rate = monthly_price × 12 / 365, or client's preferred rule — flag as an open decision); covered by unit tests on month boundaries.
3. **Adjustments**: staff endpoints/UI for credit/debit/discount lines, voiding (with reason → audit), and manual payment entry (cash/OTC) that reuses the same payment-settlement transaction as the webhook path.
4. **PDF generation**: Puppeteer rendering a branded HTML template (logo, customer, lines, totals, due date, QR + Pay-Now link); store to disk/S3 path in `invoices.pdf_path`; run in the job, never in the request handler.
5. **Email pipeline**: a single `sendEmail()` interface with a **Nodemailer + Gmail SMTP** implementation for now (App Password; 2FA required on the account), MJML or React Email templates for all six notification types (spec §3.8). Emails are sent as `type='email'` rows in the `jobs` table (same retry/backoff/dead-letter machinery as provisioning). **Gmail caveats to keep visible:** ~500/day (free) or ~2,000/day (Workspace) send caps; `@gmail.com` sender often lands in spam; no SPF/DKIM/DMARC for your own domain; and **no delivery/bounce/open webhooks**, so `email_events` records `sent`/`failed` at best — `delivered`/`bounced`/`opened` stay unpopulated until a real provider is added. Keep everything behind `sendEmail()` so SES/SendGrid/Mailgun (with webhooks + domain auth) is a one-file swap. Use MailHog in dev.
6. **QR**: generate QR encoding the payment URL (or Xendit QR Ph payload once Phase 4 lands) embedded in both email and PDF.

**Exit criteria:** advancing the clock (test hook) over a statement date produces exactly one invoice per subscription even if the job runs twice; the emailed invoice (mailhog in dev) contains a PDF, a Pay-Now link, and a scannable QR; upcoming-due reminder fires at due − 2 days.

### Phase 4 — Xendit

> Before writing any Xendit code, fetch and read the current docs at docs.xendit.co: invoice/payment-request API shape, current Node SDK package name/version, webhook callback-token verification, event names, and PH channel availability (GCash, Maya, GrabPay, ShopeePay, QR Ph, VAs, cards, OTC). Do not code from memory.

> **Local-deployment note:** inbound is permitted **only** for Xendit's webhook. Route it to `/webhook/xendit` over HTTPS (router NAT/port-forward with static IP/DDNS, or a tunnel) and expose **only that path** — keep the admin UI and rest of the API on the LAN. The webhook is the primary, real-time settlement path; step 4's polling reconciliation is the safety net for the occasional dropped webhook, not the main mechanism.

1. **Xendit client wrapper**: create payment for an issued invoice (external_id = internal `invoice_no`, amount = invoice `total` — full payment only, redirect URLs pointing back to `/pay/<token>`); persist `xendit_ref` + `xendit_payment_url`; retry-safe (re-issuing must not create duplicate Xendit invoices — check by external_id first).
2. **Webhook endpoint**: raw-body capture, callback token verification (reject 401 otherwise), immediate insert into `webhook_events` (unique key = dedupe; duplicate → 200 and stop), then the settlement transaction: validate amount equals invoice total (mismatch → flag, don't settle) → payment row → status `paid` → reconnection enqueue + queued-disconnect cancellation as in §1's flow. Return 200 fast; heavy work goes to a queue.
3. **Public invoice page (`/pay/<token>`)** — read-only lookup + stable payment entry point, no login: shows invoice number, period, line items, total, due date, and status. **Every emailed link and QR encodes this URL — never the raw Xendit URL.** On load, if the invoice is unpaid and the stored Xendit link is missing or expired, the server regenerates a fresh Xendit payment and presents it. This makes emailed links immune to Xendit expiry (a customer paying weeks late still lands on a working page) and doubles as the "I lost my invoice email" self-service page. Expired/failed webhook events are simply recorded and mark the stored link stale. Rate-limit the endpoint and render nothing on invalid tokens.
4. **Reconciliation + polling backstop**: a `node-cron` job pulling Xendit settlement/transaction data, matched against `payments`; mismatches (missing, amount differs, orphaned) land in a report screen with CSV export. **Because this is a local deploy, this job is also the safety net for missed webhooks:** for still-unpaid invoices with a Xendit ref, poll Xendit's status outbound and, if now paid, run the *same* settlement transaction the webhook uses (idempotent via `webhook_events`/`payments` de-dupe) — so a paid customer reconnects even if the webhook never arrived.
5. **Sandbox e2e test**: full loop against Xendit test mode — issue invoice → pay via test channel → webhook marks paid → reconnect enqueued.

**Exit criteria:** paying a test invoice flips it to `paid` within seconds via webhook; replaying the same webhook payload is a no-op; an unverified webhook is rejected; reconciliation flags a manually-introduced mismatch.

### Phase 5 — Dunning automation

1. **Dunning sweep job**: a **`node-cron` daily trigger** at `DUNNING_HOUR` (Asia/Manila) implementing the selection query from §1 (unpaid balance, past due + `GRACE_DAYS`, active status, no live exemption); inserts one `deactivate` row into `jobs` per ONU with a stable `dedupe_key` (`deactivate:onu:<id>`), skipping the insert if a queued/processing job for that key already exists so re-sweeps don't double-enqueue.
2. **Race-safety wiring**: payment settlement cancels queued deactivate jobs via `UPDATE jobs SET status='cancelled' WHERE dedupe_key=… AND status='queued'` **and** the worker's precondition re-check catches anything already `processing`; write an automated test that lands a payment between enqueue and processing and asserts no disconnect happens.
3. **Exemptions UI**: create/expire exemptions with reason (billing + super admin), visible on the subscription page, honored by both sweep and worker.
4. **Suspension/reconnection emails**: suspension notice includes the same payment link/QR; reconnection confirmation notes the reconnection fee if applied (fee = `invoice_lines.kind='reconnection_fee'` on the next/current invoice per client decision).
5. **Reconnection path**: full webhook → activate → status flip → email loop; apply per-OLT concurrency limits under a bulk-reconnect scenario (e.g. 50 payments after a mass outage).
6. **Alerting**: dead-letter events, OLT-unreachable streaks, and sweep failures raise alerts (email to NOC + structured log for Sentry).

**Exit criteria:** the full lifecycle runs unattended against MockOltDriver: invoice → unpaid → due+3 sweep → disconnect + email → payment → reconnect + email, all idempotent, all logged, race test green, dry-run mode demonstrably prevents execution.

### Phase 6 — Dashboards, reports & hardening

1. **Admin dashboard**: active/suspended/terminated counts, MRR, collected vs outstanding this cycle, aging receivables buckets (0–30/31–60/60+), recent payments, recent auto-disconnects.
2. **Network dashboard**: OLT health, ONU online/offline counts (from periodic `status` jobs), capacity heat by NAP/splitter.
3. **Exports**: CSV (and PDF where sensible) for invoices, payments, reconciliation, disconnect/reconnect log.
4. **Observability**: pino structured logging with request IDs, Sentry, `/healthz` + `/readyz` on api and worker, and `jobs`-table depth metrics (counts by status: queued / processing / dead) plus an alert when the `dead` count grows.
5. **Security pass**: helmet, strict CORS, rate limits, dependency audit, secrets only via env/manager, DB user least-privilege (no DDL, no UPDATE/DELETE on `audit_logs`), optional TOTP 2FA for super admin.
6. **Backups & runbooks**: automated MySQL dumps + restore drill; runbooks in `docs/` for OLT-unreachable, webhook outage/replay, mass reconnect, dry-run rollout of a new vendor driver.
7. **Data protection**: customer data export endpoint and delete/anonymize path (retain financial records per PH BIR requirements — flag retention period as a client decision).

**Exit criteria:** every acceptance criterion in master spec §10 passes in a demo using MockOltDriver + Xendit test mode, and a written runbook exists for each failure mode in spec §8 flow 6.

---

## 4. Cross-cutting rules (apply in every phase)

- **Testing:** Vitest/Jest unit tests for money math, proration, date math (Asia/Manila boundaries, DST-free but month-length-sensitive); integration tests with a real MySQL container; one e2e "grand tour" test covering spec §8 flows 1–6 against MockOltDriver.
- **Never** hold a device session or Xendit/Puppeteer call inside an Express handler — enqueue and return 202 with a job ID the UI can poll.
- **Idempotency checklist for every job processor:** stable dedupe key, precondition re-check against DB, transactional state write, safe on redelivery.
- **Money:** integer-free `DECIMAL(12,2)` end to end; use a decimal library (e.g. `decimal.js`) in JS — never float arithmetic on prices.
- **Ask, don't guess:** the remaining items in master spec §11 (billing anchor/proration/tax, grace + reminders, Xendit account specifics, email domain/DNS, worker deployment location) must be surfaced to the client before the affected phase begins. **Resolved by client:** no partial payments — full settlement only (§2 notes); stale payment links solved via the stable `/pay/<token>` page (Phase 4 step 3); first vendor driver = **HSGQ XE04I over telnet** (Phase 2 step 3), with SSH enablement and the blacklist-based suspend sequence lab-verified before Phase 5 goes live; **background jobs = `node-cron` + MySQL `jobs` table (no Redis/BullMQ)**, BullMQ kept as a documented future upgrade behind the queue interface; **UI kit = Ant Design (`antd`)**, not shadcn; **email = Nodemailer + Gmail SMTP** as a dev/low-volume stopgap behind `sendEmail()`, with a real transactional provider planned for production deliverability; **deployment = local/on-premise on one on-site box** (internet: outbound to Xendit + email, inbound only to `/webhook/xendit` — that path only, HTTPS + signature-verified, admin UI LAN-only; webhook primary, outbound polling reconciliation as safety net); **first-time bootstrap = Device Discovery & sync** (Phase 2 step 7) importing existing ONUs from the OLT and PPPoE accounts from the MikroTik (RouterOS, read-only) through a matched/new/orphaned reconciliation-and-import flow — never auto-created.
