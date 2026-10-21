import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';
import { DataTypes, Model } from 'sequelize';
import { idColumn } from '../ids';
import { applyTenantGuard } from '../tenant-guard';
import type { Organization } from './organization';

export type BillingMethod = 'card' | 'bank_transfer';
export type BillingOrderStatus = 'pending' | 'paid' | 'failed' | 'canceled';
export type TransferCurrency = 'USD' | 'TRY';

/** MySQL DECIMAL / BIGINT metin döner */
function numeric(field: string) {
  return function get(this: Model) {
    const v = this.getDataValue(field) as unknown;
    return v === null || v === undefined ? null : Number(v);
  };
}

/** Ödeme siparişi (kart: PayTR iFrame; havale/EFT: admin onayı). Her ödenen sipariş bir dönem açar. */
export class BillingOrder extends Model<InferAttributes<BillingOrder>, InferCreationAttributes<BillingOrder>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare userId: string | null;
  declare reference: string;
  declare plan: string;
  declare interval: 'monthly' | 'yearly';
  declare method: BillingMethod;
  declare status: CreationOptional<BillingOrderStatus>;
  declare currency: CreationOptional<string>;
  declare netCents: number;
  declare vatRate: number;
  declare vatCents: number;
  declare totalCents: number;
  declare paidCents: CreationOptional<number | null>;
  declare transferCurrency: TransferCurrency | null;
  declare exchangeRate: number | null;
  declare transferAmountMinor: number | null;
  declare billingType: 'individual' | 'company';
  declare billingName: string;
  declare billingEmail: string;
  declare billingPhone: string;
  declare billingAddress: string;
  declare billingCountry: string;
  declare taxId: string | null;
  declare taxOffice: string | null;
  declare locale: string;
  declare testMode: CreationOptional<boolean>;
  declare failureCode: CreationOptional<string | null>;
  declare failureMessage: CreationOptional<string | null>;
  declare periodStart: CreationOptional<Date | null>;
  declare periodEnd: CreationOptional<Date | null>;
  declare paidAt: CreationOptional<Date | null>;
  declare processedBy: CreationOptional<string | null>;
  declare adminNote: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare organization?: Organization;

  static initModel(sequelize: Sequelize): void {
    BillingOrder.init(
      {
        id: idColumn,
        organizationId: { type: DataTypes.CHAR(36), allowNull: false },
        userId: { type: DataTypes.CHAR(36), allowNull: true },
        reference: { type: DataTypes.STRING(64), allowNull: false, unique: true },
        plan: { type: DataTypes.STRING(20), allowNull: false },
        interval: { type: DataTypes.ENUM('monthly', 'yearly'), allowNull: false },
        method: { type: DataTypes.ENUM('card', 'bank_transfer'), allowNull: false },
        status: { type: DataTypes.ENUM('pending', 'paid', 'failed', 'canceled'), allowNull: false, defaultValue: 'pending' },
        currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'USD' },
        netCents: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        vatRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, get: numeric('vatRate') },
        vatCents: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        totalCents: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        paidCents: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        transferCurrency: { type: DataTypes.ENUM('USD', 'TRY'), allowNull: true },
        exchangeRate: { type: DataTypes.DECIMAL(12, 4), allowNull: true, get: numeric('exchangeRate') },
        transferAmountMinor: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, get: numeric('transferAmountMinor') },
        billingType: { type: DataTypes.ENUM('individual', 'company'), allowNull: false },
        billingName: { type: DataTypes.STRING(200), allowNull: false },
        billingEmail: { type: DataTypes.STRING(255), allowNull: false },
        billingPhone: { type: DataTypes.STRING(20), allowNull: false },
        billingAddress: { type: DataTypes.STRING(400), allowNull: false },
        billingCountry: { type: DataTypes.CHAR(2), allowNull: false },
        taxId: { type: DataTypes.STRING(64), allowNull: true },
        taxOffice: { type: DataTypes.STRING(120), allowNull: true },
        locale: { type: DataTypes.STRING(5), allowNull: false },
        testMode: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        failureCode: { type: DataTypes.STRING(20), allowNull: true },
        failureMessage: { type: DataTypes.STRING(500), allowNull: true },
        periodStart: { type: DataTypes.DATE, allowNull: true },
        periodEnd: { type: DataTypes.DATE, allowNull: true },
        paidAt: { type: DataTypes.DATE, allowNull: true },
        processedBy: { type: DataTypes.CHAR(36), allowNull: true },
        adminNote: { type: DataTypes.STRING(500), allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'billing_orders', underscored: true },
    );
    // PayTR bildirimi (referansla) ve admin listesi tüm kiracıları kapsar: sadece withoutTenantGuard ile.
    applyTenantGuard(BillingOrder, ['organizationId']);
  }
}
