"use strict";

// argon2 is required (CommonJS) because seeders run under the Sequelize CLI,
// which uses CommonJS, not ES modules.
const argon2 = require("argon2");

// The one bootstrap staff account. Change the password after first login.
const ADMIN_EMAIL = "admin@teranetwork.local";
const ADMIN_PASSWORD = "Admin123!";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Idempotency guard: if this admin already exists, do nothing. This lets the
    // seeder be re-run safely without hitting the UNIQUE(email) constraint.
    const [existing] = await queryInterface.sequelize.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      { replacements: [ADMIN_EMAIL] }
    );
    if (existing.length > 0) {
      return;
    }

    // Hash the password with argon2id. The salt is generated automatically and
    // embedded in the returned hash string, so no separate salt column is needed.
    // These cost parameters (64 MB memory, 3 iterations, 4 lanes) are a sensible
    // modern default.
    const passwordHash = await argon2.hash(ADMIN_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await queryInterface.bulkInsert("users", [
      {
        name: "Super Admin",
        email: ADMIN_EMAIL,
        password_hash: passwordHash,
        role: "super_admin",
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    // Reverse of `up`: remove only the account this seeder created.
    await queryInterface.bulkDelete("users", { email: ADMIN_EMAIL });
  },
};
