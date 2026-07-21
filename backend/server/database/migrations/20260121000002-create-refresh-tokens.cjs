"use strict";

/**
 * Migration: create the `refresh_tokens` table.
 *
 * A refresh token is the long-lived credential a logged-in staff member uses to
 * silently obtain a fresh short-lived access token, so they don't have to log in
 * again every 15 minutes.
 *
 * SECURITY: we never store the token itself — only its SHA-256 hash. A database
 * leak therefore exposes fingerprints, not usable tokens. On each refresh we hash
 * the incoming token and compare against `token_hash`.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("refresh_tokens", {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      // Which staff member this token belongs to. Foreign key into users(id).
      // ON DELETE CASCADE: if a user row is ever removed, their tokens vanish too
      // (no orphaned tokens left behind).
      user_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      // SHA-256 hash of the refresh token, in hex. A SHA-256 hex string is always
      // exactly 64 characters, hence CHAR(64). UNIQUE so no two rows collide.
      token_hash: {
        type: Sequelize.CHAR(64),
        allowNull: false,
        unique: true,
      },

      // When this token stops being valid.
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      // Set when the token is deliberately killed (logout, or rotated for a new
      // one). NULL means "still live". We revoke rather than delete so there's a
      // trail of what happened.
      revoked_at: {
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

    // Fast lookup of all tokens for a given user (e.g. "revoke everything for
    // this account").
    await queryInterface.addIndex("refresh_tokens", ["user_id"], {
      name: "idx_refresh_tokens_user_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("refresh_tokens");
  },
};
