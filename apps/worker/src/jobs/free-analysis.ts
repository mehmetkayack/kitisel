import {
  AIError,
  brandProfileOutputSchema,
  brandProfilePrompt,
  brandProfileSystem,
  competitorsPrompt,
  competitorsSchema,
  extractJson,
  opportunitiesPrompt,
  opportunitiesSchema,
  opportunitiesSystem,
} from '@upvine/ai';
import type { BrandProfileOutput } from '@upvine/ai';
import { CONTENT_LANGUAGES } from '@upvine/config';
import { freeAnalysesRepository } from '@upvine/db';
import { CrawlError, crawlSite, heuristicBrand, runChecks } from '@upvine/seo';
import type { CrawlResult } from '@upvine/seo';
import type { FreeAnalysisJobData, FreeAnalysisResult } from '@upvine/shared';
import { keywordMetrics, metricsFor } from './semantic';
import { matchContentLanguage, RetryableJobError } from './site-jobs';
import type { JobDeps, JobRun } from './site-jobs';

const FREE_MAX_PAGES = 15;

function brandInput(crawl: CrawlResult) {
  const others = crawl.pages.filter((p) => p !== crawl.homepage).sort((a, b) => b.wordCount - a.wordCount).slice(0, 3);
  return {
    url: crawl.finalUrl,
    htmlLang: crawl.homepage.lang,
    pages: [crawl.homepage, ...others].map((p, i) => ({ url: p.url, title: p.title, description: p.description, headings: p.headings, text: p.text.slice(0, i === 0 ? 2500 : 1000) })),
  };
}

/**
 * Ücretsiz analiz (Bölüm 7.2): tarama + 25 kontrol + marka özeti + 10 anahtar kelime fırsatı + konu
 * kümeleri + 3 organik rakip. Yapay zekâ adımları başarısız olursa rapor teknik bölümlerle tamamlanır.
 */
