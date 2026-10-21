import { AsyncLocalStorage } from 'node:async_hooks';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { createAIProvider } from '@upvine/ai';
import { createKeywordProvider, NoKeywordProvider } from '@upvine/keywords';
import { loadEnv } from '@upvine/config/env';
import { aiUsageRepository, connectDb, contentWorkflowRepository, freeAnalysesRepository, gscConnectionsRepository, refreshesRepository, sitesRepository } from '@upvine/db';
import { createMailer } from '@upvine/email';
import { createSafeHttpClient } from '@upvine/seo';
import { ASSIST_JOBS, CONTENT_JOBS, GENERATE_JOB_OPTIONS, PUBLISH_JOB_OPTIONS, QUEUES, SITE_JOB_OPTIONS, SITE_JOBS } from '@upvine/shared';
import type { AssistJobData, AssistJobName, ContentJobData, ContentJobName, FreeAnalysisJobData, RefreshJobData, SiteJobData, SiteJobName } from '@upvine/shared';
import { rewriteSection } from './jobs/assist-jobs';
import { generateRefresh } from './jobs/refresh-jobs';
import { contentTick, generateArticle, publishArticle } from './jobs/content-jobs';
import type { ContentDeps } from './jobs/content-jobs';
import { runFreeAnalysis } from './jobs/free-analysis';
import { createReviewNotifier } from './notifications';
import { billingTick } from './jobs/billing-jobs';
import { syncPosts } from './jobs/posts-sync';
import { planningTick, resultsTick, runVisibility, syncSearchConsole } from './jobs/results-jobs';
import { analyzeSite, generateTopics, RetryableJobError } from './jobs/site-jobs';
import { createFakeAI, createFixtureHttpClient } from './testing/fake-externals';
import type { JobDeps } from './jobs/site-jobs';

/**
 * Arka plan işleri süreci (BullMQ): heartbeat, site analizi / konu önerisi, ücretsiz analiz,
 * makale üretimi ve yayın + dakikalık zamanlayıcı. Takip ve faturalandırma ilgili fazlarda.
 */
export const HEARTBEAT_KEY = 'worker:heartbeat';
const HEARTBEAT_INTERVAL_MS = 15_000;

const env = loadEnv();
const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'worker' },
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
});
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
redis.on('error', (err) => logger.error({ err }, 'redis error'));
const sequelize = connectDb(env);

// Yapay zekâ kullanım logu hangi organizasyona yazılacak: iş başına bağlam.
const jobOrg = new AsyncLocalStorage<string>();
const fakeExternals = env.E2E_FAKE_EXTERNALS && env.NODE_ENV !== 'production';
if (fakeExternals) logger.warn('E2E_FAKE_EXTERNALS: sahte site ve sahte yapay zekâ kullanılıyor (sadece test)');
const ai = fakeExternals ? createFakeAI() : createAIProvider(env, {
  store: redis,
  onUsage: (event) => {
    aiUsageRepository
      .record({ orgId: jobOrg.getStore() ?? null, ...event, errorCode: event.errorCode ?? null })
      .catch((err: unknown) => logger.warn({ err }, 'ai usage log failed'));
  },
});
if (!ai.configured) logger.warn('GEMINI_API_KEY tanımlı değil: analiz yapay zekâsız (sezgisel) çalışacak, konu önerisi kapalı');

const deps: JobDeps = {
  env,
  ai,
  keywords: fakeExternals ? new NoKeywordProvider() : createKeywordProvider(env),
  http: fakeExternals ? createFixtureHttpClient() : createSafeHttpClient({ userAgent: env.CRAWLER_USER_AGENT }),
  logger,
};

const mailer = createMailer(env);
const contentDeps: ContentDeps = { ...deps, onReviewReady: createReviewNotifier(env, mailer) };

async function beat(): Promise<void> {
  try {
    // Admin paneli ve /api/health bu anahtarın tazeliğine bakar.
    await redis.set(HEARTBEAT_KEY, new Date().toISOString(), 'EX', (HEARTBEAT_INTERVAL_MS / 1000) * 3);
  } catch (err) {
    logger.warn({ err }, 'heartbeat failed');
  }
}

