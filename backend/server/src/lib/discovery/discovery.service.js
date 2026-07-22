/**
 * Discovery service — run a sweep and stage the results.
 * ======================================================
 *
 * Orchestrates one Device Discovery sweep:
 *   1. read the OLT (ONUs) and the MikroTik (accounts + sessions) — READ-ONLY,
 *   2. read what our DB already knows,
 *   3. reconcile() into matched / new / orphaned,
 *   4. stage every item in `discovered_items` under a `discovery_runs` row.
 *
 * It never writes to the live customer/subscription/ONU tables — that only
 * happens later when staff explicitly import a `new` item (4b).
 *
 * DEVICE SELECTION (current seam): the OLT is chosen by `oltId`. The MikroTik is
 * the mock client for now; when the real RouterOsClient lands we'll pass its
 * connection config here (e.g. from a stored router credential row).
 */

import crypto from "node:crypto";

import APIError, { ERROR_CODES } from "../../utils/APIError.js";
import { decryptCredentials } from "../../utils/credentialCrypto.js";
import { writeAudit } from "../../utils/audit.js";
import { resolveDriver } from "../olt-drivers/index.js";
import { resolveMikroTikClient } from "../mikrotik/index.js";
import { reconcile } from "./reconcile.js";
import { normalizeMac } from "./reconcile.helpers.js";
import { logger } from "../../../config/logger.js";

/**
 * Read all ONUs the OLT can see. For the mock this returns everything; for a
 * real multi-PON OLT this is where we'd sweep each PON port (TODO when the real
 * HSGQ discovery path is exercised on the bench).
 * @param {Object} olt - an `olts` row incl. credentials_enc.
 * @returns {Promise<Array>} parsed ONU records.
 */
const readOltOnus = async (olt) => {
  const driver = resolveDriver({ vendor: olt.vendor });
  const ctx = {
    host: olt.host,
    port: olt.port,
    protocol: olt.protocol,
    credentials: olt.credentials_enc ? decryptCredentials(olt.credentials_enc) : undefined,
    // ponPortIndex left undefined: the mock lists all; real HSGQ needs per-PON.
  };
  const result = await driver.listOnus(ctx);
  return Array.isArray(result.parsed) ? result.parsed : [];
};

/**
 * Run one discovery sweep end-to-end and stage the results.
 *
 * @param {Object} db - Database wrapper.
 * @param {Object} opts
 * @param {number} opts.oltId - which OLT to sweep.
 * @param {number|null} [opts.actorId] - staff user who started it (null = system).
 * @param {Object} [opts.mikrotik] - MikroTik client config (defaults to mock).
 * @returns {Promise<{ runId: number, summary: Object, itemCount: number }>}
 */
