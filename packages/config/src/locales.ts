/** Arayüz dilleri (Bölüm 2). İçerik üretim dilleri ayrıdır: bkz. content-languages.ts */
export const LOCALES = ['en', 'de', 'es', 'fr', 'tr'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Dil seçicide gösterilen ad her zaman dilin kendi adıdır (çevrilmez). */
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  tr: 'Türkçe',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Accept-Language başlığından desteklenen en uygun dili seçer.
 * Örn. "de-CH,de;q=0.9,en;q=0.8" -> "de"
 */
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { base: tag.toLowerCase().split('-')[0] ?? '', q: q ? Number(q.split('=')[1]) : 1 };
    })
    .filter((x) => x.base && !Number.isNaN(x.q))
    .sort((a, b) => b.q - a.q);
  return ranked.map((x) => x.base).find(isLocale) ?? DEFAULT_LOCALE;
}
