import { AIError, visibilityAnswerPrompt, visibilityAnswerSystem, visibilityQuestionsOutputSchema, visibilityQuestionsPrompt, visibilityQuestionsSystem } from '@upvine/ai';
import type { Source } from '@upvine/ai';
import { CONTENT_LANGUAGES } from '@upvine/config';
import { brandProfilesRepository, gscConnectionsRepository, gscMetricsRepository, newId, sitesNeedingTopics, sitesRepository, visibilityRepository } from '@upvine/db';
import type { GscRowInput } from '@upvine/db';
import { decryptJson } from '@upvine/publishers';
import { refreshSearchConsoleToken, SearchConsoleClient, SearchConsoleError } from '@upvine/seo';
import type { GoogleOAuthConfig } from '@upvine/seo';
import type { SiteJobData } from '@upvine/shared';
import { SITE_JOBS } from '@upvine/shared';
import { RetryableJobError } from './site-jobs';
import type { JobDeps, JobRun } from './site-jobs';

/** İlk eşitlemede geriye dönük gün sayısı; sonrakilerde Search Console'un geç kesinleşen son günleri yenilenir. */
export const GSC_BACKFILL_DAYS = 90;
const GSC_REFRESH_DAYS = 10;
/** Yapay zekânın ürettiği soru sayısı (Bölüm 7.12: 10-20) */
export const VISIBILITY_QUESTION_COUNT = 12;
const EXCERPT_CHARS = 600;

const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export function googleConfig(env: JobDeps['env']): GoogleOAuthConfig | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: env.GOOGLE_GSC_REDIRECT_URI };
}

/**
 * Search Console eşitlemesi (Bölüm 7.11): günlük toplamlar + sayfa/sorgu kırılımı. İlk seferde 90 gün,
 * sonra son 10 gün (veri geç kesinleşir). Token iptal edildiyse kullanıcı yeniden bağlanmalı.
 */
