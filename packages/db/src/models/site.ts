import type { CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';
import { DataTypes, Model } from 'sequelize';
import { idColumn } from '../ids';
import { applyTenantGuard } from '../tenant-guard';
import type { Article } from './content';

export const CMS_TYPES = ['none', 'wordpress', 'shopify', 'webflow', 'ghost', 'wix', 'webhook', 'download'] as const;
export type CmsType = (typeof CMS_TYPES)[number];
export type ConnectionStatus = 'not_connected' | 'connected' | 'error';
export type PublishMode = 'approval' | 'auto';
export type AnalysisStatus = 'pending' | 'running' | 'done' | 'failed';
export type TopicsStatus = 'idle' | 'running' | 'done' | 'failed';
export type PostsSyncStatus = TopicsStatus;
export type ExistingPageSource = 'crawl' | 'cms';
/** Mevcut yazının SEO sorunu (`locales/*\/sites.json > posts.issues`) */
export interface PageIssue {
  code: string;
  severity: 'high' | 'medium' | 'low';
  value?: number;
}
export const TONE_VALUES = ['professional', 'friendly', 'expert', 'playful'] as const;
export type ToneValue = (typeof TONE_VALUES)[number];
export const CONTENT_ITEM_STATUSES = ['planned', 'generating', 'review', 'approved', 'scheduled', 'published', 'failed', 'rejected'] as const;
export type ContentItemStatus = (typeof CONTENT_ITEM_STATUSES)[number];
export type KeywordIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';
export type KeywordSource = 'dataforseo' | 'estimated' | 'user';

const ts = { createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE };
const orgId = { type: DataTypes.CHAR(36), allowNull: false } as const;

export class Site extends Model<InferAttributes<Site>, InferCreationAttributes<Site>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare url: string;
  declare domain: string;
  declare name: string;
  declare country: string | null;
  declare contentLanguage: string | null;
  declare extraLanguages: string[] | null;
  declare cmsType: CreationOptional<CmsType>;
  declare connectionStatus: CreationOptional<ConnectionStatus>;
  declare publishMode: CreationOptional<PublishMode>;
  declare postsPerWeek: CreationOptional<number>;
  declare publishDays: number[] | null;
  declare publishTime: CreationOptional<string>;
  declare timezone: CreationOptional<string>;
  declare onboardingStep: CreationOptional<string>;
  declare onboardingCompletedAt: Date | null;
  declare analysisStatus: CreationOptional<AnalysisStatus>;
  declare analysisPhase: string | null;
  declare analysisError: string | null;
  declare analyzedAt: Date | null;
  declare topicsStatus: CreationOptional<TopicsStatus>;
  declare topicsError: string | null;
  /** İşin kuyruğa alındığı an (takılı iş tespiti; genel updated_at başka güncellemelerle değişiyor) */
  declare analysisStartedAt: CreationOptional<Date | null>;
  declare topicsStartedAt: CreationOptional<Date | null>;
  /** CMS'teki mevcut yazıların eşitlenmesi */
  declare postsSyncStatus: CreationOptional<PostsSyncStatus>;
  declare postsSyncError: CreationOptional<string | null>;
  declare postsSyncStartedAt: CreationOptional<Date | null>;
  declare postsSyncedAt: CreationOptional<Date | null>;
  /** AI görünürlük turu (haftalık) */
  declare visibilityStatus: CreationOptional<PostsSyncStatus>;
  declare visibilityError: CreationOptional<string | null>;
  declare visibilityStartedAt: CreationOptional<Date | null>;
  declare visibilityCheckedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: Date | null;

  static initModel(sequelize: Sequelize): void {
    Site.init(
      {
        id: idColumn,
        organizationId: orgId,
        url: { type: DataTypes.STRING(2048), allowNull: false },
        domain: { type: DataTypes.STRING(255), allowNull: false },
        name: { type: DataTypes.STRING(200), allowNull: false },
        country: { type: DataTypes.CHAR(2), allowNull: true },
        contentLanguage: { type: DataTypes.STRING(10), allowNull: true },
        extraLanguages: { type: DataTypes.JSON, allowNull: true },
        cmsType: { type: DataTypes.ENUM(...CMS_TYPES), allowNull: false, defaultValue: 'none' },
        connectionStatus: { type: DataTypes.ENUM('not_connected', 'connected', 'error'), allowNull: false, defaultValue: 'not_connected' },
        publishMode: { type: DataTypes.ENUM('approval', 'auto'), allowNull: false, defaultValue: 'approval' },
        postsPerWeek: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 2 },
        publishDays: { type: DataTypes.JSON, allowNull: true },
        publishTime: { type: DataTypes.CHAR(5), allowNull: false, defaultValue: '10:00' },
        timezone: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'UTC' },
        onboardingStep: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'brand' },
        onboardingCompletedAt: { type: DataTypes.DATE, allowNull: true },
        analysisStatus: { type: DataTypes.ENUM('pending', 'running', 'done', 'failed'), allowNull: false, defaultValue: 'pending' },
        analysisPhase: { type: DataTypes.STRING(20), allowNull: true },
        analysisError: { type: DataTypes.STRING(40), allowNull: true },
        analyzedAt: { type: DataTypes.DATE, allowNull: true },
        topicsStatus: { type: DataTypes.ENUM('idle', 'running', 'done', 'failed'), allowNull: false, defaultValue: 'idle' },
        topicsError: { type: DataTypes.STRING(40), allowNull: true },
        analysisStartedAt: { type: DataTypes.DATE, allowNull: true },
        topicsStartedAt: { type: DataTypes.DATE, allowNull: true },
        postsSyncStatus: { type: DataTypes.ENUM('idle', 'running', 'done', 'failed'), allowNull: false, defaultValue: 'idle' },
        postsSyncError: { type: DataTypes.STRING(40), allowNull: true },
        postsSyncStartedAt: { type: DataTypes.DATE, allowNull: true },
        postsSyncedAt: { type: DataTypes.DATE, allowNull: true },
        visibilityStatus: { type: DataTypes.ENUM('idle', 'running', 'done', 'failed'), allowNull: false, defaultValue: 'idle' },
        visibilityError: { type: DataTypes.STRING(40), allowNull: true },
        visibilityStartedAt: { type: DataTypes.DATE, allowNull: true },
        visibilityCheckedAt: { type: DataTypes.DATE, allowNull: true },
        ...ts,
        deletedAt: DataTypes.DATE,
      },
      { sequelize, tableName: 'sites', underscored: true, paranoid: true },
    );
    applyTenantGuard(Site, ['organizationId']);
  }
}

