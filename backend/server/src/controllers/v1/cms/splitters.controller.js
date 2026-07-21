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

const SPLITTER_COLUMNS =
  "id, parent_type, parent_id, ratio, label, location, created_at, updated_at";

const RATIOS = ["1:2", "1:4", "1:8", "1:16", "1:32", "1:64"];
const PARENT_TYPES = ["pon_port", "splitter"];

/* ----------------------------- Validation ----------------------------- */

const createSplitterSchema = z.object({
  parent_type: z.enum(PARENT_TYPES),
  parent_id: z.number().int().positive(),
  ratio: z.enum(RATIOS),
  label: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((v) => v ?? null),
  location: z
    .string()
    .trim()
    .max(190)
    .nullish()
    .transform((v) => v ?? null),
});

const updateSplitterSchema = createSplitterSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  })
  // If you change the parent, you must provide BOTH parts so we can validate them.
  .refine((data) => (data.parent_type === undefined) === (data.parent_id === undefined), {
    message: "parent_type and parent_id must be provided together",
  });

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const listQuerySchema = z.object({
  parent_type: z.enum(PARENT_TYPES).optional(),
  parent_id: z.coerce.number().int().positive().optional(),
});

/* ------------------------------ Helpers -------------------------------- */

const findSplitterById = async (conn, id) => {
  const [rows] = await conn.execute(
    `SELECT ${SPLITTER_COLUMNS} FROM splitters WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0];
};

/**
 * Enforce that the polymorphic parent actually exists (the check MySQL can't do
 * with a foreign key). Also prevents a splitter from being its own parent.
 *
 * @param {import('mysql2/promise').Connection} conn
 * @param {string} parentType - 'pon_port' | 'splitter'
 * @param {number} parentId
 * @param {number|null} selfId - id of the splitter being updated (to block self-parent)
 * @throws {APIError} 400 if the parent is missing or invalid.
 */
const validateParent = async (conn, parentType, parentId, selfId = null) => {
  if (parentType === "splitter" && selfId !== null && Number(parentId) === Number(selfId)) {
    throw new APIError("A splitter cannot be its own parent", 400, ERROR_CODES.VALIDATION_FAILED);
  }

  const table = parentType === "pon_port" ? "pon_ports" : "splitters";
  const [rows] = await conn.execute(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`, [parentId]);
  if (rows.length === 0) {
    throw new APIError(
      `The referenced ${parentType.replace("_", " ")} does not exist`,
      400,
      ERROR_CODES.VALIDATION_FAILED
    );
  }
};

/* ------------------------------- Routes -------------------------------- */

/**
 * GET / — list splitters, optionally filtered by parent. Any authenticated staff.
 */
router.get(
  "/",
  validateQuery(listQuerySchema),
  catchAsync(async (req, res) => {
    const { parent_type, parent_id } = req.validatedQuery;

    let sql = `SELECT ${SPLITTER_COLUMNS} FROM splitters`;
    const params = [];
    const conditions = [];
    if (parent_type) {
      conditions.push("parent_type = ?");
      params.push(parent_type);
    }
    if (parent_id) {
      conditions.push("parent_id = ?");
      params.push(parent_id);
    }
    if (conditions.length) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY id DESC";

    const splitters = await req.db.query(sql, params);
    return res.sendSuccess("Splitters retrieved", splitters);
  })
);

/**
 * GET /:id — fetch one splitter.
 */
router.get(
  "/:id",
  validateParams(idParamSchema),
  catchAsync(async (req, res) => {
    const [splitter] = await req.db.query(
      `SELECT ${SPLITTER_COLUMNS} FROM splitters WHERE id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!splitter) {
      throw new APIError("Splitter not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    return res.sendSuccess("Splitter retrieved", splitter);
  })
);

/**
 * POST / — create a splitter. super_admin and noc only.
 */
router.post(
  "/",
  requireRole("super_admin", "noc"),
  validateBody(createSplitterSchema),
  catchAsync(async (req, res) => {
    const s = req.body;

    const conn = await req.db.beginTransaction();
    try {
      // Service-layer integrity check (no FK for a polymorphic parent).
      await validateParent(conn, s.parent_type, s.parent_id);

      const [result] = await conn.execute(
        `INSERT INTO splitters (parent_type, parent_id, ratio, label, location)
         VALUES (?, ?, ?, ?, ?)`,
        [s.parent_type, s.parent_id, s.ratio, s.label, s.location]
      );

      const created = await findSplitterById(conn, result.insertId);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "splitter",
        entityId: result.insertId,
        action: "create",
        before: null,
        after: created,
      });

      await req.db.commit(conn);
      return res.sendSuccess("Splitter created", created, 201);
    } catch (err) {
      await req.db.rollback(conn);
      throw err;
    }
  })
);

/**
 * PATCH /:id — update a splitter. super_admin and noc only.
 */
router.patch(
  "/:id",
  requireRole("super_admin", "noc"),
  validateParams(idParamSchema),
  validateBody(updateSplitterSchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const conn = await req.db.beginTransaction();
    try {
      const before = await findSplitterById(conn, id);
      if (!before) {
        await req.db.rollback(conn);
        throw new APIError("Splitter not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      // If the parent is being changed, validate the new parent exists.
      if (updates.parent_type !== undefined) {
        await validateParent(conn, updates.parent_type, updates.parent_id, id);
      }

      const columns = Object.keys(updates);
      const setClause = columns.map((col) => `${col} = ?`).join(", ");
      const values = columns.map((col) => updates[col]);

      await conn.execute(`UPDATE splitters SET ${setClause} WHERE id = ?`, [...values, id]);

      const after = await findSplitterById(conn, id);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "splitter",
        entityId: Number(id),
        action: "update",
        before,
        after,
      });

      await req.db.commit(conn);
      return res.sendSuccess("Splitter updated", after);
    } catch (err) {
      // The 404 branch above already rolled back and released the connection.
      if (err instanceof APIError && err.status === 404) {
        throw err;
      }
      // Any other error (including a 400 from validateParent) leaves the
      // transaction open, so roll it back here.
      await req.db.rollback(conn);
      throw err;
    }
  })
);

/**
 * DELETE /:id — hard delete a splitter. super_admin and noc only.
 */
router.delete(
  "/:id",
  requireRole("super_admin", "noc"),
  validateParams(idParamSchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;

    const conn = await req.db.beginTransaction();
    try {
      const before = await findSplitterById(conn, id);
      if (!before) {
        await req.db.rollback(conn);
        throw new APIError("Splitter not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      await conn.execute("DELETE FROM splitters WHERE id = ?", [id]);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "splitter",
        entityId: Number(id),
        action: "delete",
        before,
        after: null,
      });

      await req.db.commit(conn);
      return res.sendSuccess("Splitter deleted", { id: Number(id) });
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
