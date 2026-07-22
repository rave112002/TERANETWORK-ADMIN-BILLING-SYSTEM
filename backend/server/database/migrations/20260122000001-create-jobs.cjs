"use strict";

/**
 * Migration: create the `jobs` table — our durable work queue.
 *
 * This replaces Redis/BullMQ (a client decision): we already run MySQL, so the
 * queue is just a table. cron and the API only ever INSERT rows here ("write a
 * ticket"); the provisioning worker CLAIMS rows and does the actual device work.
 *
 * The "order-ticket rail" analogy: a web request never telnets the OLT and makes
 * the customer wait. It drops a ticket (a row) and returns instantly. A separate
 * worker pulls tickets one at a time.
 *
 * Everything a real queue gives you for free is modelled as columns:
 *   - retries / max tries      -> attempts, max_attempts
 *   - backoff ("run later")    -> next_run_at
 *   - dead-letter              -> status = 'dead'
 *   - cancellation + no-dupes  -> dedupe_key (+ status)
 *   - safe multi-worker claim  -> locked_at, locked_by (+ FOR UPDATE SKIP LOCKED)
 *
 * You can watch the whole system with: SELECT * FROM jobs;
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("jobs", {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      // What kind of work this ticket represents.
      type: {
        type: Sequelize.ENUM("deactivate", "activate", "status", "email"),
        allowNull: false,
      },

      // The job's details, e.g. { onuId, subscriptionId, reason } for device
      // jobs, or the message fields for an email job. JSON keeps it flexible.
      payload: {
        type: Sequelize.JSON,
        allowNull: false,
      },

      // Lifecycle of one ticket:
      //   queued     -> waiting to be claimed
      //   processing -> a worker is running it right now
      //   succeeded  -> done
      //   failed     -> a single attempt failed (may be requeued for retry)
      //   dead       -> gave up after max_attempts (the "dead-letter" state)
      //   cancelled  -> no longer needed (e.g. customer paid before disconnect)
      status: {
        type: Sequelize.ENUM(
          "queued",
          "processing",
          "succeeded",
          "failed",
          "dead",
          "cancelled"
        ),
        allowNull: false,
        defaultValue: "queued",
      },

      // How many times we've tried, and the ceiling before we give up.
      attempts: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      max_attempts: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 5,
      },

      // "Do not run before this time." On retry we push it into the future
      // (exponential backoff + jitter). Claim query filters on next_run_at <= NOW().
      next_run_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      // A stable tag identifying the intent, e.g. 'deactivate:onu:12'. Two uses:
      //   1) idempotent enqueue — skip inserting if a live job for this key exists.
      //   2) cancellation — a payment cancels queued 'deactivate:onu:12' jobs.
      // (MySQL lacks partial unique indexes, so "only one live job per key" is
      //  enforced in the service layer before INSERT.)
      dedupe_key: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },

      // Set when a worker claims the row, so two workers never grab the same one.
      locked_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      locked_by: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },

      // The most recent failure message, for debugging.
      last_error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
      },
    });

    // Makes the worker's "give me the next due job" query fast:
    //   WHERE status='queued' AND next_run_at <= NOW() ORDER BY id
    await queryInterface.addIndex("jobs", ["status", "next_run_at", "id"], {
      name: "idx_jobs_claim",
    });

    // Makes both the "is one already queued?" check and cancellation fast.
    await queryInterface.addIndex("jobs", ["dedupe_key", "status"], {
      name: "idx_jobs_dedupe",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("jobs");
  },
};
