import { DataTypes } from 'sequelize';
import type { Migration } from './types';
import { fk, id, tableOptions, timestamps } from './types';

export const migration: Migration = {
  name: '2026_10_08_0003_create_audit_logs',
  async up({ context: qi }) {
    await qi.createTable(
      'audit_logs',
      {
        id: id(),
        user_id: fk('users', 'SET NULL', true),
        organization_id: fk('organizations', 'SET NULL', true),
        action: { type: DataTypes.STRING(100), allowNull: false },
        target_type: { type: DataTypes.STRING(60), allowNull: true },
        target_id: { type: DataTypes.CHAR(36), allowNull: true },
        metadata: { type: DataTypes.JSON, allowNull: true },
        ip: { type: DataTypes.STRING(45), allowNull: true },
        user_agent: { type: DataTypes.STRING(512), allowNull: true },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('audit_logs', ['organization_id', 'created_at']);
    await qi.addIndex('audit_logs', ['user_id', 'created_at']);
    await qi.addIndex('audit_logs', ['action']);
  },
  async down({ context: qi }) {
    await qi.dropTable('audit_logs');
  },
};
