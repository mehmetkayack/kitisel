import type { CreationOptional, InferAttributes, InferCreationAttributes, NonAttribute, Sequelize } from 'sequelize';
import { DataTypes, Model } from 'sequelize';
import { idColumn } from '../ids';
import { applyTenantGuard } from '../tenant-guard';
import type { User } from './user';

const ts = { createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE };
const orgId = { type: DataTypes.CHAR(36), allowNull: false } as const;

export type FreeAnalysisStatus = 'pending' | 'running' | 'done' | 'failed';

/** Kayıt gerektirmeyen ücretsiz analiz (Bölüm 7.2). Kiracıya bağlı değildir; erişim paylaşım token'ıyla. */
export class FreeAnalysis extends Model<InferAttributes<FreeAnalysis>, InferCreationAttributes<FreeAnalysis>> {
  declare id: CreationOptional<string>;
  declare shareToken: string;
  declare url: string;
  declare domain: string;
  declare locale: string;
  declare status: CreationOptional<FreeAnalysisStatus>;
  declare phase: string | null;
  declare error: string | null;
  declare result: unknown;
  declare email: string | null;
  declare marketingConsent: CreationOptional<boolean>;
  declare emailSentAt: Date | null;
  declare ipHash: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    FreeAnalysis.init(
      {
        id: idColumn,
        shareToken: { type: DataTypes.STRING(64), allowNull: false, unique: true },
        url: { type: DataTypes.STRING(2048), allowNull: false },
        domain: { type: DataTypes.STRING(255), allowNull: false },
        locale: { type: DataTypes.STRING(5), allowNull: false },
        status: { type: DataTypes.ENUM('pending', 'running', 'done', 'failed'), allowNull: false, defaultValue: 'pending' },
        phase: { type: DataTypes.STRING(20), allowNull: true },
        error: { type: DataTypes.STRING(40), allowNull: true },
        result: { type: DataTypes.JSON, allowNull: true },
        email: { type: DataTypes.STRING(255), allowNull: true },
        marketingConsent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        emailSentAt: { type: DataTypes.DATE, allowNull: true },
        ipHash: { type: DataTypes.CHAR(64), allowNull: false },
        ...ts,
      },
      { sequelize, tableName: 'free_analyses', underscored: true },
    );
  }
}

export interface ArticleFaq {
  question: string;
  answer: string;
}

export class Article extends Model<InferAttributes<Article>, InferCreationAttributes<Article>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare siteId: string;
  declare contentItemId: string;
  declare language: string;
  declare title: string;
  declare slug: string;
  declare metaTitle: string;
  declare metaDescription: string;
  declare html: string;
  declare outline: unknown;
  declare faq: ArticleFaq[];
  declare schemaJson: unknown;
  declare seoScore: number;
  declare seoChecks: unknown[];
  declare verification: unknown;
  declare sources: { url: string; title: string }[];
  declare wordCount: number;
  declare version: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    Article.init(
      {
        id: idColumn,
        organizationId: orgId,
        siteId: { type: DataTypes.CHAR(36), allowNull: false },
        contentItemId: { type: DataTypes.CHAR(36), allowNull: false, unique: true },
        language: { type: DataTypes.STRING(10), allowNull: false },
        title: { type: DataTypes.STRING(255), allowNull: false },
        slug: { type: DataTypes.STRING(200), allowNull: false },
        metaTitle: { type: DataTypes.STRING(255), allowNull: false },
        metaDescription: { type: DataTypes.STRING(400), allowNull: false },
        html: { type: DataTypes.TEXT('medium'), allowNull: false },
        outline: { type: DataTypes.JSON, allowNull: true },
        faq: { type: DataTypes.JSON, allowNull: false },
        schemaJson: { type: DataTypes.JSON, allowNull: false },
        seoScore: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
        seoChecks: { type: DataTypes.JSON, allowNull: false },
        verification: { type: DataTypes.JSON, allowNull: false },
        sources: { type: DataTypes.JSON, allowNull: false },
        wordCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
        ...ts,
      },
      { sequelize, tableName: 'articles', underscored: true },
    );
    applyTenantGuard(Article, ['organizationId']);
  }
}

export class ArticleImage extends Model<InferAttributes<ArticleImage>, InferCreationAttributes<ArticleImage>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare articleId: string;
  declare kind: 'cover' | 'infographic';
  /** `site`: sitedeki bir sayfanın görseli (görsel modeli yoksa), `user`: kullanıcı yükledi */
  declare source: 'ai' | 'generated' | 'site' | 'user';
  declare prompt: string | null;
  declare mimeType: string;
  declare data: Buffer;
  declare width: number;
  declare height: number;
  declare fileName: string;
  declare altText: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    ArticleImage.init(
      {
        id: idColumn,
        organizationId: orgId,
        articleId: { type: DataTypes.CHAR(36), allowNull: false },
        kind: { type: DataTypes.ENUM('cover', 'infographic'), allowNull: false },
        source: { type: DataTypes.ENUM('ai', 'generated', 'site', 'user'), allowNull: false },
        prompt: { type: DataTypes.TEXT, allowNull: true },
        mimeType: { type: DataTypes.STRING(40), allowNull: false },
        data: { type: DataTypes.BLOB('medium'), allowNull: false },
        width: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        height: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        fileName: { type: DataTypes.STRING(200), allowNull: false },
        altText: { type: DataTypes.STRING(300), allowNull: false },
        ...ts,
      },
      { sequelize, tableName: 'article_images', underscored: true },
    );
    applyTenantGuard(ArticleImage, ['organizationId']);
  }
}

