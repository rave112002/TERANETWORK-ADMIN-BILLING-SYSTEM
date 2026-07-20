'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('idempotency_keys', {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      idempotency_key: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      request_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      response_code: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      response_body: {
        type: Sequelize.TEXT('long'),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex('idempotency_keys', ['idempotency_key'], {
      name: 'idx_idempotency_key',
      unique: true,
    });

    await queryInterface.addIndex('idempotency_keys', ['expires_at'], {
      name: 'idx_idempotency_expires_at',
    });

    await queryInterface.addIndex('idempotency_keys', ['request_hash'], {
      name: 'idx_idempotency_request_hash',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('idempotency_keys');
  },
};
