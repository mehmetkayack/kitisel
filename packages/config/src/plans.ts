/**
 * Paketler ve kotalar (Bölüm 7.15). Kredi sistemi yoktur; her pakette sabit kotalar vardır.
 * iyzico fiyatlandırma planı referansları Faz 3'te `pnpm billing:setup` ile veritabanına yazılır.
 */
export const PLAN_CODES = ['starter', 'growth', 'agency'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];
export type BillingInterval = 'monthly' | 'yearly';

export interface PlanDefinition {
  code: PlanCode;
  /** USD, DECIMAL olarak saklanır; burada sent cinsinden tutulur */
  priceCents: Record<BillingInterval, number>;
  currency: 'USD';
  sites: number;
  articlesPerMonth: number;
  refreshesPerMonth: number;
  trackedKeywords: number;
  /** null = sınırsız */
  contentLanguages: number | null;
  teamMembers: number;
  aiVisibility: boolean;
  serpTracking: 'none' | 'weekly' | 'daily';
  whiteLabelReports: boolean;
}

export const PLANS: Record<PlanCode, PlanDefinition> = {
  starter: {
    code: 'starter',
    priceCents: { monthly: 2900, yearly: 29000 },
    currency: 'USD',
    sites: 1,
    articlesPerMonth: 10,
    refreshesPerMonth: 3,
    trackedKeywords: 50,
    contentLanguages: 1,
    teamMembers: 1,
    aiVisibility: false,
    serpTracking: 'none',
    whiteLabelReports: false,
  },
  growth: {
    code: 'growth',
    priceCents: { monthly: 7900, yearly: 79000 },
    currency: 'USD',
    sites: 1,
    articlesPerMonth: 30,
    refreshesPerMonth: 10,
    trackedKeywords: 200,
    contentLanguages: 3,
    teamMembers: 3,
    aiVisibility: true,
    serpTracking: 'weekly',
    whiteLabelReports: false,
  },
  agency: {
    code: 'agency',
    priceCents: { monthly: 19900, yearly: 199000 },
    currency: 'USD',
    sites: 5,
    articlesPerMonth: 100,
    refreshesPerMonth: 40,
    trackedKeywords: 1000,
    contentLanguages: null,
    teamMembers: 10,
    aiVisibility: true,
    serpTracking: 'daily',
    whiteLabelReports: true,
  },
};

export const TRIAL = { days: 7, articles: 3, reminderDaysBefore: 3 } as const;
export const REFUND_WINDOW_DAYS = 14;
/**
 * Yapay zekâ maliyetini sınırlamak için yazı başına: baştan yeniden üretim (ilk üretim hariç) ve editörde
 * bölüm yeniden yazımı. İkisi de aylık yazı hakkı tüketmez.
 */
export const REGENERATIONS_PER_ARTICLE = 3;
export const SECTION_REWRITES_PER_ARTICLE = 20;

/**
 * Aylık yeni makale hakkı. Paket seçilmemişse (ödeme adımı henüz yok) deneme hakkı geçerlidir.
 * `override`: geliştirme/test için `ARTICLE_QUOTA_OVERRIDE`.
 */
export function monthlyArticleLimit(plan: string | null, override?: number): number {
  if (override) return override;
  if (plan && plan in PLANS) return PLANS[plan as PlanCode].articlesPerMonth;
  return TRIAL.articles;
}

/** Kota dönemi: takvim ayının başı (UTC). Abonelik dönemi Faz 3'te iyzico'dan gelecek. */
export function quotaPeriodStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Organizasyonun özellikleri. Paket seçilmemişse (deneme; ödeme adımı henüz yok) Growth özellikleri
 * geçerlidir: AI görünürlük ve 200 takip edilen anahtar kelime denenebilsin.
 */
export function planFeatures(plan: string | null): PlanDefinition {
  if (plan && plan in PLANS) return PLANS[plan as PlanCode];
  return PLANS.growth;
}

export const PLAN_SOURCES = ['trial', 'paid', 'complimentary'] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];

/** Organizasyonun paket hakları (admin panelinden ödemesiz paket ve özel makale hakkı verilebilir). */
export interface OrgEntitlement {
  plan: string | null;
  planSource?: string | null;
  /** Aylık makale hakkı (paketinkini geçersiz kılar); null = paketin hakkı */
  articleQuotaOverride?: number | null;
  /** Ödemesiz paketin bitişi; null = süresiz */
  entitlementExpiresAt?: Date | null;
}

/** Ödemesiz paketin süresi dolduysa haklar denemeye döner (paket ve özel hak birlikte). */
export function entitlementActive(org: OrgEntitlement | null, now: Date = new Date()): boolean {
  if (!org) return false;
  if (org.planSource !== 'complimentary') return true;
  return !org.entitlementExpiresAt || org.entitlementExpiresAt.getTime() > now.getTime();
}

/** Geçerli paket kodu (deneme: null). */
export function effectivePlan(org: OrgEntitlement | null, now: Date = new Date()): PlanCode | null {
  if (!org?.plan || !(org.plan in PLANS) || !entitlementActive(org, now)) return null;
  return org.plan as PlanCode;
}

/**
 * Aylık makale hakkı: admin'in organizasyona verdiği özel hak > geliştirme ayarı (`ARTICLE_QUOTA_OVERRIDE`)
 * > paket > deneme. Organizasyona özel karar, genel geliştirme ayarından önce gelir.
 */
export function orgArticleLimit(org: OrgEntitlement | null, envOverride?: number, now: Date = new Date()): number {
  if (org?.articleQuotaOverride != null && entitlementActive(org, now)) return org.articleQuotaOverride;
  if (envOverride) return envOverride;
  return monthlyArticleLimit(effectivePlan(org, now));
}

/** Özellikler (AI görünürlük, takip edilen kelime...). */
export function orgFeatures(org: OrgEntitlement | null, now: Date = new Date()): PlanDefinition {
  return planFeatures(effectivePlan(org, now));
}

/** Site sınırı: deneme 1 site, paketlerde pakete göre. */
export function orgSiteLimit(org: OrgEntitlement | null, now: Date = new Date()): number {
  const plan = effectivePlan(org, now);
  return plan ? PLANS[plan].sites : 1;
}