export async function runFreeAnalysis(deps: JobDeps, data: FreeAnalysisJobData, run: JobRun): Promise<void> {
  const log = deps.logger.child({ job: 'free.analyze', id: data.id });
  const fa = await freeAnalysesRepository.findById(data.id);
  if (!fa || fa.status === 'done') return;

  let lastPhase = '';
  const phase = async (p: string) => {
    if (p === lastPhase) return;
    lastPhase = p;
    await freeAnalysesRepository.update(fa.id, { status: 'running', phase: p });
  };
  await phase('homepage');

  let crawl: CrawlResult;
  try {
    crawl = await crawlSite(fa.url, {
      client: deps.http,
      userAgent: deps.env.CRAWLER_USER_AGENT,
      maxPages: Math.min(FREE_MAX_PAGES, deps.env.CRAWLER_MAX_PAGES),
      onProgress: (e) => void phase(e.phase).catch(() => {}),
    });
  } catch (err) {
    const reason = err instanceof CrawlError ? err.reason : 'internal';
    if (!run.finalAttempt && (reason === 'unreachable' || reason === 'internal')) throw new RetryableJobError(reason);
    await freeAnalysesRepository.update(fa.id, { status: 'failed', phase: null, error: reason });
    return;
  }

  await phase('saving');
  const audit = runChecks(crawl);
  const titleCounts = new Map<string, number>();
  for (const p of crawl.pages) if (p.title) titleCounts.set(p.title.toLowerCase(), (titleCounts.get(p.title.toLowerCase()) ?? 0) + 1);
  const fallback = heuristicBrand(crawl, fa.domain);

  const result: FreeAnalysisResult = {
    url: crawl.finalUrl,
    domain: fa.domain,
    score: audit.score,
    pagesCrawled: audit.pagesCrawled,
    checks: audit.checks,
    pages: crawl.pages.map((p) => ({ url: p.url, title: p.title, duplicateTitle: !!p.title && (titleCounts.get(p.title.toLowerCase()) ?? 0) > 1 })),
    brand: { name: fallback.brandName, description: fallback.description, industry: null, products: [] },
    keywords: [],
    clusters: [],
    competitors: [],
    aiAvailable: deps.ai.configured,
  };
  // Teknik rapor hazır: yapay zekâ adımları sürerken de gösterilebilir.
  await freeAnalysesRepository.update(fa.id, { result });

  if (deps.ai.configured) {
    let brand: BrandProfileOutput | null = null;
    try {
      await phase('brand');
      brand = (
        await deps.ai.generateStructured({
          operation: 'free.brand',
          system: brandProfileSystem,
          prompt: brandProfilePrompt(brandInput(crawl)),
          schema: brandProfileOutputSchema,
          model: 'fast',
          temperature: 0.3,
        })
      ).data;
      result.brand = { name: brand.brandName, description: brand.description, industry: brand.industry || null, products: brand.productsServices };
    } catch (err) {
      log.warn({ err }, 'free brand failed');
    }

    const language = matchContentLanguage(brand?.contentLanguage) ?? matchContentLanguage(fallback.contentLanguage) ?? 'en';
    const languageName = CONTENT_LANGUAGES.find((l) => l.code === language)?.englishName ?? 'English';
    const uiLanguageName = CONTENT_LANGUAGES.find((l) => l.code === fa.locale)?.englishName ?? 'English';

    try {
      await phase('keywords');
      const opp = await deps.ai.generateStructured({
        operation: 'free.keywords',
        system: opportunitiesSystem,
        prompt: opportunitiesPrompt({
          url: crawl.finalUrl,
          brandName: result.brand?.name ?? fa.domain,
          description: result.brand?.description ?? '',
          products: result.brand?.products ?? [],
          languageName,
          existingTitles: crawl.pages.map((p) => p.title ?? '').filter(Boolean),
        }),
        schema: opportunitiesSchema,
        model: 'quality',
        temperature: 0.5,
      });
      const keywords = opp.data.keywords.slice(0, 10);
      const metrics = await keywordMetrics(deps, keywords.map((k) => k.keyword), { language, country: brand?.country?.toUpperCase() || null }, log);
      result.keywords = keywords.map((k) => {
        const real = metricsFor(metrics, k.keyword, language);
        return real && real.searchVolume !== null
          ? { ...k, searchVolume: real.searchVolume, difficulty: real.difficulty ?? k.difficulty, intent: real.intent ?? k.intent, source: 'dataforseo' as const }
          : { ...k, source: 'estimated' as const };
      });
      result.clusters = opp.data.clusters;
    } catch (err) {
      log.warn({ err }, 'free keywords failed');
    }

    try {
      await phase('competitors');
      const res = await deps.ai.generateGrounded({
        operation: 'free.competitors',
        prompt: competitorsPrompt({
          url: crawl.finalUrl,
          brandName: result.brand?.name ?? fa.domain,
          description: result.brand?.description ?? '',
          country: brand?.country || null,
          languageName: uiLanguageName,
        }),
        model: 'quality',
      });
      const parsed = competitorsSchema.safeParse(extractJson(res.data.text));
      if (parsed.success) {
        const own = fa.domain.replace(/^www\./, '');
        result.competitors = parsed.data
          .map((c) => ({ ...c, domain: c.domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') }))
          .filter((c) => c.domain && c.domain !== own)
          .slice(0, 3);
      }
    } catch (err) {
      // Bütçe/limit: rapor bu bölüm olmadan tamamlanır (bir sonraki ücretsiz analizde denenir).
      if (!(err instanceof AIError)) log.warn({ err }, 'free competitors failed');
      else log.info({ code: err.code }, 'free competitors skipped');
    }
  }

  await freeAnalysesRepository.update(fa.id, { status: 'done', phase: null, error: null, result });
  log.info({ score: result.score, keywords: result.keywords.length, competitors: result.competitors.length }, 'free analysis done');
}
