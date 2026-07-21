"use strict";

/**
 * Migration: create the `pon_ports` table.
 *
 * A PON port is one outgoing port on an OLT that feeds a tree of subscribers
 * (typically up to 64/128 ONUs). Each port belongs to exactly one OLT.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("pon_ports", {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      // Foreign key to the parent OLT. The DB rejects a value that doesn't match
      // an existing olts.id. RESTRICT prevents deleting an OLT that still has
      // ports (we soft-delete OLTs anyway).
      olt_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: "olts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },

      // Vendor-specific port label, e.g. '0/1/3'. Formats vary by vendor.
      port_index: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },

      // How many ONUs this port can serve.
      capacity: {
        type: Sequelize.SMALLINT.UNSIGNED,
        allowNull: false,
        defaultValue: 64,
      },

      status: {
        type: Sequelize.ENUM("active", "down", "reserved"),
        allowNull: false,
        defaultValue: "active",
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

    // A port index must be unique WITHIN one OLT (but may repeat across OLTs).
    await queryInterface.addIndex("pon_ports", ["olt_id", "port_index"], {
      name: "uq_pon",
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("pon_ports");
  },
};
