/** Kuyruk ve iş adları (API ekler, worker işler). */
export const QUEUES = { siteAnalysis: 'site-analysis', content: 'content', freeAnalysis: 'free-analysis', assist: 'assist' } as const;
export const SITE_JOBS = { analyze: 'analyze', topics: 'topics', syncPosts: 'sync-posts', gscSync: 'gsc-sync', visibility: 'ai-visibility' } as const;
export type SiteJobName = (typeof SITE_JOBS)[keyof typeof SITE_JOBS];

export interface SiteJobData {
  orgId: string;
  siteId: string;
  /** Konu önerisi: kaç konu (zamanlayıcı takvimdeki eksik kadar ister) */
  count?: number;
}

/** Varsayılan deneme politikası (Bölüm 4.4: üstel geri çekilme, en fazla 5 deneme) */
export const SITE_JOB_OPTIONS = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 15_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
} as const;

export const CONTENT_JOBS = { generate: 'generate', publish: 'publish', tick: 'tick' } as const;
export type ContentJobName = (typeof CONTENT_JOBS)[keyof typeof CONTENT_JOBS];

export interface ContentJobData {
  orgId: string;
  contentItemId: string;
}

/** Editör yardımcısı (kısa, etkileşimli işler): makale üretiminin arkasında beklemez. */
export const ASSIST_JOBS = { rewrite: 'rewrite', refresh: 'refresh' } as const;
export type AssistJobName = (typeof ASSIST_JOBS)[keyof typeof ASSIST_JOBS];

export interface AssistJobData {
  orgId: string;
  rewriteId: string;
}

/** İçerik yenileme önerisi (`assist` kuyruğu, `refresh`): mevcut bir yazının güncellenmiş hâli. */
export interface RefreshJobData {
  orgId: string;
  refreshId: string;
}

export const ASSIST_JOB_OPTIONS = {
  attempts: 2,
  backoff: { type: 'fixed', delay: 5_000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 24 * 3600 },
} as const;

export interface FreeAnalysisJobData {
  id: string;
}

/** Makale üretimi pahalı: daha az deneme, daha uzun bekleme. Yayın: geçici hatalarda 5 deneme. */
export const GENERATE_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 60_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
} as const;

export const PUBLISH_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
} as const;

export const FREE_ANALYSIS_JOB_OPTIONS = {
  attempts: 2,
  backoff: { type: 'fixed', delay: 10_000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 24 * 3600 },
} as const;
