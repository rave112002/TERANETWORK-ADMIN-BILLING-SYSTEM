"use strict";

/**
 * Migration: create the `network_action_logs` table.
 *
 * The system's "black-box flight recorder" for the network. EVERY device action
 * — activate, deactivate, a status read, or a dry-run — writes one row here with
 * the exact command we sent and the exact raw response the device gave back.
 *
 * Why it's non-negotiable: this platform can disconnect a paying customer. If
 * anyone ever asks "why was this ONU cut off?", we must be able to prove exactly
 * what was sent and what the device replied. This is distinct from `audit_logs`
 * (business changes); this table is the raw device conversation.
 *
 * APPEND-ONLY by policy: rows are written once, never updated or deleted (hence
 * a `created_at` but no `updated_at`). The device clock on our HSGQ OLT is
 * unreliable (stuck in year 2000), so this timestamp is server-side — we never
 * trust device-reported times.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("network_action_logs", {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      // Which ONU this action targeted.
      onu_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: "onus", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },

      // What we tried to do. 'dry_run' = the kill switch was on, so we logged
      // the intended command WITHOUT sending it to the device.
      action: {
        type: Sequelize.ENUM("activate", "deactivate", "status", "dry_run"),
        allowNull: false,
      },

      // Who caused it: 'system:dunning', 'system:payment', or 'user:<id>'.
      triggered_by: {
        type: Sequelize.STRING(40),
        allowNull: false,
      },

      // The queue ticket (jobs.id) this action came from, for traceability.
      job_id: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },

      // The exact command text we sent to the device (verbatim, for the record).
      command: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      // The exact raw text the device replied. MEDIUMTEXT because some device
      // dumps (e.g. show onu-info all) are large.
      device_response: {
        type: Sequelize.TEXT("medium"),
        allowNull: true,
      },

      // Did the action succeed? Stored as 1/0.
      success: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
      },

      // Human-readable failure reason when success = 0.
      error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      // Server-side timestamp only — never the device's (unreliable) clock.
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Fast "show me everything that happened to ONU #42, newest first" lookups.
    await queryInterface.addIndex("network_action_logs", ["onu_id", "created_at"], {
      name: "idx_nal_onu",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("network_action_logs");
  },
};
