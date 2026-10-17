import type { Transaction } from 'sequelize';
import { Op } from 'sequelize';
import { Article, ArticleImage, ArticleRewrite, ArticleVersion, ContentItem, FreeAnalysis, Keyword, Publication, Site, SiteCredential, User } from '../models';
import type { ArticleVersionSource, ContentItemStatus, CredentialKind, FreeAnalysisStatus } from '../models';
import { withoutTenantGuard } from '../tenant-guard';

// --- Ücretsiz analiz (kiracı yok; erişim paylaşım token'ıyla) -------------------------------

export const freeAnalysesRepository = {
  create(data: { shareToken: string; url: string; domain: string; locale: string; ipHash: string }, t?: Transaction) {
    return FreeAnalysis.create(
      { ...data, phase: 'queued', error: null, result: null, email: null, emailSentAt: null },
      { transaction: t },
    );
  },

  findByToken(token: string, t?: Transaction) {
    return FreeAnalysis.findOne({ where: { shareToken: token }, transaction: t });
  },

  findById(id: string, t?: Transaction) {
    return FreeAnalysis.findByPk(id, { transaction: t });
  },

  /** 24 saat önbellek: aynı alan adı için tamamlanmış ya da süren analiz. */
  recentForDomain(domain: string, since: Date, t?: Transaction) {
    return FreeAnalysis.findOne({
      where: { domain, createdAt: { [Op.gte]: since }, status: { [Op.in]: ['pending', 'running', 'done'] } },
      order: [['createdAt', 'DESC']],
      transaction: t,
    });
  },

  async update(
    id: string,
    patch: Partial<{ status: FreeAnalysisStatus; phase: string | null; error: string | null; result: unknown; email: string | null; marketingConsent: boolean; emailSentAt: Date | null }>,
    t?: Transaction,
  ): Promise<void> {
    await FreeAnalysis.update(patch, { where: { id }, transaction: t });
  },
};

// --- Makaleler ----------------------------------------------------------------------------

export interface ArticleData {
  siteId: string;
  contentItemId: string;
  language: string;
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  html: string;
  outline: unknown;
  faq: { question: string; answer: string }[];
  schemaJson: unknown;
  seoScore: number;
  seoChecks: unknown[];
  verification: unknown;
  sources: { url: string; title: string }[];
  wordCount: number;
}

export interface ImageData {
  kind: 'cover' | 'infographic';
  source: 'ai' | 'generated' | 'site' | 'user';
  prompt: string | null;
  mimeType: string;
  data: Buffer;
  width: number;
  height: number;
  fileName: string;
  altText: string;
}

export const articlesRepository = {
  findForItem(orgId: string, contentItemId: string, t?: Transaction) {
    return Article.findOne({ where: { organizationId: orgId, contentItemId }, transaction: t });
  },

  findById(orgId: string, articleId: string, t?: Transaction) {
    return Article.findOne({ where: { organizationId: orgId, id: articleId }, transaction: t });
  },

  /** Yeniden üretimde aynı kayıt güncellenir, sürüm artar. Her hali sürüm geçmişine yazılır. */
  async saveForItem(orgId: string, data: ArticleData, t?: Transaction): Promise<Article> {
    const existing = await Article.findOne({ where: { organizationId: orgId, contentItemId: data.contentItemId }, transaction: t });
    const article = existing
      ? await existing.update({ ...data, version: existing.version + 1 }, { transaction: t })
      : await Article.create({ organizationId: orgId, ...data }, { transaction: t });
    await articleVersionsRepository.record(orgId, article, 'ai', null, t);
    return article;
  },

  async update(orgId: string, articleId: string, patch: Partial<ArticleData>, t?: Transaction): Promise<void> {
    await Article.update(patch, { where: { organizationId: orgId, id: articleId }, transaction: t });
  },

  /**
   * Editörde kaydetme / eski sürüme dönüş: `baseVersion` güncel değilse (başka sekmede kaydedilmiş)
   * null döner. Sürüm artar ve geçmişe yazılır.
   */
  async saveEdit(
    orgId: string,
    articleId: string,
    baseVersion: number,
    patch: Partial<ArticleData>,
    source: Exclude<ArticleVersionSource, 'ai'>,
    userId: string,
    t?: Transaction,
  ): Promise<Article | null> {
    const [count] = await Article.update(
      { ...patch, version: baseVersion + 1 },
      { where: { organizationId: orgId, id: articleId, version: baseVersion }, transaction: t },
    );
    if (count === 0) return null;
    const article = await Article.findOne({ where: { organizationId: orgId, id: articleId }, transaction: t });
    if (!article) return null;
    await articleVersionsRepository.record(orgId, article, source, userId, t);
    return article;
  },

  async replaceImage(orgId: string, articleId: string, image: ImageData, t?: Transaction): Promise<ArticleImage> {
    await ArticleImage.destroy({ where: { organizationId: orgId, articleId, kind: image.kind }, transaction: t });
    return ArticleImage.create({ organizationId: orgId, articleId, ...image }, { transaction: t });
  },

  async removeImage(orgId: string, articleId: string, kind: 'cover' | 'infographic', t?: Transaction): Promise<void> {
    await ArticleImage.destroy({ where: { organizationId: orgId, articleId, kind }, transaction: t });
  },

  images(orgId: string, articleId: string, t?: Transaction) {
    return ArticleImage.findAll({ where: { organizationId: orgId, articleId }, order: [['kind', 'ASC']], transaction: t });
  },

  /** Ay başından beri üretilen makale sayısı (kota). Yeniden üretim yeni makale sayılmaz. */
  countSince(orgId: string, since: Date, t?: Transaction) {
    return Article.count({ where: { organizationId: orgId, createdAt: { [Op.gte]: since } }, transaction: t });
  },
};

