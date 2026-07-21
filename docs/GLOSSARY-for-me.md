# Glossary — Plain-Language Cheat Sheet

A running list of every new term we hit while building this system. One line each, in
human language. Re-read this any time a word stops making sense. We add to it as we go.

## Network / fiber terms

- **ISP** — Internet Service Provider. The company selling internet to homes. That's who this system is for.
- **Fiber / FTTH / GPON / EPON** — Internet delivered over glass fiber cables. FTTH = "Fiber To The Home." GPON/EPON are two flavors of the technology; our target OLT (HSGQ) is EPON.
- **OLT (Optical Line Terminal)** — The big box at the ISP's office that all the fiber fans out from. The "trunk of the tree." We remotely switch customers on/off here.
- **PON port** — One port on the OLT that feeds a whole tree of customers (up to ~64–128 of them).
- **Splitter** — A passive box that splits one fiber into many (1:2, 1:8, 1:64...). No electronics, no IP address — just an inventory/topology record.
- **NAP (Network Access Point)** — The street-side box where neighborhood drop cables plug in. Has a fixed number of ports and real GPS coordinates (shows up on the map).
- **ONU / ONT** — The little modem in the customer's home (the "leaf" of the tree). On EPON it's identified by its MAC address. This is the device the system disconnects/reconnects.
- **MikroTik / RouterOS** — A router brand/OS. In this network it holds the PPPoE customer accounts. We read it (read-only) during Discovery to learn who's who.
- **PPPoE** — The login-style protocol customers' connections use (username + profile). Lives on the MikroTik, not the OLT.
- **Topology** — The tree map of OLT → PON → splitter → NAP → ONU.

## Billing terms

- **Subscriber / Customer** — The paying account holder.
- **Service Plan** — A speed tier + monthly price (e.g. "50 Mbps – ₱1,200/mo").
- **Subscription** — The link between a customer, a plan, and an ONU, with a status (pending/active/suspended/terminated).
- **Statement date** — The day each month we generate and email the invoice.
- **Due date** — The payment deadline. Disconnect happens at due date + grace period.
- **Grace period** — Extra days after the due date before we cut service (default 3).
- **Invoice** — The bill. Has a number like `INV-2026-000123`, line items, a total, and a status.
- **Dunning** — The industry word for "chasing overdue bills." Our dunning engine auto-disconnects non-payers and reconnects them on payment.
- **Xendit** — The Philippine payment gateway we use (GCash, Maya, cards, QR Ph). The only payment provider.
- **Reconciliation** — Cross-checking the money Xendit says arrived against what we recorded, to catch mismatches.

## Engineering / safety terms

