/**
 * processOneJob — the "brains" of the provisioning worker.
 * ========================================================
 *
 * Given ONE claimed job, it carries out the device action safely and records
 * everything. It is deliberately a plain function (db, job) -> outcome so it's
 * easy to test without a running loop.
 *
 * The safe sequence (matches the implementation plan §1):
 *   1. Look up the ONU (+ its OLT + PON port) from the job payload.
 *   2. PRECONDITION RE-CHECK — is the action still needed? (idempotency /
 *      race-safety: the modem may already be in the target state.)
 *   3. DRY-RUN kill switch — if on, log the INTENDED command and stop; never
 *      touch the device.
 *   4. Resolve the driver, build the context, run the device command.
 *   5. ON SUCCESS: in ONE transaction, flip the ONU + subscription state AND
 *      write the network_action_logs proof AND an audit row — together.
 *   6. ON DEVICE FAILURE: log the failed attempt, leave DB state UNCHANGED, and
 *      throw so the queue retries with backoff (never mark suspended without a
 *      confirmed device response).
 *
 * RETURN VALUES (the loop uses these to complete the job):
 *   { outcome: 'succeeded' | 'skipped' | 'dry_run', detail }
 * THROWS on device failure or unresolvable job (the loop calls queue.fail()).
 */

import APIError from "../../utils/APIError.js";
import { writeAudit } from "../../utils/audit.js";
import { decryptCredentials } from "../../utils/credentialCrypto.js";
import { resolveDriver } from "../olt-drivers/index.js";
import { isDryRun } from "../settings/settings.service.js";
import { logger } from "../../../config/logger.js";

/**
 * Maps a job type to the driver method and the DB states it should produce.
 * Keeping this in one place means the logic below stays about *flow*, not
 * about "which state goes where".
 */
const ACTION_MAP = {
  deactivate: { method: "deactivateOnu", onuState: "suspended", subState: "suspended", logAction: "deactivate" },
  activate: { method: "activateOnu", onuState: "active", subState: "active", logAction: "activate" },
  status: { method: "getOnuStatus", onuState: null, subState: null, logAction: "status" },
};

/**
 * Fetch everything the worker needs about the target ONU in one query:
 * the ONU row + its OLT (with encrypted credentials) + the PON port index.
 * @param {Object} db
 * @param {number} onuId
 * @returns {Promise<Object|undefined>}
 */
const loadOnuContext = async (db, onuId) => {
  const rows = await db.query(
    `SELECT o.id, o.provisioning_state, o.onu_index, o.mac, o.serial_no,
            o.olt_id, o.pon_port_id,
            olt.vendor, olt.host, olt.port, olt.protocol, olt.credentials_enc,
            pp.port_index AS pon_port_index
       FROM onus o
       LEFT JOIN olts olt ON olt.id = o.olt_id
       LEFT JOIN pon_ports pp ON pp.id = o.pon_port_id
      WHERE o.id = ?
      LIMIT 1`,
    [onuId]
  );
  return rows[0];
};

/**
 * Decide who/what triggered this action, for the audit trail.
 * @param {Object} payload
 * @returns {string} e.g. 'system:dunning', 'system:payment', 'user:7'.
 */
const resolveTriggeredBy = (payload) => {
  if (payload.triggeredBy) return payload.triggeredBy;
  if (payload.reason) return `system:${payload.reason}`;
  return "system";
};

/**
 * Process a single claimed job.
 *
 * @param {Object} db - Database wrapper.
 * @param {Object} job - a claimed jobs row (payload already parsed by mysql2).
 * @returns {Promise<{ outcome: string, detail?: string }>}
 */
