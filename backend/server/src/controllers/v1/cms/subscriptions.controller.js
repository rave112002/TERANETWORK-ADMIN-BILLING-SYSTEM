import { Router } from "express";
import { z } from "zod";

import {
  catchAsync,
  validateBody,
  validateParams,
  validateQuery,
} from "../../../utils/catchAsync.js";
import APIError, { ERROR_CODES } from "../../../utils/APIError.js";
import { requireRole } from "../../../middlewares/rbac.middleware.js";
import { writeAudit, getAuditContext } from "../../../utils/audit.js";

const router = Router();

const STATUSES = ["pending", "active", "suspended", "terminated"];

// The lifecycle rulebook: from each status, which statuses are reachable.
// 'terminated' is terminal (no way out).
const TRANSITIONS = {
  pending: ["active", "terminated"],
  active: ["suspended", "terminated"],
  suspended: ["active", "terminated"],
  terminated: [],
};

// Human-friendly audit action name for a transition.
const transitionAction = (from, to) => {
  if (to === "active") return from === "suspended" ? "reactivate" : "activate";
  if (to === "suspended") return "suspend";
  if (to === "terminated") return "terminate";
  return "status_change";
};

const SELECT_SUB = `SELECT s.id, s.customer_id, c.name AS customer_name, c.account_no,
          s.plan_id, p.name AS plan_name, p.monthly_price,
          s.onu_id, o.serial_no AS onu_serial,
          s.statement_day, s.status, s.activated_at, s.terminated_at,
          s.created_at, s.updated_at
   FROM subscriptions s
   JOIN customers c ON c.id = s.customer_id
   JOIN plans p ON p.id = s.plan_id
   LEFT JOIN onus o ON o.id = s.onu_id`;

/* ----------------------------- Validation ----------------------------- */

const optionalId = z
  .number()
  .int()
  .positive()
  .optional()
  .nullable()
  .transform((v) => v ?? null);

const createSubscriptionSchema = z.object({
  customer_id: z.number().int().positive(),
  plan_id: z.number().int().positive(),
  onu_id: optionalId,
  statement_day: z.number().int().min(1).max(28),
});

