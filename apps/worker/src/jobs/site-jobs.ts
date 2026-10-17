import {
  AIError,
  brandProfileOutputSchema,
  brandProfilePrompt,
  brandProfileSystem,
  topicsOutputSchema,
  topicsPromptV2,
  topicsSystem,
} from '@upvine/ai';
import type { AIProvider, BrandProfileOutput } from '@upvine/ai';
import { CONTENT_LANGUAGES, isCountryCode } from '@upvine/config';
import type { Env } from '@upvine/config/env';
import {
  brandProfilesRepository,
  contentItemsRepository,
  existingPagesRepository,
  mysqlVectorStore,
  cleanTitle,
  normalizeTerm,
  siteAuditsRepository,
  siteTitleSuffixes,
  sitesRepository,
} from '@upvine/db';
import { CrawlError, crawlSite, heuristicBrand, runChecks } from '@upvine/seo';
import type { CrawlPhase, CrawlResult, HttpClient } from '@upvine/seo';
import { defaultPublishDays, planPublishDates } from '@upvine/shared';
import type { SiteJobData } from '@upvine/shared';
import type { KeywordProvider } from '@upvine/keywords';
import type { Logger } from 'pino';
import { embedPages, embedTexts, isSemanticDuplicate, keywordMetrics, metricsFor } from './semantic';

export interface JobDeps {
  env: Env;
  ai: AIProvider;
  http: HttpClient;
  logger: Logger;
  /** Gerçek arama hacmi/zorluk (DataForSEO). Yoksa yapay zekâ tahmini "tahmini" etiketiyle. */
  keywords?: KeywordProvider;
}

export interface JobRun {
  /** Son deneme mi? (değilse geçici hatada iş yeniden denenir, durum "çalışıyor" kalır) */
  finalAttempt: boolean;
}

/** Kuyruğun yeniden denemesini istemek için fırlatılır. */
export class RetryableJobError extends Error {
  override name = 'RetryableJobError';
}

/** Taramada bulunan sayfa bu uzunluktaysa yazı sayılır (kategori/ürün sayfaları genelde kısa) */
const POST_MIN_WORDS = 500;

const LANGUAGE_CODES = new Set<string>(CONTENT_LANGUAGES.map((l) => l.code));

/** `pt-BR` → `pt`, `zh-cn` → `zh-CN`: içerik dili listesindeki koda eşler. */
export function matchContentLanguage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  const exact = CONTENT_LANGUAGES.find((l) => l.code.toLowerCase() === value.toLowerCase());
  if (exact) return exact.code;
  const base = value.split(/[-_]/)[0]!.toLowerCase();
  if (LANGUAGE_CODES.has(base)) return base;
  return CONTENT_LANGUAGES.find((l) => l.code.toLowerCase().startsWith(`${base}-`))?.code ?? null;
}

