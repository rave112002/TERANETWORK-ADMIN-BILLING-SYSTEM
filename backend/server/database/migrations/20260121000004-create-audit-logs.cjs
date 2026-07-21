"use strict";

/**
 * Migration: create the `audit_logs` table.
 *
 * An immutable, append-only history of every sensitive change in the system:
 * who did it (actor_id, NULL = system), to what (entity + entity_id), what
 * happened (action), and the before/after snapshots.
 *
 * IMPORTANT: this table is INSERT-ONLY by policy. Rows are never updated or
 * deleted. In production, the application DB user should be granted no
 * UPDATE/DELETE on it. There is intentionally no `updated_at` column.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("audit_logs", {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      // The staff user who performed the action. NULL means the system did it
      // (e.g. the automated dunning sweep). No FK: audit rows must survive even
      // if the referenced row changes, and the system actor has no user row.
      actor_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
      },

      // The KIND of record affected, e.g. 'user', 'customer', 'subscription'.
      entity: {
        type: Sequelize.STRING(60),
        allowNull: false,
      },

      // The id of the affected record within that entity.
      entity_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
      },

      // What happened, e.g. 'create', 'update', 'disconnect', 'refund'.
      action: {
        type: Sequelize.STRING(60),
        allowNull: false,
      },

      // Snapshot of the record BEFORE the change (NULL for creates).
      before_state: {
        type: Sequelize.JSON,
        allowNull: true,
      },

      // Snapshot of the record AFTER the change (NULL for deletes).
      after_state: {
        type: Sequelize.JSON,
        allowNull: true,
      },

      // Originating IP address (IPv6 can be up to 45 chars).
      ip: {
        type: Sequelize.STRING(45),
        allowNull: true,
      },

      // Only created_at — audit rows are written once and never modified.
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Fast "show me everything that happened to customer #42" lookups.
    await queryInterface.addIndex("audit_logs", ["entity", "entity_id"], {
      name: "idx_audit_entity",
    });

    // Fast "show me everything this staff member did, newest first" lookups.
    await queryInterface.addIndex("audit_logs", ["actor_id", "created_at"], {
      name: "idx_audit_actor",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("audit_logs");
  },
};
