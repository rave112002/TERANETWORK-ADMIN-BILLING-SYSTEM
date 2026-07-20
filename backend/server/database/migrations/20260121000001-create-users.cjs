'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      accountId: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      shirtNumber: {
        type: Sequelize.STRING(10),
        allowNull: true,
        unique: true,
      },
      zone: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      size: {
        type: Sequelize.ENUM('S', 'M', 'L', 'XL', 'XXL'),
        allowNull: true,
      },
      qrCodeUid: {
        type: Sequelize.STRING(100),
        allowNull: true,
        unique: true,
      },
      avatarUrl: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('users', ['email'], {
      name: 'idx_users_email',
      unique: true,
    });

    await queryInterface.addIndex('users', ['shirtNumber'], {
      name: 'idx_users_shirt_number',
      unique: true,
    });

    await queryInterface.addIndex('users', ['qrCodeUid'], {
      name: 'idx_users_qr_code_uid',
      unique: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('users');
  },
};
