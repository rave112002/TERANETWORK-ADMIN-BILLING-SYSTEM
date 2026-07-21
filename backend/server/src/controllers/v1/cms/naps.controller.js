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

// NAP columns plus the parent splitter's ratio, for convenience.
const SELECT_NAP = `SELECT n.id, n.splitter_id, s.ratio AS splitter_ratio, n.label, n.total_ports,
          n.gps_lat, n.gps_lng, n.notes, n.created_at, n.updated_at
   FROM naps n
   JOIN splitters s ON s.id = n.splitter_id`;

/* ----------------------------- Validation ----------------------------- */

const createNapSchema = z.object({
  splitter_id: z.number().int().positive(),
  label: z.string().trim().min(1).max(120),
  total_ports: z.number().int().min(1).max(255).default(8),
  gps_lat: z.number().min(-90).max(90),
  gps_lng: z.number().min(-180).max(180),
  notes: z
    .string()
    .trim()
    .max(10000)
    .nullish()
    .transform((v) => v ?? null),
});

const updateNapSchema = createNapSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: "Provide at least one field to update",
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const listQuerySchema = z.object({
  splitter_id: z.coerce.number().int().positive().optional(),
});

/* ------------------------------ Helpers -------------------------------- */

const findNapById = async (conn, id) => {
  const [rows] = await conn.execute(`${SELECT_NAP} WHERE n.id = ? LIMIT 1`, [id]);
  return rows[0];
};

const mapDbError = (err) => {
  if (err && (err.code === "ER_NO_REFERENCED_ROW_2" || err.code === "ER_NO_REFERENCED_ROW")) {
    return new APIError(
      "The referenced splitter does not exist",
      400,
      ERROR_CODES.VALIDATION_FAILED
    );
  }
  return err;
};

/* ------------------------------- Routes -------------------------------- */

/**
 * GET / — list NAPs, optionally filtered by ?splitter_id. Any authenticated staff.
 */
router.get(
  "/",
  validateQuery(listQuerySchema),
  catchAsync(async (req, res) => {
    const { splitter_id } = req.validatedQuery;

    let sql = SELECT_NAP;
    const params = [];
    if (splitter_id) {
      sql += " WHERE n.splitter_id = ?";
      params.push(splitter_id);
    }
    sql += " ORDER BY n.id DESC";

    const naps = await req.db.query(sql, params);
    return res.sendSuccess("NAPs retrieved", naps);
  })
);

/**
 * GET /:id — fetch one NAP.
 */
router.get(
  "/:id",
  validateParams(idParamSchema),
  catchAsync(async (req, res) => {
    const [nap] = await req.db.query(`${SELECT_NAP} WHERE n.id = ? LIMIT 1`, [req.params.id]);
    if (!nap) {
      throw new APIError("NAP not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    return res.sendSuccess("NAP retrieved", nap);
  })
);

/**
 * POST / — create a NAP. super_admin and noc only.
 */
router.post(
  "/",
  requireRole("super_admin", "noc"),
  validateBody(createNapSchema),
  catchAsync(async (req, res) => {
    const n = req.body;

    const conn = await req.db.beginTransaction();
    try {
      const [result] = await conn.execute(
        `INSERT INTO naps (splitter_id, label, total_ports, gps_lat, gps_lng, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [n.splitter_id, n.label, n.total_ports, n.gps_lat, n.gps_lng, n.notes]
      );

      const created = await findNapById(conn, result.insertId);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "nap",
        entityId: result.insertId,
        action: "create",
        before: null,
        after: created,
      });

      await req.db.commit(conn);
      return res.sendSuccess("NAP created", created, 201);
    } catch (err) {
      await req.db.rollback(conn);
      throw mapDbError(err);
    }
  })
);

/**
 * PATCH /:id — update a NAP. super_admin and noc only.
 */
router.patch(
  "/:id",
  requireRole("super_admin", "noc"),
  validateParams(idParamSchema),
  validateBody(updateNapSchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const conn = await req.db.beginTransaction();
    try {
      const before = await findNapById(conn, id);
      if (!before) {
        await req.db.rollback(conn);
        throw new APIError("NAP not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      const columns = Object.keys(updates);
      const setClause = columns.map((col) => `${col} = ?`).join(", ");
      const values = columns.map((col) => updates[col]);

      await conn.execute(`UPDATE naps SET ${setClause} WHERE id = ?`, [...values, id]);

      const after = await findNapById(conn, id);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "nap",
        entityId: Number(id),
        action: "update",
        before,
        after,
      });

      await req.db.commit(conn);
      return res.sendSuccess("NAP updated", after);
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
 * DELETE /:id — hard delete a NAP. super_admin and noc only.
 * Blocked by the DB (RESTRICT) if ONUs still reference it, once that table exists.
 */
router.delete(
  "/:id",
  requireRole("super_admin", "noc"),
  validateParams(idParamSchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;

    const conn = await req.db.beginTransaction();
    try {
      const before = await findNapById(conn, id);
      if (!before) {
        await req.db.rollback(conn);
        throw new APIError("NAP not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      await conn.execute("DELETE FROM naps WHERE id = ?", [id]);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "nap",
        entityId: Number(id),
        action: "delete",
        before,
        after: null,
      });

      await req.db.commit(conn);
      return res.sendSuccess("NAP deleted", { id: Number(id) });
    } catch (err) {
      if (err instanceof APIError && err.status === 404) {
        throw err;
      }
      await req.db.rollback(conn);
      if (err && err.code === "ER_ROW_IS_REFERENCED_2") {
        throw new APIError(
          "Cannot delete: ONUs still reference this NAP",
          409,
          ERROR_CODES.DUPLICATE_ENTRY
        );
      }
      throw err;
    }
  })
);

export default router;