export class BrandProfile extends Model<InferAttributes<BrandProfile>, InferCreationAttributes<BrandProfile>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare siteId: string;
  declare brandName: string;
  declare description: string;
  declare industry: string | null;
  declare productsServices: string[];
  declare targetAudience: string | null;
  declare tone: CreationOptional<ToneValue>;
  declare toneGuideline: string | null;
  declare bannedWords: string[];
  declare sampleTexts: string[];
  declare competitors: string[];
  declare ctaText: string | null;
  declare ctaUrl: string | null;
  declare brandColors: string[] | null;
  declare source: 'ai' | 'heuristic' | 'user';
  declare approvedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    BrandProfile.init(
      {
        id: idColumn,
        organizationId: orgId,
        siteId: { type: DataTypes.CHAR(36), allowNull: false },
        brandName: { type: DataTypes.STRING(120), allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: false },
        industry: { type: DataTypes.STRING(120), allowNull: true },
        productsServices: { type: DataTypes.JSON, allowNull: false },
        targetAudience: { type: DataTypes.TEXT, allowNull: true },
        tone: { type: DataTypes.ENUM(...TONE_VALUES), allowNull: false, defaultValue: 'professional' },
        toneGuideline: { type: DataTypes.TEXT, allowNull: true },
        bannedWords: { type: DataTypes.JSON, allowNull: false },
        sampleTexts: { type: DataTypes.JSON, allowNull: false },
        competitors: { type: DataTypes.JSON, allowNull: false },
        ctaText: { type: DataTypes.STRING(200), allowNull: true },
        ctaUrl: { type: DataTypes.STRING(2048), allowNull: true },
        brandColors: { type: DataTypes.JSON, allowNull: true },
        source: { type: DataTypes.ENUM('ai', 'heuristic', 'user'), allowNull: false },
        approvedAt: { type: DataTypes.DATE, allowNull: true },
        ...ts,
      },
      { sequelize, tableName: 'brand_profiles', underscored: true },
    );
    applyTenantGuard(BrandProfile, ['organizationId']);
  }
}

