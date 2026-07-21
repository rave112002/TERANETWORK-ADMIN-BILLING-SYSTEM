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

const STATES = ["unprovisioned", "active", "suspended", "offline"];
const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

// ONU columns plus friendly names of its NAP / OLT / PON port (LEFT JOIN because
// those links are optional for an unplaced ONU).
const SELECT_ONU = `SELECT o.id, o.serial_no, o.mac, o.model,
          o.nap_id, na.label AS nap_label, o.nap_port,
          o.olt_id, ol.name AS olt_name,
          o.pon_port_id, pp.port_index AS pon_port_index,
          o.onu_index, o.provisioning_state,
          o.last_rx_dbm, o.last_tx_dbm, o.last_seen_at,
          o.created_at, o.updated_at
   FROM onus o
   LEFT JOIN naps na ON na.id = o.nap_id
   LEFT JOIN olts ol ON ol.id = o.olt_id
   LEFT JOIN pon_ports pp ON pp.id = o.pon_port_id`;

/* ----------------------------- Validation ----------------------------- */

const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v ?? null);

const optionalId = z
  .number()
  .int()
  .positive()
  .optional()
  .nullable()
  .transform((v) => v ?? null);

const createOnuSchema = z.object({
  serial_no: z.string().trim().min(1).max(64),
  // Optional; if present, validated and normalized to UPPER:CASE:WITH:COLONS.
  mac: z
    .string()
    .regex(MAC_REGEX, "Invalid MAC address")
    .optional()
    .nullable()
    .transform((v) => (v ? v.replace(/-/g, ":").toUpperCase() : null)),
  model: optionalText(80),
  nap_id: optionalId,
  nap_port: z
    .number()
    .int()
    .min(0)
    .max(255)
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  olt_id: optionalId,
  pon_port_id: optionalId,
  onu_index: optionalText(32),
  // NOTE: for now staff may set any state during inventory setup. In Phase 5 the
  // 'active'/'suspended' transitions will be restricted to the provisioning
  // worker (only after a confirmed device command).
  provisioning_state: z.enum(STATES).default("unprovisioned"),
});

