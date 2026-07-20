# ISP Admin & Billing System — Build Specification (Master Prompt)

> **How to use:** Paste this into your AI coding agent (Claude Code, Cursor, etc.) as the source-of-truth spec. It is an instruction set, not a description. Where it says "verify against current docs," do so before implementing — third-party APIs (especially Xendit) and OLT vendor CLIs change; never hardcode against stale assumptions.

---

## 0. Role & Objective

You are building a **production-grade ISP administration and billing platform** for a fiber (FTTH/GPON) internet service provider. Two tightly coupled domains:

1. **Network/OSS** — model and manage fiber infrastructure (OLTs, PON ports, splitters, NAPs, subscriber ONUs), including **remote deactivation/reactivation of a subscriber's ONU at the OLT**.
2. **Billing/BSS** — subscriber accounts, service plans, recurring invoicing, email delivery of invoices with an embedded payment link + QR, online payment via **Xendit**, payment reconciliation, and an **automated dunning engine** that disconnects non-payers **3 days past due** (configurable) and reconnects them on payment.

Optimize for **correctness, auditability, and safe automation**. This system can cut off real customers' internet — every automated network action must be logged, reversible, idempotent, and guarded.

**Locked stack:** React frontend (react-leaflet for maps) · Node.js **JavaScript** backend (Express) · MySQL 8 database · **Xendit** as the sole payment gateway. Do not substitute.

---

## 1. Domain Glossary (build the data model around these)

| Term | Meaning | Implementation notes |
|---|---|---|
| **OLT** (Optical Line Terminal) | Core aggregation device at the POP/central office; has multiple PON ports. | Managed remotely via SNMP, Telnet/SSH CLI, TR-069, or vendor NMS API. Command syntax is vendor-specific (Huawei, ZTE, Fiberhome, VSOL, BDCOM, …). |
| **PON port** | OLT port feeding a tree of subscribers. | One OLT → many PON ports → typically up to 64/128 ONUs per port. |
| **Splitter** | Passive optical splitter (1:2 … 1:64). | No IP; topology/inventory record only. Parent = OLT PON port or an upstream splitter (cascading). |
| **NAP** (Network Access Point) / FAT / FDB | Field distribution box where subscriber drop cables terminate. | Has ports (e.g., 8/16), GPS coordinates, and a parent splitter. Inventory + map record. |
| **ONU/ONT (subscriber modem)** | Customer-premises modem. | Identified by serial number (SN) and/or MAC. Belongs to a NAP port and a subscriber. **This is the device the dunning engine activates/deactivates at the OLT.** Use the term **ONU** consistently in code, schema, and UI. |
| **Subscriber / Customer** | The paying account holder. | May have ≥1 subscription/ONU. |
| **Service Plan** | Speed tier + monthly price + billing cycle. | E.g., "Fiber 50Mbps – ₱1,200/mo." |
| **Subscription** | Binds Customer ↔ Plan ↔ ONU, with lifecycle status. | Drives billing and provisioning state. |
| **Statement date** | Day each cycle's invoice is generated and emailed. | Configurable: global anchor or per-subscriber anchor. |
| **Due date** | Payment deadline. | Auto-disconnect at **due date + GRACE_DAYS (default 3, configurable)**. |

---

## 2. User Roles & Permissions (RBAC)

Implement role-based access control with at minimum:

- **Super Admin** — full access; manages users, system config, Xendit/email/OLT credentials.
- **Billing Staff** — customers, plans, invoices, payments, refunds, manual reconnect/grace overrides.
- **NOC / Technician** — network inventory (OLT/splitter/NAP/ONU), provision/deprovision ONUs, diagnostics. **Cannot** alter billing.
- **Read-only / Auditor** — dashboards, reports, audit logs only.

Every sensitive action (disconnect, reconnect, refund, credential change, manual override) is permission-gated and written to the audit log with actor, timestamp, and before/after state.

---

## 3. Functional Requirements

### 3.1 Network Infrastructure Management (OSS)

