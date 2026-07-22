# Phase 2 — OLT Control · Progress Summary

**Status:** ✅ Complete against mocks · ⏸ Bench verification pending (HSGQ + MikroTik)
**Scope:** OLT driver abstraction (mock + real HSGQ), a MySQL-backed job queue + provisioning worker, manual ONU controls (API + UI), the DRY_RUN kill switch, and full Device Discovery (OLT + MikroTik read → reconcile → import), backend and frontend.

Roadmap: Phase 1 Foundation ✅ → **[Phase 2 OLT control ✅]** → Billing (Phase 3) → Xendit (Phase 4) → Dunning (Phase 5) → Dashboards & hardening (Phase 6).

---

## 1. What Phase 2 delivered (in plain terms)

The software can now actually reach the OLT. Staff can activate / deactivate / status-check a subscriber's modem from the UI; the request drops a job on a queue and a separate worker performs the device command, records exactly what was sent and what the device replied, and flips the ONU/subscription state — but only after a confirmed device response.

A global DRY_RUN "rehearse only" switch lets the whole flow run without touching hardware. And Device Discovery reads the existing ~200 modems (from the OLT) and PPPoE accounts (from the MikroTik) into a staging area, sorts them into matched / new / orphaned, and lets staff import them into live records — nothing is created silently.

Everything is proven end-to-end with a MockOltDriver + MockMikroTikClient. The real HSGQ driver is fully built but stays behind DRY_RUN until lab-verified.

---

## 2. Key decisions locked in during Phase 2