/** İş düştüğünde ilgili durumu "başarısız" yapar (site alanları; Search Console'da bağlantı kaydı). */
async function markFailed(name: SiteJobName, orgId: string, siteId: string, code: string, onlyIfRunning = false): Promise<void> {
  if (name === SITE_JOBS.gscSync) {
    const conn = await gscConnectionsRepository.findForSite(orgId, siteId);
    if (conn && (!onlyIfRunning || conn.syncStatus === 'running')) await gscConnectionsRepository.update(orgId, siteId, { syncStatus: 'failed', syncError: code });
    return;
  }
  const site = await sitesRepository.findById(orgId, siteId);
  if (!site) return;
  const running: Record<SiteJobName, boolean> = {
    analyze: site.analysisStatus === 'running' || site.analysisStatus === 'pending',
    topics: site.topicsStatus === 'running',
    'sync-posts': site.postsSyncStatus === 'running',
    'ai-visibility': site.visibilityStatus === 'running',
    'gsc-sync': false,
  };
  if (onlyIfRunning && !running[name]) return;
  const patch =
    name === SITE_JOBS.analyze
      ? { analysisStatus: 'failed' as const, analysisPhase: null, analysisError: code }
      : name === SITE_JOBS.syncPosts
        ? { postsSyncStatus: 'failed' as const, postsSyncError: code }
        : name === SITE_JOBS.visibility
          ? { visibilityStatus: 'failed' as const, visibilityError: code }
          : { topicsStatus: 'failed' as const, topicsError: code };
  await sitesRepository.update(orgId, siteId, patch);
}

const siteWorker = new Worker<SiteJobData, void, SiteJobName>(
  QUEUES.siteAnalysis,
  async (job) => {
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const run = { finalAttempt };
    await jobOrg.run(job.data.orgId, async () => {
      try {
        if (job.name === SITE_JOBS.analyze) await analyzeSite(deps, job.data, run);
        else if (job.name === SITE_JOBS.topics) await generateTopics(deps, job.data, run);
        else if (job.name === SITE_JOBS.syncPosts) await syncPosts(deps, job.data, run);
        else if (job.name === SITE_JOBS.gscSync) await syncSearchConsole(deps, job.data, run);
        else if (job.name === SITE_JOBS.visibility) await runVisibility(deps, job.data, run);
      } catch (err) {
        if (err instanceof RetryableJobError) throw err;
        // Beklenmeyen hata: son denemede kullanıcıya "takılı kaldı" yerine anlaşılır durum göster.
        if (finalAttempt) {
          const { orgId, siteId } = job.data;
          await markFailed(job.name, orgId, siteId, 'internal').catch(() => {});
        }
        throw err;
      }
    });
  },
  // BullMQ engelleyici komutlar kullanır: maxRetriesPerRequest null olmalı. Geliştirmede worker kod
  // değişince yeniden başlıyor: süren iş birkaç kez "takılabilir", hemen düşürülmesin.
  { connection: new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }), concurrency: 2, prefix: env.QUEUE_PREFIX, maxStalledCount: 3 },
);
siteWorker.on('failed', (job, err) => {
  logger.warn({ err, job: job?.name, attempts: job?.attemptsMade }, 'job failed');
  // İşlemci dışında düşen işler (worker yeniden başlarken takılma = "stalled", son deneme) durumu
  // "çalışıyor"da bırakıyordu: kalıcı olarak "yarıda kaldı" yaz, kullanıcı tekrar deneyebilsin.
  if (!job) return;
  const finalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
  if (!finalAttempt && !/stalled/i.test(err.message)) return;
  void markFailed(job.name, job.data.orgId, job.data.siteId, 'stalled', true).catch(() => {});
});
siteWorker.on('error', (err) => logger.error({ err }, 'worker error'));

const bullConnection = () => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const siteQueue = new Queue<SiteJobData, void, SiteJobName>(QUEUES.siteAnalysis, { connection: bullConnection(), prefix: env.QUEUE_PREFIX });
const contentQueue = new Queue<ContentJobData | Record<string, never>, void, ContentJobName>(QUEUES.content, { connection: bullConnection(), prefix: env.QUEUE_PREFIX });

