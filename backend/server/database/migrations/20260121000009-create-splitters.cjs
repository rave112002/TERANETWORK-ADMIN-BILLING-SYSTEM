"use strict";

/**
 * Migration: create the `splitters` table.
 *
 * A splitter is a passive optical device that splits one fiber into many
 * (1:2 .. 1:64). It has NO IP — it's an inventory/topology record only.
 *
 * Its parent is POLYMORPHIC: either a PON port or another splitter (splitters
 * can cascade). MySQL cannot foreign-key a column that may point at one of two
 * tables, so parent validity is enforced in the service layer instead. The
 * (parent_type, parent_id) index keeps "what hangs off this parent?" fast.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("splitters", {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      // Polymorphic parent: which kind of thing the parent is...
      parent_type: {
        type: Sequelize.ENUM("pon_port", "splitter"),
        allowNull: false,
      },
      // ...and its id in that table. No FK (see file header).
      parent_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
      },

      ratio: {
        type: Sequelize.ENUM("1:2", "1:4", "1:8", "1:16", "1:32", "1:64"),
        allowNull: false,
      },

      label: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      location: {
        type: Sequelize.STRING(190),
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

    await queryInterface.addIndex("splitters", ["parent_type", "parent_id"], {
      name: "idx_splitter_parent",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("splitters");
  },
};
