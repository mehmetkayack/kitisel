import type { Env } from '@upvine/config/env';
import type { Sequelize } from 'sequelize';
import { createSequelize } from './connection';
import type { DbOptions } from './connection';
import { initModels } from './models';

export { createSequelize } from './connection';
export { createMigrator } from './migrator';
export { ensureDatabase } from './database';
export { newId } from './ids';
export * from './models';
export { applyTenantGuard, TenantGuardError, withoutTenantGuard } from './tenant-guard';
export { usersRepository } from './repositories/users';
export {
  emailVerificationsRepository,
  passwordResetsRepository,
  refreshTokensRepository,
} from './repositories/tokens';
export { membershipsRepository, organizationsRepository } from './repositories/organizations';
export { auditLogsRepository } from './repositories/audit-logs';
export { adminRepository } from './repositories/admin';
export {
  aiUsageRepository,
  brandProfilesRepository,
  contentItemsRepository,
  existingPagesRepository,
  normalizeTerm,
  sitesNeedingTopics,
  siteAuditsRepository,
  sitesRepository,
} from './repositories/sites';
export type { BrandProfileData, CmsPostInput, ExistingPageInput, TopicInput } from './repositories/sites';
export {
  articleRewritesRepository,
  articlesRepository,
  articleVersionsRepository,
  contentWorkflowRepository,
  MAX_ARTICLE_VERSIONS,
  credentialsRepository,
  freeAnalysesRepository,
  publicationsRepository,
} from './repositories/content';
export type { ArticleData, ImageData } from './repositories/content';
export type { AuditEntry } from './repositories/audit-logs';
export { refreshesRepository } from './repositories/refreshes';
export { blogPostsRepository, contactMessagesRepository, testimonialsRepository } from './repositories/marketing';
export { billingOrdersRepository, billingOrgRepository } from './repositories/billing';
export type { BillingOrderData, BillingOrderPatch, BillingProfilePatch } from './repositories/billing';
export { salesLeadEventsRepository, salesLeadsRepository, salesMatchRepository, salesPostsRepository } from './repositories/sales';
export type { SalesLeadData, SalesLeadFilter, SalesLeadPatch, SalesLeadSort } from './repositories/sales';
export type { BlogPostData, TestimonialData, TestimonialPatch } from './repositories/marketing';
export { contentStatsRepository, gscConnectionsRepository, gscMetricsRepository, visibilityRepository } from './repositories/results';
export type { GscAggregate, GscRowInput } from './repositories/results';
export { cleanTitle, cosine, fromBlob, mysqlVectorStore, pageEmbeddingText, siteTitleSuffixes, toBlob } from './vector-store';
export type { VectorEntry, VectorStore } from './vector-store';
export { UniqueConstraintError } from 'sequelize';
export type { Transaction } from 'sequelize';

/** Bağlantıyı kurar ve modelleri başlatır. Uygulama başına bir kez çağrılır. */
export function connectDb(env: Env, opts: DbOptions = {}): Sequelize {
  const sequelize = createSequelize(env, opts);
  initModels(sequelize);
  return sequelize;
}