- CRUD **OLTs**: name, vendor, model, management host/IP, port, protocol (SNMP/SSH/Telnet/TR-069), encrypted credentials, site/location, status, uplink info.
- CRUD **PON ports**, **splitters** (ratio, parent PON port or parent splitter, location), **NAPs** (parent splitter, total ports, GPS lat/lng, notes).
- CRUD **ONUs**: SN, MAC, model, parent NAP + port, assigned subscriber, optical/signal status, provisioning state: `unprovisioned | active | suspended | offline`.
- **Topology view**: render the OLT → PON → splitter → NAP → ONU tree. **Map view** of NAPs (and optionally customers) from GPS coordinates, built with **react-leaflet**.
- **Capacity indicators**: used/free ports per PON, splitter, and NAP so staff can see where to provision new customers.
- **Live device read (recommended)**: on-demand ONU status, optical power (Rx/Tx dBm), and online/offline state from the OLT for diagnostics.

### 3.1.1 Device Discovery & First-Time Sync (bootstrap onboarding)

The system must **import existing modems and subscriber accounts from the live network devices** so staff don't hand-enter hundreds of records when standing the platform up. This is primarily a **one-time bootstrap**, but the sync stays re-runnable to catch drift and adopt newly-added units later. **Two sources, because modems and accounts live on different devices:**

