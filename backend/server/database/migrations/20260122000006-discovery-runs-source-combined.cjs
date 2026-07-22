"use strict";

/**
 * Migration: allow `discovery_runs.source` = 'combined'.
 *
 * A single discovery sweep reads BOTH the OLT (modems) and the MikroTik
 * (accounts/sessions) so it can join them by MAC. The original enum only had
 * 'olt' | 'mikrotik'; we add 'combined' for these cross-device runs. Per-item
 * `discovered_items.source` is unchanged — each item still comes from one device.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("discovery_runs", "source", {
      type: Sequelize.ENUM("olt", "mikrotik", "combined"),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("discovery_runs", "source", {
      type: Sequelize.ENUM("olt", "mikrotik"),
      allowNull: false,
    });
  },
};
