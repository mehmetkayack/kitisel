import { DataTypes } from 'sequelize';
import type { Migration } from './types';
import { fk, id, tableOptions, timestamps } from './types';

const tokenTable = (userFk: ReturnType<typeof fk>) => ({
  id: id(),
  user_id: userFk,
  token_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  used_at: { type: DataTypes.DATE, allowNull: true },
  ...timestamps(),
});

export const migration: Migration = {
  name: '2026_10_08_0001_create_users_and_auth',
  async up({ context: qi }) {
    await qi.createTable(
      'users',
      {
        id: id(),
        email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        password_hash: { type: DataTypes.STRING(255), allowNull: true },
        name: { type: DataTypes.STRING(120), allowNull: false },
        locale: { type: DataTypes.STRING(5), allowNull: false, defaultValue: 'en' },
        theme: {
          type: DataTypes.ENUM('system', 'light', 'dark'),
          allowNull: false,
          defaultValue: 'system',
        },
        email_verified_at: { type: DataTypes.DATE, allowNull: true },
        google_id: { type: DataTypes.STRING(64), allowNull: true, unique: true },
        is_superadmin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        last_login_at: { type: DataTypes.DATE, allowNull: true },
        ...timestamps(true),
      },
      tableOptions,
    );

    await qi.createTable(
      'refresh_tokens',
      {
        id: id(),
        user_id: fk('users', 'CASCADE'),
        token_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
        // Aynı oturumdan türeyen token zinciri; yeniden kullanım tespitinde tüm aile iptal edilir.
        family_id: { type: DataTypes.CHAR(36), allowNull: false },
        expires_at: { type: DataTypes.DATE, allowNull: false },
        revoked_at: { type: DataTypes.DATE, allowNull: true },
        replaced_by_id: { type: DataTypes.CHAR(36), allowNull: true },
        user_agent: { type: DataTypes.STRING(512), allowNull: true },
        ip: { type: DataTypes.STRING(45), allowNull: true },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('refresh_tokens', ['user_id']);
    await qi.addIndex('refresh_tokens', ['family_id']);

    await qi.createTable('email_verifications', tokenTable(fk('users', 'CASCADE')), tableOptions);
    await qi.addIndex('email_verifications', ['user_id']);

    await qi.createTable('password_resets', tokenTable(fk('users', 'CASCADE')), tableOptions);
    await qi.addIndex('password_resets', ['user_id']);
  },
  async down({ context: qi }) {
    await qi.dropTable('password_resets');
    await qi.dropTable('email_verifications');
    await qi.dropTable('refresh_tokens');
    await qi.dropTable('users');
  },
};
