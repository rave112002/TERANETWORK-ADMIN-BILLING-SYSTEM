'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('users', [
      {
        accountId: 1,
        name: 'Admin User',
        email: 'admin@example.com',
        phone: '+1234567890',
        shirtNumber: 'A001',
        zone: 'Zone A',
        size: 'L',
        qrCodeUid: 'QR-ADMIN-001',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        accountId: 2,
        name: 'Test User',
        email: 'test@example.com',
        phone: '+1234567891',
        shirtNumber: 'T001',
        zone: 'Zone B',
        size: 'M',
        qrCodeUid: 'QR-TEST-001',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        accountId: 3,
        name: 'Demo User',
        email: 'demo@example.com',
        phone: '+1234567892',
        shirtNumber: 'D001',
        zone: 'Zone C',
        size: 'XL',
        qrCodeUid: 'QR-DEMO-001',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('users', null, {});
  },
};