export async function syncSearchConsole(deps: JobDeps, data: SiteJobData, run: JobRun, now = new Date()): Promise<void> {
  const { orgId, siteId } = data;
  const log = deps.logger.child({ job: 'site.gsc_sync', siteId });
  const conn = await gscConnectionsRepository.findForSite(orgId, siteId);
  if (!conn) return;
  const fail = (code: string) => gscConnectionsRepository.update(orgId, siteId, { syncStatus: 'failed', syncError: code });
  const cfg = googleConfig(deps.env);
  if (!conn.property) return void (await fail('no_property'));
  if (!cfg) return void (await fail('rejected'));
  await gscConnectionsRepository.update(orgId, siteId, { syncStatus: 'running', syncError: null });

  try {
    const { refreshToken } = decryptJson<{ refreshToken: string }>(
      { ciphertext: conn.ciphertext, iv: conn.iv, authTag: conn.authTag, keyVersion: conn.keyVersion },
      { [deps.env.ENCRYPTION_KEY_VERSION]: deps.env.ENCRYPTION_KEY },
    );
    const client = new SearchConsoleClient(deps.http, await refreshSearchConsoleToken(deps.http, cfg, refreshToken));
    const endDate = day(addDays(now, -1));
    const startDate = day(addDays(now, -(conn.lastSyncedAt ? GSC_REFRESH_DAYS : GSC_BACKFILL_DAYS)));

    const totals = await client.query(conn.property, { startDate, endDate, dimensions: ['date'] });
    const detail = await client.queryAll(conn.property, { startDate, endDate, dimensions: ['date', 'page', 'query'] });
    const rows: GscRowInput[] = [
      ...totals.map((r) => ({ date: r.keys[0]!, page: '', query: '', clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
      ...detail.map((r) => ({ date: r.keys[0]!, page: r.keys[1] ?? '', query: r.keys[2] ?? '', clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
    ];
    await gscMetricsRepository.upsertMany(orgId, siteId, rows);
    await gscConnectionsRepository.update(orgId, siteId, { syncStatus: 'done', syncError: null, lastSyncedAt: now });
    log.info({ days: totals.length, rows: detail.length, startDate, endDate }, 'search console synced');
  } catch (err) {
    if (err instanceof SearchConsoleError) {
      if (err.retryable && !run.finalAttempt) throw new RetryableJobError(err.code);
      log.warn({ err }, 'search console sync failed');
      return void (await fail(err.code));
    }
    throw err;
  }
}

/** Karşılaştırma için: küçük harf, aksansız, Türkçe İ/ı dahil. */
export function foldText(text: string): string {
  return text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Cevapta marka anıldı mı: marka adı ya da alan adı geçiyor mu. Alan adının uzantısız kökü (ör.
 * "coskunzeytincilik") sadece 8+ harfse aranır: "klinik" gibi kısa kökler sıradan kelimedir.
 * Kaynaklarda alan adı varsa "alıntılandı".
 */
export function detectMention(answer: string, sources: Source[], brand: { names: string[]; domain: string }): { mentioned: boolean; cited: boolean; citedUrls: string[] } {
  const host = brand.domain.toLowerCase().replace(/^www\./, '');
  const root = host.split('.')[0] ?? '';
  const needles = [...brand.names, host, ...(root.length >= 8 ? [root] : [])].map(foldText).filter((n) => n.length >= 3);
  const text = foldText(answer);
  const mentioned = needles.some((n) => new RegExp(`(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(text));
  // Grounding kaynak adresleri yönlendirme adresidir; başlık alan adını taşır.
  const citedUrls = sources.filter((s) => foldText(`${s.title} ${s.url}`).includes(host)).map((s) => s.title || s.url);
  return { mentioned: mentioned || citedUrls.length > 0, cited: citedUrls.length > 0, citedUrls };
}

function excerpt(answer: string, names: string[]): string {
  const folded = foldText(answer);
  const hit = names.map((n) => folded.indexOf(foldText(n))).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  const start = hit === undefined ? 0 : Math.max(0, hit - EXCERPT_CHARS / 3);
  const text = answer.slice(start, start + EXCERPT_CHARS).trim();
  return `${start > 0 ? '…' : ''}${text}${start + EXCERPT_CHARS < answer.length ? '…' : ''}`;
}

function aiCode(err: unknown): string {
  if (err instanceof AIError) {
    if (err.code === 'not_configured' || err.code === 'rejected' || err.code === 'not_implemented') return 'ai_not_configured';
    if (err.code === 'budget_exceeded') return 'ai_budget';
    if (err.code === 'rate_limited' || err.code === 'unavailable') return 'ai_unavailable';
  }
  return 'internal';
}

/**
 * AI görünürlük turu (Bölüm 7.12): soru yoksa önce üretilir; her soru Google Search ile (grounding)
 * sorulur, kota yoksa modelin kendi bilgisiyle (`grounded: false`). Cevapta marka anıldı mı kaydedilir.
 */
export async function runVisibility(deps: JobDeps, data: SiteJobData, run: JobRun): Promise<void> {
  const { orgId, siteId } = data;
  const log = deps.logger.child({ job: 'site.ai_visibility', siteId });
  const site = await sitesRepository.findById(orgId, siteId);
  if (!site) return;
  const fail = (code: string) => sitesRepository.update(orgId, siteId, { visibilityStatus: 'failed', visibilityError: code });
  if (!deps.ai.configured) return void (await fail('ai_not_configured'));
  await sitesRepository.update(orgId, siteId, { visibilityStatus: 'running', visibilityError: null });

  const brand = await brandProfilesRepository.findForSite(orgId, siteId);
  const brandName = brand?.brandName ?? site.name;
  const language = site.contentLanguage ?? 'en';
  const languageName = CONTENT_LANGUAGES.find((l) => l.code === language)?.englishName ?? 'English';

  let prompts = await visibilityRepository.listPrompts(orgId, siteId);
  if (prompts.length === 0) {
    try {
      const res = await deps.ai.generateStructured({
        operation: 'visibility.questions',
        system: visibilityQuestionsSystem,
        prompt: visibilityQuestionsPrompt({
          brandName,
          description: brand?.description ?? '',
          productsServices: brand?.productsServices ?? [],
          targetAudience: brand?.targetAudience ?? null,
          languageName,
          country: site.country,
          count: VISIBILITY_QUESTION_COUNT,
        }),
        schema: visibilityQuestionsOutputSchema,
        model: 'quality',
        temperature: 0.6,
      });
      const unique = [...new Set(res.data.questions.map((q) => q.trim()))].slice(0, VISIBILITY_QUESTION_COUNT);
      prompts = await visibilityRepository.addPrompts(orgId, siteId, unique.map((question) => ({ question, language, source: 'ai' as const })));
    } catch (err) {
      if (err instanceof AIError && err.retryable && !run.finalAttempt) throw new RetryableJobError(err.code);
      log.warn({ err }, 'visibility questions failed');
      return void (await fail(aiCode(err)));
    }
  }

  const runId = newId();
  const names = [brandName, ...(site.name !== brandName ? [site.name] : [])];
  const checks: Parameters<typeof visibilityRepository.addChecks>[2] = [];
  let lastError: unknown = null;
  for (const prompt of prompts) {
    const question = visibilityAnswerPrompt({ question: prompt.question, languageName, country: site.country });
    let answer: { text: string; sources: Source[]; grounded: boolean; model: string } | null = null;
    try {
      const res = await deps.ai.generateGrounded({ operation: 'visibility.answer', prompt: question, model: 'fast' });
      answer = { ...res.data, grounded: true, model: res.model };
    } catch (err) {
      // Google Search kotası yok (ücretsiz katman): modelin kendi bilgisiyle cevap.
      if (!(err instanceof AIError) || err.code === 'budget_exceeded' || err.code === 'not_configured' || err.code === 'rejected') {
        lastError = err;
        if (err instanceof AIError && err.code === 'budget_exceeded') break;
      } else {
        try {
          const res = await deps.ai.generateText({ operation: 'visibility.answer_ungrounded', system: visibilityAnswerSystem, prompt: question, model: 'fast', temperature: 0.4 });
          answer = { text: res.data, sources: [], grounded: false, model: res.model };
        } catch (inner) {
          lastError = inner;
          if (inner instanceof AIError && inner.code === 'budget_exceeded') break;
        }
      }
    }
    if (!answer) continue;
    const found = detectMention(answer.text, answer.sources, { names, domain: site.domain });
    checks.push({
      promptId: prompt.id,
      runId,
      provider: deps.ai.id,
      model: answer.model,
      grounded: answer.grounded,
      ...found,
      answerExcerpt: excerpt(answer.text, [...names, site.domain]),
      checkedAt: new Date(),
    });
  }

  if (checks.length === 0) {
    if (lastError instanceof AIError && lastError.retryable && !run.finalAttempt) throw new RetryableJobError(lastError.code);
    return void (await fail(aiCode(lastError)));
  }
  await visibilityRepository.addChecks(orgId, siteId, checks);
  await sitesRepository.update(orgId, siteId, { visibilityStatus: 'done', visibilityError: null, visibilityCheckedAt: new Date() });
  log.info({ questions: prompts.length, answered: checks.length, mentioned: checks.filter((c) => c.mentioned).length, grounded: checks.some((c) => c.grounded) }, 'ai visibility checked');
}

/**
 * Sonuçlar zamanlayıcısı (dakikalık tick içinde): Search Console günde bir, AI görünürlük haftada bir.
 * İş kimliği gün/hafta başına tekil: aynı iş iki kez eklenmez.
 */
export async function resultsTick(enqueue: (name: 'gsc-sync' | 'ai-visibility', data: SiteJobData, jobId: string) => Promise<void>, now = new Date()): Promise<{ gsc: number; visibility: number }> {
  const today = day(now);

  const gsc = await gscConnectionsRepository.dueForSync(addDays(now, -1));
  for (const c of gsc) await enqueue(SITE_JOBS.gscSync, { orgId: c.organizationId, siteId: c.siteId }, `gsc-${c.siteId}-${today}`);
  const sites = await visibilityRepository.dueSites(addDays(now, -7));
  for (const s of sites) await enqueue(SITE_JOBS.visibility, { orgId: s.organizationId, siteId: s.id }, `visibility-${s.id}-${today}`);
  return { gsc: gsc.length, visibility: sites.length };
}

/**
 * Takvim doldurma (dakikalık tick içinde): kurulumu bitmiş sitede önümüzdeki 4 haftanın yayın sayısı
 * kadar konu yoksa eksik kadar konu önerilir ve takvimin sonuna yerleşir. Site başına günde en fazla bir kez.
 */
export async function planningTick(enqueue: (data: SiteJobData, jobId: string) => Promise<void>, now = new Date()): Promise<number> {
  const today = day(now);
  const sites = await sitesNeedingTopics(now);
  for (const s of sites) await enqueue({ orgId: s.orgId, siteId: s.siteId, count: s.needed }, `topics-auto-${s.siteId}-${today}`);
  return sites.length;
}
