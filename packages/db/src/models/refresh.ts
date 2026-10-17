import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';
import { DataTypes, Model } from 'sequelize';
import { idColumn } from '../ids';
import { applyTenantGuard } from '../tenant-guard';

export type RefreshStatus = 'generating' | 'ready' | 'applied' | 'reverted' | 'dismissed' | 'failed';

/** Yazının öneri anındaki hâli. `raw`: CMS'teki ham içerik (WordPress blok işaretleri dahil), geri almada aynen yazılır. */
export interface RefreshOriginal {
  title: string;
  /** CMS'teki ham başlık (geri alma) */
  rawTitle?: string;
  html: string;
  raw: string;
  metaDescription: string | null;
  url: string;
}

export interface RefreshChange {
  kind: 'outdated' | 'structure' | 'faq' | 'meta' | 'links' | 'content' | 'title';
  description: string;
}

export interface RefreshSuggestion {
  summary: string;
  changes: RefreshChange[];
  title: string;
  metaTitle: string;
  metaDescription: string;
  html: string;
}

/** İçerik yenileme önerisi (Bölüm 7.9): mevcut bir yazı için. */
export class ContentRefresh extends Model<InferAttributes<ContentRefresh>, InferCreationAttributes<ContentRefresh>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare siteId: string;
  declare existingPageId: string;
  declare remoteId: string;
  declare status: CreationOptional<RefreshStatus>;
  declare error: CreationOptional<string | null>;
  declare original: CreationOptional<RefreshOriginal | null>;
  declare suggestion: CreationOptional<RefreshSuggestion | null>;
  declare scoreBefore: CreationOptional<number | null>;
  declare scoreAfter: CreationOptional<number | null>;
  declare requestedBy: string | null;
  declare startedAt: CreationOptional<Date | null>;
  declare appliedAt: CreationOptional<Date | null>;
  declare revertedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    ContentRefresh.init(
      {
        id: idColumn,
        organizationId: { type: DataTypes.CHAR(36), allowNull: false },
        siteId: { type: DataTypes.CHAR(36), allowNull: false },
        existingPageId: { type: DataTypes.CHAR(36), allowNull: false },
        remoteId: { type: DataTypes.STRING(64), allowNull: false },
        status: { type: DataTypes.ENUM('generating', 'ready', 'applied', 'reverted', 'dismissed', 'failed'), allowNull: false, defaultValue: 'generating' },
        error: { type: DataTypes.STRING(40), allowNull: true },
        original: { type: DataTypes.JSON, allowNull: true },
        suggestion: { type: DataTypes.JSON, allowNull: true },
        scoreBefore: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
        scoreAfter: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
        requestedBy: { type: DataTypes.CHAR(36), allowNull: true },
        startedAt: { type: DataTypes.DATE, allowNull: true },
        appliedAt: { type: DataTypes.DATE, allowNull: true },
        revertedAt: { type: DataTypes.DATE, allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'content_refreshes', underscored: true },
    );
    applyTenantGuard(ContentRefresh, ['organizationId']);
  }
}