// --- İçerik durumu ---------------------------------------------------------------------------

export const contentWorkflowRepository = {
  /** Başarılı yeniden üretimden sonra sayaç (atomik artırma). */
  async incrementRegenerations(orgId: string, itemId: string, t?: Transaction): Promise<void> {
    await ContentItem.increment('regenerationCount', { by: 1, where: { organizationId: orgId, id: itemId }, transaction: t });
  },

  findItem(orgId: string, itemId: string, t?: Transaction) {
    return ContentItem.findOne({
      where: { organizationId: orgId, id: itemId },
      include: [
        { model: Keyword, as: 'keyword', required: false },
        { model: Article, as: 'article', required: false },
      ],
      transaction: t,
    });
  },

  async updateItem(
    orgId: string,
    itemId: string,
    patch: Partial<{ status: ContentItemStatus; progressStep: string | null; errorMessage: string | null; plannedAt: Date | null; rejectReason: string | null; title: string; duplicateOfUrl: string | null }>,
    t?: Transaction,
  ): Promise<void> {
    await ContentItem.update(patch, { where: { organizationId: orgId, id: itemId }, transaction: t });
  },

  /** Kurulumdan sonra hemen yazılacak ilk konular. */
  firstPlanned(orgId: string, siteId: string, limit: number, t?: Transaction) {
    return ContentItem.findAll({
      where: { organizationId: orgId, siteId, status: 'planned' },
      order: [
        ['plannedAt', 'ASC'],
        ['position', 'ASC'],
      ],
      limit,
      transaction: t,
    });
  },

  /** Zamanlayıcı (tüm kiracılar): yayın zamanı gelmiş, onaylanmış içerikler. */
  dueForPublish(now: Date, limit = 50) {
    return withoutTenantGuard(() =>
      ContentItem.findAll({
        where: { status: 'scheduled', plannedAt: { [Op.lte]: now } },
        attributes: ['id', 'organizationId', 'siteId'],
        order: [['plannedAt', 'ASC']],
        limit,
      }),
    );
  },

  /** Zamanlayıcı (tüm kiracılar): yayın tarihine `before`'dan az kalmış, henüz yazılmamış konular. */
  dueForGenerate(before: Date, limit = 20) {
    return withoutTenantGuard(() =>
      ContentItem.findAll({
        where: { status: 'planned', plannedAt: { [Op.lte]: before } },
        attributes: ['id', 'organizationId', 'siteId'],
        include: [{ model: Site, as: 'site', required: true, attributes: ['id'], where: { onboardingCompletedAt: { [Op.ne]: null } } }],
        order: [['plannedAt', 'ASC']],
        limit,
      }),
    );
  },
};

// --- Site bağlantıları (şifreli) ---------------------------------------------------------------

export const credentialsRepository = {
  findForSite(orgId: string, siteId: string, t?: Transaction) {
    return SiteCredential.findOne({ where: { organizationId: orgId, siteId }, transaction: t });
  },

  async save(
    orgId: string,
    siteId: string,
    data: { kind: CredentialKind; ciphertext: Buffer; iv: Buffer; authTag: Buffer; keyVersion: number; display: Record<string, string> },
    t?: Transaction,
  ): Promise<SiteCredential> {
    await SiteCredential.destroy({ where: { organizationId: orgId, siteId }, transaction: t });
    return SiteCredential.create({ organizationId: orgId, siteId, ...data, lastVerifiedAt: new Date() }, { transaction: t });
  },

  async markVerified(orgId: string, siteId: string, t?: Transaction): Promise<void> {
    await SiteCredential.update({ lastVerifiedAt: new Date() }, { where: { organizationId: orgId, siteId }, transaction: t });
  },

  async remove(orgId: string, siteId: string, t?: Transaction): Promise<number> {
    return SiteCredential.destroy({ where: { organizationId: orgId, siteId }, transaction: t });
  },
};

