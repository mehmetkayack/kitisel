import { createHmac } from 'node:crypto';
import sharp from 'sharp';
import type { OutputInfo } from 'sharp';
import { strToU8, zipSync } from 'fflate';
import { orgArticleLimit, quotaPeriodStart, REGENERATIONS_PER_ARTICLE, SECTION_REWRITES_PER_ARTICLE } from '@upvine/config';
import type { Env } from '@upvine/config/env';
import {
  articleRewritesRepository,
  articlesRepository,
  articleVersionsRepository,
  auditLogsRepository,
  brandProfilesRepository,
  contentItemsRepository,
  contentWorkflowRepository,
  credentialsRepository,
  existingPagesRepository,
  membershipsRepository,
  organizationsRepository,
  publicationsRepository,
  sitesRepository,
} from '@upvine/db';
import type { Article, ArticleData, ArticleImage, ArticleRewrite, ArticleVersion, ContentItem, Role } from '@upvine/db';
import { authorizeUrl, createPublisher, CredentialKeyError, decryptJson, encryptJson, normalizeShopDomain, PublishError, WebflowPublisher, WebhookPublisher, WordPressPublisher } from '@upvine/publishers';
import type { Publisher, StoredCredentials } from '@upvine/publishers';
import {
  addTableOfContents,
  buildArticleSchema,
  countWords,
  extractFaq,
  pickInternalLinks,
  sanitizeArticleHtml,
  scoreArticle,
  stripTableOfContents,
  tocLabelOf,
  toMarkdown,
} from '@upvine/seo';
import type { HttpClient } from '@upvine/seo';
import type {
  ArticleCheckDto,
  ArticleDto,
  ArticleVersionDetailDto,
  ArticleVersionDto,
  ConnectionDto,
  ContentDetailDto,
  ContentUsageDto,
  GenerationStep,
  PublicationDto,
  RejectInput,
  RescheduleInput,
  RestoreVersionInput,
  RewriteDto,
  RewriteSectionInput,
  TopicDto,
  UpdateArticleInput,
  VerificationReport,
  GhostConnectInput,
  ShopifyConnectInput,
  WebflowConnectInput,
  WebflowSiteDto,
  WebhookConnectInput,
  WixConnectInput,
  WordpressConnectInput,
} from '@upvine/shared';
import { canSyncPosts, COVER_UPLOAD, MOVABLE_STATUSES, moveToDate, normalizeSiteUrl, SITE_JOBS } from '@upvine/shared';
import { randomToken, safeEqual } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import type { JobQueue } from '../../lib/jobs';
import { aiAvailable, STALE_JOB_MS } from '../sites/sites.service';
import type { SiteContext } from '../sites/sites.service';

export interface ContentDeps {
  env: Env;
  jobs: JobQueue;
  http: HttpClient;
}

const EDIT_ROLES: Role[] = ['owner', 'admin', 'editor'];
const MANAGE_ROLES: Role[] = ['owner', 'admin'];

