/**
 * Provisioning worker loop — the "cook" that drains the ticket rail.
 * ==================================================================
 *
 * It repeatedly asks the queue for the next due device job, hands it to
 * processOneJob (the brains), and then marks the job done or failed:
 *
 *   claim() -> processOneJob() -> complete()        (on success/skip/dry-run)
 *                              -> fail()            (on throw: retry or dead-letter)
 *
 * Design notes for the reader:
 * - It only claims DEVICE job types (deactivate/activate/status). 'email' jobs
 *   get their own processor in Phase 3, so we leave them alone.
 * - Each tick DRAINS all currently-due jobs (loop until claim() returns null),
 *   then sleeps `pollMs` before the next tick. This keeps latency low when busy
 *   and cost near-zero when idle.
 * - Ticks never overlap: we schedule the next tick only after the current one
 *   finishes, so we never run two drains at once in this single worker.
 * - When a job dead-letters (out of retries), we call the `alert` hook — a NOC
 *   notification. For now that's just a structured error log; a real
 *   email/Sentry alert drops in here later without touching this loop.
 */

import { claim, complete, fail } from "./jobs.queue.js";
import { processOneJob } from "./processJob.js";
import { logger } from "../../../config/logger.js";

// The job types this worker is responsible for.
const DEVICE_JOB_TYPES = ["deactivate", "activate", "status"];

/**
 * Handle exactly one claimed job: run it, then complete or fail it.
 * @param {Object} db
 * @param {Object} job
 * @param {(job: Object, err: Error) => (void|Promise<void>)} [alert] - NOC alert hook.
 */
export const handleJob = async (db, job, alert) => {
  try {
    const outcome = await processOneJob(db, job);
    await complete(db, job.id);
    logger.debug(`Job ${job.id} completed (${outcome.outcome})`, { jobId: job.id });
    return outcome;
  } catch (err) {
    // A thrown error means the attempt failed. fail() decides: retry or give up.
    const { deadLettered, attempts } = await fail(db, job.id, err.message);
    if (deadLettered) {
      logger.error(`Job ${job.id} DEAD-LETTERED after ${attempts} attempt(s): ${err.message}`, {
        jobId: job.id,
        type: job.type,
      });
      if (alert) {
        // Never let a broken alert hook crash the worker.
        try {
          await alert(job, err);
        } catch (alertErr) {
          logger.error("NOC alert hook threw", { error: alertErr.message });
        }
      }
    } else {
      logger.warn(`Job ${job.id} failed (attempt ${attempts}), will retry: ${err.message}`, {
        jobId: job.id,
        type: job.type,
      });
    }
    return { outcome: deadLettered ? "dead" : "failed" };
  }
};

/**
 * Start the worker loop.
 *
 * @param {Object} db - Database wrapper.
 * @param {Object} [options]
 * @param {string} [options.workerId] - identifies this instance (goes in locked_by).
 * @param {number} [options.pollMs=3000] - idle wait between drains.
 * @param {(job: Object, err: Error) => any} [options.alert] - NOC alert hook.
 * @returns {{ stop: () => void }} call stop() for a clean shutdown.
 */
export const startWorker = (db, { workerId, pollMs = 3000, alert } = {}) => {
  const id = workerId ?? `worker-${process.pid}`;
  let running = true;
  let timer = null;

  const tick = async () => {
    if (!running) return;
    try {
      // Drain every job that's due right now.
      let job;
      while (running && (job = await claim(db, id, { types: DEVICE_JOB_TYPES }))) {
        await handleJob(db, job, alert);
      }
    } catch (err) {
      // A claim/DB error shouldn't kill the loop; log and try again next tick.
      logger.error(`Worker ${id} tick error: ${err.message}`, { stack: err.stack });
    } finally {
      if (running) {
        timer = setTimeout(tick, pollMs);
      }
    }
  };

  logger.info(`Provisioning worker '${id}' started (polling every ${pollMs}ms)`);
  tick();

  return {
    stop: () => {
      running = false;
      if (timer) clearTimeout(timer);
      logger.info(`Provisioning worker '${id}' stopped`);
    },
  };
};

export default startWorker;