- **ONUs (modems) — from the OLT.** Sweep each PON via the driver's `listOnus` (HSGQ: `show onu-info all` per EPON interface) to discover ONU MAC, `pon/onu-id` index, auth/config/online state, and optical levels. On the target OLT ~200 ONUs are already bound from a prior ISP deployment. **Also capture the ONU `description` free-text** (the prior ISP stored e.g. "Jacqueline-Rebancos PON 2 NAP 1 PORT 5") — parse it into suggested customer name + NAP + port, editable by staff.
- **Accounts + live sessions — from the MikroTik (RouterOS).** The OLT has no concept of a subscriber account; in this network PPPoE runs on the MikroTik router. Read **PPPoE secrets** (the account list: username, profile/plan, enabled/disabled, comment) and **active PPPoE sessions** (who's online now: username, caller-id MAC, IP, uptime) via the RouterOS API (the same interface WinBox uses). This requires a **MikroTik integration** (new; see stack).

**Reconciliation workflow (mandatory — no silent creation).** Discovery is **read-only against the devices** and only ever writes to a **staging area** first. It presents matches in three buckets, mirroring the payment-reconciliation pattern:

- **Matched** — device record already exists in the system (by MAC / serial / username); show and update snapshot only.
- **New** — found on a device but not in the system → a *candidate* to import; staff review and confirm before any customer/subscription/ONU row is created.
- **Orphaned** — exists in the system but not found on the device → flag for staff (retired unit, moved, or error); never auto-delete.

The natural **join key between an ONU and an account is the MAC** (the ONU MAC appears on the OLT, and the CPE/caller-id MAC appears on the MikroTik's active session), letting the system *suggest* modem↔account↔customer links for staff to confirm. Because this platform can disconnect customers, **nothing discovered is adopted into the billing/dunning engine without explicit staff confirmation**, and every import writes an audit row.


- CRUD customers: name, address, GPS, **email (required — invoices are email-only)**, phone, ID/KYC fields, account number.
- Assign one or more subscriptions; each links a plan + an ONU + a billing anchor/statement date.
- Subscription lifecycle: `pending → active → suspended (non-payment) → active (reconnected) → terminated`.
- Prorate mid-cycle activation and plan changes.

### 3.3 Service Plans

- CRUD plans: name, download/upload Mbps, monthly price, currency (PHP), billing interval (monthly default), optional reconnection fee, optional installation fee.

### 3.4 Billing & Invoicing

- **Billing cycle engine**: scheduled job that generates each subscriber's invoice on their statement date.
- Invoice fields: sequential human-readable number (`INV-2026-000123`), subscriber, subscription(s), line items, subtotal, taxes/fees, total, statement date, **due date**, status (`draft | issued | paid | partially_paid | overdue | void`).
- **PDF generation** server-side (headless Chromium or a PDF lib) from a branded HTML template: ISP logo, customer details, line items, due date, and the **payment QR + link**.
- **Idempotent generation**: never double-bill a period — unique constraint on `(subscription_id, billing_period_start)`.
- Manual adjustments: credits/debits, discounts, voiding, partial payments.

### 3.5 Invoice Delivery (Email only)

On invoice issue, email the customer:

- The invoice PDF attached and/or an inline summary.
- A **"Pay Now" button/link** opening the Xendit hosted payment page for that invoice.
- A **QR code** (in the email and/or PDF) resolving to the same payment URL, or a Xendit QR Ph payload.

**For now, send via Gmail SMTP (Nodemailer + App Password)** behind a single `sendEmail()` interface. This is a development/low-volume stopgap with real limits to keep in mind: Gmail caps sends (~500/day free, ~2,000/day Workspace), messages from a `@gmail.com` sender often land in spam, you cannot configure SPF/DKIM/DMARC for your own domain, and plain SMTP gives **no delivery/bounce/open webhooks** — so `email_events` will record *sent*, not *delivered*. Keep the notification layer abstracted so a real transactional provider (SES / SendGrid / Mailgun / Postmark) with proper SPF/DKIM/DMARC and webhook delivery tracking can be dropped in later without touching business logic. Build templates with MJML or React Email — do not hand-roll fragile HTML. Use MailHog in dev to avoid burning Gmail quota on test runs.

### 3.6 Payment Integration — Xendit

> **Verify all endpoints, SDK package names, webhook event names, and supported channels against the current docs at `https://docs.xendit.co` before coding. Do not assume.**

- Create a Xendit invoice/payment request when the internal invoice is issued; store the returned **payment URL** and **reference ID** on the internal invoice.
- Surface relevant PH channels: e-wallets (GCash, Maya, GrabPay, ShopeePay), **QR Ph**, bank transfer / virtual accounts, cards, and over-the-counter where applicable.
- The email "Pay Now" link and the QR both resolve to the Xendit payment URL.
- **Webhook handler** for payment/invoice events:
  - **Verify the callback token / signature on every request**; reject unverified calls.
  - **Idempotent** (Xendit retries/duplicates) — de-dupe on event/payment ID.
  - On `paid`: mark the internal invoice `paid`, record a Payment row (amount, channel, Xendit ref, paid_at), and **trigger reconnection** if the subscription is suspended.
  - On `expired`/`failed`: leave the invoice unpaid; the dunning engine proceeds.
- Reconciliation report: match Xendit settlements against internal payments; flag mismatches.

### 3.7 Automated Dunning & Disconnect Engine (core of the system)

**Disconnect rule:** a subscription with an unpaid invoice where `today >= due_date + GRACE_DAYS (default 3)` is automatically suspended by deactivating its ONU at the OLT.

1. **Scheduler**: daily job (configurable time, e.g. 02:00 Asia/Manila) finds matching subscriptions and enqueues one `disconnect` task per ONU.
2. **Provisioning worker**, per ONU:
   - Resolve ONU → parent OLT → select the correct **vendor driver**.
   - Execute the vendor-specific **deactivate** command. **Suspend, do not delete** — reactivation must be instant on payment.
   - Set ONU → `suspended`, subscription → `suspended`.
   - Write a network action record: command sent, raw device response, success/failure, actor = `system`.
   - Email the customer a suspension notice containing the same payment link/QR.
3. **Reconnection**: triggered by the Xendit `paid` webhook or manual staff action. Run the vendor **activate** command, set ONU and subscription → `active`, log, email a reconnection confirmation, and apply the reconnection fee if configured.
4. **Guardrails (mandatory):**
   - **Idempotency**: never re-disconnect an already-suspended ONU or re-activate an already-active one.
   - **Retry with backoff** on device/command failure; after N failures, alert NOC. Never silently leave a customer in a wrong state.
   - **Exemptions**: staff can whitelist a subscriber from auto-disconnect (dispute, promise-to-pay) with a reason and expiry.
   - **Kill switch / dry-run mode**: global flag to run the engine in "log only, do not execute" mode.
   - **Race safety**: a payment landing while a disconnect task is queued for the same subscription must cancel/preempt that disconnect.
   - **Concurrency limits per OLT** to avoid hammering a device with simultaneous CLI sessions.

> **Architecture note:** many ISPs use a soft suspension (RADIUS/PPPoE walled-garden portal with a "settle your bill" page) instead of a hard OLT cutoff. The client explicitly requires OLT-level disconnect — implement that as the primary strategy, but design the provisioning layer so a `captive-portal` strategy can be plugged in later without rewrites.

### 3.8 Notifications

- Email events: invoice issued, payment received, upcoming-due reminder (due date − 2 days), overdue notice, suspension notice, reconnection notice.
- Client requires **email only** today. Keep the notification channel abstracted so SMS/Viber can be added later without touching business logic.

### 3.9 Dashboards & Reporting

- **Admin dashboard**: active/suspended/terminated counts, MRR, collected vs outstanding this cycle, aging receivables (0–30 / 31–60 / 60+), recent payments, recent auto-disconnects.
- **Network dashboard**: OLT health, ONU online/offline counts, capacity by NAP/splitter.
- Exportable reports (CSV/PDF): invoices, payments, reconciliation, disconnect/reconnect log.

---

## 4. Non-Functional Requirements

- **Security**: encrypt OLT credentials and API keys at rest (secrets manager / KMS / envelope encryption — never plaintext columns). HTTPS everywhere. Verify Xendit webhook signatures. Rate-limit auth endpoints. Hash passwords with argon2 or bcrypt. Least privilege for DB and device access.
- **Auditability**: immutable audit log for every billing change and every network action (who/what/when/before/after/raw device output). Non-negotiable given the disconnect capability.
- **Reliability**: all device commands and external calls run through a **queue with retries, backoff, and dead-letter handling**. No long-running device I/O inside HTTP request handlers.
- **Idempotency**: invoice generation, webhook handling, and all provisioning actions.
- **Observability**: structured logging, error tracking (e.g., Sentry), health checks, alerts on engine failures and unreachable devices.
- **Time zones**: store timestamps in UTC; compute statement/due/disconnect dates in **Asia/Manila**.
- **Data protection**: careful PII handling, backups, and a customer data export/delete path.
- **Testability**: ship a **MockOltDriver** so the full billing → disconnect → reconnect flow can be tested end-to-end without hardware.

---

## 5. Architecture & Stack (locked)

- **Pattern**: **modular monolith** API plus a provisioning worker. Since this deploys **locally on one on-site box on the OLT's LAN**, the worker reaches the OLT directly and can even run in the same process as the API for a single-OLT site — but keep it as a separate module (its own worker loop over the `jobs` table) so it can be split onto its own box later without a rewrite. Keep all module boundaries clean.
- **Backend**: **Node.js (JavaScript, ES modules) with Express**. No TypeScript — use JSDoc annotations where type hints help, and runtime validation (Joi or Zod) at all API boundaries and for env config.
- **Database**: **MySQL 8** (InnoDB, `utf8mb4`).
- **ORM**: Prisma with the MySQL connector (works fine from plain JavaScript; Sequelize is an acceptable fallback if justified).
- **Scheduler**: `node-cron` (in-process) for time-based jobs — billing cycles, the daily dunning sweep, upcoming-due reminders, reconciliation, and periodic ONU status polls. cron only *triggers* work; it does not carry it out.
- **Durable work queue**: a **MySQL-backed `jobs` table** (no Redis). A worker loop claims jobs with `SELECT … FOR UPDATE SKIP LOCKED`, and retries/backoff/dead-letter/cancellation/concurrency are implemented as columns + logic (see the implementation plan's `jobs` table and worker loop). This keeps the whole system on MySQL — one fewer moving part — and the queue is directly inspectable (`SELECT * FROM jobs`), which aids learning and debugging.
  > **Future upgrade path (not now):** if send/throughput ever outgrows a DB-polled queue, swap the `jobs` table for **Redis + BullMQ** behind the same queue interface (`enqueue`, `claim`, `complete`, `fail`, `cancel`). BullMQ would give repeatable jobs, backoff, dead-letter, and per-group concurrency out of the box. Keep the interface clean now so this stays a drop-in replacement later.
- **Frontend**: **React** (Vite) + **Ant Design (`antd`)** as the primary component kit (tables, forms, modals, date pickers come batteries-included), **react-leaflet** (Leaflet) for the NAP/customer map, and a tree component for topology. Tailwind may be used for page-level layout only; theme UI components the Ant Design way rather than fighting them with utility classes.
- **OLT communication**: a **driver abstraction** — interface `activateOnu`, `deactivateOnu`, `getOnuStatus`, `listOnus` — with concrete per-vendor drivers over `ssh2`/telnet and `net-snmp`. Ship `MockOltDriver` for dev/tests.
- **MikroTik integration (RouterOS)**: a read client over the **RouterOS API** (`node-routeros` or the REST API on newer RouterOS) to pull **PPPoE secrets** (accounts) and **active PPPoE sessions** for Device Discovery (§3.1.1). Read-only for now; keep it behind a small interface so a future "disconnect via MikroTik" strategy (disable secret / drop active session) can plug in alongside the OLT-level disconnect if the client chooses that path.
- **Payments**: **Xendit only** — official Xendit Node SDK (verify current package + version against docs.xendit.co). Do not add other gateways.
- **Email**: **Nodemailer over Gmail SMTP** for now (App Password; requires 2FA on the Google account), behind a single `sendEmail()` interface + MJML or React Email templates; queue-based sending via the `jobs` table. **MailHog** in dev so tests don't burn Gmail quota. Gmail is a stopgap — see the delivery caveats in the implementation plan; swapping to SES/SendGrid/Mailgun later is a one-file change behind the same interface.
- **PDF**: headless Chromium (Puppeteer) rendering the invoice HTML template, or a PDF lib.
- **QR**: a QR library encoding the payment URL, or Xendit's QR Ph payload directly when available.
- **Auth**: JWT access + refresh tokens, RBAC guards, optional 2FA for admins.
- **Deployment**: **local / on-premise (not cloud).** The full stack (API, web, worker, MySQL) runs on one on-site box on the same LAN as the OLT and MikroTik — so the worker reaches the OLT management VLAN directly and no VPN/co-lo is needed. **Internet access is limited to: outbound to Xendit and email, and inbound only for Xendit's payment webhook.** Route that permitted inbound to `/webhook/xendit` over HTTPS via a NAT/port-forward on the router (static IP or DDNS), or a tunnel (Cloudflare/Tailscale) if you prefer not to open a port. **Expose *only* that path** — the admin UI and the rest of the API stay LAN-only; never publish the dashboard/login to the internet. Keep the webhook signature-verified and rate-limited, and restrict to Xendit source IPs if published. The webhook is the **primary, real-time** settlement path; keep a lightweight outbound **polling reconciliation** (the reconciliation job + `/pay/<token>` re-check) as a **safety net** so a rare dropped webhook can't leave a paying customer suspended. Ship via Docker Compose on the local box.

---

## 6. Project Structure (monorepo)

```
isp-platform/
├── apps/
│   ├── api/                       # Node.js (JavaScript/Express) backend — BSS + OSS API
│   ├── web/                       # React (Vite) admin dashboard, react-leaflet map
│   └── provisioning-worker/       # Deployable worker with OLT network access
├── packages/
│   ├── database/                  # Prisma schema (MySQL) + migrations + seed
│   ├── olt-drivers/               # Vendor driver abstraction
│   │   └── src/
│   │       ├── driver.interface.js   # documented contract: activateOnu, deactivateOnu, getOnuStatus, listOnus
│   │       ├── huawei/
│   │       ├── zte/
│   │       ├── vsol/
│   │       └── mock/              # MockOltDriver for tests/dev
│   ├── shared/                    # constants, enums, money/date utils
│   └── config/                    # env loading + runtime validation (Joi/Zod)
├── docker/                        # Dockerfiles, compose, nginx
├── docs/                          # ADRs, runbooks, per-vendor OLT command notes
└── .env.example
```

**API module layout (`apps/api/src/`):**

```
modules/
├── auth/                # login, tokens, RBAC guards
├── users/               # staff accounts & roles
├── customers/           # subscribers / KYC
├── plans/               # service plans
├── subscriptions/       # plan↔customer↔ONU binding + lifecycle
├── network/
│   ├── olts/
│   ├── pon-ports/
│   ├── splitters/
│   ├── naps/
│   └── onus/            # subscriber modems
├── billing/
│   ├── invoices/
│   ├── payments/
│   └── cycles/          # statement-date generation engine
├── provisioning/        # connect/disconnect orchestration (enqueues jobs)
├── dunning/             # daily overdue sweep → disconnect tasks
├── discovery/           # device discovery + reconciliation (matched/new/orphaned) + import
├── notifications/       # email events + templates
└── reports/

integrations/
├── xendit/              # client + webhook controller (signature-verified)
├── email/               # nodemailer + Gmail SMTP adapter (behind sendEmail())
├── mikrotik/            # RouterOS API read client — PPPoE secrets + active sessions (discovery)
└── olt/                 # wires olt-drivers into the app

jobs/                    # cron schedulers (node-cron) + job processors (claim from the MySQL jobs table)
common/                  # guards, middleware, filters, audit, encryption
```

---

## 7. Core Data Model (MySQL)

Define schema for at least:

- `users` (id, name, email, password_hash, role, status)
- `customers` (id, account_no, name, email **required**, phone, address, gps_lat, gps_lng, status)
- `plans` (id, name, down_mbps, up_mbps, monthly_price, currency, reconnection_fee, install_fee)
- `olts` (id, name, vendor, model, host, port, protocol, credentials_encrypted, site, status)
- `pon_ports` (id, olt_id, port_index, capacity, status)
- `splitters` (id, parent_type, parent_id [pon_port | splitter], ratio, location)
- `naps` (id, splitter_id, total_ports, gps_lat, gps_lng, label, notes)
- `onus` (id, serial_no, mac, model, nap_id, nap_port, olt_id, pon_port_id, provisioning_state, last_rx_dbm, last_seen_at)
- `subscriptions` (id, customer_id, plan_id, onu_id, statement_day, status, activated_at, terminated_at)
- `invoices` (id, invoice_no, subscription_id, customer_id, billing_period_start, billing_period_end, statement_date, due_date, subtotal, fees, total, status, xendit_ref, xendit_payment_url)
- `invoice_lines` (id, invoice_id, description, qty, unit_price, amount)
- `payments` (id, invoice_id, amount, channel, xendit_payment_id, paid_at, raw_payload JSON)
- `dunning_exemptions` (id, subscription_id, reason, created_by, expires_at)
- `network_action_logs` (id, onu_id, action [activate|deactivate|status], triggered_by, command, device_response, success, created_at)
- `jobs` (id, type, payload JSON, status, attempts, max_attempts, next_run_at, dedupe_key, locked_at, locked_by, last_error) — the durable work queue (replaces Redis/BullMQ); see the implementation plan for the full DDL and worker loop.
- `discovery_runs` (id, source [olt|mikrotik], started_by, started_at, finished_at, item_count, status) — one row per discovery sweep.
- `discovered_items` (id, run_id, source, raw JSON, external_key [mac/serial/username], match_status [matched|new|orphaned], matched_entity, matched_id, imported_at) — staging rows staff review before anything is created in the live tables.
- `audit_logs` (id, actor_id, entity, entity_id, action, before JSON, after JSON, created_at)
- `email_events` (id, invoice_id, type, provider_status, created_at)

**Constraints & conventions:** unique on `invoices(subscription_id, billing_period_start)`, `onus(serial_no)`, `payments(xendit_payment_id)`. Use `DECIMAL(12,2)` for money (never FLOAT), `DATETIME`/`TIMESTAMP` stored in UTC, and InnoDB with `utf8mb4`.

---

## 8. Critical Flows (implement and test end-to-end)

1. **Provision new customer** → create customer → create subscription bound to a free NAP port + ONU → activate ONU at OLT → status `active`.
2. **Statement-date billing** → cycle engine generates invoice → creates Xendit payment → renders PDF → emails invoice with Pay-Now link + QR.
3. **Customer pays** → verified, idempotent Xendit webhook → invoice `paid` + payment recorded → if suspended, reconnect ONU.
4. **Customer doesn't pay** → at due_date + grace, dunning sweep enqueues disconnect → worker deactivates ONU at OLT → suspension email → all logged.
5. **Late payment after disconnect** → webhook → reconnect ONU → optional reconnection fee → confirmation email.
6. **Failure path** → OLT unreachable during disconnect → retries with backoff → NOC alert; state stays consistent (never mark `suspended` without a confirmed device command).

---

## 9. Build Phases (deliver incrementally)

1. **Foundation** — auth/RBAC, customers, plans, subscriptions, network inventory CRUD, audit logging, encrypted credentials.
2. **OLT control** — driver abstraction + MockOltDriver + at least one real vendor driver; manual activate/deactivate from the UI with full logging; dry-run mode.
3. **Billing** — cycle engine, invoice generation + PDF, email delivery with payment link/QR.
4. **Xendit** — payment creation, hosted-page link, verified idempotent webhook, reconciliation.
5. **Dunning automation** — daily sweep, queue-based disconnect/reconnect, guardrails, exemptions, alerts.
6. **Dashboards, reports & hardening** — aging receivables, network health, observability, backups, docs/runbooks.

---

## 10. Acceptance Criteria (Definition of Done)

- A subscriber can be fully provisioned and appears in the topology tree and NAP map.
- On statement date, an invoice is auto-generated and emailed with a working Xendit Pay-Now link and a scannable QR resolving to the same payment.
- Paying via Xendit marks the invoice paid within seconds (webhook) and, if suspended, automatically reconnects the ONU.
- A subscriber unpaid at due_date + grace is automatically deactivated at the OLT — with a logged device command/response and a suspension email — and reactivated automatically on later payment.
- Every disconnect/reconnect is permission-gated, idempotent, retried on failure, alertable, and fully audited.
- Dry-run mode and MockOltDriver allow the entire flow to be demonstrated without real hardware.

---

## 11. Open Decisions — Confirm With the Client (surface these; don't guess)

1. **OLT vendor(s)/model(s)** in the network and the allowed management protocol (SSH/Telnet/SNMP/TR-069) — this dictates which real driver to build first.
2. **Disconnect mechanism**: hard OLT deactivation (stated requirement) vs. soft RADIUS walled garden — confirm primary, note fallback.
3. **Billing anchor**: global statement date vs. per-subscriber anchor; proration rules; tax/VAT handling; reconnection fee amount.
4. **Grace period** value (default 3 days) and whether pre-disconnect reminders are sent.
5. **Xendit account specifics**: enabled channels, QR Ph availability, settlement schedule, live vs. test keys.
6. **Email sending domain** and DNS access (SPF/DKIM/DMARC) for deliverability.
7. **Deployment/network**: **Resolved — local/on-premise on one on-site box** on the OLT+MikroTik LAN (no cloud, no VPN). Internet access is outbound to Xendit + email and **inbound only for Xendit's webhook** (routed to `/webhook/xendit`, that path only, HTTPS + signature-verified; admin UI stays LAN-only). **Minor to confirm:** whether inbound is delivered via router NAT/port-forward (needs static IP/DDNS) or a tunnel. A polling reconciliation is kept as a safety net regardless.
