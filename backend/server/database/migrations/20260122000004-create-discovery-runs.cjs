"use strict";

/**
 * Migration: create the `discovery_runs` table.
 *
 * One row per Device Discovery sweep (§3.1.1). Discovery reads existing modems
 * from the OLT and existing PPPoE accounts/sessions from the MikroTik so staff
 * don't hand-enter the ~200 records left by the prior ISP.
 *
 * A "run" is the header: which device we swept, who started it, when it started
 * and finished, how many items it found, and whether it succeeded. The actual
 * findings live in `discovered_items` (next migration), linked by run_id.
 *
 * IMPORTANT: discovery only READS the devices and writes to this staging area.
 * It never creates live customer/subscription/ONU rows on its own.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("discovery_runs", {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      // Which device this sweep read.
      source: {
        type: Sequelize.ENUM("olt", "mikrotik"),
        allowNull: false,
      },

      // Staff user who kicked it off. NULL = a scheduled/automated run.
      started_by: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      started_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      // Set when the sweep completes (success or failure).
      finished_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      // How many items this sweep discovered.
      item_count: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },

      status: {
        type: Sequelize.ENUM("running", "completed", "failed"),
        allowNull: false,
        defaultValue: "running",
      },

      // Failure reason if status = 'failed'.
      error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("discovery_runs");
  },
};