/** Göreli görsel adresini sayfaya göre tam adrese çevirir; geçersizse null. */
export function absoluteUrl(value: string | null, base: string): string | null {
  if (!value) return null;
  try {
    const u = new URL(value, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function brandInput(crawl: CrawlResult) {
  // Prompt'u kısa tutmak için ana sayfa + en çok metin içeren birkaç sayfa.
  const others = crawl.pages
    .filter((p) => p !== crawl.homepage)
    .sort((a, b) => b.wordCount - a.wordCount)
    .slice(0, 4);
  return {
    url: crawl.finalUrl,
    htmlLang: crawl.homepage.lang,
    pages: [crawl.homepage, ...others].map((p, i) => ({
      url: p.url,
      title: p.title,
      description: p.description,
      headings: p.headings,
      text: p.text.slice(0, i === 0 ? 3000 : 1200),
    })),
  };
}

/**
 * Site analizi (Bölüm 7.1 adım 2, 7.2): tarama → 25 kontrol → sayfa listesi → marka profili.
 * Yapay zekâ yoksa veya başarısızsa marka özeti taramadan çıkarılır; analiz yine tamamlanır.
 */
export async function analyzeSite(deps: JobDeps, data: SiteJobData, run: JobRun): Promise<void> {
  const { orgId, siteId } = data;
  const log = deps.logger.child({ job: 'site.analyze', siteId });
  const site = await sitesRepository.findById(orgId, siteId);
  if (!site) return;

  let lastPhase: string | null = null;
  const setPhase = async (phase: CrawlPhase | 'brand' | 'saving') => {
    if (phase === lastPhase) return;
    lastPhase = phase;
    await sitesRepository.update(orgId, siteId, { analysisStatus: 'running', analysisPhase: phase });
  };
  await setPhase('homepage');

  let crawl: CrawlResult;
  try {
    crawl = await crawlSite(site.url, {
      client: deps.http,
      userAgent: deps.env.CRAWLER_USER_AGENT,
      maxPages: deps.env.CRAWLER_MAX_PAGES,
      onProgress: (e) => void setPhase(e.phase).catch(() => {}),
    });
  } catch (err) {
    const reason = err instanceof CrawlError ? err.reason : 'internal';
    log.warn({ err, reason }, 'crawl failed');
    // Site kapalıysa birkaç dakika sonra tekrar denemek anlamlı; engellenen/HTML olmayan adreste değil.
    if (!run.finalAttempt && (reason === 'unreachable' || reason === 'internal')) throw new RetryableJobError(reason);
    await sitesRepository.update(orgId, siteId, { analysisStatus: 'failed', analysisPhase: null, analysisError: reason });
    return;
  }

  await setPhase('saving');
  const auditResult = runChecks(crawl);
  await siteAuditsRepository.create(orgId, siteId, auditResult);
  await existingPagesRepository.upsertMany(
    orgId,
    siteId,
    crawl.pages.map((p) => ({
      url: p.url,
      title: p.title,
      h1: p.h1[0] ?? null,
      description: p.description,
      statusCode: p.status,
      wordCount: p.wordCount,
      imageUrl: absoluteUrl(p.og.image, p.url),
    })),
  );

  await setPhase('brand');
  let profile: BrandProfileOutput | null = null;
  if (deps.ai.configured) {
    try {
      const res = await deps.ai.generateStructured({
        operation: 'site.brand_profile',
        system: brandProfileSystem,
        prompt: brandProfilePrompt(brandInput(crawl)),
        schema: brandProfileOutputSchema,
        model: 'quality',
        temperature: 0.3,
      });
      profile = res.data;
    } catch (err) {
      // Geçici hata: önce yeniden dene; son denemede yapay zekâsız özete düş.
      if (err instanceof AIError && err.retryable && !run.finalAttempt) throw new RetryableJobError(err.code);
      log.warn({ err }, 'brand profile AI failed, using heuristic');
    }
  }

  const fallback = heuristicBrand(crawl, site.domain);
  const existing = await brandProfilesRepository.findForSite(orgId, siteId);
  // Kullanıcının düzenlediği profil yeniden analizde ezilmez.
  if (!existing || existing.source !== 'user') {
    await brandProfilesRepository.upsert(orgId, siteId, {
      brandName: profile?.brandName ?? fallback.brandName,
      description: profile?.description ?? fallback.description,
      industry: profile?.industry || null,
      productsServices: profile?.productsServices ?? [],
      targetAudience: profile?.targetAudience || null,
      tone: profile?.suggestedTone ?? 'professional',
      source: profile ? 'ai' : 'heuristic',
    });
  }

  const language = matchContentLanguage(profile?.contentLanguage) ?? matchContentLanguage(fallback.contentLanguage);
  const country = profile?.country?.toUpperCase();
  await sitesRepository.update(orgId, siteId, {
    analysisStatus: 'done',
    analysisPhase: null,
    analysisError: null,
    analyzedAt: new Date(),
    ...(site.name === site.domain ? { name: (profile?.brandName ?? fallback.brandName).slice(0, 200) } : {}),
    ...(!site.contentLanguage && language ? { contentLanguage: language } : {}),
    ...(!site.country && country && isCountryCode(country) ? { country } : {}),
  });
  // Konu tekrarı ve iç linkler için sayfa vektörleri (isteğe bağlı; başarısızsa kelime benzerliği)
  const embedded = await embedPages(deps, orgId, siteId, log).catch(() => 0);
  log.info({ score: auditResult.score, pages: auditResult.pagesCrawled, ai: !!profile, embedded }, 'site analyzed');
}

const words = (s: string) => new Set(s.toLocaleLowerCase().replace(/i\u0307/g, 'i').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));

/** Kelime kümesi benzerliği (Jaccard): embedding yoksa (yapay zekâsız, elle eklenen konu) yedek kontrol. */
export function isDuplicateTopic(candidate: string, existing: string[], threshold = 0.6): boolean {
  const a = words(candidate);
  if (a.size === 0) return false;
  return existing.some((title) => {
    const b = words(title);
    if (b.size === 0) return false;
    const inter = [...a].filter((w) => b.has(w)).length;
    return inter / (a.size + b.size - inter) >= threshold;
  });
}

function topicsErrorCode(err: unknown): string {
  if (err instanceof AIError) {
    if (err.code === 'not_configured' || err.code === 'not_implemented') return 'ai_not_configured';
    if (err.code === 'budget_exceeded') return 'ai_budget';
    return 'ai_unavailable';
  }
  return 'internal';
}

/** İlk konu önerileri (Bölüm 7.1 adım 5): marka profili + mevcut sayfalar → 10 konu. */
export async function generateTopics(deps: JobDeps, data: SiteJobData, run: JobRun, defaultCount = 10): Promise<void> {
  const { orgId, siteId } = data;
  const count = Math.min(20, Math.max(1, data.count ?? defaultCount));
  const log = deps.logger.child({ job: 'site.topics', siteId });
  const site = await sitesRepository.findById(orgId, siteId);
  if (!site) return;
  await sitesRepository.update(orgId, siteId, { topicsStatus: 'running', topicsError: null, topicsStartedAt: new Date() });

  const brand = await brandProfilesRepository.findForSite(orgId, siteId);
  const pages = await existingPagesRepository.list(orgId, siteId);
  const existingTitles = pages.flatMap((p) => [p.title, p.h1]).filter((t): t is string => !!t);
  // Modele gösterilen başlıklar: site eki atılmış; yazılar (CMS ya da uzun sayfa) ayrı ve öncelikli
  const suffixes = siteTitleSuffixes(pages.map((p) => p.title));
  const label = (p: (typeof pages)[number]) => cleanTitle(p.h1 ?? p.title ?? '', suffixes);
  const isPost = (p: (typeof pages)[number]) => p.source === 'cms' || p.wordCount >= POST_MIN_WORDS;
  const planned = await contentItemsRepository.listForSite(orgId, siteId);
  const knownTerms = await contentItemsRepository.keywordTerms(orgId, siteId);
  const language = site.contentLanguage ?? 'en';
  const languageName = CONTENT_LANGUAGES.find((l) => l.code === language)?.englishName ?? 'English';

  try {
    const res = await deps.ai.generateStructured({
      operation: 'site.topics',
      system: topicsSystem,
      prompt: topicsPromptV2({
        brandName: brand?.brandName ?? site.name,
        description: brand?.description ?? '',
        productsServices: brand?.productsServices ?? [],
        targetAudience: brand?.targetAudience ?? '',
        languageName,
        country: site.country,
        existingPosts: [...new Set([...pages.filter(isPost).map(label), ...planned.map((p) => p.title)].filter(Boolean))],
        otherPages: [...new Set(pages.filter((p) => !isPost(p)).map(label).filter(Boolean))],
        excludeKeywords: knownTerms,
        count,
      }),
      schema: topicsOutputSchema,
      model: 'quality',
      temperature: 0.7,
    });

    const known = new Set(knownTerms.map((t) => normalizeTerm(t, language)));
    const titles = [...existingTitles, ...planned.map((p) => p.title)];
    // Anlamsal tekrar (Bölüm 7.3): mevcut sayfa ve konu vektörleriyle cosine ≥ 0,85 → eklenmez.
    await embedPages(deps, orgId, siteId, log).catch(() => 0);
    const vectors: Parameters<typeof isSemanticDuplicate>[1] = await mysqlVectorStore.siteVectors(orgId, siteId);
    const candidates = await embedTexts(deps, 'site.topic_embeddings', res.data.topics.map((t) => `${t.title} — ${t.keyword}`), log);
    // Gerçek arama hacmi ve zorluk (DataForSEO varsa); yoksa yapay zekâ tahmini.
    const metrics = await keywordMetrics(deps, res.data.topics.map((t) => t.keyword), { language, country: site.country }, log);
    let position = planned.length;
    let added = 0;
    for (const [i, topic] of res.data.topics.entries()) {
      const term = normalizeTerm(topic.keyword, language);
      const vector = candidates?.[i] ?? null;
      if (known.has(term) || isDuplicateTopic(topic.title, titles) || isSemanticDuplicate(vector, vectors)) continue;
      known.add(term);
      titles.push(topic.title);
      if (vector) vectors.push({ vector, kind: 'topic' });
      const real = metricsFor(metrics, topic.keyword, language);
      const item = await contentItemsRepository.createTopic(orgId, siteId, {
        title: topic.title,
        term,
        language,
        country: site.country,
        searchVolume: real?.searchVolume ?? topic.searchVolume,
        difficulty: real?.difficulty ?? topic.difficulty,
        intent: real?.intent ?? topic.intent,
        cpc: real?.cpc ?? null,
        source: real ? 'dataforseo' : 'estimated',
        position: position++,
      });
      if (vector) await mysqlVectorStore.setTopicVector(orgId, item.id, vector);
      if (++added >= count) break;
    }
    // Kurulumdan sonra eklenen konular takvimin sonuna yerleşir (kurulumda tarih sihirbazın sonunda atanır).
    const scheduled = site.onboardingCompletedAt
      ? await contentItemsRepository.scheduleUnplanned(orgId, siteId, (n, after) =>
          planPublishDates({ count: n, days: site.publishDays ?? defaultPublishDays(site.postsPerWeek), time: site.publishTime, timeZone: site.timezone, after }),
        )
      : 0;
    await sitesRepository.update(orgId, siteId, { topicsStatus: 'done', topicsError: null, topicsStartedAt: new Date() });
    log.info({ suggested: res.data.topics.length, added, scheduled }, 'topics generated');
  } catch (err) {
    if (err instanceof AIError && err.retryable && !run.finalAttempt) throw new RetryableJobError(err.code);
    log.warn({ err }, 'topic generation failed');
    await sitesRepository.update(orgId, siteId, { topicsStatus: 'failed', topicsError: topicsErrorCode(err) });
  }
}
