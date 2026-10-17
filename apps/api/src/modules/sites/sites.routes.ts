import express, { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import {
  COVER_UPLOAD,
  coverAltSchema,
  gscPropertySchema,
  visibilityQuestionSchema,
  createSiteSchema,
  createTopicSchema,
  ghostConnectSchema,
  rejectSchema,
  rescheduleSchema,
  restoreVersionSchema,
  rewriteSectionSchema,
  updateArticleSchema,
  updateBrandSchema,
  shopifyConnectSchema,
  updateSiteSchema,
  webflowConnectSchema,
  webflowDiscoverSchema,
  webhookConnectSchema,
  wixConnectSchema,
  wordpressConnectSchema,
} from '@upvine/shared';
import type {
  CreateSiteInput,
  CreateTopicInput,
  GhostConnectInput,
  GscPropertyInput,
  VisibilityQuestionInput,
  RejectInput,
  RescheduleInput,
  RestoreVersionInput,
  RewriteSectionInput,
  UpdateArticleInput,
  UpdateBrandInput,
  ShopifyConnectInput,
  UpdateSiteInput,
  WebflowConnectInput,
  WebflowDiscoverInput,
  WebhookConnectInput,
  WixConnectInput,
  WordpressConnectInput,
} from '@upvine/shared';
import { createContentService } from '../content/content.service';
import { createResultsService } from '../results/results.service';
import type { AppDeps } from '../../deps';
import { requireAuth } from '../../middleware/auth';
import { RATE_LIMITS } from '../../middleware/rate-limit';
import { validateBody } from '../../middleware/validate';
import { AppError } from '../../lib/errors';
import { createRefreshService } from './refresh.service';
import { createSitesService, resolveContext } from './sites.service';
import type { SiteContext } from './sites.service';

async function context(req: Request): Promise<SiteContext> {
  const header = req.get('x-org-id');
  const ctx = await resolveContext(req.auth!.userId, header || undefined);
  return { ...ctx, ip: req.ip, userAgent: req.get('user-agent') };
}

/** Liste uç noktaları: organizasyonu olmayan kullanıcı (ör. sadece admin hesabı) hata değil boş liste görür. */
async function contextOrNull(req: Request): Promise<SiteContext | null> {
  try {
    return await context(req);
  } catch (err) {
    if (err instanceof AppError && err.code === 'forbidden') return null;
    throw err;
  }
}

const param = (req: Request, name: string): string => String(req.params[name] ?? '');

/** `/api/v1/sites` — site ekleme, analiz, marka profili, konu planı ve sihirbaz (Bölüm 7.1-7.4). */
export function sitesRoutes(deps: AppDeps): Router {
  const service = createSitesService({ env: deps.env, jobs: deps.jobs, http: deps.http });
  const refreshes = createRefreshService({ env: deps.env, jobs: deps.jobs, http: deps.http });
  const r = Router();
  r.use(requireAuth(deps.env));
  const analysisLimit = deps.rateLimiter(RATE_LIMITS.siteAnalysis);

  const list: RequestHandler = async (req, res) => {
    const ctx = await contextOrNull(req);
    res.json({ items: ctx ? await service.list(ctx) : [] });
  };
  const create: RequestHandler = async (req, res) => {
    res.status(201).json(await service.create(await context(req), req.body as CreateSiteInput));
  };
  const get: RequestHandler = async (req, res) => {
    res.json(await service.get(await context(req), param(req, 'id')));
  };
  const update: RequestHandler = async (req, res) => {
    res.json(await service.update(await context(req), param(req, 'id'), req.body as UpdateSiteInput));
  };
  const remove: RequestHandler = async (req, res) => {
    await service.remove(await context(req), param(req, 'id'));
    res.status(204).end();
  };
  const reanalyze: RequestHandler = async (req, res) => {
    res.json(await service.reanalyze(await context(req), param(req, 'id')));
  };
  const getAudit: RequestHandler = async (req, res) => {
    res.json({ audit: await service.getAudit(await context(req), param(req, 'id')) });
  };
  const updateBrand: RequestHandler = async (req, res) => {
    res.json(await service.updateBrand(await context(req), param(req, 'id'), req.body as UpdateBrandInput));
  };
  const listTopics: RequestHandler = async (req, res) => {
    res.json({ items: await service.listTopics(await context(req), param(req, 'id')) });
  };
  const generateTopics: RequestHandler = async (req, res) => {
    res.json(await service.generateTopics(await context(req), param(req, 'id')));
  };
  const addTopic: RequestHandler = async (req, res) => {
    res.status(201).json(await service.addTopic(await context(req), param(req, 'id'), req.body as CreateTopicInput));
  };
  const removeTopic: RequestHandler = async (req, res) => {
    await service.removeTopic(await context(req), param(req, 'id'), param(req, 'topicId'));
    res.status(204).end();
  };
  const listPosts: RequestHandler = async (req, res) => {
    res.json(await service.listPosts(await context(req), param(req, 'id')));
  };
  const syncPosts: RequestHandler = async (req, res) => {
    res.json(await service.syncPosts(await context(req), param(req, 'id')));
  };
  const complete: RequestHandler = async (req, res) => {
    res.json(await service.completeOnboarding(await context(req), param(req, 'id')));
  };

  r.get('/', list);
  r.post('/', analysisLimit, validateBody(createSiteSchema), create);
  r.get('/:id', get);
  r.patch('/:id', validateBody(updateSiteSchema), update);
  r.delete('/:id', remove);
  r.post('/:id/analyze', analysisLimit, reanalyze);
  r.get('/:id/audit', getAudit);
  r.put('/:id/brand', validateBody(updateBrandSchema), updateBrand);
  r.get('/:id/topics', listTopics);
  r.post('/:id/topics/generate', analysisLimit, generateTopics);
  r.post('/:id/topics', validateBody(createTopicSchema), addTopic);
  r.delete('/:id/topics/:topicId', removeTopic);
  r.post('/:id/onboarding/complete', complete);
  r.get('/:id/posts', listPosts);
  r.post('/:id/posts/sync', analysisLimit, syncPosts);
  // İçerik yenileme (Bölüm 7.9): öneri worker'da üretilir; uygulama/geri alma kullanıcı onayıyla CMS'te.
  r.post('/:id/posts/:postId/refresh', analysisLimit, async (req, res) => {
    res.status(202).json(await refreshes.request(await context(req), param(req, 'id'), param(req, 'postId')));
  });
  r.get('/:id/refreshes/:refreshId', async (req, res) => {
    res.json(await refreshes.detail(await context(req), param(req, 'id'), param(req, 'refreshId')));
  });
  r.post('/:id/refreshes/:refreshId/apply', analysisLimit, async (req, res) => {
    res.json(await refreshes.apply(await context(req), param(req, 'id'), param(req, 'refreshId')));
  });
  r.post('/:id/refreshes/:refreshId/revert', analysisLimit, async (req, res) => {
    res.json(await refreshes.revert(await context(req), param(req, 'id'), param(req, 'refreshId')));
  });
  r.post('/:id/refreshes/:refreshId/dismiss', async (req, res) => {
    res.json(await refreshes.dismiss(await context(req), param(req, 'id'), param(req, 'refreshId')));
  });

  // Site bağlantısı (Bölüm 7.8): kimlik bilgileri şifreli saklanır, tarayıcıya asla geri dönmez.
  const content = createContentService({ env: deps.env, jobs: deps.jobs, http: deps.http });
  r.get('/:id/connection', async (req, res) => {
    res.json(await content.connection(await context(req), param(req, 'id')));
  });
  r.put('/:id/connection/wordpress', analysisLimit, validateBody(wordpressConnectSchema), async (req, res) => {
    res.json(await content.connectWordPress(await context(req), param(req, 'id'), req.body as WordpressConnectInput));
  });
  r.put('/:id/connection/webhook', analysisLimit, validateBody(webhookConnectSchema), async (req, res) => {
    res.json(await content.connectWebhook(await context(req), param(req, 'id'), req.body as WebhookConnectInput));
  });
  r.put('/:id/connection/ghost', analysisLimit, validateBody(ghostConnectSchema), async (req, res) => {
    res.json(await content.connectGhost(await context(req), param(req, 'id'), req.body as GhostConnectInput));
  });
  r.put('/:id/connection/shopify', analysisLimit, validateBody(shopifyConnectSchema), async (req, res) => {
    res.json(await content.connectShopify(await context(req), param(req, 'id'), req.body as ShopifyConnectInput));
  });
  r.post('/:id/connection/webflow/discover', analysisLimit, validateBody(webflowDiscoverSchema), async (req, res) => {
    res.json({ sites: await content.discoverWebflow(await context(req), param(req, 'id'), (req.body as WebflowDiscoverInput).token) });
  });
  r.put('/:id/connection/webflow', analysisLimit, validateBody(webflowConnectSchema), async (req, res) => {
    res.json(await content.connectWebflow(await context(req), param(req, 'id'), req.body as WebflowConnectInput));
  });
  r.put('/:id/connection/wix', analysisLimit, validateBody(wixConnectSchema), async (req, res) => {
    res.json(await content.connectWix(await context(req), param(req, 'id'), req.body as WixConnectInput));
  });
  r.post('/:id/connection/test', analysisLimit, async (req, res) => {
    res.json(await content.testConnection(await context(req), param(req, 'id')));
  });
  r.delete('/:id/connection', async (req, res) => {
    await content.disconnect(await context(req), param(req, 'id'));
    res.status(204).end();
  });
  r.get('/:id/connection/wordpress/authorize-url', async (req, res) => {
    res.json({ url: content.wordpressAuthorizeUrl(await context(req), param(req, 'id'), String(req.query.siteUrl ?? '')) });
  });

  // Sonuçlar (Bölüm 7.11, 7.12): Search Console, genel bakış, anahtar kelimeler, AI görünürlük
  const results = createResultsService({ env: deps.env, jobs: deps.jobs, http: deps.http });
  r.get('/:id/search-console', async (req, res) => {
    res.json(await results.searchConsole(await context(req), param(req, 'id')));
  });
  r.get('/:id/search-console/authorize-url', async (req, res) => {
    res.json({ url: await results.authorizeUrl(await context(req), param(req, 'id'), req.locale) });
  });
  r.put('/:id/search-console/property', validateBody(gscPropertySchema), async (req, res) => {
    res.json(await results.selectProperty(await context(req), param(req, 'id'), (req.body as GscPropertyInput).property));
  });
  r.post('/:id/search-console/sync', analysisLimit, async (req, res) => {
    res.json(await results.syncNow(await context(req), param(req, 'id')));
  });
  r.delete('/:id/search-console', async (req, res) => {
    await results.disconnect(await context(req), param(req, 'id'));
    res.status(204).end();
  });
  r.get('/:id/results/overview', async (req, res) => {
    res.json(await results.overview(await context(req), param(req, 'id')));
  });
  r.get('/:id/results/keywords', async (req, res) => {
    res.json(await results.keywords(await context(req), param(req, 'id')));
  });
  r.get('/:id/visibility', async (req, res) => {
    res.json(await results.visibility(await context(req), param(req, 'id')));
  });
  r.post('/:id/visibility/run', analysisLimit, async (req, res) => {
    res.json(await results.runVisibility(await context(req), param(req, 'id')));
  });
  r.post('/:id/visibility/questions', validateBody(visibilityQuestionSchema), async (req, res) => {
    res.status(201).json(await results.addQuestion(await context(req), param(req, 'id'), (req.body as VisibilityQuestionInput).question));
  });
  r.delete('/:id/visibility/questions/:questionId', async (req, res) => {
    res.json(await results.removeQuestion(await context(req), param(req, 'id'), param(req, 'questionId')));
  });
  return r;
}

/** `/api/v1/content` — İçerikler, Takvim ve inceleme ekranı (Bölüm 7.6, 7.13). */
export function contentRoutes(deps: AppDeps): Router {
  const service = createContentService({ env: deps.env, jobs: deps.jobs, http: deps.http });
  const r = Router();
  r.use(requireAuth(deps.env));
  const limit = deps.rateLimiter(RATE_LIMITS.siteAnalysis);

  r.get('/', async (req, res) => {
    const ctx = await contextOrNull(req);
    res.json(ctx ? await service.list(ctx) : { items: [], usage: { used: 0, limit: 0 } });
  });
  r.get('/:id', async (req, res) => {
    res.json(await service.detail(await context(req), param(req, 'id')));
  });
  r.post('/:id/generate', limit, async (req, res) => {
    res.json(await service.generate(await context(req), param(req, 'id')));
  });
  r.post('/:id/approve', async (req, res) => {
    res.json(await service.approve(await context(req), param(req, 'id')));
  });
  r.post('/:id/reject', validateBody(rejectSchema), async (req, res) => {
    res.json(await service.reject(await context(req), param(req, 'id'), req.body as RejectInput));
  });
  r.post('/:id/restore', async (req, res) => {
    res.json(await service.restore(await context(req), param(req, 'id')));
  });
  r.post('/:id/retry-publish', limit, async (req, res) => {
    res.json(await service.retryPublish(await context(req), param(req, 'id')));
  });
  r.patch('/:id/schedule', validateBody(rescheduleSchema), async (req, res) => {
    res.json(await service.reschedule(await context(req), param(req, 'id'), req.body as RescheduleInput));
  });
  // Editör (Bölüm 7.6): kaydet, sürüm geçmişi, bölümü yeniden yazdır
  // Kapak yükleme: gövde ham görsel (multipart yok), alt metin sorguda.
  r.put('/:id/cover', express.raw({ type: [...COVER_UPLOAD.mimeTypes], limit: COVER_UPLOAD.maxBytes }), async (req, res) => {
    const alt = coverAltSchema.safeParse(req.query.alt ?? '');
    if (!alt.success) throw new AppError('validation_failed', { fields: alt.error.issues.map((i) => ({ path: 'alt', message: i.message })) });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new AppError('invalid_image');
    res.json(await service.uploadCover(await context(req), param(req, 'id'), req.body, alt.data));
  });
  r.put('/:id/article', validateBody(updateArticleSchema), async (req, res) => {
    res.json(await service.updateArticle(await context(req), param(req, 'id'), req.body as UpdateArticleInput));
  });
  r.get('/:id/versions', async (req, res) => {
    res.json({ items: await service.versions(await context(req), param(req, 'id')) });
  });
  r.get('/:id/versions/:versionId', async (req, res) => {
    res.json(await service.version(await context(req), param(req, 'id'), param(req, 'versionId')));
  });
  r.post('/:id/versions/:versionId/restore', validateBody(restoreVersionSchema), async (req, res) => {
    res.json(await service.restoreVersion(await context(req), param(req, 'id'), param(req, 'versionId'), req.body as RestoreVersionInput));
  });
  r.post('/:id/rewrites', limit, validateBody(rewriteSectionSchema), async (req, res) => {
    res.status(202).json(await service.requestRewrite(await context(req), param(req, 'id'), req.body as RewriteSectionInput));
  });
  r.get('/:id/rewrites/:rewriteId', async (req, res) => {
    res.json(await service.rewriteStatus(await context(req), param(req, 'id'), param(req, 'rewriteId')));
  });
  r.get('/:id/download', async (req, res) => {
    const format = req.query.format === 'md' ? 'md' : req.query.format === 'zip' ? 'zip' : 'html';
    const file = await service.download(await context(req), param(req, 'id'), format);
    res.setHeader('content-type', file.contentType);
    res.setHeader('content-disposition', `attachment; filename="${file.fileName.replace(/"/g, '')}"`);
    res.send(file.body);
  });
  return r;
}

/** `/api/v1/connections/{wordpress,search-console}/callback` — yetkilendirme dönüşleri (oturum yok, imzalı state). */
export function connectionCallbackRoutes(deps: AppDeps): Router {
  const service = createContentService({ env: deps.env, jobs: deps.jobs, http: deps.http });
  const r = Router();
  r.get('/wordpress/callback', async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const result = await service.wordpressCallback({ state: q.state, site_url: q.site_url, user_login: q.user_login, password: q.password });
    res.redirect(302, `${deps.env.WEB_URL}/app/settings?connection=${result}`);
  });
  // Search Console yetkilendirme dönüşü (oturum yok, imzalı state)
  const results = createResultsService({ env: deps.env, jobs: deps.jobs, http: deps.http });
  r.get('/search-console/callback', async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const result = await results.callback({ state: q.state, code: q.code, error: q.error });
    res.redirect(302, `${deps.env.WEB_URL}/app/settings?gsc=${result}`);
  });
  return r;
}
