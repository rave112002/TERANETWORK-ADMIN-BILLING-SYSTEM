"use strict";

/**
 * Migration: create the `system_settings` table.
 *
 * A tiny key/value store for runtime-tunable config a super admin can change
 * WITHOUT editing .env or redeploying. The most important key for Phase 2 is:
 *
 *   DRY_RUN = 'true' | 'false'   — the global kill switch. When 'true', the
 *   provisioning worker LOGS the command it WOULD send (action='dry_run') but
 *   never actually touches the device. Lets us safely rehearse the whole flow.
 *
 * Later keys live here too: GRACE_DAYS, DUNNING_HOUR, etc.
 *
 * Values are stored as strings; the reader parses them (e.g. 'true' -> boolean).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("system_settings", {
      // The setting name, e.g. 'DRY_RUN'. `key` is a reserved word in SQL, so
      // Sequelize quotes it for us.
      key: {
        type: Sequelize.STRING(80),
        primaryKey: true,
        allowNull: false,
      },

      value: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },

      // The staff user who last changed it (NULL = set by system/seed).
      updated_by: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
      },
    });

    // Seed the kill switch OFF by default so the system behaves normally.
    await queryInterface.bulkInsert("system_settings", [
      { key: "DRY_RUN", value: "false", updated_by: null },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("system_settings");
  },
};
