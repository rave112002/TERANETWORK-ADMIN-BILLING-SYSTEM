import { Router } from "express";
import crypto from "node:crypto";
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

const CUSTOMER_COLUMNS =
  "id, account_no, name, email, phone, address, gps_lat, gps_lng, id_type, id_number, status, created_at, updated_at";

/* ----------------------------- Validation ----------------------------- */

// Reusable optional-text field: accepts a string, or null/absent -> null.
const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v ?? null);

const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(190),
  phone: optionalText(32),
  address: optionalText(255),
  // Latitude -90..90, longitude -180..180. Optional (null if not provided).
  gps_lat: z
    .number()
    .min(-90)
    .max(90)
    .nullish()
    .transform((v) => v ?? null),
  gps_lng: z
    .number()
    .min(-180)
    .max(180)
    .nullish()
    .transform((v) => v ?? null),
  id_type: optionalText(40),
  id_number: optionalText(64),
  status: z.enum(["active", "inactive"]).default("active"),
});

const updateCustomerSchema = createCustomerSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const listQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

/* ------------------------------ Helpers -------------------------------- */

const findCustomerById = async (conn, id) => {
  const [rows] = await conn.execute(
    `SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0];
};

/* ------------------------------- Routes -------------------------------- */

/**
 * GET / — list customers with optional search and pagination.
 * Query: ?search=<text>&limit=<1-100>&offset=<n>
 * Any authenticated staff may read.
 */
router.get(
  "/",
  validateQuery(listQuerySchema),
  catchAsync(async (req, res) => {
    const { search, limit, offset } = req.validatedQuery;

    // Build an optional WHERE clause for search across a few columns.
    let where = "";
    const params = [];
    if (search) {
      where = "WHERE name LIKE ? OR email LIKE ? OR account_no LIKE ?";
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    // Total count (for pagination UIs), using the same filter.
    const [countRow] = await req.db.query(
      `SELECT COUNT(*) AS total FROM customers ${where}`,
      params
    );

    // limit/offset are validated integers, so inlining them is safe here.
    const items = await req.db.query(
      `SELECT ${CUSTOMER_COLUMNS} FROM customers ${where} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return res.sendSuccess("Customers retrieved", {
      items,
      total: countRow.total,
      limit,
      offset,
    });
  })
);

/**
 * GET /:id — fetch one customer.
 */
router.get(
  "/:id",
  validateParams(idParamSchema),
  catchAsync(async (req, res) => {
    const [customer] = await req.db.query(
      `SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!customer) {
      throw new APIError("Customer not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    return res.sendSuccess("Customer retrieved", customer);
  })
);

/**
 * POST / — create a customer. super_admin and billing only.
 * account_no is generated from the new row id, inside the transaction.
 */
router.post(
  "/",
  requireRole("super_admin", "billing"),
  validateBody(createCustomerSchema),
  catchAsync(async (req, res) => {
    const c = req.body;

    const conn = await req.db.beginTransaction();
    try {
      // Temporary unique placeholder so the NOT NULL + UNIQUE column is satisfied
      // before we know the id. Replaced immediately below.
      const placeholder = `TMP-${crypto.randomBytes(6).toString("hex")}`;

      const [result] = await conn.execute(
        `INSERT INTO customers
           (account_no, name, email, phone, address, gps_lat, gps_lng, id_type, id_number, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          placeholder,
          c.name,
          c.email,
          c.phone,
          c.address,
          c.gps_lat,
          c.gps_lng,
          c.id_type,
          c.id_number,
          c.status,
        ]
      );

      // Derive the real account number from the auto-increment id.
      const accountNo = `ACC-${String(result.insertId).padStart(6, "0")}`;
      await conn.execute("UPDATE customers SET account_no = ? WHERE id = ?", [
        accountNo,
        result.insertId,
      ]);

      const created = await findCustomerById(conn, result.insertId);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "customer",
        entityId: result.insertId,
        action: "create",
        before: null,
        after: created,
      });

      await req.db.commit(conn);
      return res.sendSuccess("Customer created", created, 201);
    } catch (err) {
      await req.db.rollback(conn);
      throw err;
    }
  })
);

/**
 * PATCH /:id — update a customer. super_admin and billing only.
 */
router.patch(
  "/:id",
  requireRole("super_admin", "billing"),
  validateParams(idParamSchema),
  validateBody(updateCustomerSchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    const conn = await req.db.beginTransaction();
    try {
      const before = await findCustomerById(conn, id);
      if (!before) {
        await req.db.rollback(conn);
        throw new APIError("Customer not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      const columns = Object.keys(updates);
      const setClause = columns.map((col) => `${col} = ?`).join(", ");
      const values = columns.map((col) => updates[col]);

      await conn.execute(`UPDATE customers SET ${setClause} WHERE id = ?`, [...values, id]);

      const after = await findCustomerById(conn, id);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "customer",
        entityId: Number(id),
        action: "update",
        before,
        after,
      });

      await req.db.commit(conn);
      return res.sendSuccess("Customer updated", after);
    } catch (err) {
      if (err instanceof APIError && err.status === 404) {
        throw err;
      }
      await req.db.rollback(conn);
      throw err;
    }
  })
);

/**
 * DELETE /:id — soft delete (set status = 'inactive'). super_admin and billing.
 * We never hard-delete customers, so their billing history stays intact.
 */
router.delete(
  "/:id",
  requireRole("super_admin", "billing"),
  validateParams(idParamSchema),
  catchAsync(async (req, res) => {
    const { id } = req.params;

    const conn = await req.db.beginTransaction();
    try {
      const before = await findCustomerById(conn, id);
      if (!before) {
        await req.db.rollback(conn);
        throw new APIError("Customer not found", 404, ERROR_CODES.RESOURCE_NOT_FOUND);
      }

      await conn.execute("UPDATE customers SET status = 'inactive' WHERE id = ?", [id]);
      const after = await findCustomerById(conn, id);

      await writeAudit(conn, {
        ...getAuditContext(req),
        entity: "customer",
        entityId: Number(id),
        action: "deactivate",
        before,
        after,
      });

      await req.db.commit(conn);
      return res.sendSuccess("Customer deactivated", after);
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