const updateOnuSchema = createOnuSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: "Provide at least one field to update",
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const listQuerySchema = z.object({
  search: z.string().trim().max(64).optional(),
  nap_id: z.coerce.number().int().positive().optional(),
  olt_id: z.coerce.number().int().positive().optional(),
  provisioning_state: z.enum(STATES).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

/* ------------------------------ Helpers -------------------------------- */

const findOnuById = async (conn, id) => {
  const [rows] = await conn.execute(`${SELECT_ONU} WHERE o.id = ? LIMIT 1`, [id]);
  return rows[0];
};

const mapDbError = (err) => {
  if (err && err.code === "ER_DUP_ENTRY") {
    if (err.message && err.message.includes("uq_nap_port")) {
      return new APIError(
        "That NAP port is already occupied by another ONU",
        409,
        ERROR_CODES.DUPLICATE_ENTRY
      );
    }
    return new APIError(
      "An ONU with this serial number or MAC already exists",
      409,
      ERROR_CODES.DUPLICATE_ENTRY
    );
  }
  if (err && (err.code === "ER_NO_REFERENCED_ROW_2" || err.code === "ER_NO_REFERENCED_ROW")) {
    return new APIError(
      "A referenced NAP, OLT, or PON port does not exist",
      400,
      ERROR_CODES.VALIDATION_FAILED
    );
  }
  return err;
};

/* ------------------------------- Routes -------------------------------- */

/**
 * GET / — list ONUs with search, filters, and pagination. Any authenticated staff.
 * Query: ?search=&nap_id=&olt_id=&provisioning_state=&limit=&offset=
 */
router.get(
  "/",
  validateQuery(listQuerySchema),
  catchAsync(async (req, res) => {
    const { search, nap_id, olt_id, provisioning_state, limit, offset } = req.validatedQuery;

    const conditions = [];
    const params = [];
    if (search) {
      conditions.push("(o.serial_no LIKE ? OR o.mac LIKE ?)");
      const like = `%${search}%`;
      params.push(like, like);
    }
    if (nap_id) {
      conditions.push("o.nap_id = ?");
      params.push(nap_id);
    }
    if (olt_id) {
      conditions.push("o.olt_id = ?");
      params.push(olt_id);
    }
    if (provisioning_state) {
      conditions.push("o.provisioning_state = ?");
      params.push(provisioning_state);
    }
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    const [countRow] = await req.db.query(`SELECT COUNT(*) AS total FROM onus o ${where}`, params);

    // limit/offset are validated integers, so inlining them is safe.
    const items = await req.db.query(
      `${SELECT_ONU} ${where} ORDER BY o.id DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return res.sendSuccess("ONUs retrieved", {
      items,
      total: countRow.total,
      limit,
      offset,
    });
  })
);

/**
 * GET /:id — fetch one ONU.
 */
router.get(
  "/:id",
  validateParams(idParamSchema),
  catchAsync(async (req, res) => {
    const [onu] = await req.db.query(`${SELECT_ONU} WHERE o.id = ? LIMIT 1`, [req.params.id]);
    if (!onu) {
      throw new APIError("ONU not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    return res.sendSuccess("ONU retrieved", onu);
  })
);

/**
 * POST / — create an ONU. super_admin and noc only.
 */
router.post(
  "/",
  requireRole("super_admin", "noc"),
  validateBody(createOnuSchema),
  catchAsync(async (req, res) => {
    const o = req.body;

    const conn = await req.db.beginTransaction();
    try {
      const [result] = await conn.execute(
        `INSERT INTO onus
           (serial_no, mac, model, nap_id, nap_port, olt_id, pon_port_id, onu_index, provisioning_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          o.serial_no,
          o.mac,
          o.model,
          o.nap_id,
          o.nap_port,
          o.olt_id,
          o.pon_port_id,
          o.onu_index,
          o.provisioning_state,
        ]
      );

      const created = await findOnuById(conn, result.insertId);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "onu",
        entityId: result.insertId,
        action: "create",
        before: null,
        after: created,
      });

      await req.db.commit(conn);
      return res.sendSuccess("ONU created", created, 201);
    } catch (err) {
      await req.db.rollback(conn);
      throw mapDbError(err);
    }
  })
);

/**
 * PATCH /:id — update an ONU. super_admin and noc only.
 */
router.patch(
  "/:id",
  requireRole("super_admin", "noc"),
  validateParams(idParamSchema),
  validateBody(updateOnuSchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const conn = await req.db.beginTransaction();
    try {
      const before = await findOnuById(conn, id);
      if (!before) {
        await req.db.rollback(conn);
        throw new APIError("ONU not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      const columns = Object.keys(updates);
      const setClause = columns.map((col) => `${col} = ?`).join(", ");
      const values = columns.map((col) => updates[col]);

      await conn.execute(`UPDATE onus SET ${setClause} WHERE id = ?`, [...values, id]);

      const after = await findOnuById(conn, id);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "onu",
        entityId: Number(id),
        action: "update",
        before,
        after,
      });

      await req.db.commit(conn);
      return res.sendSuccess("ONU updated", after);
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
 * DELETE /:id — hard delete an ONU. super_admin and noc only.
 * (Blocked by the DB if a subscription references it, once that table exists.)
 */
router.delete(
  "/:id",
  requireRole("super_admin", "noc"),
  validateParams(idParamSchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;

    const conn = await req.db.beginTransaction();
    try {
      const before = await findOnuById(conn, id);
      if (!before) {
        await req.db.rollback(conn);
        throw new APIError("ONU not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      await conn.execute("DELETE FROM onus WHERE id = ?", [id]);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "onu",
        entityId: Number(id),
        action: "delete",
        before,
        after: null,
      });

      await req.db.commit(conn);
      return res.sendSuccess("ONU deleted", { id: Number(id) });
    } catch (err) {
      if (err instanceof APIError && err.status === 404) {
        throw err;
      }
      await req.db.rollback(conn);
      if (err && err.code === "ER_ROW_IS_REFERENCED_2") {
        throw new APIError(
          "Cannot delete: a subscription still references this ONU",
          409,
          ERROR_CODES.DUPLICATE_ENTRY
        );
      }
      throw err;
    }
  })
);

export default router;
