/**
 * Provisioning worker entry point.
 * ================================
 *
 * Runs the device-job worker as its own process. For a single-OLT site it could
 * live inside the API process, but keeping it standalone lets us watch it, and
 * lets it move to its own box later without a rewrite.
 *
 * Run it with:  npm run worker      (or  npm run worker:dev  for auto-reload)
 * Watch the queue meanwhile with:   SELECT * FROM jobs;
 */

import "dotenv/config";
import Database from "../config/database.js";
import { logger } from "../config/logger.js";
import { startWorker } from "../src/lib/jobs/worker.js";

const db = new Database();

/**
 * NOC alert hook. For now it's a loud structured log; a real deployment swaps
 * in email/Sentry here without touching the worker loop.
 */
const alert = (job, err) => {
  logger.error(`🚨 NOC ALERT: job ${job.id} (${job.type}) dead-lettered: ${err.message}`, {
    jobId: job.id,
    type: job.type,
  });
};

(async () => {
  try {
    await db.initialize();

    const pollMs = Number(process.env.WORKER_POLL_MS ?? 3000);
    const worker = startWorker(db, { pollMs, alert });

    // Graceful shutdown: stop claiming, then close the DB pool.
    const shutdown = async (signal) => {
      logger.info(`${signal} received: shutting down provisioning worker`);
      worker.stop();
      try {
        await db.close();
      } catch (err) {
        logger.error("Error closing DB on worker shutdown", { error: err.message });
      }
      process.exit(0);
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    logger.error("Provisioning worker failed to start", { error: err.message, stack: err.stack });
    process.exit(1);
  }
})();
