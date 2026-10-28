import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';
import { DataTypes, Model } from 'sequelize';
import { idColumn } from '../ids';

export type SalesSector = 'dental' | 'beauty' | 'lawyer' | 'ecommerce' | 'other';
export type SalesChannel = 'email' | 'instagram_dm' | 'in_person' | 'phone' | 'linkedin';
export type SalesLeadStatus = 'new' | 'contacted' | 'replied' | 'meeting' | 'trial' | 'customer' | 'not_interested';
export type SalesSource = 'manual' | 'import' | 'agent';
export type SalesLeadEventType = 'status_change' | 'note' | 'message_copied' | 'follow_up_sent' | 'created' | 'imported' | 'linked';
export type SalesPostPillar = 'intro' | 'education' | 'kit_found' | 'sector' | 'analysis_cta';
export type SalesPostStatus = 'draft' | 'approved' | 'scheduled' | 'published';

const SECTORS = ['dental', 'beauty', 'lawyer', 'ecommerce', 'other'] as const;
const CHANNELS = ['email', 'instagram_dm', 'in_person', 'phone', 'linkedin'] as const;
const LEAD_STATUSES = ['new', 'contacted', 'replied', 'meeting', 'trial', 'customer', 'not_interested'] as const;
const SOURCES = ['manual', 'import', 'agent'] as const;

/** Satış masası: müşteri adayı (kiracıya bağlı değil; sadece admin). */
export class SalesLead extends Model<InferAttributes<SalesLead>, InferCreationAttributes<SalesLead>> {
  declare id: CreationOptional<string>;
  declare domain: string;
  declare name: string;
  declare sector: CreationOptional<SalesSector>;
  declare city: string | null;
  declare website: string | null;
  declare email: string | null;
  declare phone: string | null;
  declare instagram: string | null;
  declare channel: CreationOptional<SalesChannel>;
  declare status: CreationOptional<SalesLeadStatus>;
  declare finding: string | null;
  declare message: string | null;
  declare followUpMessage: string | null;
  declare note: string | null;
  declare source: CreationOptional<SalesSource>;
  declare doNotContact: CreationOptional<boolean>;
  declare contactedAt: CreationOptional<Date | null>;
  declare lastStatusAt: CreationOptional<Date | null>;
  declare nextFollowUpAt: CreationOptional<Date | null>;
  declare followUpsSent: CreationOptional<number>;
  declare linkedUserId: CreationOptional<string | null>;
  declare addedAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    SalesLead.init(
      {
        id: idColumn,
        domain: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        name: { type: DataTypes.STRING(255), allowNull: false },
        sector: { type: DataTypes.ENUM(...SECTORS), allowNull: false, defaultValue: 'other' },
        city: { type: DataTypes.STRING(120), allowNull: true },
        website: { type: DataTypes.STRING(500), allowNull: true },
        email: { type: DataTypes.STRING(255), allowNull: true },
        phone: { type: DataTypes.STRING(60), allowNull: true },
        instagram: { type: DataTypes.STRING(255), allowNull: true },
        channel: { type: DataTypes.ENUM(...CHANNELS), allowNull: false, defaultValue: 'email' },
        status: { type: DataTypes.ENUM(...LEAD_STATUSES), allowNull: false, defaultValue: 'new' },
        finding: { type: DataTypes.TEXT, allowNull: true },
        message: { type: DataTypes.TEXT, allowNull: true },
        followUpMessage: { type: DataTypes.TEXT, allowNull: true },
        note: { type: DataTypes.TEXT, allowNull: true },
        source: { type: DataTypes.ENUM(...SOURCES), allowNull: false, defaultValue: 'manual' },
        doNotContact: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        contactedAt: { type: DataTypes.DATE, allowNull: true },
        lastStatusAt: { type: DataTypes.DATE, allowNull: true },
        nextFollowUpAt: { type: DataTypes.DATE, allowNull: true },
        followUpsSent: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
        linkedUserId: { type: DataTypes.CHAR(36), allowNull: true },
        addedAt: { type: DataTypes.DATE, allowNull: false },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'sales_leads', underscored: true },
    );
  }
}

/** Aday geçmişi: durum değişiklikleri, notlar, kopyalanan mesajlar. */
export class SalesLeadEvent extends Model<InferAttributes<SalesLeadEvent>, InferCreationAttributes<SalesLeadEvent>> {
  declare id: CreationOptional<string>;
  declare leadId: string;
  declare type: SalesLeadEventType;
  declare fromStatus: string | null;
  declare toStatus: string | null;
  declare text: string | null;
  declare adminUserId: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    SalesLeadEvent.init(
      {
        id: idColumn,
        leadId: { type: DataTypes.CHAR(36), allowNull: false },
        type: { type: DataTypes.ENUM('status_change', 'note', 'message_copied', 'follow_up_sent', 'created', 'imported', 'linked'), allowNull: false },
        fromStatus: { type: DataTypes.STRING(20), allowNull: true },
        toStatus: { type: DataTypes.STRING(20), allowNull: true },
        text: { type: DataTypes.TEXT, allowNull: true },
        adminUserId: { type: DataTypes.CHAR(36), allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'sales_lead_events', underscored: true },
    );
  }
}

/** Instagram gönderi planı. */
export class SalesSocialPost extends Model<InferAttributes<SalesSocialPost>, InferCreationAttributes<SalesSocialPost>> {
  declare id: CreationOptional<string>;
  declare slug: string;
  /** YYYY-MM-DD */
  declare date: string;
  declare time: string | null;
  declare format: string | null;
  declare pillar: CreationOptional<SalesPostPillar>;
  declare title: string;
  declare visual: string | null;
  declare caption: string | null;
  declare hashtags: string | null;
  declare status: CreationOptional<SalesPostStatus>;
  declare source: CreationOptional<SalesSource>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    SalesSocialPost.init(
      {
        id: idColumn,
        slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
        date: { type: DataTypes.DATEONLY, allowNull: false },
        time: { type: DataTypes.STRING(5), allowNull: true },
        format: { type: DataTypes.STRING(60), allowNull: true },
        pillar: { type: DataTypes.ENUM('intro', 'education', 'kit_found', 'sector', 'analysis_cta'), allowNull: false, defaultValue: 'intro' },
        title: { type: DataTypes.STRING(255), allowNull: false },
        visual: { type: DataTypes.TEXT, allowNull: true },
        caption: { type: DataTypes.TEXT, allowNull: true },
        hashtags: { type: DataTypes.STRING(500), allowNull: true },
        status: { type: DataTypes.ENUM('draft', 'approved', 'scheduled', 'published'), allowNull: false, defaultValue: 'draft' },
        source: { type: DataTypes.ENUM(...SOURCES), allowNull: false, defaultValue: 'manual' },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'sales_social_posts', underscored: true },
    );
  }
}