export const runDiscovery = async (db, { oltId, actorId = null, mikrotik = { driver: "mock" } }) => {
  // Look up the OLT to sweep.
  const oltRows = await db.query(
    `SELECT id, name, vendor, host, port, protocol, credentials_enc FROM olts WHERE id = ? LIMIT 1`,
    [oltId]
  );
  const olt = oltRows[0];
  if (!olt) {
    throw new APIError("OLT not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
  }

  // Open the run row up front so the attempt is visible even if it fails.
  const runInsert = await db.query(
    `INSERT INTO discovery_runs (source, olt_id, started_by, status) VALUES ('combined', ?, ?, 'running')`,
    [oltId, actorId]
  );
  const runId = runInsert.insertId;
  logger.info(`Discovery run ${runId} started (OLT #${oltId})`, { runId, oltId, actorId });

  try {
    // 1) Read devices (read-only) — slow I/O, done OUTSIDE any transaction.
    const oltOnus = await readOltOnus(olt);
    const mt = resolveMikroTikClient(mikrotik);
    await mt.connect();
    let accounts;
    let sessions;
    try {
      accounts = await mt.listPppoeSecrets();
      sessions = await mt.listActiveSessions();
    } finally {
      await mt.close();
    }

    // 2) What our DB already knows.
    const existingOnus = await db.query(`SELECT id, mac, serial_no FROM onus`);
    const existingSubs = await db.query(
      `SELECT id, onu_id FROM subscriptions WHERE onu_id IS NOT NULL`
    );

    // 3) Reconcile into buckets.
    const { items, summary } = reconcile({
      oltOnus,
      accounts,
      sessions,
      existing: { onus: existingOnus, subscriptions: existingSubs },
    });

    // 4) Stage all items + finalise the run, atomically.
    const conn = await db.beginTransaction();
    try {
      for (const it of items) {
        await conn.execute(
          `INSERT INTO discovered_items
             (run_id, source, external_key, raw, suggested, match_status, matched_entity, matched_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            runId,
            it.source,
            it.external_key,
            JSON.stringify(it.raw),
            it.suggested === null ? null : JSON.stringify(it.suggested),
            it.match_status,
            it.matched_entity,
            it.matched_id,
          ]
        );
      }
      await conn.execute(
        `UPDATE discovery_runs SET status = 'completed', finished_at = NOW(), item_count = ? WHERE id = ?`,
        [items.length, runId]
      );
      await db.commit(conn);
    } catch (err) {
      await db.rollback(conn);
      throw err;
    }

    logger.info(`Discovery run ${runId} completed`, { runId, summary, itemCount: items.length });
    return { runId, summary, itemCount: items.length };
  } catch (err) {
    // Record the failure on the run row (best-effort) and surface the error.
    await db
      .query(`UPDATE discovery_runs SET status = 'failed', finished_at = NOW(), error = ? WHERE id = ?`, [
        String(err.message).slice(0, 2000),
        runId,
      ])
      .catch(() => {});
    logger.error(`Discovery run ${runId} failed: ${err.message}`, { runId });
    throw err;
  }
};

/**
 * List staged items for a run, optionally filtered by bucket.
 * @param {Object} db
 * @param {number} runId
 * @param {Object} [opts]
 * @param {'matched'|'new'|'orphaned'} [opts.bucket]
 * @param {number} [opts.limit=100]
 * @param {number} [opts.offset=0]
 * @returns {Promise<Array>}
 */
export const getRunItems = async (db, runId, { bucket, limit = 100, offset = 0 } = {}) => {
  const params = [runId];
  let where = `run_id = ?`;
  if (bucket) {
    where += ` AND match_status = ?`;
    params.push(bucket);
  }
  // limit/offset are validated integers, interpolated (mysql2 rejects them as
  // bound params — same gotcha as the action-logs endpoint).
  return db.query(
    `SELECT id, source, external_key, raw, suggested, match_status, matched_entity, matched_id,
            imported_at, imported_by
       FROM discovered_items
      WHERE ${where}
      ORDER BY match_status, id
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    params
  );
};

/**
 * List recent discovery runs (newest first) with their bucket counts.
 * @param {Object} db
 * @param {number} [limit=20]
 * @returns {Promise<Array>}
 */
export const listRuns = async (db, limit = 20) => {
  return db.query(
    `SELECT id, source, started_by, started_at, finished_at, item_count, status, error
       FROM discovery_runs
      ORDER BY id DESC
      LIMIT ${Number(limit)}`
  );
};

/**
 * Load one staged item together with its run's OLT id.
 * @param {Object} db
 * @param {number} itemId
 * @returns {Promise<Object|undefined>}
 */
const loadItemWithRun = async (db, itemId) => {
  const rows = await db.query(
    `SELECT di.*, dr.olt_id AS run_olt_id
       FROM discovered_items di
       JOIN discovery_runs dr ON dr.id = di.run_id
      WHERE di.id = ?
      LIMIT 1`,
    [itemId]
  );
  return rows[0];
};

/**
 * Stamp a staged item as imported + matched, inside the given transaction.
 * @param {import('mysql2/promise').Connection} conn
 * @param {number} itemId
 * @param {number|null} actorId
 * @param {'onu'|'customer'} entity
 * @param {number} entityId
 */
const markItemImported = async (conn, itemId, actorId, entity, entityId) => {
  await conn.execute(
    `UPDATE discovered_items
        SET imported_at = NOW(), imported_by = ?, match_status = 'matched',
            matched_entity = ?, matched_id = ?
      WHERE id = ?`,
    [actorId, entity, entityId, itemId]
  );
};

/**
 * Import a staged OLT item as a live ONU (internal — item already loaded/checked).
 * @returns {Promise<{ onuId: number, item: Object }>}
 */
const importOnu = async (db, item, { actorId, overrides }) => {
  const raw = typeof item.raw === "string" ? JSON.parse(item.raw) : item.raw;

  // Merge discovered data with staff-confirmed overrides (overrides win).
  const serialNo = overrides.serialNo ?? raw.serialNo ?? null;
  if (!serialNo) {
    throw new APIError(
      "A serial number is required to import this ONU (none discovered — provide serialNo)",
      400,
      ERROR_CODES.VALIDATION_FAILED
    );
  }
  const mac = normalizeMac(overrides.mac ?? raw.mac) ?? null;
  const oltId = overrides.oltId ?? item.run_olt_id ?? null;
  if (!oltId) {
    throw new APIError("An oltId is required to import this ONU", 400, ERROR_CODES.VALIDATION_FAILED);
  }
  const model = overrides.model ?? raw.model ?? null;
  const onuIndex = overrides.onuIndex ?? raw.onuIndex ?? null;
  const napId = overrides.napId ?? null;
  const napPort = overrides.napPort ?? null;
  const ponPortId = overrides.ponPortId ?? null;
  // A modem the OLT reports online is 'active'; otherwise 'unprovisioned'. Overridable.
  const provisioningState = overrides.provisioningState ?? (raw.online ? "active" : "unprovisioned");

  const conn = await db.beginTransaction();
  try {
    let onuId;
    try {
      const [result] = await conn.execute(
        `INSERT INTO onus
           (serial_no, mac, model, olt_id, onu_index, nap_id, nap_port, pon_port_id, provisioning_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [serialNo, mac, model, oltId, onuIndex, napId, napPort, ponPortId, provisioningState]
      );
      onuId = result.insertId;
    } catch (err) {
      if (err && err.code === "ER_DUP_ENTRY") {
        throw new APIError("An ONU with this serial or MAC already exists", 409, ERROR_CODES.DUPLICATE_ENTRY);
      }
      throw err;
    }

    await markItemImported(conn, item.id, actorId, "onu", onuId);
    await writeAudit(conn, {
      actorId,
      entity: "onu",
      entityId: onuId,
      action: "discovery_import",
      before: null,
      after: { serial_no: serialNo, mac, olt_id: oltId, onu_index: onuIndex, provisioning_state: provisioningState },
    });

    await db.commit(conn);
    logger.info(`Imported discovered ONU (item ${item.id}) as ONU #${onuId}`, { itemId: item.id, onuId, actorId });
    return { onuId, item: { ...item, imported_at: new Date(), imported_by: actorId, match_status: "matched", matched_entity: "onu", matched_id: onuId } };
  } catch (err) {
    await db.rollback(conn);
    throw err;
  }
};

/**
 * Import a staged MikroTik account item as a live customer (internal).
 *
 * A PPPoE account has no email, but customers.email is REQUIRED (invoices are
 * email-only). So the caller MUST supply an email in overrides; we refuse
 * otherwise rather than invent a fake address.
 *
 * NOTE: this creates the CUSTOMER only. Binding customer + plan + ONU into a
 * subscription stays a deliberate, separate action (the existing subscriptions
 * CRUD), because a subscription drives billing and needs a chosen plan + ONU.
 *
 * @returns {Promise<{ customerId: number, item: Object }>}
 */
const importAccount = async (db, item, { actorId, overrides }) => {
  const raw = typeof item.raw === "string" ? JSON.parse(item.raw) : item.raw;

  const name = overrides.name ?? raw.comment ?? raw.username ?? null;
  if (!name) {
    throw new APIError("A customer name is required to import this account", 400, ERROR_CODES.VALIDATION_FAILED);
  }
  const email = overrides.email ?? null;
  if (!email) {
    throw new APIError(
      "An email is required to import this account (PPPoE accounts have none; invoices are email-only)",
      400,
      ERROR_CODES.VALIDATION_FAILED
    );
  }
  const phone = overrides.phone ?? null;
  const address = overrides.address ?? null;
  const gpsLat = overrides.gps_lat ?? null;
  const gpsLng = overrides.gps_lng ?? null;
  // A disabled PPPoE account maps to an inactive customer, unless overridden.
  const status = overrides.status ?? (raw.disabled ? "inactive" : "active");

  const conn = await db.beginTransaction();
  try {
    let customerId;
    try {
      // Placeholder account_no (NOT NULL + UNIQUE) until we know the id.
      const placeholder = `TMP-${crypto.randomBytes(6).toString("hex")}`;
      const [result] = await conn.execute(
        `INSERT INTO customers (account_no, name, email, phone, address, gps_lat, gps_lng, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [placeholder, name, email, phone, address, gpsLat, gpsLng, status]
      );
      customerId = result.insertId;
      const accountNo = `ACC-${String(customerId).padStart(6, "0")}`;
      await conn.execute("UPDATE customers SET account_no = ? WHERE id = ?", [accountNo, customerId]);
    } catch (err) {
      if (err && err.code === "ER_DUP_ENTRY") {
        throw new APIError("A customer with this detail already exists", 409, ERROR_CODES.DUPLICATE_ENTRY);
      }
      throw err;
    }

    await markItemImported(conn, item.id, actorId, "customer", customerId);
    await writeAudit(conn, {
      actorId,
      entity: "customer",
      entityId: customerId,
      action: "discovery_import",
      before: null,
      after: { name, email, status, pppoe_username: raw.username ?? null },
    });

    await db.commit(conn);
    logger.info(`Imported discovered account (item ${item.id}) as customer #${customerId}`, { itemId: item.id, customerId, actorId });
    return { customerId, item: { ...item, imported_at: new Date(), imported_by: actorId, match_status: "matched", matched_entity: "customer", matched_id: customerId } };
  } catch (err) {
    await db.rollback(conn);
    throw err;
  }
};

/**
 * Import one staged item into the live tables — the GUARDED WRITE PATH.
 *
 * Loads the item, refuses anything that isn't NEW + not-yet-imported, then
 * dispatches by source: OLT item → create ONU; MikroTik item → create customer.
 * Idempotent: a second import returns 409.
 *
 * @param {Object} db
 * @param {number} itemId
 * @param {Object} opts
 * @param {number|null} opts.actorId
 * @param {Object} [opts.overrides] - staff-confirmed field values.
 * @returns {Promise<Object>} { onuId, item } or { customerId, item }.
 */
export const importItem = async (db, itemId, { actorId = null, overrides = {} }) => {
  const item = await loadItemWithRun(db, itemId);
  if (!item) {
    throw new APIError("Discovered item not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
  }
  if (item.imported_at) {
    throw new APIError("This item has already been imported", 409, ERROR_CODES.DUPLICATE_ENTRY);
  }
  if (item.match_status !== "new") {
    throw new APIError(
      `Only 'new' items can be imported (this one is '${item.match_status}')`,
      409,
      ERROR_CODES.VALIDATION_FAILED
    );
  }

  if (item.source === "olt") {
    return importOnu(db, item, { actorId, overrides });
  }
  if (item.source === "mikrotik") {
    return importAccount(db, item, { actorId, overrides });
  }
  throw new APIError(`Cannot import item of source '${item.source}'`, 400, ERROR_CODES.VALIDATION_FAILED);
};

export default { runDiscovery, getRunItems, listRuns, importItem };
