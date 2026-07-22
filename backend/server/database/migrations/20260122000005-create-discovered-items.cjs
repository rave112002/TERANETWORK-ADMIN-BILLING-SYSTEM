"use strict";

/**
 * Migration: create the `discovered_items` table — the discovery STAGING area.
 *
 * Every record a discovery sweep finds lands here first. Staff review these and
 * explicitly import the ones they want; nothing here touches the live tables
 * until they do. Each item is bucketed:
 *
 *   matched  - already exists in our system (by MAC / serial / username) → just
 *              a snapshot to confirm/update.
 *   new      - found on the device but NOT in our system → a candidate to import.
 *   orphaned - exists in our system but NOT found on the device → flag for staff
 *              (retired/moved/error); never auto-deleted.
 *
 * The join key between an ONU (from the OLT) and an account (from the MikroTik)
 * is the MAC address — stored in `external_key` — which lets us suggest
 * modem↔account↔customer links for staff to confirm.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("discovered_items", {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      // Which sweep produced this item.
      run_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: "discovery_runs", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE", // deleting a run discards its staged items
      },

      source: {
        type: Sequelize.ENUM("olt", "mikrotik"),
        allowNull: false,
      },

      // The join/identity key: ONU or caller-id MAC, or a PPPoE username.
      external_key: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },

      // Full parsed record from the device (an onu-info row, or a pppoe
      // secret/session), kept verbatim for review.
      raw: {
        type: Sequelize.JSON,
        allowNull: false,
      },

      // Parsed hints for staff, e.g. name/NAP/port pulled from an ONU description.
      suggested: {
        type: Sequelize.JSON,
        allowNull: true,
      },

      match_status: {
        type: Sequelize.ENUM("matched", "new", "orphaned"),
        allowNull: false,
      },

      // If matched, WHAT it matched and its id in our tables.
      matched_entity: {
        type: Sequelize.STRING(40), // 'onu' | 'customer' | 'subscription'
        allowNull: true,
      },
      matched_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
      },

      // Set when staff import this candidate into the live tables.
      imported_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      imported_by: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
    });

    // Fast "show me this run's items in bucket X" lookups (the review screen).
    await queryInterface.addIndex("discovered_items", ["run_id", "match_status"], {
      name: "idx_disc_run",
    });

    // Fast lookups by MAC/username when reconciling across the two devices.
    await queryInterface.addIndex("discovered_items", ["external_key"], {
      name: "idx_disc_key",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("discovered_items");
  },
};