| Decision | Choice | Notes |
| --- | --- | --- |
| Background jobs | `node-cron` (later) + **MySQL `jobs` table** worker queue | No Redis/BullMQ. Behind an `enqueue/claim/complete/fail/cancel` interface so BullMQ can drop in later. |
| Driver placement | `backend/server/src/lib/olt-drivers/` | Next to existing `lib/qr`, `lib/xendit`, etc. (on-disk convention, not the spec's `packages/`). |
| Driver contract | Abstract `OltDriver` class + JSDoc typedefs | `activateOnu`/`deactivateOnu`/`getOnuStatus`/`listOnus`, all returning `{ success, command, rawResponse, parsed }`. |
| Suspend mechanism (HSGQ) | **blacklist MAC + `onu-deregister`** | Bare deregister re-registers in ~33s; blacklist holds it down. **Syntax is bench-verify.** |
| Transport | Telnet (`net` socket) today | Swappable to SSH once enabled on the device. |
| State safety | State flips only after a confirmed device success, in one TX with the log | Never mark `suspended` on a failed/uncertain command. |
| Kill switch | `DRY_RUN` in `system_settings` | super_admin toggles; worker logs `action='dry_run'` and skips the device. |
| Discovery | Read-only against devices; stage → review → explicit import | `discovery_runs.source` extended to include `'combined'`; account import requires a staff-supplied email. |
| MikroTik | Read-only client behind an interface; mock now, `RouterOsClient` stub | Real client needs `node-routeros` (deferred). |

---

## 3. Backend — what was built

### 3.1 Database (Sequelize CLI migrations)

New migrations (after Phase 1's `...012`):

1. `20260122000001-create-jobs` — durable work queue: `type`, `payload` JSON, `status`, `attempts`/`max_attempts`, `next_run_at` (backoff), `dedupe_key`, `locked_at`/`locked_by`, `last_error`. Indexes for claim + dedupe.
2. `20260122000002-create-network-action-logs` — append-only device "black box": `onu_id`, `action`, `triggered_by`, `job_id`, `command`, `device_response`, `success`, `error`. Server-side timestamp only (device clock is unreliable).
3. `20260122000003-create-system-settings` — key/value runtime config; seeds `DRY_RUN=false`.
4. `20260122000004-create-discovery-runs` — one row per sweep.
5. `20260122000005-create-discovered-items` — staging rows (matched/new/orphaned) staff review before import.
6. `20260122000006-discovery-runs-source-combined` — allow `source='combined'` (a sweep reads both devices).
7. `20260122000007-add-olt-id-to-discovery-runs` — record which OLT a sweep targeted (used by ONU import).

### 3.2 OLT drivers (`server/src/lib/olt-drivers/`)

- `driver.interface.js` — the `OltDriver` contract + `OltContext`/`DriverResult` typedefs.
- `mock.driver.js` — `MockOltDriver`: in-memory ONUs, configurable latency + failure rate (`MOCK_OLT_LATENCY_MS`, `MOCK_OLT_FAILURE_RATE`), HSGQ-flavoured fake transcripts. Seeded with the lab ONU (Huawei EG8145V5 @ 1/27).
- `index.js` — `resolveDriver(olt)` (mock / hsgq, else 501).
- `hsgq/commands.js` — pure command builders (`buildDeactivate`/`buildActivate`/`buildStatus`/`buildListOnus`, `parseOnuIndex`).
- `hsgq/parsers.js` — `parseOnuInfoAll` (+ optical/one-ONU parsers). **Output format is provisional — needs a real capture.**
- `hsgq/telnet.js` — `HsgqTelnetTransport`: connect/login/prompt-state-machine/`execPlan`, timeouts, guaranteed session cleanup.
- `hsgq/driver.js` — `HsgqOltDriver` stitching commands + transport + parsers into `DriverResult`.

### 3.3 Jobs queue + worker (`server/src/lib/jobs/`)

- `jobs.queue.js` — `enqueue` (dedupe), `claim` (`FOR UPDATE SKIP LOCKED`, optional type filter), `complete`, `fail` (exponential backoff + jitter, dead-letter), `cancel`.
- `processJob.js` — `processOneJob`: precondition re-check (idempotency), DRY_RUN branch, resolve driver, run command, transactional state + `network_action_logs` write, throw on device failure (→ retry).
- `worker.js` — `startWorker` polling loop + `handleJob` (complete/fail + NOC alert hook on dead-letter).
- `server/bin/worker.js` — runnable entry (`npm run worker` / `worker:dev`), graceful shutdown.

### 3.4 Settings + discovery libs

- `lib/settings/settings.service.js` — `getSetting`/`setSetting`/`isDryRun`.
- `lib/mikrotik/` — `client.interface.js`, `mock.client.js` (seeded to dovetail with the mock OLT by MAC), `routeros.client.js` (stub), `index.js` (`resolveMikroTikClient`).
- `lib/discovery/reconcile.helpers.js` — `normalizeMac`, `parseOnuDescription`, `buildSessionMacIndex`.
- `lib/discovery/reconcile.js` — pure `reconcile()` → matched/new/orphaned + suggestions (MAC join).
- `lib/discovery/discovery.service.js` — `runDiscovery`, `getRunItems`, `listRuns`, `importItem` (dispatch: OLT→ONU, MikroTik→customer).

### 3.5 API surface (all JWT-guarded; writes role-gated; transactional + audited)

- **Manual controls (`/api/v1/network/onus`)** — `POST /:id/deactivate|activate|status` (super_admin/noc, enqueue → 202), `GET /:id/action-logs`.
- **System (`/api/v1/system/settings`)** — `GET /dry-run`, `PUT /dry-run` (super_admin, audited).
- **Discovery (`/api/v1/discovery`)** — `POST /run` (super_admin/noc), `GET /runs`, `GET /runs/:id/items?bucket=`, `POST /items/:id/import` (super_admin/billing/noc).

---

## 4. Frontend — what was built

Stack unchanged (React 19 + Vite + Ant Design 5 + React Query + Zustand).

### 4.1 Manual ONU controls (`pages/CMS/Onus.jsx`)
- A **Provision ▾** dropdown per ONU (super_admin/noc): Activate / Deactivate (danger) / Refresh status, each behind a confirm dialog. Actions enqueue jobs (toast says "queued", not "done").
- A **Logs** drawer showing the ONU's `network_action_logs` — action, result, who, when — with expandable rows revealing the exact command + raw device response.
- New: `services/api/provisioningApi.js`, `query/useActionLogsQuery.js`, `mutation/useProvisioningMutation.js`.

### 4.2 DRY_RUN toggle + banner
- `components/common/DryRunToggle.jsx` — header switch (super_admin only).
- `components/common/DryRunBanner.jsx` — full-width warning shown to everyone when on.
- Wired into `CMSLayout`. New: `services/api/systemApi.js`, `query/useSystemQuery.js`, `mutation/useSystemMutation.js`.

### 4.3 Device Discovery (`pages/CMS/Discovery.jsx`)
- OLT selector + **Run discovery** (super_admin/noc), run picker, **New/Matched/Orphaned** tabs, items table (source, status, key, human details) with expandable raw/suggested.
- **Import** action on `new` items → source-specific modal (ONU fields vs customer fields with required email), calling the import endpoint.
- Added to the Network menu group (`constants/menu.jsx`). New: `services/api/discoveryApi.js`, `query/useDiscoveryQuery.js`, `mutation/useDiscoveryMutation.js`.

---

## 5. How to run (dev)

**Backend** (`backend/`):

```
npm install
npm run key:generate
npm run env:example        # then fill .env (incl. jwtAuth*, CREDENTIAL_MASTER_KEY, DB_*)
npm run db:migrate
npm run db:seed
npm run dev                # API on http://localhost:3000
npm run worker             # provisioning worker (separate terminal)
```

**Frontend** (`frontend/`): `npm install` then `npm run dev` (http://localhost:5173). Log in `admin@teranetwork.local` / `Admin123!`.

To rehearse safely: toggle **Dry-run** on in the header, then use the ONU Provision actions — they log `dry_run` without touching a device.

---

## 6. Bench-verification checklist (before real hardware)

Items flagged `BENCH-VERIFY` in code that need real captures:

**HSGQ XE04I (telnet 192.168.88.10:23):**
- [ ] Exact login banner (`Username:`/`Password:` vs `login:`); does `enable` prompt for a password?
- [ ] Confirm command syntax: `blacklist add/del mac <MAC>`, `onu-deregister <id>`, `onu-authorize <id>`; whether `save` persists the blacklist across reboot.
- [ ] Capture real `show onu-info all` → `docs/vendor-transcripts/hsgq-xe04i/show-onu-info-all.txt`; tune `hsgq/parsers.js` + tests.
- [ ] Full deactivate→(>10 min down)→activate cycle on lab ONU (Huawei EG8145V5 @ 1/27), 5× for idempotency.
- [ ] Enable SSH, then switch transport 23→22 and disable telnet.

**MikroTik (RouterOS):**
- [ ] Confirm access method (API 8728/8729 vs REST) + read-only credentials.
- [ ] Sample `/ppp/secret/print` and `/ppp/active/print` output → implement real `RouterOsClient` (adds `node-routeros` dependency — flag before installing).

---

## 7. Known gaps / deferred

- **Real `RouterOsClient`** — stub only; mock covers dev/testing. Needs `node-routeros`.
- **HSGQ multi-PON discovery** — `readOltOnus` currently does a single `listOnus`; real per-PON sweep is a TODO in `discovery.service.js`.
- **Subscription creation from discovery** — import creates ONUs and customers separately; binding customer+plan+ONU into a subscription stays a deliberate manual step (existing Subscriptions CRUD).
- **cron schedulers** — the worker runs, but time-based triggers (dunning sweep, reminders) arrive in Phase 5.
- **Discovery orphan detection** is OLT-only (per sweep) for now.

---

## 8. Definition of Done — Phase 2 checklist

- [x] Driver abstraction + MockOltDriver + one real vendor driver (HSGQ)
- [x] Manual activate/deactivate/status from the UI with full logging
- [x] MySQL jobs queue + provisioning worker (retry/backoff/dead-letter/cancel)
- [x] State changes only after confirmed device response, in-transaction with logs
- [x] DRY_RUN kill switch (backend + UI)
- [x] Device Discovery: OLT + MikroTik read → reconcile (matched/new/orphaned) → explicit import, no silent creation, audited
- [x] Whole flow demonstrable via MockOltDriver + MockMikroTikClient
- [ ] Real HSGQ driver verified on the lab bench (pending — see §6)
- [ ] Real MikroTik client implemented (pending — see §6)

_Next: **bench verification**, then **Phase 3 — Billing** (cycle engine, invoices + PDF, email delivery with payment link/QR)._
