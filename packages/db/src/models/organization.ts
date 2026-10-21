import type {
  CreationOptional,
  InferAttributes,
  InferCreationAttributes,
  Sequelize,
} from 'sequelize';
import { DataTypes, Model } from 'sequelize';
import { idColumn } from '../ids';
import { applyTenantGuard } from '../tenant-guard';
import type { User } from './user';

export type PlanStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled';
export const ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export class Organization extends Model<
  InferAttributes<Organization>,
  InferCreationAttributes<Organization>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare slug: string;
  declare plan: string | null;
  declare planStatus: CreationOptional<PlanStatus>;
  /** trial: paket yok; paid: ödenmiş dönem (`currentPeriodEnd`'e kadar); complimentary: admin'in verdiği ödemesiz paket */
  declare planSource: CreationOptional<'trial' | 'paid' | 'complimentary'>;
  declare articleQuotaOverride: CreationOptional<number | null>;
  declare entitlementExpiresAt: CreationOptional<Date | null>;
  declare entitlementNote: CreationOptional<string | null>;
  declare trialEndsAt: Date | null;
  declare currentPeriodEnd: Date | null;
  declare defaultLocale: CreationOptional<string>;
  declare billingType: 'company' | 'individual' | null;
  declare billingName: string | null;
  declare billingAddress: string | null;
  declare billingCountry: string | null;
  declare taxId: string | null;
  declare billingPhone: CreationOptional<string | null>;
  declare taxOffice: CreationOptional<string | null>;
  /** Yenileme hatırlatması bu dönem sonu için gönderildi */
  declare renewalRemindedFor: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: Date | null;

  static initModel(sequelize: Sequelize): void {
    Organization.init(
      {
        id: idColumn,
        name: { type: DataTypes.STRING(120), allowNull: false },
        slug: { type: DataTypes.STRING(140), allowNull: false, unique: true },
        plan: { type: DataTypes.STRING(20), allowNull: true },
        planStatus: {
          type: DataTypes.ENUM('none', 'trialing', 'active', 'past_due', 'paused', 'canceled'),
          allowNull: false,
          defaultValue: 'none',
        },
        planSource: { type: DataTypes.ENUM('trial', 'paid', 'complimentary'), allowNull: false, defaultValue: 'trial' },
        articleQuotaOverride: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
        entitlementExpiresAt: { type: DataTypes.DATE, allowNull: true },
        entitlementNote: { type: DataTypes.STRING(500), allowNull: true },
        trialEndsAt: { type: DataTypes.DATE, allowNull: true },
        currentPeriodEnd: { type: DataTypes.DATE, allowNull: true },
        defaultLocale: { type: DataTypes.STRING(5), allowNull: false, defaultValue: 'en' },
        billingType: { type: DataTypes.ENUM('company', 'individual'), allowNull: true },
        billingName: { type: DataTypes.STRING(200), allowNull: true },
        billingAddress: { type: DataTypes.STRING(500), allowNull: true },
        billingCountry: { type: DataTypes.CHAR(2), allowNull: true },
        taxId: { type: DataTypes.STRING(64), allowNull: true },
        billingPhone: { type: DataTypes.STRING(20), allowNull: true },
        taxOffice: { type: DataTypes.STRING(120), allowNull: true },
        renewalRemindedFor: { type: DataTypes.DATE, allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
        deletedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'organizations', underscored: true, paranoid: true },
    );
  }
}

export class Membership extends Model<
  InferAttributes<Membership>,
  InferCreationAttributes<Membership>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare organizationId: string;
  declare role: Role;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare organization?: Organization;
  declare user?: User;

  static initModel(sequelize: Sequelize): void {
    Membership.init(
      {
        id: idColumn,
        userId: { type: DataTypes.CHAR(36), allowNull: false },
        organizationId: { type: DataTypes.CHAR(36), allowNull: false },
        role: { type: DataTypes.ENUM(...ROLES), allowNull: false },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'memberships', underscored: true },
    );
    // Üyelikler ya organizasyona ya da kullanıcıya göre sorgulanmalı (kullanıcının kendi üyelikleri).
    applyTenantGuard(Membership, ['organizationId', 'userId']);
  }
}