- **CRUD** — Create, Read, Update, Delete. The basic operations on any record.
- **RBAC (Role-Based Access Control)** — Permissions based on a user's role (super_admin, billing, noc, auditor).
- **Migration** — A versioned, replayable script that changes the database shape (creates/alters tables). Never edit the DB by hand.
- **Seeder** — A script that inserts demo/starter data into the database.
- **Audit log** — An immutable record of who did what, when, and the before/after state. Required for every sensitive action.
- **Idempotency** — Doing the same operation twice is safe: no double charge, no double disconnect. Xendit may tell us "paid" more than once — we must handle that.
- **Envelope encryption** — Lock the secret (OLT password) with a per-record "data key," then lock that data key with a single "master key" kept out of the database. Even a stolen database can't reveal it. Rotating security means re-wrapping the small keys, not re-encrypting all the data.
- **AES-256-GCM** — Our encryption algorithm. "Authenticated": besides scrambling data it makes a 16-byte auth tag, so any tampering with the stored bytes makes decryption fail loudly instead of returning garbage.
- **IV (initialization vector)** — Random bytes mixed into each encryption so the same input never produces the same output twice. Not secret; stored next to the ciphertext.
- **Queue / `jobs` table** — A to-do list stored as database rows. Slow/risky work (talking to the OLT) is written as a "job" and a separate worker does it, so the website stays fast and work can retry.
- **Worker** — A separate program that reads jobs from the `jobs` table and carries them out (e.g. actually disconnecting an ONU).
- **Scheduler (`node-cron`)** — An in-app alarm clock. At a set time it _creates jobs_ (e.g. "start the 2 AM dunning sweep"); it doesn't do the heavy work itself.
- **Webhook** — Xendit phoning _us_ to say "this customer just paid," instead of us constantly asking.
- **Dry-run mode** — A global switch that makes the engine _log_ what it would do without actually touching devices. Safety net for testing.
- **Dead-letter** — A job that failed too many times gets parked as "dead" and raises an alert, instead of retrying forever.
- **State machine** — A rulebook of allowed status transitions (e.g. a subscription can go active→suspended but not terminated→active). Every change is checked against it, so illegal jumps are rejected instead of corrupting the record.
- **Foreign key (FK)** — A column that must point at a real row in another table (e.g. `pon_ports.olt_id` → `olts.id`). The database refuses orphans. A normal FK points at exactly one table.
- **Polymorphic parent** — When a column could reference one of _several_ tables (e.g. a splitter's parent is a PON port OR another splitter). A normal FK can't express this, so we validate the parent exists in application code instead.
- **Denormalization** — Deliberately storing redundant data (e.g. `onus.olt_id`, derivable via the NAP chain) to make a common lookup fast and simple. A trade of a little duplication for speed.
- **DECIMAL (not float)** — Money is always stored as exact decimals. Floating-point math makes `0.1 + 0.2` slightly wrong, which is unacceptable for money.
- **Transaction** — A group of database changes treated as all-or-nothing: they all commit together or, on error, all roll back together. Like a bank transfer where the debit and credit must both happen or neither does. We wrap each change with its audit-log insert in one transaction so a change can never exist without its audit trail.
- **Merge conflict** — When two Git branches change the same lines, Git can't pick a winner and leaves both versions wrapped in `<<<<<<<`, `=======`, `>>>>>>>` markers. You resolve it by deleting the markers and keeping the correct code. A file with these markers won't run. (The template shipped with several of these; we fixed them.)

## Auth terms

- **Hashing** — Turning a password into a scrambled, fixed-length string that can't be reversed. We store the hash, never the password.
- **argon2id** — The specific hashing algorithm we use. Deliberately slow and memory-hungry so brute-force guessing is expensive. Recommended default for password hashing today.
- **Salt** — A little random data mixed into a hash so two identical passwords don't produce identical hashes. argon2 embeds the salt inside its output string, so we need no separate salt column.
- **Access token** — Short-lived pass (15 min) attached to every API request. A stolen one expires fast.
- **Refresh token** — Long-lived credential used to quietly get a new access token, so you don't re-login constantly. We store only its SHA-256 hash, never the token itself.
- **JWT** — JSON Web Token. A signed token the server can verify without a database lookup. We sign with RS256 (a private key signs, a public key verifies).

## Frontend gotchas

- **React `{x && <JSX/>}` renders `0`** — JSX skips `false`/`null`/`undefined` but _renders_ the number `0`. Since MySQL booleans come back as `1`/`0`, use `{x ? <JSX/> : null}` or `{Boolean(x) && <JSX/>}` for numeric flags.
- **MySQL booleans are numbers** — `tinyint(1)` returns `1`/`0`, not `true`/`false`. Coerce with `Boolean(...)` before feeding a Switch/checkbox or sending back to a boolean-validating API.

## Project-specific notes

- **Repo layout** — This project is `backend/` (Express template) + `frontend/` (React + Vite + Ant Design template), each with its own `README.Standards.md`. That's the real structure we follow, even though the spec sketches an idealized `apps/*` monorepo.
- **DB access style** — Raw parameterized SQL via `mysql2` at runtime. Sequelize CLI is used ONLY for migrations/seeders, not as an ORM.
