import { DataTypes } from 'sequelize';
import type { Migration } from './types';

/**
 * Admin panelinden verilen haklar: ödemesiz (hediye) paket, özel aylık makale hakkı, bitiş tarihi ve not.
 * `plan_source`: trial (paket yok), paid (iyzico, Faz 3), complimentary (admin verdi).
 */
export const migration: Migration = {
  name: '2026_10_12_0012_org_entitlements',
  async up({ context: qi }) {
    await qi.addColumn('organizations', 'plan_source', { type: DataTypes.ENUM('trial', 'paid', 'complimentary'), allowNull: false, defaultValue: 'trial' });
    await qi.addColumn('organizations', 'article_quota_override', { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true });
    await qi.addColumn('organizations', 'entitlement_expires_at', { type: DataTypes.DATE, allowNull: true });
    await qi.addColumn('organizations', 'entitlement_note', { type: DataTypes.STRING(500), allowNull: true });
  },
  async down({ context: qi }) {
    for (const col of ['entitlement_note', 'entitlement_expires_at', 'article_quota_override', 'plan_source']) await qi.removeColumn('organizations', col);
  },
};