export const CREDENTIAL_KINDS = ['wordpress', 'webhook', 'ghost', 'shopify', 'webflow', 'wix'] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export class SiteCredential extends Model<InferAttributes<SiteCredential>, InferCreationAttributes<SiteCredential>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare siteId: string;
  declare kind: CredentialKind;
  declare ciphertext: Buffer;
  declare iv: Buffer;
  declare authTag: Buffer;
  declare keyVersion: number;
  declare display: Record<string, string>;
  declare lastVerifiedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    SiteCredential.init(
      {
        id: idColumn,
        organizationId: orgId,
        siteId: { type: DataTypes.CHAR(36), allowNull: false },
        kind: { type: DataTypes.STRING(20), allowNull: false },
        ciphertext: { type: DataTypes.BLOB, allowNull: false },
        iv: { type: DataTypes.BLOB('tiny'), allowNull: false },
        authTag: { type: DataTypes.BLOB('tiny'), allowNull: false },
        keyVersion: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
        display: { type: DataTypes.JSON, allowNull: false },
        lastVerifiedAt: { type: DataTypes.DATE, allowNull: true },
        ...ts,
      },
      { sequelize, tableName: 'site_credentials', underscored: true },
    );
    applyTenantGuard(SiteCredential, ['organizationId']);
  }
}

export class Publication extends Model<InferAttributes<Publication>, InferCreationAttributes<Publication>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare siteId: string;
  declare articleId: string;
  declare provider: string;
  declare status: CreationOptional<'pending' | 'published' | 'failed'>;
  declare remoteId: string | null;
  declare remoteUrl: string | null;
  declare error: string | null;
  declare attempts: CreationOptional<number>;
  declare publishedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    Publication.init(
      {
        id: idColumn,
        organizationId: orgId,
        siteId: { type: DataTypes.CHAR(36), allowNull: false },
        articleId: { type: DataTypes.CHAR(36), allowNull: false },
        provider: { type: DataTypes.STRING(20), allowNull: false },
        status: { type: DataTypes.ENUM('pending', 'published', 'failed'), allowNull: false, defaultValue: 'pending' },
        remoteId: { type: DataTypes.STRING(100), allowNull: true },
        remoteUrl: { type: DataTypes.STRING(2048), allowNull: true },
        error: { type: DataTypes.STRING(60), allowNull: true },
        attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        publishedAt: { type: DataTypes.DATE, allowNull: true },
        ...ts,
      },
      { sequelize, tableName: 'publications', underscored: true },
    );
    applyTenantGuard(Publication, ['organizationId']);
  }
}

export type ArticleVersionSource = 'ai' | 'user' | 'restore';

/** Makalenin her kaydedilen hali (üretim, editör, geri dönüş). */
export class ArticleVersion extends Model<InferAttributes<ArticleVersion>, InferCreationAttributes<ArticleVersion>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare articleId: string;
  declare version: number;
  declare source: ArticleVersionSource;
  declare userId: string | null;
  declare title: string;
  declare slug: string;
  declare metaTitle: string;
  declare metaDescription: string;
  declare html: string;
  declare faq: ArticleFaq[];
  declare seoScore: number;
  declare wordCount: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare user?: NonAttribute<User | null>;

  static initModel(sequelize: Sequelize): void {
    ArticleVersion.init(
      {
        id: idColumn,
        organizationId: orgId,
        articleId: { type: DataTypes.CHAR(36), allowNull: false },
        version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        source: { type: DataTypes.ENUM('ai', 'user', 'restore'), allowNull: false },
        userId: { type: DataTypes.CHAR(36), allowNull: true },
        title: { type: DataTypes.STRING(255), allowNull: false },
        slug: { type: DataTypes.STRING(200), allowNull: false },
        metaTitle: { type: DataTypes.STRING(255), allowNull: false },
        metaDescription: { type: DataTypes.STRING(400), allowNull: false },
        html: { type: DataTypes.TEXT('medium'), allowNull: false },
        faq: { type: DataTypes.JSON, allowNull: false },
        seoScore: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
        wordCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        ...ts,
      },
      { sequelize, tableName: 'article_versions', underscored: true },
    );
    applyTenantGuard(ArticleVersion, ['organizationId']);
  }
}

export type RewriteStatus = 'pending' | 'done' | 'failed';

/** Editörde seçilen bölümün yapay zekâyla yeniden yazımı (worker `assist` kuyruğu). */
export class ArticleRewrite extends Model<InferAttributes<ArticleRewrite>, InferCreationAttributes<ArticleRewrite>> {
  declare id: CreationOptional<string>;
  declare organizationId: string;
  declare articleId: string;
  declare userId: string | null;
  declare status: CreationOptional<RewriteStatus>;
  declare instruction: string;
  declare customInstruction: string | null;
  declare inputHtml: string;
  declare outputHtml: string | null;
  declare error: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): void {
    ArticleRewrite.init(
      {
        id: idColumn,
        organizationId: orgId,
        articleId: { type: DataTypes.CHAR(36), allowNull: false },
        userId: { type: DataTypes.CHAR(36), allowNull: true },
        status: { type: DataTypes.ENUM('pending', 'done', 'failed'), allowNull: false, defaultValue: 'pending' },
        instruction: { type: DataTypes.STRING(40), allowNull: false },
        customInstruction: { type: DataTypes.STRING(500), allowNull: true },
        inputHtml: { type: DataTypes.TEXT('medium'), allowNull: false },
        outputHtml: { type: DataTypes.TEXT('medium'), allowNull: true },
        error: { type: DataTypes.STRING(40), allowNull: true },
        ...ts,
      },
      { sequelize, tableName: 'article_rewrites', underscored: true },
    );
    applyTenantGuard(ArticleRewrite, ['organizationId']);
  }
}
