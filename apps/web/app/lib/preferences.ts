import { isLocale, LOCALES, pickLocale } from '@upvine/config';
import type { Locale } from '@upvine/config';
import { PREF_COOKIES } from '@upvine/shared';

export type ThemePreference = 'system' | 'light' | 'dark';
export const THEMES: ThemePreference[] = ['system', 'light', 'dark'];

export function isTheme(v: unknown): v is ThemePreference {
  return v === 'system' || v === 'light' || v === 'dark';
}

export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // bozuk çerez değeri yok sayılır
    }
  }
  return out;
}

/** Sunucu: istekten dil (çerez > Accept-Language) ve tema çerezini okur. */
export function preferencesFromRequest(request: Request): { locale: Locale; theme: ThemePreference } {
  const cookies = parseCookies(request.headers.get('cookie'));
  const cookieLocale = cookies[PREF_COOKIES.locale];
  const theme = cookies[PREF_COOKIES.theme];
  return {
    locale: isLocale(cookieLocale) ? cookieLocale : pickLocale(request.headers.get('accept-language')),
    theme: isTheme(theme) ? theme : 'system',
  };
}

const ONE_YEAR = 60 * 60 * 24 * 365;

function writeCookie(name: string, value: string): void {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`;
}

/** Tarayıcı: kullanıcının dil seçimini saklar (SSR bir sonraki istekte doğru dille render eder). */
export function storeLocale(locale: Locale): void {
  writeCookie(PREF_COOKIES.locale, locale);
}

/** Tarayıcı: temayı anında uygular ve saklar. "system" -> öznitelik kaldırılır, CSS sistem ayarına uyar. */
export function applyTheme(theme: ThemePreference): void {
  writeCookie(PREF_COOKIES.theme, theme);
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/** Tarayıcı: çerezdeki ya da tarayıcının dil tercihi */
export function clientLocale(): Locale {
  const fromCookie = parseCookies(document.cookie)[PREF_COOKIES.locale];
  if (isLocale(fromCookie)) return fromCookie;
  return pickLocale(navigator.languages.join(','));
}

/** "/de/login?x=1" -> "/fr/login?x=1" */
export function swapLocaleInPath(pathname: string, locale: Locale): string {
  const parts = pathname.split('/');
  if (isLocale(parts[1])) parts[1] = locale;
  else parts.splice(1, 0, locale);
  return parts.join('/') || `/${locale}`;
}

export { LOCALES };