// Edit non-status fields only. Status changes go through POST /:id/status.
const updateSubscriptionSchema = z
  .object({
    plan_id: z.number().int().positive().optional(),
    onu_id: optionalId,
    statement_day: z.number().int().min(1).max(28).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

const statusBodySchema = z.object({
  status: z.enum(STATUSES),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const listQuerySchema = z.object({
  customer_id: z.coerce.number().int().positive().optional(),
  status: z.enum(STATUSES).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

/* ------------------------------ Helpers -------------------------------- */

const findSubscriptionById = async (conn, id) => {
  const [rows] = await conn.execute(`${SELECT_SUB} WHERE s.id = ? LIMIT 1`, [id]);
  return rows[0];
};

const mapDbError = (err) => {
  if (err && err.code === "ER_DUP_ENTRY") {
    return new APIError(
      "That ONU is already assigned to another subscription",
      409,
      ERROR_CODES.DUPLICATE_ENTRY
    );
  }
  if (err && (err.code === "ER_NO_REFERENCED_ROW_2" || err.code === "ER_NO_REFERENCED_ROW")) {
    return new APIError(
      "A referenced customer, plan, or ONU does not exist",
      400,
      ERROR_CODES.VALIDATION_FAILED
    );
  }
  return err;
};

/* ------------------------------- Routes -------------------------------- */

/**
 * GET / — list subscriptions with filters + pagination. Any authenticated staff.
 */
router.get(
  "/",
  validateQuery(listQuerySchema),
  catchAsync(async (req, res) => {
    const { customer_id, status, limit, offset } = req.validatedQuery;

    const conditions = [];
    const params = [];
    if (customer_id) {
      conditions.push("s.customer_id = ?");
      params.push(customer_id);
    }
    if (status) {
      conditions.push("s.status = ?");
      params.push(status);
    }
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    const [countRow] = await req.db.query(
      `SELECT COUNT(*) AS total FROM subscriptions s ${where}`,
      params
    );

    const items = await req.db.query(
      `${SELECT_SUB} ${where} ORDER BY s.id DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return res.sendSuccess("Subscriptions retrieved", {
      items,
      total: countRow.total,
      limit,
      offset,
    });
  })
);

/**
 * GET /:id — fetch one subscription.
 */
router.get(
  "/:id",
  validateParams(idParamSchema),
  catchAsync(async (req, res) => {
    const [sub] = await req.db.query(`${SELECT_SUB} WHERE s.id = ? LIMIT 1`, [req.params.id]);
    if (!sub) {
      throw new APIError("Subscription not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    return res.sendSuccess("Subscription retrieved", sub);
  })
);

/**
 * POST / — create a subscription. super_admin and billing only.
 * Always starts in 'pending'; use POST /:id/status to move the lifecycle.
 */
router.post(
  "/",
  requireRole("super_admin", "billing"),
  validateBody(createSubscriptionSchema),
  catchAsync(async (req, res) => {
    const s = req.body;

    const conn = await req.db.beginTransaction();
    try {
      const [result] = await conn.execute(
        `INSERT INTO subscriptions (customer_id, plan_id, onu_id, statement_day, status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [s.customer_id, s.plan_id, s.onu_id, s.statement_day]
      );

      const created = await findSubscriptionById(conn, result.insertId);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "subscription",
        entityId: result.insertId,
        action: "create",
        before: null,
        after: created,
      });

      await req.db.commit(conn);
      return res.sendSuccess("Subscription created", created, 201);
    } catch (err) {
      await req.db.rollback(conn);
      throw mapDbError(err);
    }
  })
);

/**
 * PATCH /:id — edit plan/ONU/statement_day. super_admin and billing only.
 * (Status is NOT editable here — see POST /:id/status.)
 */
router.patch(
  "/:id",
  requireRole("super_admin", "billing"),
  validateParams(idParamSchema),
  validateBody(updateSubscriptionSchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const conn = await req.db.beginTransaction();
    try {
      const before = await findSubscriptionById(conn, id);
      if (!before) {
        await req.db.rollback(conn);
        throw new APIError("Subscription not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      const columns = Object.keys(updates);
      const setClause = columns.map((col) => `${col} = ?`).join(", ");
      const values = columns.map((col) => updates[col]);

      await conn.execute(`UPDATE subscriptions SET ${setClause} WHERE id = ?`, [...values, id]);

      const after = await findSubscriptionById(conn, id);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "subscription",
        entityId: Number(id),
        action: "update",
        before,
        after,
      });

      await req.db.commit(conn);
      return res.sendSuccess("Subscription updated", after);
    } catch (err) {
      if (err instanceof APIError && err.status === 404) {
        throw err;
      }
      await req.db.rollback(conn);
      throw mapDbError(err);
    }
  })
);

/**
 * POST /:id/status — move the subscription through its lifecycle.
 * The transition is validated against the state machine; illegal moves are 409.
 * super_admin and billing only.
 */
router.post(
  "/:id/status",
  requireRole("super_admin", "billing"),
  validateParams(idParamSchema),
  validateBody(statusBodySchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const { status: target } = req.body;

    const conn = await req.db.beginTransaction();
    try {
      const before = await findSubscriptionById(conn, id);
      if (!before) {
        await req.db.rollback(conn);
        throw new APIError("Subscription not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      // No-op if already in the requested state.
      if (before.status === target) {
        await req.db.rollback(conn);
        throw new APIError(`Subscription is already ${target}`, 409, ERROR_CODES.DUPLICATE_ENTRY);
      }

      // Enforce the state machine.
      const allowed = TRANSITIONS[before.status] || [];
      if (!allowed.includes(target)) {
        await req.db.rollback(conn);
        throw new APIError(
          `Cannot change status from '${before.status}' to '${target}'`,
          409,
          ERROR_CODES.VALIDATION_FAILED
        );
      }

      // Side effects of specific transitions.
      const sets = ["status = ?"];
      const values = [target];

      if (target === "active" && !before.activated_at) {
        sets.push("activated_at = NOW()");
      }
      if (target === "terminated") {
        sets.push("terminated_at = NOW()");
        // Free the ONU so it can be reassigned to a new subscription.
        sets.push("onu_id = NULL");
      }

      await conn.execute(`UPDATE subscriptions SET ${sets.join(", ")} WHERE id = ?`, [
        ...values,
        id,
      ]);

      const after = await findSubscriptionById(conn, id);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "subscription",
        entityId: Number(id),
        action: transitionAction(before.status, target),
        before,
        after,
      });

      await req.db.commit(conn);
      return res.sendSuccess(`Subscription ${target}`, after);
    } catch (err) {
      if (err instanceof APIError && (err.status === 404 || err.status === 409)) {
        throw err;
      }
      await req.db.rollback(conn);
      throw err;
    }
  })
);

export default router;
