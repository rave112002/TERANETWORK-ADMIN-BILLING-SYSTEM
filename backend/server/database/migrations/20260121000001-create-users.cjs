"use strict";

/**
 * Migration: create the `users` table.
 *
 * `users` are the STAFF who operate this platform (not the paying internet
 * subscribers — those live in a separate `customers` table later). Every
 * sensitive action in the system is tied back to a row here via the audit log,
 * and access is gated by the `role` column.
 *
 * We log in by EMAIL (not a username), and we store only a password *hash*
 * (argon2id) — never the raw password.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("users", {
      // Primary key. BIGINT UNSIGNED so we never run out of ids, matching the
      // implementation plan's schema for every table.
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      // The staff member's display name.
      name: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },

      // Login identifier. UNIQUE so two staff can't share an email.
      email: {
        type: Sequelize.STRING(190),
        allowNull: false,
        unique: true,
      },

      // argon2id hash of the password. 255 chars is plenty for an argon2 string.
      // The raw password is NEVER stored.
      password_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },

      // Role-based access control. These four roles come straight from spec §2:
      //  - super_admin: full access, manages users + system config + credentials
      //  - billing:     customers, plans, invoices, payments, manual overrides
      //  - noc:         network inventory + provisioning; CANNOT touch billing
      //  - auditor:     read-only (dashboards, reports, audit logs)
      role: {
        type: Sequelize.ENUM("super_admin", "billing", "noc", "auditor"),
        allowNull: false,
      },

      // Whether the account can log in. Disabling is preferred over deleting so
      // the person's history in the audit log stays intact.
      status: {
        type: Sequelize.ENUM("active", "disabled"),
        allowNull: false,
        defaultValue: "active",
      },

      // Optional 2FA secret for admins. Stored as raw binary (VARBINARY) and
      // ENCRYPTED — hence the `_enc` suffix — never as readable text.
      // We pass the raw SQL type because Sequelize has no first-class VARBINARY.
      totp_secret_enc: {
        type: "VARBINARY(255)",
        allowNull: true,
      },

      // Standard bookkeeping timestamps, stored in UTC (see DB timezone config).
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

    // Explicit unique index on email. The column is already UNIQUE above, but a
    // named index makes the intent clear and gives us a predictable index name
    // for fast email lookups at login time.
    await queryInterface.addIndex("users", ["email"], {
      name: "idx_users_email",
      unique: true,
    });
  },

  async down(queryInterface) {
    // Reverse of `up`: drop the table. Dropping it also removes its indexes.
    // (The ENUM types are defined inline on the table, so they go with it.)
    await queryInterface.dropTable("users");
  },
};