export const processOneJob = async (db, job) => {
  const spec = ACTION_MAP[job.type];
  if (!spec) {
    // 'email' and unknown types aren't handled by the provisioning worker.
    throw new APIError(`Provisioning worker cannot handle job type '${job.type}'`, 400);
  }

  // Payload is a JSON column (mysql2 parses it), but be defensive.
  const payload = typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload;
  const { onuId, subscriptionId } = payload;
  const triggeredBy = resolveTriggeredBy(payload);

  // 1) Load the ONU + OLT + PON port.
  const onu = await loadOnuContext(db, onuId);
  if (!onu) {
    throw new APIError(`ONU ${onuId} not found`, 404);
  }

  // 2) PRECONDITION RE-CHECK (idempotency / race-safety).
  // If the modem is already in the target state, there's nothing to do — this
  // is what makes jobs safe to run twice. (The invoice-paid re-check that
  // cancels a disconnect after a late payment is added in Phase 5, once the
  // invoices table exists.)
  if (spec.onuState && onu.provisioning_state === spec.onuState) {
    logger.info(`Job ${job.id}: ONU ${onuId} already '${spec.onuState}' — skipping`, {
      jobId: job.id,
      onuId,
    });
    return { outcome: "skipped", detail: `already ${spec.onuState}` };
  }

  // 3) DRY-RUN kill switch — log intent, do NOT touch the device.
  if (spec.onuState && (await isDryRun(db))) {
    const preview = `[DRY_RUN] would ${job.type} ONU ${onu.onu_index ?? onu.mac ?? onuId}`;
    const conn = await db.beginTransaction();
    try {
      await conn.execute(
        `INSERT INTO network_action_logs
           (onu_id, action, triggered_by, job_id, command, device_response, success, error)
         VALUES (?, 'dry_run', ?, ?, ?, NULL, 1, NULL)`,
        [onuId, triggeredBy, String(job.id), preview]
      );
      await db.commit(conn);
    } catch (err) {
      await db.rollback(conn);
      throw err;
    }
    logger.info(`Job ${job.id}: DRY_RUN — logged intent, device untouched`, { jobId: job.id, onuId });
    return { outcome: "dry_run", detail: preview };
  }

  // 4) Resolve driver + build the context, then run the device command.
  if (!onu.olt_id) {
    throw new APIError(`ONU ${onuId} has no OLT assigned; cannot ${job.type}`, 409);
  }
  const driver = resolveDriver({ vendor: onu.vendor });
  const ctx = {
    host: onu.host,
    port: onu.port,
    protocol: onu.protocol,
    credentials: decryptCredentials(onu.credentials_enc),
    ponPortIndex: onu.pon_port_index ?? undefined,
    onuIndex: onu.onu_index ?? undefined,
    serialNo: onu.serial_no ?? undefined,
    mac: onu.mac ?? undefined,
  };

  const result = await driver[spec.method](ctx);

  // 5/6) Persist. Whether success or failure, we ALWAYS write the device-conversation
  // log. State only changes on a confirmed success.
  const conn = await db.beginTransaction();
  try {
    if (result.success) {
      if (spec.onuState) {
        // Flip ONU state (and remember when we last spoke to it).
        await conn.execute(
          `UPDATE onus SET provisioning_state = ?, last_seen_at = NOW() WHERE id = ?`,
          [spec.onuState, onuId]
        );
        // Flip subscription state, if this job is tied to one.
        if (subscriptionId && spec.subState) {
          await conn.execute(`UPDATE subscriptions SET status = ? WHERE id = ?`, [
            spec.subState,
            subscriptionId,
          ]);
        }
      } else if (job.type === "status" && result.parsed) {
        // A status read refreshes optical readings, no state change.
        await conn.execute(
          `UPDATE onus SET last_rx_dbm = ?, last_tx_dbm = ?, last_seen_at = NOW() WHERE id = ?`,
          [result.parsed.rxDbm ?? null, result.parsed.txDbm ?? null, onuId]
        );
      }

      // The black-box record of exactly what we sent and got back.
      await conn.execute(
        `INSERT INTO network_action_logs
           (onu_id, action, triggered_by, job_id, command, device_response, success, error)
         VALUES (?, ?, ?, ?, ?, ?, 1, NULL)`,
        [onuId, spec.logAction, triggeredBy, String(job.id), result.command, result.rawResponse]
      );

      // Business audit row (only meaningful for state-changing actions).
      if (spec.onuState) {
        await writeAudit(conn, {
          actorId: null, // system action
          entity: "onu",
          entityId: onuId,
          action: job.type,
          before: { provisioning_state: onu.provisioning_state },
          after: { provisioning_state: spec.onuState },
        });
      }

      await db.commit(conn);
      logger.info(`Job ${job.id}: ${job.type} ONU ${onuId} succeeded`, { jobId: job.id, onuId });
      return { outcome: "succeeded" };
    }

    // Device reported failure. Log the failed attempt; DB state stays UNCHANGED.
    await conn.execute(
      `INSERT INTO network_action_logs
         (onu_id, action, triggered_by, job_id, command, device_response, success, error)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [onuId, spec.logAction, triggeredBy, String(job.id), result.command, result.rawResponse, result.error ?? "device reported failure"]
    );
    await db.commit(conn);
  } catch (err) {
    await db.rollback(conn);
    throw err;
  }

  // Throw AFTER logging so the queue treats this as a retryable failure.
  throw new APIError(
    `Device ${job.type} failed for ONU ${onuId}: ${result.error ?? "unknown device error"}`,
    502
  );
};

export default processOneJob;
