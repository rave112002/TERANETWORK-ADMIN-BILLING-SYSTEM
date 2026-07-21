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

// Select the port plus its parent OLT's name for convenience.
const SELECT_PON = `SELECT p.id, p.olt_id, o.name AS olt_name, p.port_index, p.capacity, p.status, p.created_at, p.updated_at
   FROM pon_ports p
   JOIN olts o ON o.id = p.olt_id`;

/* ----------------------------- Validation ----------------------------- */

const createPonPortSchema = z.object({
  olt_id: z.number().int().positive(),
  port_index: z.string().trim().min(1).max(32),
  capacity: z.number().int().min(1).max(65535).default(64),
  status: z.enum(["active", "down", "reserved"]).default("active"),
});

const updatePonPortSchema = createPonPortSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const listQuerySchema = z.object({
  olt_id: z.coerce.number().int().positive().optional(),
});

/* ------------------------------ Helpers -------------------------------- */

const findPonPortById = async (conn, id) => {
  const [rows] = await conn.execute(`${SELECT_PON} WHERE p.id = ? LIMIT 1`, [id]);
  return rows[0];
};

// Translate MySQL constraint errors into friendly API errors.
const mapDbError = (err) => {
  if (err && err.code === "ER_DUP_ENTRY") {
    return new APIError(
      "This port index already exists on the selected OLT",
      409,
      ERROR_CODES.DUPLICATE_ENTRY
    );
  }
  if (err && (err.code === "ER_NO_REFERENCED_ROW_2" || err.code === "ER_NO_REFERENCED_ROW")) {
    return new APIError("The referenced OLT does not exist", 400, ERROR_CODES.VALIDATION_FAILED);
  }
  return err;
};

/* ------------------------------- Routes -------------------------------- */

/**
 * GET / — list PON ports, optionally filtered by ?olt_id. Any authenticated staff.
 */
router.get(
  "/",
  validateQuery(listQuerySchema),
  catchAsync(async (req, res) => {
    const { olt_id } = req.validatedQuery;

    let sql = SELECT_PON;
    const params = [];
    if (olt_id) {
      sql += " WHERE p.olt_id = ?";
      params.push(olt_id);
    }
    sql += " ORDER BY p.olt_id, p.port_index";

    const ports = await req.db.query(sql, params);
    return res.sendSuccess("PON ports retrieved", ports);
  })
);

/**
 * GET /:id — fetch one PON port.
 */
router.get(
  "/:id",
  validateParams(idParamSchema),
  catchAsync(async (req, res) => {
    const [port] = await req.db.query(`${SELECT_PON} WHERE p.id = ? LIMIT 1`, [req.params.id]);
    if (!port) {
      throw new APIError("PON port not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    return res.sendSuccess("PON port retrieved", port);
  })
);

/**
 * POST / — create a PON port. super_admin and noc only.
 */
router.post(
  "/",
  requireRole("super_admin", "noc"),
  validateBody(createPonPortSchema),
  catchAsync(async (req, res) => {
    const p = req.body;

    const conn = await req.db.beginTransaction();
    try {
      const [result] = await conn.execute(
        `INSERT INTO pon_ports (olt_id, port_index, capacity, status) VALUES (?, ?, ?, ?)`,
        [p.olt_id, p.port_index, p.capacity, p.status]
      );

      const created = await findPonPortById(conn, result.insertId);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "pon_port",
        entityId: result.insertId,
        action: "create",
        before: null,
        after: created,
      });

      await req.db.commit(conn);
      return res.sendSuccess("PON port created", created, 201);
    } catch (err) {
      await req.db.rollback(conn);
      throw mapDbError(err);
    }
  })
);

/**
 * PATCH /:id — update a PON port. super_admin and noc only.
 */
router.patch(
  "/:id",
  requireRole("super_admin", "noc"),
  validateParams(idParamSchema),
  validateBody(updatePonPortSchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const conn = await req.db.beginTransaction();
    try {
      const before = await findPonPortById(conn, id);
      if (!before) {
        await req.db.rollback(conn);
        throw new APIError("PON port not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      const columns = Object.keys(updates);
      const setClause = columns.map((col) => `${col} = ?`).join(", ");
      const values = columns.map((col) => updates[col]);

      await conn.execute(`UPDATE pon_ports SET ${setClause} WHERE id = ?`, [...values, id]);

      const after = await findPonPortById(conn, id);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "pon_port",
        entityId: Number(id),
        action: "update",
        before,
        after,
      });

      await req.db.commit(conn);
      return res.sendSuccess("PON port updated", after);
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
 * DELETE /:id — hard delete a PON port. super_admin and noc only.
 * Ports have no billing history, so a real delete is fine — but the DB will
 * block it (RESTRICT) if child records (splitters/ONUs) still reference it,
 * once those tables exist.
 */
router.delete(
  "/:id",
  requireRole("super_admin", "noc"),
  validateParams(idParamSchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;

    const conn = await req.db.beginTransaction();
    try {
      const before = await findPonPortById(conn, id);
      if (!before) {
        await req.db.rollback(conn);
        throw new APIError("PON port not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      await conn.execute("DELETE FROM pon_ports WHERE id = ?", [id]);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "pon_port",
        entityId: Number(id),
        action: "delete",
        before,
        after: null,
      });

      await req.db.commit(conn);
      return res.sendSuccess("PON port deleted", { id: Number(id) });
    } catch (err) {
      if (err instanceof APIError && err.status === 404) {
        throw err;
      }
      await req.db.rollback(conn);
      // A child row referencing this port would raise a FK RESTRICT error.
      if (err && err.code === "ER_ROW_IS_REFERENCED_2") {
        throw new APIError(
          "Cannot delete: other records still reference this PON port",
          409,
          ERROR_CODES.DUPLICATE_ENTRY
        );
      }
      throw err;
    }
  })
);

export default router;
