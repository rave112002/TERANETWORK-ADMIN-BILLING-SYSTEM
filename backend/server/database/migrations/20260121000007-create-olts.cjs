"use strict";

/**
 * Migration: create the `olts` table.
 *
 * An OLT (Optical Line Terminal) is the core device customers' fiber trees hang
 * off. The system connects to it remotely to activate/deactivate ONUs.
 *
 * `credentials_enc` stores the login (username/password/etc.) as an ENVELOPE-
 * ENCRYPTED blob — never plaintext. See utils/credentialCrypto.js.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("olts", {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING(120),
        allowNull: false,
        unique: true,
      },

      // Device family — dictates which driver we use later.
      vendor: {
        type: Sequelize.ENUM(
          "hsgq",
          "huawei",
          "zte",
          "fiberhome",
          "vsol",
          "bdcom",
          "mock",
          "other"
        ),
        allowNull: false,
      },

      // EPON vs GPON. Our target HSGQ XE04I is EPON.
      pon_technology: {
        type: Sequelize.ENUM("epon", "gpon"),
        allowNull: false,
        defaultValue: "epon",
      },

      model: {
        type: Sequelize.STRING(80),
        allowNull: true,
      },

      // Management address + port. Telnet (23) today; 22 once SSH is enabled.
      host: {
        type: Sequelize.STRING(190),
        allowNull: false,
      },
      port: {
        type: Sequelize.SMALLINT.UNSIGNED,
        allowNull: false,
        defaultValue: 23,
      },

      protocol: {
        type: Sequelize.ENUM("ssh", "telnet", "snmp", "tr069"),
        allowNull: false,
      },

      // Envelope-encrypted credentials JSON. NEVER plaintext.
      credentials_enc: {
        type: "VARBINARY(2048)",
        allowNull: false,
      },

      site: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },

      status: {
        type: Sequelize.ENUM("active", "maintenance", "retired"),
        allowNull: false,
        defaultValue: "active",
      },

      // The XE04I has a weak CPU; we keep at most 1 CLI session open at a time.
      max_concurrent_sessions: {
        type: Sequelize.TINYINT.UNSIGNED,
        allowNull: false,
        defaultValue: 1,
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
    await queryInterface.dropTable("olts");
  },
};
