"use strict";

/**
 * Migration: create the `subscriptions` table.
 *
 * A subscription binds a customer + plan + (optionally) an ONU, and carries the
 * service lifecycle status. `onu_id` is UNIQUE so an ONU is bound to at most one
 * subscription at a time (we free it — set NULL — when a subscription terminates).
 *
 * `statement_day` is clamped 1..28 in the service layer to avoid month-end edge
 * cases (no 29/30/31).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("subscriptions", {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      customer_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: "customers", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },

      plan_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: "plans", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },

      // One subscription per ONU at a time. Nullable (a pending sub may not have
      // an ONU assigned yet).
      onu_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        unique: true,
        references: { model: "onus", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },

      // Day of month the invoice is generated. Clamped 1..28 in the app.
      statement_day: {
        type: Sequelize.TINYINT.UNSIGNED,
        allowNull: false,
      },

      status: {
        type: Sequelize.ENUM("pending", "active", "suspended", "terminated"),
        allowNull: false,
        defaultValue: "pending",
      },

      activated_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      terminated_at: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex("subscriptions", ["status"], {
      name: "idx_sub_status",
    });
    await queryInterface.addIndex("subscriptions", ["customer_id"], {
      name: "idx_sub_customer",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("subscriptions");
  },
};