export class SiteAudit extends Model<InferAttributes<SiteAudit>, InferCreationAttributes<SiteAudit>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare siteId: string;
  declare score: number;
  /** `@upvine/seo` CheckResult[] (paket bağımlılığı olmasın diye burada `unknown[]`) */
  declare checks: unknown[];
  declare pagesCrawled: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    SiteAudit.init(
      {
        id: idColumn,
        organizationId: orgId,
        siteId: { type: DataTypes.CHAR(36), allowNull: false },
        score: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
        checks: { type: DataTypes.JSON, allowNull: false },
        pagesCrawled: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        ...ts,
      },
      { sequelize, tableName: 'site_audits', underscored: true },
    );
    applyTenantGuard(SiteAudit, ['organizationId']);
  }
}

export class ExistingPage extends Model<InferAttributes<ExistingPage>, InferCreationAttributes<ExistingPage>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare siteId: string;
  declare url: string;
  declare urlHash: string;
  declare title: string | null;
  declare h1: string | null;
  declare description: string | null;
  declare statusCode: number;
  declare wordCount: CreationOptional<number>;
  declare embedding: Buffer | null;
  declare embeddingHash: string | null;
  declare lastCrawledAt: Date;
  /** `cms`: CMS'ten çekilen yazı (SEO sorunlarıyla); `crawl`: taramada bulunan sayfa */
  declare source: CreationOptional<ExistingPageSource>;
  declare remoteId: CreationOptional<string | null>;
  /** Sayfanın görseli (og:image ya da öne çıkan görsel): kapak adayı */
  declare imageUrl: CreationOptional<string | null>;
  declare publishedAt: CreationOptional<Date | null>;
  declare modifiedAt: CreationOptional<Date | null>;
  declare seoScore: CreationOptional<number | null>;
  declare issues: CreationOptional<PageIssue[] | null>;
  declare metrics: CreationOptional<Record<string, number> | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    ExistingPage.init(
      {
        id: idColumn,
        organizationId: orgId,
        siteId: { type: DataTypes.CHAR(36), allowNull: false },
        url: { type: DataTypes.STRING(2048), allowNull: false },
        urlHash: { type: DataTypes.CHAR(64), allowNull: false },
        title: { type: DataTypes.STRING(500), allowNull: true },
        h1: { type: DataTypes.STRING(500), allowNull: true },
        description: { type: DataTypes.STRING(1000), allowNull: true },
        statusCode: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
        wordCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        embedding: { type: DataTypes.BLOB, allowNull: true },
        embeddingHash: { type: DataTypes.CHAR(16), allowNull: true },
        lastCrawledAt: { type: DataTypes.DATE, allowNull: false },
        source: { type: DataTypes.ENUM('crawl', 'cms'), allowNull: false, defaultValue: 'crawl' },
        remoteId: { type: DataTypes.STRING(64), allowNull: true },
        imageUrl: { type: DataTypes.STRING(2048), allowNull: true },
        publishedAt: { type: DataTypes.DATE, allowNull: true },
        modifiedAt: { type: DataTypes.DATE, allowNull: true },
        seoScore: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
        issues: { type: DataTypes.JSON, allowNull: true },
        metrics: { type: DataTypes.JSON, allowNull: true },
        ...ts,
      },
      { sequelize, tableName: 'existing_pages', underscored: true },
    );
    applyTenantGuard(ExistingPage, ['organizationId']);
  }
}

export class Keyword extends Model<InferAttributes<Keyword>, InferCreationAttributes<Keyword>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare siteId: string;
  declare term: string;
  declare language: string;
  declare country: string | null;
  declare searchVolume: number | null;
  declare difficulty: number | null;
  declare cpc: string | null;
  declare currency: string | null;
  declare intent: KeywordIntent | null;
  declare source: KeywordSource;
  declare clusterId: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    Keyword.init(
      {
        id: idColumn,
        organizationId: orgId,
        siteId: { type: DataTypes.CHAR(36), allowNull: false },
        term: { type: DataTypes.STRING(200), allowNull: false },
        language: { type: DataTypes.STRING(10), allowNull: false },
        country: { type: DataTypes.CHAR(2), allowNull: true },
        searchVolume: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        difficulty: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
        cpc: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
        currency: { type: DataTypes.CHAR(3), allowNull: true },
        intent: { type: DataTypes.ENUM('informational', 'commercial', 'transactional', 'navigational'), allowNull: true },
        source: { type: DataTypes.ENUM('dataforseo', 'estimated', 'user'), allowNull: false },
        clusterId: { type: DataTypes.CHAR(36), allowNull: true },
        ...ts,
      },
      { sequelize, tableName: 'keywords', underscored: true },
    );
    applyTenantGuard(Keyword, ['organizationId']);
  }
}

