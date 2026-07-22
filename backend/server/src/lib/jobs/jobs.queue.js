/**
 * Jobs queue interface — the ONLY place that writes raw `jobs` SQL.
 * =================================================================
 *
 * Five small functions wrap the `jobs` table (our order-ticket rail):
 *
 *   enqueue()  - write a ticket (skip if an identical live one exists)
 *   claim()    - a worker grabs the next due ticket (safe against other workers)
 *   complete() - mark a ticket done
 *   fail()     - a try failed: retry with backoff, or dead-letter after N tries
 *   cancel()   - drop still-queued tickets by dedupe_key (e.g. customer paid)
 *
 * WHY a thin interface: everything else in the app calls these functions, never
 * raw job SQL. If we ever outgrow the table and move to Redis/BullMQ, we rewrite
 * only this file — callers don't change.
 *
 * ABOUT THE `runner` ARGUMENT: most functions take a `runner`, which can be
 * EITHER the shared Database wrapper (`req.db`, has `.query`) OR a raw
 * transaction connection (from `db.beginTransaction()`, has `.execute`). This
 * lets callers enqueue/cancel *inside* an existing transaction (e.g. the Xendit
 * webhook cancelling a disconnect in the same TX that records the payment).
 * `claim()` is special: it manages its own short transaction, so it needs the
 * Database wrapper itself, not a runner.
 */

/**
 * Run a query through whichever executor we were handed.
 * @param {Object} runner - Database wrapper (.query) or a raw connection (.execute).
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<Array|Object>} rows for SELECT, result header for INSERT/UPDATE.
 */
const run = async (runner, sql, params = []) => {
  if (typeof runner.execute === "function") {
    // Raw mysql2 connection (inside a caller's transaction).
    const [result] = await runner.execute(sql, params);
    return result;
  }
  // The Database wrapper — returns rows directly.
  return runner.query(sql, params);
};

/**
 * Write a ticket onto the rail — unless an identical live one already exists.
 *
 * Idempotent by `dedupeKey`: if a job with the same key is already 'queued' or
 * 'processing', we DON'T insert a duplicate; we return that existing job's id.
 * This is what stops a re-run of the dunning sweep from disconnecting the same
 * ONU twice.
 *
 * @param {Object} runner - Database wrapper or transaction connection.
 * @param {Object} job
 * @param {'deactivate'|'activate'|'status'|'email'} job.type
 * @param {Object} job.payload      - e.g. { onuId, subscriptionId, reason }.
 * @param {string} [job.dedupeKey]  - e.g. 'deactivate:onu:12'.
 * @param {number} [job.maxAttempts=5]
 * @returns {Promise<{ id: number, deduped: boolean }>}
 *
 * @example
 *   await enqueue(req.db, {
 *     type: "deactivate",
 *     payload: { onuId: 12, subscriptionId: 5, reason: "dunning" },
 *     dedupeKey: "deactivate:onu:12",
 *   });
 */
export const enqueue = async (runner, { type, payload, dedupeKey = null, maxAttempts = 5 }) => {
  // 1) Dedupe check — is there already a live job for this key?
  if (dedupeKey) {
    const existing = await run(
      runner,
      `SELECT id FROM jobs
        WHERE dedupe_key = ? AND status IN ('queued', 'processing')
        LIMIT 1`,
      [dedupeKey]
    );
    if (existing.length > 0) {
      return { id: existing[0].id, deduped: true };
    }
  }

  // 2) Insert the ticket. status/next_run_at/attempts use their column defaults.
  const result = await run(
    runner,
    `INSERT INTO jobs (type, payload, dedupe_key, max_attempts)
     VALUES (?, ?, ?, ?)`,
    [type, JSON.stringify(payload), dedupeKey, maxAttempts]
  );

  return { id: result.insertId, deduped: false };
};

/**
 * Claim the next due job for a worker to process.
 *
 * The safe-against-other-workers trick lives here:
 *   SELECT ... FOR UPDATE SKIP LOCKED
 * - FOR UPDATE  : lock the row I pick so no one else can take it.
 * - SKIP LOCKED : if a row is already locked by another worker, skip it and
 *                 take the next one instead of waiting.
 * All inside a short transaction so the claim (select + flip to 'processing')
 * is atomic.
 *
 * @param {Object} db - the Database wrapper (needs beginTransaction/commit/rollback).
 * @param {string} workerId - identifies this worker instance (for locked_by).
 * @param {Object} [opts]
 * @param {string[]} [opts.types] - only claim these job types (e.g. device jobs).
 *   Defaults to claiming any type. Lets the provisioning worker ignore 'email'
 *   jobs, which get their own processor in Phase 3.
 * @returns {Promise<Object|null>} the claimed job row, or null if none are due.
 */
