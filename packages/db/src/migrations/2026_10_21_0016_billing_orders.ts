import { DataTypes } from 'sequelize';
import type { Migration } from './types';
import { fk, id, tableOptions, timestamps } from './types';

/**
 * Ödeme: sipariş başına bir satır (kart = PayTR iFrame, havale/EFT = admin onayı). Her ödenen sipariş
 * bir dönem açar (otomatik çekim yok). Fatura bilgileri siparişte de saklanır (sonradan değişse bile
 * o ödemenin faturası için). `reference` PayTR'nin `merchant_oid`'i ve havale açıklama kodudur.
 */
export const migration: Migration = {
  name: '2026_10_21_0016_billing_orders',
  async up({ context: qi }) {
    await qi.createTable(
      'billing_orders',
      {
        id: id(),
        organization_id: fk('organizations', 'CASCADE'),
        user_id: fk('users', 'SET NULL', true),
        reference: { type: DataTypes.STRING(64), allowNull: false, unique: true },
        plan: { type: DataTypes.STRING(20), allowNull: false },
        interval: { type: DataTypes.ENUM('monthly', 'yearly'), allowNull: false },
        method: { type: DataTypes.ENUM('card', 'bank_transfer'), allowNull: false },
        status: { type: DataTypes.ENUM('pending', 'paid', 'failed', 'canceled'), allowNull: false, defaultValue: 'pending' },
        currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'USD' },
        net_cents: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        vat_rate: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
        vat_cents: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        total_cents: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        /** Tahsil edilen (PayTR `total_amount`; taksitte siparişten yüksek olabilir) */
        paid_cents: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        /** Havale: hangi hesaba; TRY ise sipariş anındaki TCMB döviz satış kuru ve kuruş cinsinden tutar */
        transfer_currency: { type: DataTypes.ENUM('USD', 'TRY'), allowNull: true },
        exchange_rate: { type: DataTypes.DECIMAL(12, 4), allowNull: true },
        transfer_amount_minor: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
        billing_type: { type: DataTypes.ENUM('individual', 'company'), allowNull: false },
        billing_name: { type: DataTypes.STRING(200), allowNull: false },
        billing_email: { type: DataTypes.STRING(255), allowNull: false },
        billing_phone: { type: DataTypes.STRING(20), allowNull: false },
        billing_address: { type: DataTypes.STRING(400), allowNull: false },
        billing_country: { type: DataTypes.CHAR(2), allowNull: false },
        tax_id: { type: DataTypes.STRING(64), allowNull: true },
        tax_office: { type: DataTypes.STRING(120), allowNull: true },
        locale: { type: DataTypes.STRING(5), allowNull: false },
        test_mode: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        failure_code: { type: DataTypes.STRING(20), allowNull: true },
        failure_message: { type: DataTypes.STRING(500), allowNull: true },
        period_start: { type: DataTypes.DATE, allowNull: true },
        period_end: { type: DataTypes.DATE, allowNull: true },
        paid_at: { type: DataTypes.DATE, allowNull: true },
        /** Havaleyi onaylayan / siparişi iptal eden admin */
        processed_by: fk('users', 'SET NULL', true),
        admin_note: { type: DataTypes.STRING(500), allowNull: true },
        ...timestamps(),
      },
      tableOptions,
    );
    await qi.addIndex('billing_orders', ['organization_id', 'id']);
    await qi.addIndex('billing_orders', ['status', 'method', 'id']);

    await qi.addColumn('organizations', 'billing_phone', { type: DataTypes.STRING(20), allowNull: true });
    await qi.addColumn('organizations', 'tax_office', { type: DataTypes.STRING(120), allowNull: true });
    // Bu dönem sonu için yenileme hatırlatması gönderildi (aynı dönem için bir kez)
    await qi.addColumn('organizations', 'renewal_reminded_for', { type: DataTypes.DATE, allowNull: true });
  },
  async down({ context: qi }) {
    for (const col of ['renewal_reminded_for', 'tax_office', 'billing_phone']) await qi.removeColumn('organizations', col);
    await qi.dropTable('billing_orders');
  },
};
