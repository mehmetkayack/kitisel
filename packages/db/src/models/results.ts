import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';
import { DataTypes, Model } from 'sequelize';
import { idColumn } from '../ids';
import { applyTenantGuard } from '../tenant-guard';

const ts = { createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE };
const orgId = { type: DataTypes.CHAR(36), allowNull: false } as const;

export type SyncStatus = 'idle' | 'running' | 'done' | 'failed';

/** Site başına Search Console bağlantısı (Bölüm 7.11). Refresh token AES-256-GCM ile şifreli. */
export class GscConnection extends Model<InferAttributes<GscConnection>, InferCreationAttributes<GscConnection>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare siteId: string;
  declare googleEmail: string | null;
  /** Seçilen mülk: `sc-domain:ornek.com` ya da `https://ornek.com/`; seçilmemişse null */
  declare property: string | null;
  declare properties: string[];
  declare ciphertext: Buffer;
  declare iv: Buffer;
  declare authTag: Buffer;
  declare keyVersion: number;
  declare syncStatus: CreationOptional<SyncStatus>;
  declare syncError: CreationOptional<string | null>;
  declare syncStartedAt: CreationOptional<Date | null>;
  declare lastSyncedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    GscConnection.init(
      {
        id: idColumn,
        organizationId: orgId,
        siteId: { type: DataTypes.CHAR(36), allowNull: false },
        googleEmail: { type: DataTypes.STRING(320), allowNull: true },
        property: { type: DataTypes.STRING(512), allowNull: true },
        properties: { type: DataTypes.JSON, allowNull: false },
        ciphertext: { type: DataTypes.BLOB, allowNull: false },
        iv: { type: DataTypes.BLOB('tiny'), allowNull: false },
        authTag: { type: DataTypes.BLOB('tiny'), allowNull: false },
        keyVersion: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
        syncStatus: { type: DataTypes.ENUM('idle', 'running', 'done', 'failed'), allowNull: false, defaultValue: 'idle' },
        syncError: { type: DataTypes.STRING(40), allowNull: true },
        syncStartedAt: { type: DataTypes.DATE, allowNull: true },
        lastSyncedAt: { type: DataTypes.DATE, allowNull: true },
        ...ts,
      },
      { sequelize, tableName: 'gsc_connections', underscored: true },
    );
    applyTenantGuard(GscConnection, ['organizationId']);
  }
}

/** Günlük Search Console metriği. `page = ''` ve `query = ''` satırı günün sitedeki toplamıdır. */
export class GscDailyMetric extends Model<InferAttributes<GscDailyMetric>, InferCreationAttributes<GscDailyMetric>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare siteId: string;
  /** `YYYY-MM-DD` (Search Console: Pasifik saati) */
  declare date: string;
  declare page: string;
  declare pageHash: string;
  declare query: string;
  declare queryHash: string;
  declare clicks: number;
  declare impressions: number;
  declare ctr: string;
  declare position: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    GscDailyMetric.init(
      {
        id: idColumn,
        organizationId: orgId,
        siteId: { type: DataTypes.CHAR(36), allowNull: false },
        date: { type: DataTypes.DATEONLY, allowNull: false },
        page: { type: DataTypes.STRING(2048), allowNull: false },
        pageHash: { type: DataTypes.CHAR(16), allowNull: false },
        query: { type: DataTypes.STRING(500), allowNull: false },
        queryHash: { type: DataTypes.CHAR(16), allowNull: false },
        clicks: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        impressions: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        ctr: { type: DataTypes.DECIMAL(6, 4), allowNull: false },
        position: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
        ...ts,
      },
      { sequelize, tableName: 'gsc_daily_metrics', underscored: true },
    );
    applyTenantGuard(GscDailyMetric, ['organizationId']);
  }
}

/** AI görünürlük sorusu (Bölüm 7.12): potansiyel müşterinin bir yapay zekâ asistanına soracağı soru. */
export class AiVisibilityPrompt extends Model<InferAttributes<AiVisibilityPrompt>, InferCreationAttributes<AiVisibilityPrompt>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare siteId: string;
  declare question: string;
  declare language: string;
  declare source: 'ai' | 'user';
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    AiVisibilityPrompt.init(
      {
        id: idColumn,
        organizationId: orgId,
        siteId: { type: DataTypes.CHAR(36), allowNull: false },
        question: { type: DataTypes.STRING(300), allowNull: false },
        language: { type: DataTypes.STRING(10), allowNull: false },
        source: { type: DataTypes.ENUM('ai', 'user'), allowNull: false },
        ...ts,
      },
      { sequelize, tableName: 'ai_visibility_prompts', underscored: true },
    );
    applyTenantGuard(AiVisibilityPrompt, ['organizationId']);
  }
}

/** Bir sorunun bir turdaki sonucu: cevapta marka anıldı mı, alan adı kaynaklarda geçti mi. */
export class AiVisibilityCheck extends Model<InferAttributes<AiVisibilityCheck>, InferCreationAttributes<AiVisibilityCheck>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare siteId: string;
  declare promptId: string;
  declare runId: string;
  declare provider: string;
  declare model: string;
  declare grounded: boolean;
  declare mentioned: boolean;
  declare cited: boolean;
  declare citedUrls: string[];
  declare answerExcerpt: string;
  declare checkedAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    AiVisibilityCheck.init(
      {
        id: idColumn,
        organizationId: orgId,
        siteId: { type: DataTypes.CHAR(36), allowNull: false },
        promptId: { type: DataTypes.CHAR(36), allowNull: false },
        runId: { type: DataTypes.CHAR(36), allowNull: false },
        provider: { type: DataTypes.STRING(40), allowNull: false },
        model: { type: DataTypes.STRING(100), allowNull: false },
        grounded: { type: DataTypes.BOOLEAN, allowNull: false },
        mentioned: { type: DataTypes.BOOLEAN, allowNull: false },
        cited: { type: DataTypes.BOOLEAN, allowNull: false },
        citedUrls: { type: DataTypes.JSON, allowNull: false },
        answerExcerpt: { type: DataTypes.TEXT, allowNull: false },
        checkedAt: { type: DataTypes.DATE, allowNull: false },
        ...ts,
      },
      { sequelize, tableName: 'ai_visibility_checks', underscored: true },
    );
    applyTenantGuard(AiVisibilityCheck, ['organizationId']);
  }
}
