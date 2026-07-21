"use strict";

/**
 * Migration: create the `customers` table.
 *
 * A customer is the paying account holder (distinct from `users`, who are staff).
 * `email` is REQUIRED because invoices are delivered by email. `account_no` is a
 * human-readable unique identifier (e.g. ACC-000123) generated from the row id.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("customers", {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      // Human-facing account number, unique. Generated as 'ACC-' + zero-padded id.
      account_no: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true,
      },

      name: {
        type: Sequelize.STRING(160),
        allowNull: false,
      },

      // Required — invoices are email-only. Indexed (non-unique) for fast lookup.
      email: {
        type: Sequelize.STRING(190),
        allowNull: false,
      },

      phone: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },

      address: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      // GPS coordinates for the NAP/customer map. DECIMAL(10,7) gives ~1cm
      // precision and holds the full lat/lng range.
      gps_lat: {
        type: Sequelize.DECIMAL(10, 7),
        allowNull: true,
      },
      gps_lng: {
        type: Sequelize.DECIMAL(10, 7),
        allowNull: true,
      },

      // Optional KYC fields.
      id_type: {
        type: Sequelize.STRING(40),
        allowNull: true,
      },
      id_number: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },

      status: {
        type: Sequelize.ENUM("active", "inactive"),
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

    await queryInterface.addIndex("customers", ["email"], {
      name: "idx_customers_email",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("customers");
  },
};
