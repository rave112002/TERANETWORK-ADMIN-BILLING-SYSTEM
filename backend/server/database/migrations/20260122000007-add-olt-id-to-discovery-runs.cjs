"use strict";

/**
 * Migration: add `olt_id` to `discovery_runs`.
 *
 * A sweep is anchored on one OLT. Recording which OLT lets the import step
 * create ONUs against the right device without making staff re-pick it.
 * Nullable + SET NULL on delete so run history survives if the OLT is removed.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("discovery_runs", "olt_id", {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: "olts", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("discovery_runs", "olt_id");
  },
};
