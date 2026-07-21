"use strict";

/**
 * Migration: create the `naps` table.
 *
 * A NAP (Network Access Point) is the field distribution box where subscriber
 * drop cables terminate. It hangs off a splitter, has a fixed number of ports,
 * and has REQUIRED GPS coordinates (it appears as a pin on the map).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("naps", {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      // Parent splitter. Single-table foreign key (a NAP always hangs off one
      // splitter). RESTRICT: can't delete a splitter that still has NAPs.
      splitter_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: "splitters", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },

      label: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },

      // Number of drop ports on the box.
      total_ports: {
        type: Sequelize.TINYINT.UNSIGNED,
        allowNull: false,
        defaultValue: 8,
      },

      // Required — NAPs are mapped. DECIMAL(10,7) ~= 1cm precision.
      gps_lat: {
        type: Sequelize.DECIMAL(10, 7),
        allowNull: false,
      },
      gps_lng: {
        type: Sequelize.DECIMAL(10, 7),
        allowNull: false,
      },

      notes: {
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

    await queryInterface.addIndex("naps", ["splitter_id"], {
      name: "idx_naps_splitter",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("naps");
  },
};
