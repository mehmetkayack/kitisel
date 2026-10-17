import { z } from 'zod';

/** Sonuçlar sayfası (Bölüm 7.11, 7.12): Search Console, Genel Bakış, Anahtar Kelimeler, AI Görünürlük. */

/** Search Console eşitleme hataları (`locales/*\/sites.json > searchConsole.errors`). */
export const GSC_SYNC_ERRORS = ['revoked', 'forbidden', 'unavailable', 'rejected', 'no_property', 'stalled', 'internal'] as const;
/** AI görünürlük hataları (`locales/*\/sites.json > visibility.errors`). */
export const VISIBILITY_ERRORS = ['ai_not_configured', 'ai_budget', 'ai_unavailable', 'stalled', 'internal'] as const;

export const gscPropertySchema = z.object({ property: z.string().trim().min(1, 'validation.required').max(512) });
export type GscPropertyInput = z.infer<typeof gscPropertySchema>;

export const visibilityQuestionSchema = z.object({ question: z.string().trim().min(8, 'validation.questionMin').max(300, 'validation.tooLong') });
export type VisibilityQuestionInput = z.infer<typeof visibilityQuestionSchema>;

/** Site başına en fazla soru (Bölüm 7.12: 10-20) */
export const MAX_VISIBILITY_QUESTIONS = 20;

export type JobStatusDto = 'idle' | 'running' | 'done' | 'failed';

export interface SearchConsoleDto {
  /** Google OAuth istemcisi `.env`'de tanımlı mı */
  configured: boolean;
  connection: {
    googleEmail: string | null;
    /** Seçilen mülk; null ise kullanıcı listeden seçmeli */
    property: string | null;
    properties: string[];
    syncStatus: JobStatusDto;
    syncError: string | null;
    lastSyncedAt: string | null;
    /** En son veri günü (Search Console 2-3 gün geriden gelir) */
    latestDataDate: string | null;
  } | null;
}

export interface MetricChangeDto {
  value: number;
  /** Önceki dönem (yoksa null) */
  previous: number | null;
}

export interface KeywordWinDto {
  query: string;
  page: string | null;
  from: number;
  to: number;
}

export interface OverviewDto {
  content: { publishedThisMonth: number; publishedTotal: number; scheduled: number; inReview: number; averageSeoScore: number | null };
  auditScore: number | null;
  /** Search Console bağlı ve verisi varsa: son 28 gün, önceki 28 günle */
  gsc: {
    from: string;
    to: string;
    clicks: MetricChangeDto;
    impressions: MetricChangeDto;
    /** Gösterimle ağırlıklı ortalama sıra (küçük = iyi) */
    position: MetricChangeDto;
    /** İlk 10'daki sorgu sayısı */
    top10: MetricChangeDto;
    daily: { date: string; clicks: number; impressions: number }[];
    wins: KeywordWinDto[];
  } | null;
  visibility: { rate: number | null; checkedAt: string | null };
}

export interface KeywordRowDto {
  keyword: string;
  /** Konu planında var mı (bizim hedeflediğimiz) */
  planned: boolean;
  searchVolume: number | null;
  difficulty: number | null;
  source: 'dataforseo' | 'estimated' | 'user' | 'gsc';
  clicks: number | null;
  impressions: number | null;
  position: number | null;
  previousPosition: number | null;
  page: string | null;
}

export interface KeywordsDto {
  gscConnected: boolean;
  from: string | null;
  to: string | null;
  rows: KeywordRowDto[];
  /** Paketteki takip sınırı */
  limit: number;
}

export interface VisibilityCheckDto {
  mentioned: boolean;
  cited: boolean;
  /** Google Search ile mi cevaplandı (yoksa modelin kendi bilgisi) */
  grounded: boolean;
  checkedAt: string;
  answerExcerpt: string;
  citedUrls: string[];
}

export interface VisibilityPromptDto {
  id: string;
  question: string;
  source: 'ai' | 'user';
  latest: VisibilityCheckDto | null;
}

export interface VisibilityDto {
  /** Paket AI görünürlüğü içeriyor mu (Starter'da yok) */
  available: boolean;
  aiAvailable: boolean;
  status: JobStatusDto;
  error: string | null;
  checkedAt: string | null;
  /** Son turda markanın anıldığı soruların oranı (0-1) */
  mentionRate: number | null;
  runs: { checkedAt: string; total: number; mentioned: number; grounded: boolean }[];
  prompts: VisibilityPromptDto[];
}
