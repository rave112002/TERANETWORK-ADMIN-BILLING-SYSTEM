import { Router } from "express";
import { z } from "zod";

import { catchAsync, validateBody, validateParams } from "../../../utils/catchAsync.js";
import APIError, { ERROR_CODES } from "../../../utils/APIError.js";
import { requireRole } from "../../../middlewares/rbac.middleware.js";
import { writeAudit, getAuditContext } from "../../../utils/audit.js";

const router = Router();

// Columns we return to clients. Kept in one place so every query is consistent.
const PLAN_COLUMNS =
  "id, name, down_mbps, up_mbps, monthly_price, currency, reconnection_fee, install_fee, is_active, created_at, updated_at";

/* ----------------------------- Validation ----------------------------- */

// Shape for creating a plan. Money fields are non-negative numbers; the DB
// column (DECIMAL(12,2)) enforces exact 2-decimal storage.
const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(120),
  down_mbps: z.number().int().positive(),
  up_mbps: z.number().int().positive(),
  monthly_price: z.number().nonnegative(),
  currency: z.string().length(3).toUpperCase().default("PHP"),
  reconnection_fee: z.number().nonnegative().default(0),
  install_fee: z.number().nonnegative().default(0),
  is_active: z.boolean().default(true),
});

// Update: every field optional, but at least one must be present.
const updatePlanSchema = createPlanSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: "Provide at least one field to update",
});

// Route param :id must be a positive integer. z.coerce turns the string "5"
// from the URL into the number 5.
const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/* ------------------------------ Helpers -------------------------------- */

/**
 * Fetch a single plan row using a specific connection (so it can participate in
 * a transaction). Returns the row or undefined.
 */
const findPlanById = async (conn, id) => {
  const [rows] = await conn.execute(`SELECT ${PLAN_COLUMNS} FROM plans WHERE id = ? LIMIT 1`, [id]);
  return rows[0];
};

/* ------------------------------- Routes -------------------------------- */

/**
 * GET / — list all plans (newest first). Any authenticated staff may read.
 */
router.get(
  "/",
  catchAsync(async (req, res) => {
    const plans = await req.db.query(`SELECT ${PLAN_COLUMNS} FROM plans ORDER BY id DESC`);
    return res.sendSuccess("Plans retrieved", plans);
  })
);

/**
 * GET /:id — fetch one plan.
 */
router.get(
  "/:id",
  validateParams(idParamSchema),
  catchAsync(async (req, res) => {
    const [plan] = await req.db.query(`SELECT ${PLAN_COLUMNS} FROM plans WHERE id = ? LIMIT 1`, [
      req.params.id,
    ]);
    if (!plan) {
      throw new APIError("Plan not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    return res.sendSuccess("Plan retrieved", plan);
  })
);

/**
 * POST / — create a plan. Only super_admin and billing staff.
 * The insert and its audit row share one transaction.
 */
router.post(
  "/",
  requireRole("super_admin", "billing"),
  validateBody(createPlanSchema),
  catchAsync(async (req, res) => {
    const p = req.body;

    const conn = await req.db.beginTransaction();
    try {
      const [result] = await conn.execute(
        `INSERT INTO plans
           (name, down_mbps, up_mbps, monthly_price, currency, reconnection_fee, install_fee, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.name,
          p.down_mbps,
          p.up_mbps,
          p.monthly_price,
          p.currency,
          p.reconnection_fee,
          p.install_fee,
          p.is_active,
        ]
      );

      const created = await findPlanById(conn, result.insertId);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "plan",
        entityId: result.insertId,
        action: "create",
        before: null,
        after: created,
      });

      await req.db.commit(conn);
      return res.sendSuccess("Plan created", created, 201);
    } catch (err) {
      await req.db.rollback(conn);
      throw err;
    }
  })
);

/**
 * PATCH /:id — update a plan. Only super_admin and billing staff.
 * Reads the old row, applies changes, re-reads, and audits before/after — all
 * inside one transaction.
 */
router.patch(
  "/:id",
  requireRole("super_admin", "billing"),
  validateParams(idParamSchema),
  validateBody(updatePlanSchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const conn = await req.db.beginTransaction();
    try {
      const before = await findPlanById(conn, id);
      if (!before) {
        await req.db.rollback(conn);
        throw new APIError("Plan not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      // Build "col = ?, col = ?" only from the fields actually provided. The
      // keys come from the Zod-parsed body, so they are a known, safe set.
      const columns = Object.keys(updates);
      const setClause = columns.map((col) => `${col} = ?`).join(", ");
      const values = columns.map((col) => updates[col]);

      await conn.execute(`UPDATE plans SET ${setClause} WHERE id = ?`, [...values, id]);

      const after = await findPlanById(conn, id);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "plan",
        entityId: Number(id),
        action: "update",
        before,
        after,
      });

      await req.db.commit(conn);
      return res.sendSuccess("Plan updated", after);
    } catch (err) {
      // If we already threw the 404 above, the connection is released; guard
      // against a double-release by only rolling back on other errors.
      if (err instanceof APIError && err.status === 404) {
        throw err;
      }
      await req.db.rollback(conn);
      throw err;
    }
  })
);

/**
 * DELETE /:id — soft delete (deactivate) a plan. Only super_admin.
 * We never hard-delete plans, so invoices referencing them stay valid.
 */
router.delete(
  "/:id",
  requireRole("super_admin"),
  validateParams(idParamSchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;

    const conn = await req.db.beginTransaction();
    try {
      const before = await findPlanById(conn, id);
      if (!before) {
        await req.db.rollback(conn);
        throw new APIError("Plan not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      await conn.execute("UPDATE plans SET is_active = 0 WHERE id = ?", [id]);
      const after = await findPlanById(conn, id);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "plan",
        entityId: Number(id),
        action: "deactivate",
        before,
        after,
      });

      await req.db.commit(conn);
      return res.sendSuccess("Plan deactivated", after);
    } catch (err) {
      if (err instanceof APIError && err.status === 404) {
        throw err;
      }
      await req.db.rollback(conn);
      throw err;
    }
  })
);

export default router;