function requireRole(ctx: SiteContext, roles: Role[]): void {
  if (!roles.includes(ctx.role)) throw new AppError('forbidden');
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Yazımı süren ama işi kaybolmuş içerik "sorun var" görünür ve yeniden yazdırılabilir. */
function staleGenerating(item: ContentItem): boolean {
  return item.status === 'generating' && Date.now() - item.updatedAt.getTime() > STALE_JOB_MS;
}

function renderHtmlFile(article: Article, body: string, cover: { src: string; alt: string; width: number; height: number } | null): string {
  const schema = Array.isArray(article.schemaJson) ? article.schemaJson : [];
  return `<!doctype html>
<html lang="${escapeHtml(article.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(article.metaTitle)}</title>
<meta name="description" content="${escapeHtml(article.metaDescription)}">
${schema.map((s) => `<script type="application/ld+json">${JSON.stringify(s).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
<article>
<h1>${escapeHtml(article.title)}</h1>
${cover ? `<img src="${escapeHtml(cover.src)}" alt="${escapeHtml(cover.alt)}" width="${cover.width}" height="${cover.height}">` : ''}
${body}
</article>
</body>
</html>
`;
}

function renderMarkdownFile(article: Article, body: string, cover: { src: string; alt: string } | null): string {
  const front = ['---', `title: ${JSON.stringify(article.title)}`, `slug: ${article.slug}`, `meta_title: ${JSON.stringify(article.metaTitle)}`, `description: ${JSON.stringify(article.metaDescription)}`, `lang: ${article.language}`, '---', ''].join('\n');
  const img = cover ? `![${cover.alt}](${cover.src})\n\n` : '';
  return `${front}# ${article.title}\n\n${img}${toMarkdown(body)}\n`;
}

function toTopic(item: ContentItem): TopicDto {
  return {
    id: item.id,
    siteId: item.siteId,
    title: item.title,
    keyword: item.keyword?.term ?? null,
    intent: item.keyword?.intent ?? null,
    searchVolume: item.keyword?.searchVolume ?? null,
    difficulty: item.keyword?.difficulty ?? null,
    source: item.keyword?.source ?? null,
    status: staleGenerating(item) ? 'failed' : item.status,
    plannedAt: item.plannedAt?.toISOString() ?? null,
  };
}

async function articleDto(orgId: string, article: Article): Promise<ArticleDto> {
  const images = await articlesRepository.images(orgId, article.id);
  const cover = images.find((i) => i.kind === 'cover');
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    metaTitle: article.metaTitle,
    metaDescription: article.metaDescription,
    html: article.html,
    faq: article.faq,
    seoScore: article.seoScore,
    seoChecks: article.seoChecks as ArticleCheckDto[],
    verification: article.verification as VerificationReport,
    sources: article.sources,
    wordCount: article.wordCount,
    version: article.version,
    cover: cover ? { dataUrl: `data:${cover.mimeType};base64,${cover.data.toString('base64')}`, alt: cover.altText, source: cover.source } : null,
    updatedAt: article.updatedAt.toISOString(),
  };
}

/** Editörde düzenlenebilen durumlar (yayınlanan yazı CMS'te düzenlenir). */
const EDITABLE: ContentItem['status'][] = ['review', 'scheduled', 'failed', 'rejected'];
/** Organizasyon başına saatte en fazla bu kadar bölüm yeniden yazımı */
const REWRITES_PER_HOUR = 60;

function versionDto(v: ArticleVersion, currentVersion: number): ArticleVersionDto {
  return {
    id: v.id,
    version: v.version,
    source: v.source,
    authorName: v.user?.name ?? null,
    title: v.title,
    seoScore: v.seoScore,
    wordCount: v.wordCount,
    createdAt: v.createdAt.toISOString(),
    current: v.version === currentVersion,
  };
}

function rewriteDto(r: ArticleRewrite): RewriteDto {
  // Kaybolmuş iş (worker kapalıyken) sonsuza kadar "bekliyor" görünmesin.
  const stale = r.status === 'pending' && Date.now() - r.createdAt.getTime() > STALE_JOB_MS;
  return { id: r.id, status: stale ? 'failed' : r.status, html: r.status === 'done' ? r.outputHtml : null, error: stale ? 'internal' : r.error };
}

export function createContentService(deps: ContentDeps) {
  const { env, jobs, http } = deps;
  const keys = () => ({ [env.ENCRYPTION_KEY_VERSION]: env.ENCRYPTION_KEY });

  async function loadItem(ctx: SiteContext, itemId: string): Promise<ContentItem> {
    const item = await contentWorkflowRepository.findItem(ctx.orgId, itemId);
    if (!item) throw new AppError('not_found');
    return item;
  }

  async function usage(ctx: SiteContext): Promise<ContentUsageDto> {
    const org = await organizationsRepository.findById(ctx.orgId);
    return {
      used: await articlesRepository.countSince(ctx.orgId, quotaPeriodStart()),
      limit: orgArticleLimit(org, env.ARTICLE_QUOTA_OVERRIDE),
    };
  }

  async function audit(ctx: SiteContext, action: string, targetId: string, metadata?: Record<string, unknown>) {
    await auditLogsRepository.record({ action, userId: ctx.userId, orgId: ctx.orgId, targetType: 'content', targetId, metadata: metadata ?? null, ip: ctx.ip, userAgent: ctx.userAgent });
  }

  async function storedCredentials(ctx: SiteContext, siteId: string): Promise<StoredCredentials | null> {
    const rec = await credentialsRepository.findForSite(ctx.orgId, siteId);
    if (!rec) return null;
    try {
      return decryptJson<StoredCredentials>({ ciphertext: rec.ciphertext, iv: rec.iv, authTag: rec.authTag, keyVersion: rec.keyVersion }, keys());
    } catch (err) {
      if (err instanceof CredentialKeyError) throw new AppError('encryption_not_configured');
      throw err;
    }
  }

  async function saveConnection(ctx: SiteContext, siteId: string, input: StoredCredentials, publisher: Publisher): Promise<ConnectionDto> {
    let display: Record<string, string>;
    let creds = input;
    try {
      const info = await publisher.testConnection();
      display = info.display;
      // Testte bulunan değerler (Shopify blog, Wix yazar) kimlik bilgileriyle saklanır.
      if (info.update) creds = { ...creds, ...info.update } as StoredCredentials;
    } catch (err) {
      if (err instanceof PublishError) throw new AppError('connection_failed', { reason: err.code });
      throw err;
    }
    let enc;
    try {
      enc = encryptJson(creds, env.ENCRYPTION_KEY, env.ENCRYPTION_KEY_VERSION);
    } catch (err) {
      if (err instanceof CredentialKeyError) throw new AppError('encryption_not_configured');
      throw err;
    }
    const rec = await credentialsRepository.save(ctx.orgId, siteId, { kind: creds.kind, ...enc, display });
    await sitesRepository.update(ctx.orgId, siteId, { cmsType: creds.kind, connectionStatus: 'connected' });
    await auditLogsRepository.record({ action: 'connection.created', userId: ctx.userId, orgId: ctx.orgId, targetType: 'site', targetId: siteId, metadata: { kind: creds.kind }, ip: ctx.ip, userAgent: ctx.userAgent });
    // Mevcut yazılar okunur (iç linkler, tekrar koruması, "Yazılarım"). Yazılara dokunulmaz.
    if (canSyncPosts(creds.kind)) {
      await sitesRepository.update(ctx.orgId, siteId, { postsSyncStatus: 'running', postsSyncError: null, postsSyncStartedAt: new Date() });
      await jobs.enqueueSiteJob(SITE_JOBS.syncPosts, { orgId: ctx.orgId, siteId });
    }
    // Bağlantı bekleyen onaylı yazılar zamanlayıcıyla yayınlanır.
    return { kind: rec.kind, display: rec.display, lastVerifiedAt: rec.lastVerifiedAt?.toISOString() ?? null };
  }

  /** WordPress tek tıkla yetkilendirme `state` değeri: imzalı, 30 dk geçerli. */
  function signState(payload: { orgId: string; siteId: string; userId: string }): string {
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 30 * 60_000 })).toString('base64url');
    return `${body}.${createHmac('sha256', env.JWT_ACCESS_SECRET).update(body).digest('base64url')}`;
  }

  function verifyState(state: string): { orgId: string; siteId: string; userId: string } | null {
    const [body, sig] = state.split('.');
    if (!body || !sig || !safeEqual(sig, createHmac('sha256', env.JWT_ACCESS_SECRET).update(body).digest('base64url'))) return null;
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { orgId: string; siteId: string; userId: string; exp: number };
    return data.exp > Date.now() ? data : null;
  }

  /**
   * Editörde kaydedilen gövdeden makalenin türetilmiş alanlarını yeniden üretir: temizleme,
   * içindekiler, SSS (FAQPage schema'sı için), JSON-LD ve SEO skoru. Hepsi sunucuda; tarayıcıya güvenilmez.
   */
  async function rebuild(
    ctx: SiteContext,
    item: ContentItem,
    article: Article,
    input: { title: string; metaTitle: string; metaDescription: string; slug: string; html: string; faq?: { question: string; answer: string }[] },
  ): Promise<Partial<ArticleData>> {
    const site = await sitesRepository.findById(ctx.orgId, item.siteId);
    if (!site) throw new AppError('not_found');
    const brand = await brandProfilesRepository.findForSite(ctx.orgId, site.id);
    const pages = await existingPagesRepository.list(ctx.orgId, site.id);
    const keyword = item.keyword?.term ?? item.title;
    const language = article.language;
    const candidates = pickInternalLinks(`${item.title} ${keyword}`, pages.map((p) => ({ url: p.url, title: p.title ?? p.h1 ?? '' })), 5, language).length;
    const label = tocLabelOf(article.html) ?? tocLabelOf(input.html) ?? 'Contents';
    const html = addTableOfContents(sanitizeArticleHtml(stripTableOfContents(input.html)), label);
    const faq = input.faq ?? extractFaq(html, article.faq);
    const cover = (await articlesRepository.images(ctx.orgId, article.id)).find((i) => i.kind === 'cover');
    const seo = scoreArticle({
      keyword,
      language,
      title: input.title,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      slug: input.slug,
      html,
      siteUrl: site.url,
      faqCount: faq.length,
      schemaTypes: ['Article', ...(faq.length ? ['FAQPage'] : [])],
      coverAlt: cover?.altText ?? null,
      internalLinkCandidates: candidates,
    });
    return {
      title: input.title,
      slug: input.slug,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      html,
      faq,
      schemaJson: buildArticleSchema({
        title: input.title,
        description: input.metaDescription,
        language,
        brandName: brand?.brandName ?? site.name,
        siteUrl: site.url,
        datePublished: (item.plannedAt ?? article.createdAt).toISOString(),
        faq,
      }),
      seoScore: seo.score,
      seoChecks: seo.checks,
      wordCount: countWords(html),
    };
  }

  async function editableArticle(ctx: SiteContext, itemId: string): Promise<{ item: ContentItem; article: Article }> {
    requireRole(ctx, EDIT_ROLES);
    const item = await loadItem(ctx, itemId);
    if (!item.article || !EDITABLE.includes(item.status) || staleGenerating(item)) throw new AppError('invalid_state');
    return { item, article: item.article };
  }

  async function loadArticle(ctx: SiteContext, itemId: string): Promise<Article> {
    const item = await loadItem(ctx, itemId);
    if (!item.article) throw new AppError('not_found');
    return item.article;
  }

  return {
    usage,

    /** Takvimde sürükle-bırak: başka güne taşı (sitenin saat diliminde, saat korunur). */
    async reschedule(ctx: SiteContext, itemId: string, input: RescheduleInput): Promise<TopicDto> {
      requireRole(ctx, EDIT_ROLES);
      const item = await loadItem(ctx, itemId);
      if (!(MOVABLE_STATUSES as readonly string[]).includes(item.status) || staleGenerating(item)) throw new AppError('invalid_state');
      const site = await sitesRepository.findById(ctx.orgId, item.siteId);
      if (!site) throw new AppError('not_found');
      const plannedAt = moveToDate({ date: input.date, current: item.plannedAt, publishTime: site.publishTime, timeZone: site.timezone });
      if (!plannedAt) throw new AppError('validation_failed', { fields: [{ path: 'date', message: 'validation.pastDate' }] });
      await contentWorkflowRepository.updateItem(ctx.orgId, item.id, { plannedAt });
      await audit(ctx, 'content.rescheduled', item.id, { from: item.plannedAt?.toISOString() ?? null, to: plannedAt.toISOString() });
      return toTopic(await loadItem(ctx, item.id));
    },

    // --- Editör ve sürüm geçmişi ----------------------------------------------------------------

    /** Editörde kaydet: türetilmiş alanlar yeniden hesaplanır, yeni sürüm geçmişe yazılır. */
    async updateArticle(ctx: SiteContext, itemId: string, input: UpdateArticleInput): Promise<ContentDetailDto> {
      const { item, article } = await editableArticle(ctx, itemId);
      if (article.version !== input.baseVersion) throw new AppError('version_conflict');
      const patch = await rebuild(ctx, item, article, input);
      const saved = await articlesRepository.saveEdit(ctx.orgId, article.id, input.baseVersion, patch, 'user', ctx.userId);
      if (!saved) throw new AppError('version_conflict');
      if (item.title !== input.title) await contentWorkflowRepository.updateItem(ctx.orgId, item.id, { title: input.title.slice(0, 255) });
      await audit(ctx, 'content.edited', item.id, { version: saved.version });
      return this.detail(ctx, item.id);
    },

    /**
     * Kapağı kullanıcının görseliyle değiştirir: oran korunur (kırpılmaz), en fazla 1600 px genişlik,
     * WebP. Yayınlanmamış yazılarda; yayında olan yazının kapağı CMS'te değiştirilmez.
     */
    async uploadCover(ctx: SiteContext, itemId: string, data: Buffer, alt: string): Promise<ContentDetailDto> {
      const { item, article } = await editableArticle(ctx, itemId);
      let out: { data: Buffer; info: OutputInfo };
      try {
        const meta = await sharp(data).metadata();
        // EXIF yönü: dikey çekilmiş fotoğrafta genişlik/yükseklik yer değiştirir.
        const [w, h] = (meta.orientation ?? 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
        if (!['jpeg', 'png', 'webp', 'heif'].includes(meta.format ?? '') || (w ?? 0) < COVER_UPLOAD.minWidth || (h ?? 0) < COVER_UPLOAD.minHeight) {
          throw new AppError('invalid_image');
        }
        out = await sharp(data).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError('invalid_image');
      }
      await articlesRepository.replaceImage(ctx.orgId, article.id, {
        kind: 'cover',
        source: 'user',
        prompt: null,
        mimeType: 'image/webp',
        data: out.data,
        width: out.info.width,
        height: out.info.height,
        fileName: `${article.slug}.webp`,
        altText: alt,
      });
      await audit(ctx, 'content.cover_uploaded', item.id, { width: out.info.width, height: out.info.height });
      return this.detail(ctx, item.id);
    },

    async versions(ctx: SiteContext, itemId: string): Promise<ArticleVersionDto[]> {
      const article = await loadArticle(ctx, itemId);
      return (await articleVersionsRepository.list(ctx.orgId, article.id)).map((v) => versionDto(v, article.version));
    },

    async version(ctx: SiteContext, itemId: string, versionId: string): Promise<ArticleVersionDetailDto> {
      const article = await loadArticle(ctx, itemId);
      const v = await articleVersionsRepository.find(ctx.orgId, article.id, versionId);
      if (!v) throw new AppError('not_found');
      return { ...versionDto(v, article.version), metaTitle: v.metaTitle, metaDescription: v.metaDescription, slug: v.slug, html: v.html };
    },

    /** Eski sürüme dön: o sürümün içeriği yeni bir sürüm olarak kaydedilir (geçmiş silinmez). */
    async restoreVersion(ctx: SiteContext, itemId: string, versionId: string, input: RestoreVersionInput): Promise<ContentDetailDto> {
      const { item, article } = await editableArticle(ctx, itemId);
      if (article.version !== input.baseVersion) throw new AppError('version_conflict');
      const v = await articleVersionsRepository.find(ctx.orgId, article.id, versionId);
      if (!v) throw new AppError('not_found');
      const patch = await rebuild(ctx, item, article, { title: v.title, metaTitle: v.metaTitle, metaDescription: v.metaDescription, slug: v.slug, html: v.html, faq: v.faq });
      const saved = await articlesRepository.saveEdit(ctx.orgId, article.id, input.baseVersion, patch, 'restore', ctx.userId);
      if (!saved) throw new AppError('version_conflict');
      await contentWorkflowRepository.updateItem(ctx.orgId, item.id, { title: v.title.slice(0, 255) });
      await audit(ctx, 'content.version_restored', item.id, { from: v.version, version: saved.version });
      return this.detail(ctx, item.id);
    },

    /** Seçilen bölümü yapay zekâya yeniden yazdır: worker `assist` kuyruğunda, istemci sonucu sorgular. */
    async requestRewrite(ctx: SiteContext, itemId: string, input: RewriteSectionInput): Promise<RewriteDto> {
      const { article } = await editableArticle(ctx, itemId);
      if (!aiAvailable(env)) throw new AppError('ai_not_configured');
      if ((await articleRewritesRepository.countRecent(ctx.orgId, new Date(Date.now() - 3_600_000))) >= REWRITES_PER_HOUR) throw new AppError('rate_limited');
      if ((await articleRewritesRepository.countForArticle(ctx.orgId, article.id)) >= SECTION_REWRITES_PER_ARTICLE) {
        throw new AppError('rewrite_limit', { limit: SECTION_REWRITES_PER_ARTICLE });
      }
      const rewrite = await articleRewritesRepository.create(ctx.orgId, {
        articleId: article.id,
        userId: ctx.userId,
        instruction: input.instruction,
        customInstruction: input.instruction === 'custom' ? (input.customInstruction ?? null) : null,
        inputHtml: sanitizeArticleHtml(input.html),
      });
      await jobs.enqueueAssistJob('rewrite', { orgId: ctx.orgId, rewriteId: rewrite.id });
      return rewriteDto(rewrite);
    },

    async rewriteStatus(ctx: SiteContext, itemId: string, rewriteId: string): Promise<RewriteDto> {
      const article = await loadArticle(ctx, itemId);
      const r = await articleRewritesRepository.find(ctx.orgId, rewriteId);
      if (!r || r.articleId !== article.id) throw new AppError('not_found');
      return rewriteDto(r);
    },

    async list(ctx: SiteContext): Promise<{ items: TopicDto[]; usage: ContentUsageDto }> {
      const items = await contentItemsRepository.listForOrg(ctx.orgId);
      return { items: items.filter((i) => i.status !== 'rejected').map(toTopic), usage: await usage(ctx) };
    },

    async detail(ctx: SiteContext, itemId: string): Promise<ContentDetailDto> {
      const item = await loadItem(ctx, itemId);
      const site = await sitesRepository.findById(ctx.orgId, item.siteId);
      const publication = item.article ? await publicationsRepository.latestForArticle(ctx.orgId, item.article.id) : null;
      const pub: PublicationDto | null = publication
        ? { status: publication.status, provider: publication.provider, remoteUrl: publication.remoteUrl, error: publication.error, publishedAt: publication.publishedAt?.toISOString() ?? null }
        : null;
      return {
        ...toTopic(item),
        progressStep: staleGenerating(item) ? null : (item.progressStep as GenerationStep | null),
        errorMessage: staleGenerating(item) ? 'internal' : item.errorMessage,
        duplicateOfUrl: item.duplicateOfUrl ?? null,
        regenerations: { used: item.regenerationCount ?? 0, limit: REGENERATIONS_PER_ARTICLE },
        rejectReason: item.rejectReason ?? null,
        article: item.article ? await articleDto(ctx.orgId, item.article) : null,
        publication: pub,
        siteConnected: !!(await credentialsRepository.findForSite(ctx.orgId, item.siteId)),
        publishMode: site?.publishMode ?? 'approval',
      };
    },

    /** "Şimdi yaz" / "Yeniden yaz": kota ve yapay zekâ kontrolünden sonra kuyruğa. */
    async generate(ctx: SiteContext, itemId: string): Promise<ContentDetailDto> {
      requireRole(ctx, EDIT_ROLES);
      const item = await loadItem(ctx, itemId);
      if (!['planned', 'failed', 'review', 'rejected'].includes(item.status) && !staleGenerating(item)) throw new AppError('invalid_state');
      if (!aiAvailable(env)) throw new AppError('ai_not_configured');
      if (!item.article) {
        const u = await usage(ctx);
        if (u.used >= u.limit) throw new AppError('quota_exceeded', u);
      } else if ((item.regenerationCount ?? 0) >= REGENERATIONS_PER_ARTICLE) {
        // Yeniden yazım hak tüketmiyor: sınırsız olunca tek yazı için maliyet katlanıyordu.
        throw new AppError('regeneration_limit', { limit: REGENERATIONS_PER_ARTICLE });
      }
      await contentWorkflowRepository.updateItem(ctx.orgId, item.id, { status: 'generating', progressStep: 'research', errorMessage: null });
      await jobs.enqueueContentJob('generate', { orgId: ctx.orgId, contentItemId: item.id });
      await audit(ctx, item.article ? 'content.regenerated' : 'content.generation_started', item.id);
      return this.detail(ctx, item.id);
    },

    /** "Onayla ve planla": planlı tarih geçmişse ve site bağlıysa hemen yayına. */
    async approve(ctx: SiteContext, itemId: string): Promise<ContentDetailDto> {
      requireRole(ctx, EDIT_ROLES);
      const item = await loadItem(ctx, itemId);
      if (!item.article || !['review', 'failed'].includes(item.status)) throw new AppError('invalid_state');
      const now = new Date();
      const plannedAt = item.plannedAt && item.plannedAt > now ? item.plannedAt : now;
      await contentWorkflowRepository.updateItem(ctx.orgId, item.id, { status: 'scheduled', plannedAt, errorMessage: null, rejectReason: null });
      if (plannedAt <= now && (await credentialsRepository.findForSite(ctx.orgId, item.siteId))) {
        await jobs.enqueueContentJob('publish', { orgId: ctx.orgId, contentItemId: item.id });
      }
      await audit(ctx, 'content.approved', item.id);
      return this.detail(ctx, item.id);
    },

    /** Reddet: sebep sonraki yazılarda dikkate alınır (Bölüm 7.13). */
    async reject(ctx: SiteContext, itemId: string, input: RejectInput): Promise<ContentDetailDto> {
      requireRole(ctx, EDIT_ROLES);
      const item = await loadItem(ctx, itemId);
      if (!['review', 'failed', 'scheduled'].includes(item.status)) throw new AppError('invalid_state');
      await contentWorkflowRepository.updateItem(ctx.orgId, item.id, { status: 'rejected', rejectReason: input.reason });
      await audit(ctx, 'content.rejected', item.id, { reason: input.reason });
      return this.detail(ctx, item.id);
    },

    /** Reddedilen yazıyı geri al (5 sn "Geri al" bildirimi): incelemeye döner. */
    async restore(ctx: SiteContext, itemId: string): Promise<ContentDetailDto> {
      requireRole(ctx, EDIT_ROLES);
      const item = await loadItem(ctx, itemId);
      if (item.status !== 'rejected') throw new AppError('invalid_state');
      await contentWorkflowRepository.updateItem(ctx.orgId, item.id, { status: item.article ? 'review' : 'planned', rejectReason: null });
      return this.detail(ctx, item.id);
    },

    async retryPublish(ctx: SiteContext, itemId: string): Promise<ContentDetailDto> {
      requireRole(ctx, EDIT_ROLES);
      const item = await loadItem(ctx, itemId);
      if (!item.article || item.status !== 'failed' || !item.errorMessage?.startsWith('publish_')) throw new AppError('invalid_state');
      if (!(await credentialsRepository.findForSite(ctx.orgId, item.siteId))) throw new AppError('not_connected');
      await contentWorkflowRepository.updateItem(ctx.orgId, item.id, { status: 'scheduled', errorMessage: null, plannedAt: new Date() });
      await jobs.enqueueContentJob('publish', { orgId: ctx.orgId, contentItemId: item.id });
      return this.detail(ctx, item.id);
    },

    /**
     * İndirme (Bölüm 7.6): HTML veya Markdown (görseller dosyaya gömülü) ya da ZIP (HTML + Markdown +
     * görsel dosyaları). Sunucumuza bağlı hiçbir şey kalmaz.
     */
    async download(ctx: SiteContext, itemId: string, format: 'html' | 'md' | 'zip'): Promise<{ fileName: string; contentType: string; body: string | Buffer }> {
      const item = await loadItem(ctx, itemId);
      const article = item.article;
      if (!article) throw new AppError('invalid_state');
      const images = await articlesRepository.images(ctx.orgId, article.id);
      const cover = images.find((i) => i.kind === 'cover') ?? null;
      const dataUrl = (img: ArticleImage) => `data:${img.mimeType};base64,${img.data.toString('base64')}`;
      const fileUrl = (img: ArticleImage) => `images/${img.fileName}`;
      const files = (src: (img: ArticleImage) => string) => {
        return { html: renderHtmlFile(article, article.html, cover ? { src: src(cover), alt: cover.altText, width: cover.width, height: cover.height } : null), md: renderMarkdownFile(article, article.html, cover ? { src: src(cover), alt: cover.altText } : null) };
      };
      if (format === 'zip') {
        const { html, md } = files(fileUrl);
        const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
          [`${article.slug}/index.html`]: strToU8(html),
          [`${article.slug}/${article.slug}.md`]: strToU8(md),
        };
        // Görseller zaten sıkıştırılmış (WebP): tekrar sıkıştırılmaz.
        if (cover) entries[`${article.slug}/${fileUrl(cover)}`] = [new Uint8Array(cover.data), { level: 0 }];
        return { fileName: `${article.slug}.zip`, contentType: 'application/zip', body: Buffer.from(zipSync(entries)) };
      }
      const { html, md } = files(dataUrl);
      return format === 'md'
        ? { fileName: `${article.slug}.md`, contentType: 'text/markdown; charset=utf-8', body: md }
        : { fileName: `${article.slug}.html`, contentType: 'text/html; charset=utf-8', body: html };
    },

    // --- Bağlantılar ----------------------------------------------------------------------------

    async connection(ctx: SiteContext, siteId: string): Promise<{ connection: ConnectionDto | null; oneClickAvailable: boolean }> {
      const site = await sitesRepository.findById(ctx.orgId, siteId);
      if (!site) throw new AppError('not_found');
      const rec = await credentialsRepository.findForSite(ctx.orgId, siteId);
      return {
        connection: rec ? { kind: rec.kind, display: rec.display, lastVerifiedAt: rec.lastVerifiedAt?.toISOString() ?? null } : null,
        // Application Passwords dönüş adresi HTTPS olmak zorunda (WordPress kuralı)
        oneClickAvailable: env.API_URL.startsWith('https://') || env.WEB_URL.startsWith('https://'),
      };
    },

    async connectWordPress(ctx: SiteContext, siteId: string, input: WordpressConnectInput): Promise<ConnectionDto> {
      requireRole(ctx, MANAGE_ROLES);
      if (!(await sitesRepository.findById(ctx.orgId, siteId))) throw new AppError('not_found');
      const normalized = normalizeSiteUrl(input.siteUrl);
      if (!normalized) throw new AppError('validation_failed', { fields: [{ path: 'siteUrl', message: 'validation.siteUrl' }] });
      const creds: StoredCredentials = { kind: 'wordpress', siteUrl: input.siteUrl.trim().replace(/\/+$/, '').replace(/^(?!https?:\/\/)/, 'https://'), username: input.username, appPassword: input.appPassword };
      return saveConnection(ctx, siteId, creds, new WordPressPublisher(creds, http));
    },

    async connectWebhook(ctx: SiteContext, siteId: string, input: WebhookConnectInput): Promise<ConnectionDto> {
      requireRole(ctx, MANAGE_ROLES);
      if (!(await sitesRepository.findById(ctx.orgId, siteId))) throw new AppError('not_found');
      const creds: StoredCredentials = { kind: 'webhook', url: input.url, secret: randomToken(32) };
      const dto = await saveConnection(ctx, siteId, creds, new WebhookPublisher(creds, http));
      // İmza anahtarı sadece şimdi bir kez gösterilir.
      return { ...dto, secret: creds.secret };
    },

    async connectGhost(ctx: SiteContext, siteId: string, input: GhostConnectInput): Promise<ConnectionDto> {
      requireRole(ctx, MANAGE_ROLES);
      if (!(await sitesRepository.findById(ctx.orgId, siteId))) throw new AppError('not_found');
      const normalized = normalizeSiteUrl(input.siteUrl);
      if (!normalized) throw new AppError('validation_failed', { fields: [{ path: 'siteUrl', message: 'validation.siteUrl' }] });
      const creds: StoredCredentials = { kind: 'ghost', siteUrl: normalized.url.replace(/\/+$/, ''), adminApiKey: input.adminApiKey };
      return saveConnection(ctx, siteId, creds, createPublisher(creds, http));
    },

    async connectShopify(ctx: SiteContext, siteId: string, input: ShopifyConnectInput): Promise<ConnectionDto> {
      requireRole(ctx, MANAGE_ROLES);
      if (!(await sitesRepository.findById(ctx.orgId, siteId))) throw new AppError('not_found');
      const shop = normalizeShopDomain(input.shop);
      if (!shop) throw new AppError('validation_failed', { fields: [{ path: 'shop', message: 'validation.shopDomain' }] });
      const creds: StoredCredentials =
        input.method === 'app' ? { kind: 'shopify', shop, clientId: input.clientId!, clientSecret: input.clientSecret! } : { kind: 'shopify', shop, accessToken: input.accessToken! };
      return saveConnection(ctx, siteId, creds, createPublisher(creds, http));
    },

    /** Webflow: token'ın eriştiği siteler, koleksiyonlar ve alanlar (kullanıcı eşlemeyi seçer). Token saklanmaz. */
    async discoverWebflow(ctx: SiteContext, siteId: string, token: string): Promise<WebflowSiteDto[]> {
      requireRole(ctx, MANAGE_ROLES);
      if (!(await sitesRepository.findById(ctx.orgId, siteId))) throw new AppError('not_found');
      try {
        return await WebflowPublisher.discover(token, http);
      } catch (err) {
        if (err instanceof PublishError) throw new AppError('connection_failed', { reason: err.code });
        throw err;
      }
    },

    async connectWebflow(ctx: SiteContext, siteId: string, input: WebflowConnectInput): Promise<ConnectionDto> {
      requireRole(ctx, MANAGE_ROLES);
      if (!(await sitesRepository.findById(ctx.orgId, siteId))) throw new AppError('not_found');
      const fields = Object.fromEntries(Object.entries(input.fields).filter(([, v]) => v)) as WebflowConnectInput['fields'];
      const creds: StoredCredentials = { kind: 'webflow', token: input.token, siteId: input.siteId, collectionId: input.collectionId, fields };
      return saveConnection(ctx, siteId, creds, createPublisher(creds, http));
    },

    async connectWix(ctx: SiteContext, siteId: string, input: WixConnectInput): Promise<ConnectionDto> {
      requireRole(ctx, MANAGE_ROLES);
      if (!(await sitesRepository.findById(ctx.orgId, siteId))) throw new AppError('not_found');
      const creds: StoredCredentials = { kind: 'wix', apiKey: input.apiKey, siteId: input.siteId };
      return saveConnection(ctx, siteId, creds, createPublisher(creds, http));
    },

    async testConnection(ctx: SiteContext, siteId: string): Promise<ConnectionDto> {
      requireRole(ctx, EDIT_ROLES);
      const creds = await storedCredentials(ctx, siteId);
      if (!creds) throw new AppError('not_connected');
      const publisher = createPublisher(creds, http);
      try {
        await publisher.testConnection();
      } catch (err) {
        if (err instanceof PublishError) {
          await sitesRepository.update(ctx.orgId, siteId, { connectionStatus: 'error' });
          throw new AppError('connection_failed', { reason: err.code });
        }
        throw err;
      }
      await credentialsRepository.markVerified(ctx.orgId, siteId);
      await sitesRepository.update(ctx.orgId, siteId, { connectionStatus: 'connected' });
      return (await this.connection(ctx, siteId)).connection!;
    },

    async disconnect(ctx: SiteContext, siteId: string): Promise<void> {
      requireRole(ctx, MANAGE_ROLES);
      if (!(await sitesRepository.findById(ctx.orgId, siteId))) throw new AppError('not_found');
      await credentialsRepository.remove(ctx.orgId, siteId);
      await sitesRepository.update(ctx.orgId, siteId, { cmsType: 'none', connectionStatus: 'not_connected' });
      await auditLogsRepository.record({ action: 'connection.deleted', userId: ctx.userId, orgId: ctx.orgId, targetType: 'site', targetId: siteId, ip: ctx.ip, userAgent: ctx.userAgent });
    },

    wordpressAuthorizeUrl(ctx: SiteContext, siteId: string, siteUrl: string): string {
      requireRole(ctx, MANAGE_ROLES);
      const normalized = normalizeSiteUrl(siteUrl);
      if (!normalized) throw new AppError('validation_failed', { fields: [{ path: 'siteUrl', message: 'validation.siteUrl' }] });
      const state = signState({ orgId: ctx.orgId, siteId, userId: ctx.userId });
      const callback = `${env.API_URL}/api/v1/connections/wordpress/callback?state=${encodeURIComponent(state)}`;
      return authorizeUrl(normalized.url, { appName: 'Upvine', appId: siteId, successUrl: callback, rejectUrl: `${env.WEB_URL}/app/settings?connection=rejected` });
    },

    /** WordPress yetkilendirme dönüşü: `site_url`, `user_login`, `password` (Application Passwords). */
    async wordpressCallback(query: { state?: string; site_url?: string; user_login?: string; password?: string }): Promise<'connected' | 'failed'> {
      const state = query.state ? verifyState(query.state) : null;
      if (!state || !query.site_url || !query.user_login || !query.password) return 'failed';
      const membership = await membershipsRepository.find(state.orgId, state.userId);
      if (!membership) return 'failed';
      const ctx: SiteContext = { userId: state.userId, orgId: state.orgId, role: membership.role };
      try {
        await this.connectWordPress(ctx, state.siteId, { siteUrl: query.site_url, username: query.user_login, appPassword: query.password });
        return 'connected';
      } catch {
        return 'failed';
      }
    },
  };
}

export type ContentService = ReturnType<typeof createContentService>;
