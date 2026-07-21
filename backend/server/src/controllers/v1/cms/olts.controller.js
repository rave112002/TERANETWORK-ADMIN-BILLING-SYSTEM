import { Router } from "express";
import { z } from "zod";

import { catchAsync, validateBody, validateParams } from "../../../utils/catchAsync.js";
import APIError, { ERROR_CODES } from "../../../utils/APIError.js";
import { requireRole } from "../../../middlewares/rbac.middleware.js";
import { writeAudit, getAuditContext } from "../../../utils/audit.js";
import { encryptCredentials } from "../../../utils/credentialCrypto.js";

const router = Router();

// Columns returned to clients. NOTE: credentials_enc is intentionally excluded —
// credentials never leave the server through this API, and (because the audit
// "after" snapshot uses these columns) never reach the audit log either.
const OLT_COLUMNS =
  "id, name, vendor, pon_technology, model, host, port, protocol, site, status, max_concurrent_sessions, created_at, updated_at";

const VENDORS = ["hsgq", "huawei", "zte", "fiberhome", "vsol", "bdcom", "mock", "other"];
const PROTOCOLS = ["ssh", "telnet", "snmp", "tr069"];

/* ----------------------------- Validation ----------------------------- */

const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v ?? null);

// The secret bundle we encrypt. Required whenever credentials are provided.
const credentialsSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(255),
  enablePassword: z.string().max(255).optional(),
});

const createOltSchema = z.object({
  name: z.string().trim().min(1).max(120),
  vendor: z.enum(VENDORS),
  pon_technology: z.enum(["epon", "gpon"]).default("epon"),
  model: optionalText(80),
  host: z.string().trim().min(1).max(190),
  port: z.number().int().min(1).max(65535).default(23),
  protocol: z.enum(PROTOCOLS),
  credentials: credentialsSchema, // required on create
  site: optionalText(120),
  status: z.enum(["active", "maintenance", "retired"]).default("active"),
  max_concurrent_sessions: z.number().int().min(1).max(255).default(1),
});

const updateOltSchema = createOltSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: "Provide at least one field to update",
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/* ------------------------------ Helpers -------------------------------- */

const findOltById = async (conn, id) => {
  const [rows] = await conn.execute(`SELECT ${OLT_COLUMNS} FROM olts WHERE id = ? LIMIT 1`, [id]);
  return rows[0];
};

// Map a MySQL duplicate-key error to a friendly 409.
const asDuplicateError = (err) => {
  if (err && err.code === "ER_DUP_ENTRY") {
    return new APIError("An OLT with this name already exists", 409, ERROR_CODES.DUPLICATE_ENTRY);
  }
  return err;
};

/* ------------------------------- Routes -------------------------------- */

/**
 * GET / — list OLTs (metadata only, never credentials). Any authenticated staff.
 */
router.get(
  "/",
  catchAsync(async (req, res) => {
    const olts = await req.db.query(`SELECT ${OLT_COLUMNS} FROM olts ORDER BY id DESC`);
    return res.sendSuccess("OLTs retrieved", olts);
  })
);

/**
 * GET /:id — fetch one OLT (metadata only).
 */
router.get(
  "/:id",
  validateParams(idParamSchema),
  catchAsync(async (req, res) => {
    const [olt] = await req.db.query(`SELECT ${OLT_COLUMNS} FROM olts WHERE id = ? LIMIT 1`, [
      req.params.id,
    ]);
    if (!olt) {
      throw new APIError("OLT not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    return res.sendSuccess("OLT retrieved", olt);
  })
);

/**
 * POST / — create an OLT. super_admin and noc only.
 * Credentials are encrypted into an envelope before storage.
 */
router.post(
  "/",
  requireRole("super_admin", "noc"),
  validateBody(createOltSchema),
  catchAsync(async (req, res) => {
    const { credentials, ...m } = req.body;
    // Encrypt credentials up front; the plaintext is never persisted or logged.
    const credentialsEnc = encryptCredentials(credentials);

    const conn = await req.db.beginTransaction();
    try {
      const [result] = await conn.execute(
        `INSERT INTO olts
           (name, vendor, pon_technology, model, host, port, protocol, credentials_enc, site, status, max_concurrent_sessions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          m.name,
          m.vendor,
          m.pon_technology,
          m.model,
          m.host,
          m.port,
          m.protocol,
          credentialsEnc,
          m.site,
          m.status,
          m.max_concurrent_sessions,
        ]
      );

      const created = await findOltById(conn, result.insertId);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "olt",
        entityId: result.insertId,
        action: "create",
        before: null,
        after: created, // metadata only — no credentials
      });

      await req.db.commit(conn);
      return res.sendSuccess("OLT created", created, 201);
    } catch (err) {
      await req.db.rollback(conn);
      throw asDuplicateError(err);
    }
  })
);

/**
 * PATCH /:id — update an OLT. super_admin and noc only.
 * If `credentials` is included, it is re-encrypted; otherwise credentials are
 * left untouched.
 */
router.patch(
  "/:id",
  requireRole("super_admin", "noc"),
  validateParams(idParamSchema),
  validateBody(updateOltSchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const { credentials, ...updates } = req.body;

    const conn = await req.db.beginTransaction();
    try {
      const before = await findOltById(conn, id);
      if (!before) {
        await req.db.rollback(conn);
        throw new APIError("OLT not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      // Metadata columns from the (non-credential) fields provided.
      const columns = Object.keys(updates);
      const setParts = columns.map((col) => `${col} = ?`);
      const values = columns.map((col) => updates[col]);

      // If new credentials were supplied, encrypt and include them.
      if (credentials) {
        setParts.push("credentials_enc = ?");
        values.push(encryptCredentials(credentials));
      }

      await conn.execute(`UPDATE olts SET ${setParts.join(", ")} WHERE id = ?`, [...values, id]);

      const after = await findOltById(conn, id);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "olt",
        entityId: Number(id),
        action: "update",
        before,
        after,
      });

      await req.db.commit(conn);
      return res.sendSuccess("OLT updated", after);
    } catch (err) {
      if (err instanceof APIError && err.status === 404) {
        throw err;
      }
      await req.db.rollback(conn);
      throw asDuplicateError(err);
    }
  })
);

/**
 * DELETE /:id — mark an OLT retired (soft delete). super_admin and noc only.
 */
router.delete(
  "/:id",
  requireRole("super_admin", "noc"),
  validateParams(idParamSchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;

    const conn = await req.db.beginTransaction();
    try {
      const before = await findOltById(conn, id);
      if (!before) {
        await req.db.rollback(conn);
        throw new APIError("OLT not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      await conn.execute("UPDATE olts SET status = 'retired' WHERE id = ?", [id]);
      const after = await findOltById(conn, id);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "olt",
        entityId: Number(id),
        action: "retire",
        before,
        after,
      });

      await req.db.commit(conn);
      return res.sendSuccess("OLT retired", after);
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