export const publicationsRepository = {
  create(orgId: string, data: { siteId: string; articleId: string; provider: string }, t?: Transaction) {
    return Publication.create(
      { organizationId: orgId, ...data, remoteId: null, remoteUrl: null, error: null, publishedAt: null },
      { transaction: t },
    );
  },

  async update(
    orgId: string,
    id: string,
    patch: Partial<{ status: 'pending' | 'published' | 'failed'; remoteId: string | null; remoteUrl: string | null; error: string | null; attempts: number; publishedAt: Date | null }>,
    t?: Transaction,
  ): Promise<void> {
    await Publication.update(patch, { where: { organizationId: orgId, id }, transaction: t });
  },

  latestForArticle(orgId: string, articleId: string, t?: Transaction) {
    return Publication.findOne({ where: { organizationId: orgId, articleId }, order: [['createdAt', 'DESC']], transaction: t });
  },
};

// --- Sürüm geçmişi ve bölüm yeniden yazımı -----------------------------------------------------

/** Makale başına en fazla bu kadar sürüm tutulur (en eskiler silinir). */
export const MAX_ARTICLE_VERSIONS = 50;

export const articleVersionsRepository = {
  async record(orgId: string, article: Article, source: ArticleVersionSource, userId: string | null, t?: Transaction): Promise<void> {
    await ArticleVersion.destroy({ where: { organizationId: orgId, articleId: article.id, version: article.version }, transaction: t });
    await ArticleVersion.create(
      {
        organizationId: orgId,
        articleId: article.id,
        version: article.version,
        source,
        userId,
        title: article.title,
        slug: article.slug,
        metaTitle: article.metaTitle,
        metaDescription: article.metaDescription,
        html: article.html,
        faq: article.faq,
        seoScore: article.seoScore,
        wordCount: article.wordCount,
      },
      { transaction: t },
    );
    const old = await ArticleVersion.findAll({
      where: { organizationId: orgId, articleId: article.id },
      attributes: ['id'],
      order: [['version', 'DESC']],
      offset: MAX_ARTICLE_VERSIONS,
      limit: 1000,
      transaction: t,
    });
    if (old.length) await ArticleVersion.destroy({ where: { organizationId: orgId, id: { [Op.in]: old.map((v) => v.id) } }, transaction: t });
  },

  /** Liste: HTML olmadan (hafif). */
  list(orgId: string, articleId: string, t?: Transaction) {
    return ArticleVersion.findAll({
      where: { organizationId: orgId, articleId },
      attributes: ['id', 'version', 'source', 'userId', 'title', 'seoScore', 'wordCount', 'createdAt'],
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'], required: false }],
      order: [['version', 'DESC']],
      transaction: t,
    });
  },

  find(orgId: string, articleId: string, versionId: string, t?: Transaction) {
    return ArticleVersion.findOne({ where: { organizationId: orgId, articleId, id: versionId }, transaction: t });
  },
};

export const articleRewritesRepository = {
  create(orgId: string, data: { articleId: string; userId: string; instruction: string; customInstruction: string | null; inputHtml: string }, t?: Transaction) {
    return ArticleRewrite.create({ organizationId: orgId, ...data, outputHtml: null, error: null }, { transaction: t });
  },

  find(orgId: string, id: string, t?: Transaction) {
    return ArticleRewrite.findOne({ where: { organizationId: orgId, id }, transaction: t });
  },

  async update(orgId: string, id: string, patch: Partial<{ status: 'pending' | 'done' | 'failed'; outputHtml: string | null; error: string | null }>, t?: Transaction): Promise<void> {
    await ArticleRewrite.update(patch, { where: { organizationId: orgId, id }, transaction: t });
  },

  /** Bir yazı için istenen bölüm yeniden yazımı sayısı (yazı başına sınır). */
  countForArticle(orgId: string, articleId: string, t?: Transaction) {
    return ArticleRewrite.count({ where: { organizationId: orgId, articleId }, transaction: t });
  },

  /** Son bir saatteki istek sayısı (kötüye kullanım sınırı). */
  countRecent(orgId: string, since: Date, t?: Transaction) {
    return ArticleRewrite.count({ where: { organizationId: orgId, createdAt: { [Op.gte]: since } }, transaction: t });
  },
};
