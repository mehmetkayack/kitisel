import type { Sequelize } from 'sequelize';
import { AuditLog } from './audit-log';
import { EmailVerification, PasswordReset, RefreshToken } from './auth-tokens';
import { Membership, Organization } from './organization';
import { User } from './user';
import { AiUsageLog, BrandProfile, ContentItem, ExistingPage, Keyword, Site, SiteAudit } from './site';
import { Article, ArticleImage, ArticleRewrite, ArticleVersion, FreeAnalysis, Publication, SiteCredential } from './content';
import { AiVisibilityCheck, AiVisibilityPrompt, GscConnection, GscDailyMetric } from './results';
import { ContentRefresh } from './refresh';
import { BlogPost, ContactMessage } from './marketing';

export { AuditLog, EmailVerification, Membership, Organization, PasswordReset, RefreshToken, User };
export { AiUsageLog, BrandProfile, ContentItem, ExistingPage, Keyword, Site, SiteAudit };
export { Article, ArticleImage, ArticleRewrite, ArticleVersion, FreeAnalysis, Publication, SiteCredential };
export { AiVisibilityCheck, AiVisibilityPrompt, GscConnection, GscDailyMetric };
export type { SyncStatus } from './results';
export { ContentRefresh };
export { BlogPost, ContactMessage };
export type { BlogPostStatus, ContactMessageStatus } from './marketing';
export type { RefreshChange, RefreshOriginal, RefreshStatus, RefreshSuggestion } from './refresh';
export { CREDENTIAL_KINDS } from './content';
export type { ArticleFaq, ArticleVersionSource, CredentialKind, FreeAnalysisStatus, RewriteStatus } from './content';
export type {
  AnalysisStatus,
  CmsType,
  ConnectionStatus,
  ContentItemStatus,
  KeywordIntent,
  KeywordSource,
  PublishMode,
  ExistingPageSource,
  PageIssue,
  PostsSyncStatus,
  ToneValue,
  TopicsStatus,
} from './site';
export { CMS_TYPES, CONTENT_ITEM_STATUSES, TONE_VALUES } from './site';
export type { ThemePreference } from './user';
export type { PlanStatus, Role } from './organization';
export { ROLES } from './organization';

let initialized = false;

/** Tüm modelleri bir Sequelize örneğine bağlar ve ilişkileri kurar. */
export function initModels(sequelize: Sequelize): void {
  if (initialized) return;
  User.initModel(sequelize);
  RefreshToken.initModel(sequelize);
  EmailVerification.initModel(sequelize);
  PasswordReset.initModel(sequelize);
  Organization.initModel(sequelize);
  Membership.initModel(sequelize);
  AuditLog.initModel(sequelize);
  Site.initModel(sequelize);
  BrandProfile.initModel(sequelize);
  SiteAudit.initModel(sequelize);
  ExistingPage.initModel(sequelize);
  Keyword.initModel(sequelize);
  ContentItem.initModel(sequelize);
  AiUsageLog.initModel(sequelize);
  FreeAnalysis.initModel(sequelize);
  Article.initModel(sequelize);
  ArticleImage.initModel(sequelize);
  SiteCredential.initModel(sequelize);
  Publication.initModel(sequelize);
  ArticleVersion.initModel(sequelize);
  ArticleRewrite.initModel(sequelize);
  GscConnection.initModel(sequelize);
  GscDailyMetric.initModel(sequelize);
  AiVisibilityPrompt.initModel(sequelize);
  AiVisibilityCheck.initModel(sequelize);
  ContentRefresh.initModel(sequelize);
  ContactMessage.initModel(sequelize);
  BlogPost.initModel(sequelize);

  Membership.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });
  Membership.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  ContentItem.belongsTo(Keyword, { foreignKey: 'keywordId', as: 'keyword' });
  ContentItem.hasOne(Article, { foreignKey: 'contentItemId', as: 'article' });
  ArticleVersion.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  ContentItem.belongsTo(Site, { foreignKey: 'siteId', as: 'site' });
  initialized = true;
}
