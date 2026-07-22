/**
 * Provisioning controller — manual ONU controls.
 * ===============================================
 *
 * These endpoints let a human (NOC / super admin) trigger the exact same
 * pipeline the dunning engine uses. CRUCIALLY, they do NOT talk to the OLT
 * inside the web request. They just ENQUEUE a job onto the `jobs` table and
 * return immediately; the provisioning worker picks it up and does the slow,
 * risky device work. (Spec rule: no device I/O inside an HTTP handler.)
 *
 *   POST /:id/deactivate  -> enqueue a 'deactivate' job   (NOC / super_admin)
 *   POST /:id/activate    -> enqueue an 'activate' job     (NOC / super_admin)
 *   POST /:id/status      -> enqueue a 'status' read       (NOC / super_admin)
 *   GET  /:id/action-logs -> read the ONU's device-action history (any staff)
 *
 * Mounted at /api/v1/network/onus (see network.route.js), so the final paths
 * are e.g. POST /api/v1/network/onus/12/deactivate.
 */

import { Router } from "express";
import { z } from "zod";

import { catchAsync, validateParams, validateQuery } from "../../../utils/catchAsync.js";
import APIError, { ERROR_CODES } from "../../../utils/APIError.js";
import { requireRole } from "../../../middlewares/rbac.middleware.js";
import { enqueue } from "../../../lib/jobs/jobs.queue.js";

const router = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const logsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Look up an ONU and make sure it can actually be provisioned (exists + has an
 * OLT). Fails fast with a friendly error rather than letting the worker choke.
 * @param {Object} db
 * @param {number} id
 * @returns {Promise<Object>} the ONU row.
 */
const loadProvisionableOnu = async (db, id) => {
  const rows = await db.query(
    `SELECT id, olt_id, onu_index, mac, provisioning_state FROM onus WHERE id = ? LIMIT 1`,
    [id]
  );
  const onu = rows[0];
  if (!onu) {
    throw new APIError("ONU not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
  }
  if (!onu.olt_id) {
    throw new APIError(
      "This ONU has no OLT assigned; assign one before provisioning",
      409,
      ERROR_CODES.VALIDATION_FAILED
    );
  }
  return onu;
};

/**
 * Shared handler: enqueue a device job of `type` for the ONU in the URL.
 * @param {'deactivate'|'activate'|'status'} type
 */
const enqueueDeviceJob = (type) =>
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const onu = await loadProvisionableOnu(req.db, id);

    const { id: jobId, deduped } = await enqueue(req.db, {
      type,
      payload: {
        onuId: onu.id,
        // Records WHO clicked the button, for the audit trail (network_action_logs).
        triggeredBy: `user:${req.user.id}`,
        reason: "manual",
      },
      // Repeated clicks while one is still pending collapse into the same ticket.
      dedupeKey: `${type}:onu:${onu.id}`,
    });

    return res.sendSuccess(
      deduped ? `A ${type} job is already queued for this ONU` : `${type} job queued`,
      { jobId, type, onuId: onu.id, deduped },
      202 // Accepted: work is queued, not done yet.
    );
  });

/**
 * POST /:id/deactivate — queue a suspend. NOC / super_admin only.
 */
router.post(
  "/:id/deactivate",
  requireRole("super_admin", "noc"),
  validateParams(idParamSchema),
  enqueueDeviceJob("deactivate")
);

/**
 * POST /:id/activate — queue a reconnect. NOC / super_admin only.
 */
router.post(
  "/:id/activate",
  requireRole("super_admin", "noc"),
  validateParams(idParamSchema),
  enqueueDeviceJob("activate")
);

/**
 * POST /:id/status — queue a live status read. NOC / super_admin only.
 */
router.post(
  "/:id/status",
  requireRole("super_admin", "noc"),
  validateParams(idParamSchema),
  enqueueDeviceJob("status")
);

/**
 * GET /:id/action-logs — the ONU's device-action history (newest first).
 * Any authenticated staff (incl. auditor) may read.
 */
router.get(
  "/:id/action-logs",
  validateParams(idParamSchema),
  validateQuery(logsQuerySchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const { limit, offset } = req.validatedQuery;

    // NOTE: LIMIT/OFFSET are interpolated, not bound. mysql2 prepared statements
    // (`execute`) reject `?` placeholders for LIMIT/OFFSET. It's safe here because
    // both are Zod-validated, bounded integers — not user free-text.
    const logs = await req.db.query(
      `SELECT id, action, triggered_by, job_id, command, device_response, success, error, created_at
         FROM network_action_logs
        WHERE onu_id = ?
        ORDER BY id DESC
        LIMIT ${limit} OFFSET ${offset}`,
      [id]
    );

    return res.sendSuccess("Action logs retrieved", logs);
  })
);

export default router;
