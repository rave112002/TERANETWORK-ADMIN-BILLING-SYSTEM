/**
 * Audit logging helper.
 *
 * Writes an immutable row into `audit_logs` describing a sensitive change.
 *
 * CRITICAL: pass the SAME transaction connection used for the change itself
 * (the connection returned by `db.beginTransaction()`). That way the audit row
 * and the change commit or roll back together — you can never have one without
 * the other.
 *
 * @example
 *   const conn = await req.db.beginTransaction();
 *   try {
 *     await conn.execute("UPDATE plans SET monthly_price = ? WHERE id = ?", [price, id]);
 *     await writeAudit(conn, {
 *       ...getAuditContext(req),
 *       entity: "plan",
 *       entityId: id,
 *       action: "update",
 *       before: oldPlan,
 *       after: newPlan,
 *     });
 *     await req.db.commit(conn);
 *   } catch (err) {
 *     await req.db.rollback(conn);
 *     throw err;
 *   }
 */

/**
 * @typedef {Object} AuditEntry
 * @property {number|null} [actorId] - Staff user id, or null for system actions.
 * @property {string} entity - Kind of record, e.g. 'user', 'customer'.
 * @property {number} entityId - Id of the affected record.
 * @property {string} action - What happened, e.g. 'create', 'update', 'delete'.
 * @property {Object|null} [before] - Snapshot before the change (null for creates).
 * @property {Object|null} [after] - Snapshot after the change (null for deletes).
 * @property {string|null} [ip] - Originating IP address.
 */

/**
 * Insert an audit row using the given transaction connection.
 *
 * @param {import('mysql2/promise').Connection} conn - Active transaction connection.
 * @param {AuditEntry} entry - The audit details.
 * @returns {Promise<void>}
 */
export const writeAudit = async (
  conn,
  { actorId = null, entity, entityId, action, before = null, after = null, ip = null }
) => {
  await conn.execute(
    `INSERT INTO audit_logs
       (actor_id, entity, entity_id, action, before_state, after_state, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      actorId,
      entity,
      entityId,
      action,
      // JSON columns need a JSON string, not a JS object.
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      ip,
    ]
  );
};

/**
 * Pull the actor id and IP off an Express request, for convenience.
 * `req.user` is set by passport on authenticated routes; it's absent for
 * unauthenticated/system contexts, in which case actorId is null.
 *
 * @param {import('express').Request} req
 * @returns {{ actorId: number|null, ip: string|null }}
 */
export const getAuditContext = (req) => ({
  actorId: req.user?.id ?? null,
  ip: req.ip ?? null,
});

export default writeAudit;