export class ContentItem extends Model<InferAttributes<ContentItem>, InferCreationAttributes<ContentItem>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare siteId: string;
  declare keywordId: string | null;
  declare title: string;
  declare plannedAt: Date | null;
  declare status: CreationOptional<ContentItemStatus>;
  declare type: CreationOptional<'new' | 'refresh'>;
  declare errorMessage: string | null;
  declare progressStep: string | null;
  declare position: CreationOptional<number>;
  declare rejectReason: CreationOptional<string | null>;
  /** Başlık + anahtar kelime vektörü (Float32, normalize): konu tekrarı ve iç link seçimi */
  declare embedding: CreationOptional<Buffer | null>;
  /** Konu sitedeki bu yazıyla aynı çıktı: yazılmadı, o yazının güncellenmesi önerilir */
  declare duplicateOfUrl: CreationOptional<string | null>;
  /** Yazının baştan yeniden üretilme sayısı (ilk üretim hariç; sınır `REGENERATIONS_PER_ARTICLE`) */
  declare regenerationCount: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare keyword?: Keyword | null;
  declare article?: Article | null;
  declare site?: Site;

  static initModel(sequelize: Sequelize): void {
    ContentItem.init(
      {
        id: idColumn,
        organizationId: orgId,
        siteId: { type: DataTypes.CHAR(36), allowNull: false },
        keywordId: { type: DataTypes.CHAR(36), allowNull: true },
        title: { type: DataTypes.STRING(255), allowNull: false },
        plannedAt: { type: DataTypes.DATE, allowNull: true },
        status: { type: DataTypes.ENUM(...CONTENT_ITEM_STATUSES), allowNull: false, defaultValue: 'planned' },
        type: { type: DataTypes.ENUM('new', 'refresh'), allowNull: false, defaultValue: 'new' },
        errorMessage: { type: DataTypes.STRING(500), allowNull: true },
        progressStep: { type: DataTypes.STRING(40), allowNull: true },
        position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        rejectReason: { type: DataTypes.STRING(40), allowNull: true },
        embedding: { type: DataTypes.BLOB, allowNull: true },
        duplicateOfUrl: { type: DataTypes.STRING(2048), allowNull: true },
        regenerationCount: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 0 },
        ...ts,
      },
      { sequelize, tableName: 'content_items', underscored: true },
    );
    applyTenantGuard(ContentItem, ['organizationId']);
  }
}

/** Yapay zekâ çağrı kaydı. Kiracıya bağlı değildir (sistem çağrıları da olabilir); admin maliyet raporunda kullanılır. */
export class AiUsageLog extends Model<InferAttributes<AiUsageLog>, InferCreationAttributes<AiUsageLog>> {
  declare id: CreationOptional<string>;
  declare organizationId: string | null;
  declare operation: string;
  declare model: string;
  declare inputTokens: number;
  declare outputTokens: number;
  declare costUsd: string | number;
  declare latencyMs: number;
  declare success: boolean;
  declare errorCode: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    AiUsageLog.init(
      {
        id: idColumn,
        organizationId: { type: DataTypes.CHAR(36), allowNull: true },
        operation: { type: DataTypes.STRING(80), allowNull: false },
        model: { type: DataTypes.STRING(80), allowNull: false },
        inputTokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        outputTokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        costUsd: { type: DataTypes.DECIMAL(12, 6), allowNull: false },
        latencyMs: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        success: { type: DataTypes.BOOLEAN, allowNull: false },
        errorCode: { type: DataTypes.STRING(40), allowNull: true },
        ...ts,
      },
      { sequelize, tableName: 'ai_usage_logs', underscored: true },
    );
  }
}
