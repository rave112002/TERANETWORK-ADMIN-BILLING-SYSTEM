"use strict";

/**
 * Migration: create the `plans` table.
 *
 * A service plan is a speed tier + monthly price that customers subscribe to,
 * e.g. "Fiber 50Mbps – PHP 1,200/mo". Subscriptions (built later) point at a plan.
 *
 * All money columns are DECIMAL(12,2) — exact decimal arithmetic, never FLOAT.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("plans", {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },

      // Advertised download / upload speeds in megabits per second.
      down_mbps: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
      },
      up_mbps: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
      },

      // Recurring monthly charge. DECIMAL for exact money math.
      monthly_price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },

      // ISO currency code. Fixed 3 chars (e.g. 'PHP').
      currency: {
        type: Sequelize.CHAR(3),
        allowNull: false,
        defaultValue: "PHP",
      },

      // Optional one-off fees. Default 0.00 so they never accidentally become NULL.
      reconnection_fee: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      install_fee: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.0,
      },

      // Soft on/off switch. We deactivate plans rather than delete them, so
      // historical invoices that reference a plan stay meaningful.
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable("plans");
  },
};
