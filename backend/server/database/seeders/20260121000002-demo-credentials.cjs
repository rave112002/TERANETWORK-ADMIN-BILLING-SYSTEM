'use strict';

const argon2 = require('argon2');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const hashedPassword = await argon2.hash('Password123!', {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await queryInterface.bulkInsert('credentials', [
      {
        credentialId: 1,
        accountId: 1,
        username: 'admin',
        password: hashedPassword,
        isActive: true,
        lastLogin: null,
        passwordChangedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        credentialId: 2,
        accountId: 2,
        username: 'testuser',
        password: hashedPassword,
        isActive: true,
        lastLogin: null,
        passwordChangedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        credentialId: 3,
        accountId: 3,
        username: 'demouser',
        password: hashedPassword,
        isActive: true,
        lastLogin: null,
        passwordChangedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('credentials', null, {});
  },
};