export const claim = async (db, workerId, { types = null } = {}) => {
  const conn = await db.beginTransaction();
  try {
    // Optional "only these types" filter, built as ?-placeholders.
    const typeClause = types && types.length ? ` AND type IN (${types.map(() => "?").join(",")})` : "";
    const typeParams = types && types.length ? [...types] : [];

    // Pick the oldest due, queued job and lock it.
    const [rows] = await conn.execute(
      `SELECT * FROM jobs
        WHERE status = 'queued' AND next_run_at <= NOW()${typeClause}
        ORDER BY id
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
      typeParams
    );

    if (rows.length === 0) {
      await db.commit(conn); // nothing to do; release the connection
      return null;
    }

    const job = rows[0];

    // Flip it to 'processing' and stamp who holds it.
    await conn.execute(
      `UPDATE jobs
          SET status = 'processing', locked_at = NOW(), locked_by = ?
        WHERE id = ?`,
      [workerId, job.id]
    );

    await db.commit(conn);

    // Reflect the changes we just made in the returned object.
    job.status = "processing";
    job.locked_by = workerId;
    return job;
  } catch (err) {
    await db.rollback(conn);
    throw err;
  }
};

/**
 * Mark a job succeeded.
 * @param {Object} runner
 * @param {number} jobId
 */
export const complete = async (runner, jobId) => {
  await run(runner, `UPDATE jobs SET status = 'succeeded' WHERE id = ?`, [jobId]);
};

/**
 * Record a failed attempt. Either requeue with exponential backoff (+ jitter)
 * if we have tries left, or dead-letter the job (status='dead') once we hit
 * max_attempts.
 *
 * Backoff (why): if the OLT is briefly unreachable, hammering it immediately
 * won't help. We wait a bit longer after each failure. Jitter (a little
 * randomness) stops many jobs from retrying in lockstep.
 *
 * @param {Object} db - Database wrapper (reads the row, then updates it).
 * @param {number} jobId
 * @param {string} errorMessage - stored in last_error for debugging.
 * @param {Object} [opts]
 * @param {number} [opts.baseDelaySec=30] - first-retry delay; doubles each time.
 * @returns {Promise<{ deadLettered: boolean, attempts: number }>}
 */
export const fail = async (db, jobId, errorMessage, { baseDelaySec = 30 } = {}) => {
  const rows = await db.query(
    `SELECT attempts, max_attempts FROM jobs WHERE id = ? LIMIT 1`,
    [jobId]
  );
  if (rows.length === 0) {
    return { deadLettered: false, attempts: 0 };
  }

  const attempts = rows[0].attempts + 1; // this failed try
  const maxAttempts = rows[0].max_attempts;

  if (attempts >= maxAttempts) {
    // Out of tries -> dead-letter. The worker raises a NOC alert separately.
    await db.query(
      `UPDATE jobs
          SET status = 'dead', attempts = ?, last_error = ?, locked_at = NULL, locked_by = NULL
        WHERE id = ?`,
      [attempts, errorMessage, jobId]
    );
    return { deadLettered: true, attempts };
  }

  // Still have tries -> requeue for later. Exponential backoff + jitter.
  // delay = base * 2^(attempts-1) + random(0..base).
  const backoff = baseDelaySec * 2 ** (attempts - 1);
  const jitter = Math.floor(Math.random() * baseDelaySec);
  const delaySec = backoff + jitter;

  await db.query(
    `UPDATE jobs
        SET status = 'queued',
            attempts = ?,
            last_error = ?,
            next_run_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
            locked_at = NULL,
            locked_by = NULL
      WHERE id = ?`,
    [attempts, errorMessage, delaySec, jobId]
  );

  return { deadLettered: false, attempts };
};

/**
 * Cancel still-queued jobs matching a dedupe_key.
 *
 * Used when a customer pays: any queued 'deactivate:onu:<id>' ticket for their
 * ONU is cancelled so the disconnect never happens. (A job already 'processing'
 * is caught by the worker's own precondition re-check — see the worker step.)
 *
 * @param {Object} runner
 * @param {string} dedupeKey
 * @returns {Promise<number>} how many jobs were cancelled.
 */
export const cancel = async (runner, dedupeKey) => {
  const result = await run(
    runner,
    `UPDATE jobs SET status = 'cancelled'
      WHERE dedupe_key = ? AND status = 'queued'`,
    [dedupeKey]
  );
  return result.affectedRows ?? 0;
};

export default { enqueue, claim, complete, fail, cancel };
