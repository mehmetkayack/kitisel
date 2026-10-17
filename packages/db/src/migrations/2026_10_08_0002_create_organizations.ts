import { DataTypes } from 'sequelize';
import type { Migration } from './types';
import { fk, id, tableOptions, timestamps } from './types';

export const migration: Migration = {
  name: '2026_10_08_0002_create_organizations',
  async up({ context: qi }) {
    await qi.createTable(
      'organizations',
      {
        id: id(),
        name: { type: DataTypes.STRING(120), allowNull: false },
        slug: { type: DataTypes.STRING(140), allowNull: false, unique: true },
        plan: { type: DataTypes.STRING(20), allowNull: true },
        plan_status: {
          type: DataTypes.ENUM('none', 'trialing', 'active', 'past_due', 'paused', 'canceled'),
          allowNull: false,
          defaultValue: 'none',
        },
        trial_ends_at: { type: DataTypes.DATE, allowNull: true },
        current_period_end: { type: DataTypes.DATE, allowNull: true },
        default_locale: { type: DataTypes.STRING(5), allowNull: false, defaultValue: 'en' },
        billing_type: { type: DataTypes.ENUM('company', 'individual'), allowNull: true },
        billing_name: { type: DataTypes.STRING(200), allowNull: true },
        billing_address: { type: DataTypes.STRING(500), allowNull: true },
        billing_country: { type: DataTypes.CHAR(2), allowNull: true },
        tax_id: { type: DataTypes.STRING(64), allowNull: true },
        ...timestamps(true),
      },
      tableOptions,
    );
    await qi.addIndex('organizations', ['plan_status']);

    await qi.createTable(
      'memberships',
      {
        id: id(),
        user_id: fk('users', 'CASCADE'),
        organization_id: fk('organizations', 'CASCADE'),
        role: {
          type: DataTypes.ENUM('owner', 'admin', 'editor', 'viewer'),
          allowNull: false,
        },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('memberships', ['user_id', 'organization_id'], { unique: true });
    await qi.addIndex('memberships', ['organization_id']);
  },
  async down({ context: qi }) {
    await qi.dropTable('memberships');
    await qi.dropTable('organizations');
  },
};
