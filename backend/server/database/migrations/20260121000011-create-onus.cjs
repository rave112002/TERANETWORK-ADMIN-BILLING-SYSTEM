"use strict";

/**
 * Migration: create the `onus` table.
 *
 * An ONU is the customer's modem — the leaf of the fiber tree and the device the
 * dunning engine activates/deactivates. On EPON (our HSGQ network) the MAC is the
 * primary identifier; `onu_index` stores the vendor's pon/onu-id (e.g. '1/27').
 *
 * olt_id and pon_port_id are DENORMALIZED (also derivable via the NAP chain) so
 * the worker can resolve an ONU straight to its OLT/driver without walking the
 * cascading splitter tree.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("onus", {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      // Inventory label printed on the unit. Unique.
      serial_no: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },

      // EPON primary identifier. Nullable at the DB level, but effectively
      // required for HSGQ-managed ONUs (enforced in the service layer later).
      mac: {
        type: Sequelize.STRING(17),
        allowNull: true,
        unique: true,
      },

      model: {
        type: Sequelize.STRING(80),
        allowNull: true,
      },

      // Placement: which NAP + which port on it. Nullable so an ONU can exist in
      // inventory before it's physically placed.
      nap_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: "naps", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      nap_port: {
        type: Sequelize.TINYINT.UNSIGNED,
        allowNull: true,
      },

      // Denormalized links for fast driver resolution.
      olt_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: "olts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      pon_port_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: "pon_ports", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },

      // Vendor-side ONU id on the PON, e.g. '1/27'.
      onu_index: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },

      provisioning_state: {
        type: Sequelize.ENUM("unprovisioned", "active", "suspended", "offline"),
        allowNull: false,
        defaultValue: "unprovisioned",
      },

      // Last-read optical power (signed dBm) and last-seen time. Populated by
      // status polls later; stored server-side (device clock is unreliable).
      last_rx_dbm: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
      },
      last_tx_dbm: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
      },
      last_seen_at: {
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

    // One ONU per physical NAP port. (Multiple NULLs are allowed by MySQL, so
    // unplaced ONUs don't collide.)
    await queryInterface.addIndex("onus", ["nap_id", "nap_port"], {
      name: "uq_nap_port",
      unique: true,
    });

    // Helpful lookups.
    await queryInterface.addIndex("onus", ["olt_id"], { name: "idx_onus_olt" });
    await queryInterface.addIndex("onus", ["provisioning_state"], {
      name: "idx_onus_state",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("onus");
  },
};
