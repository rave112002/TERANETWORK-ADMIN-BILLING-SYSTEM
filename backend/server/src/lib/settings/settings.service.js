/**
 * System settings reader/writer — thin wrapper over the `system_settings` table.
 *
 * Runtime-tunable config a super admin can change without touching .env or
 * redeploying. Values are stored as strings; helpers parse them.
 *
 * The star of Phase 2 is the DRY_RUN kill switch (see isDryRun()).
 */

/**
 * Read one setting's raw string value.
 * @param {Object} db - Database wrapper (has .query).
 * @param {string} key
 * @param {string|null} [fallback=null] - returned if the key isn't set.
 * @returns {Promise<string|null>}
 */
export const getSetting = async (db, key, fallback = null) => {
  const rows = await db.query(`SELECT value FROM system_settings WHERE \`key\` = ? LIMIT 1`, [key]);
  return rows.length > 0 ? rows[0].value : fallback;
};

/**
 * Create or update a setting (upsert).
 * @param {Object} runner - Database wrapper or transaction connection.
 * @param {string} key
 * @param {string} value
 * @param {number|null} [updatedBy=null] - staff user id making the change.
 */
export const setSetting = async (runner, key, value, updatedBy = null) => {
  const sql = `INSERT INTO system_settings (\`key\`, value, updated_by)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)`;
  if (typeof runner.execute === "function") {
    await runner.execute(sql, [key, value, updatedBy]);
  } else {
    await runner.query(sql, [key, value, updatedBy]);
  }
};

/**
 * Is the global DRY_RUN kill switch on?
 *
 * Treats 'true'/'1'/'yes' (any case) as on. Defaults to OFF when unset — a
 * missing switch must never silently stop real work.
 *
 * @param {Object} db - Database wrapper.
 * @returns {Promise<boolean>}
 */
export const isDryRun = async (db) => {
  const raw = (await getSetting(db, "DRY_RUN", "false")) ?? "false";
  return ["true", "1", "yes"].includes(raw.trim().toLowerCase());
};

export default { getSetting, setSetting, isDryRun };