// Makale üretimi ve yayın. Üretim pahalı (yapay zekâ çağrıları): eşzamanlılık düşük.
const contentWorker = new Worker<ContentJobData | Record<string, never>, void, ContentJobName>(
  QUEUES.content,
  async (job) => {
    if (job.name === CONTENT_JOBS.tick) {
      const counts = await contentTick({ env }, async (name, data, jobId) => {
        await contentQueue.add(name, data, { ...(name === 'generate' ? GENERATE_JOB_OPTIONS : PUBLISH_JOB_OPTIONS), jobId });
      });
      if (counts.publish || counts.generate) logger.info(counts, 'content tick');
      // Search Console (günde bir) ve AI görünürlük (haftada bir)
      const results = await resultsTick(async (name, data, jobId) => {
        await siteQueue.add(name, data, { ...SITE_JOB_OPTIONS, jobId });
      });
      if (results.gsc || results.visibility) logger.info(results, 'results tick');
      // Takvim azalınca yeni konu (yapay zekâ yoksa konu önerilemez)
      if (ai.configured) {
        const planned = await planningTick(async (data, jobId) => {
          await siteQueue.add(SITE_JOBS.topics, data, { ...SITE_JOB_OPTIONS, jobId });
        });
        if (planned) logger.info({ sites: planned }, 'planning tick');
      }
      // Ödenmiş dönem: yenileme hatırlatması ve süresi dolanlar
      const billed = await billingTick({ env, mailer, logger });
      if (billed.reminded || billed.lapsed) logger.info(billed, 'billing tick');
      return;
    }
    const data = job.data as ContentJobData;
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await jobOrg.run(data.orgId, async () => {
      try {
        if (job.name === CONTENT_JOBS.generate) await generateArticle(contentDeps, data, { finalAttempt });
        else if (job.name === CONTENT_JOBS.publish) await publishArticle(contentDeps, data, { finalAttempt });
      } catch (err) {
        if (err instanceof RetryableJobError) throw err;
        if (finalAttempt) {
          await contentWorkflowRepository
            .updateItem(data.orgId, data.contentItemId, { status: 'failed', progressStep: null, errorMessage: 'internal' })
            .catch(() => {});
        }
        throw err;
      }
    });
  },
  { connection: bullConnection(), concurrency: 1, prefix: env.QUEUE_PREFIX, maxStalledCount: 3 },
);
contentWorker.on('failed', (job, err) => {
  logger.warn({ err, job: job?.name, attempts: job?.attemptsMade }, 'content job failed');
  // Takılma ile düşen yazım işi: içerik "yazılıyor"da kalmasın.
  if (job?.name === CONTENT_JOBS.generate && /stalled/i.test(err.message)) {
    const data = job.data as ContentJobData;
    void contentWorkflowRepository.updateItem(data.orgId, data.contentItemId, { status: 'failed', progressStep: null, errorMessage: 'internal' }).catch(() => {});
  }
});
contentWorker.on('error', (err) => logger.error({ err }, 'content worker error'));
// Dakikalık zamanlayıcı (tek kayıt; birden çok worker süreci olsa da bir kez çalışır).
await contentQueue.upsertJobScheduler(CONTENT_JOBS.tick, { every: 60_000 }, { name: CONTENT_JOBS.tick, data: {}, opts: { removeOnComplete: true, removeOnFail: 100 } });

// Editör yardımcısı: kısa, etkileşimli işler (bölüm yeniden yazımı, mevcut yazı için güncelleme önerisi).
// Makale üretiminin arkasında beklemez.
const assistWorker = new Worker<AssistJobData | RefreshJobData, void, AssistJobName>(
  QUEUES.assist,
  async (job) => {
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (job.name === ASSIST_JOBS.refresh) {
      const data = job.data as RefreshJobData;
      await jobOrg.run(data.orgId, async () => {
        try {
          await generateRefresh(contentDeps, data, { finalAttempt });
        } catch (err) {
          if (err instanceof RetryableJobError) throw err;
          if (finalAttempt) await refreshesRepository.update(data.orgId, data.refreshId, { status: 'failed', error: 'internal' }).catch(() => {});
          throw err;
        }
      });
      return;
    }
    const data = job.data as AssistJobData;
    await jobOrg.run(data.orgId, () => rewriteSection(contentDeps, data, { finalAttempt }));
  },
  { connection: bullConnection(), concurrency: 3, prefix: env.QUEUE_PREFIX },
);
assistWorker.on('failed', (job, err) => logger.warn({ err, attempts: job?.attemptsMade }, 'assist job failed'));
assistWorker.on('error', (err) => logger.error({ err }, 'assist worker error'));

// Ücretsiz analiz (kayıt gerektirmez)
const freeWorker = new Worker<FreeAnalysisJobData>(
  QUEUES.freeAnalysis,
  async (job) => {
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    try {
      await runFreeAnalysis(deps, job.data, { finalAttempt });
    } catch (err) {
      if (err instanceof RetryableJobError) throw err;
      if (finalAttempt) await freeAnalysesRepository.update(job.data.id, { status: 'failed', phase: null, error: 'internal' }).catch(() => {});
      throw err;
    }
  },
  { connection: bullConnection(), concurrency: 2, prefix: env.QUEUE_PREFIX },
);
freeWorker.on('failed', (job, err) => logger.warn({ err, attempts: job?.attemptsMade }, 'free analysis job failed'));
freeWorker.on('error', (err) => logger.error({ err }, 'free worker error'));

await beat();
const timer = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
logger.info({ ai: ai.configured }, 'worker started');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  clearInterval(timer);
  await Promise.allSettled([siteWorker.close(), contentWorker.close(), freeWorker.close(), assistWorker.close(), contentQueue.close(), siteQueue.close()]);
  await Promise.allSettled([sequelize.close(), redis.quit()]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
