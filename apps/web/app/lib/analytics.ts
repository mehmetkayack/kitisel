import { PREF_COOKIES } from '@upvine/shared';

/**
 * Google Analytics 4 (sadece halka açık site). KVKK/GDPR: ziyaretçi "Kabul et" demeden gtag.js hiç
 * yüklenmez; reddedilirse yüklenmez, sonradan reddedilirse ölçüm durur ve GA çerezleri silinir.
 * Ölçüm kimliği sunucuda `GA_MEASUREMENT_ID`'den gelir (koda gömülmez).
 */

export type Consent = 'granted' | 'denied';

/** Onay 6 ay geçerli; sonra yeniden sorulur */
const CONSENT_MAX_AGE = 180 * 24 * 3600;

export const MEASUREMENT_ID = /^G-[A-Z0-9]{4,20}$/;

/** Bandı yeniden açmak için (alt bilgideki "Çerez tercihleri") */
export const OPEN_CONSENT_EVENT = 'kitisel:open-consent';

export function readConsent(cookie: string): Consent | null {
  const match = new RegExp(`(?:^|;\\s*)${PREF_COOKIES.consent}=(granted|denied)(?:;|$)`).exec(cookie);
  return (match?.[1] as Consent | undefined) ?? null;
}

export function consentCookie(value: Consent, secure: boolean): string {
  return `${PREF_COOKIES.consent}=${value}; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
}

interface GtagWindow {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
}

let loadedId: string | null = null;

/** gtag.js'i bir kez yükler. Sayfa görüntülemeleri `trackPageView` ile (istemci tarafı gezinmede de). */
export function loadAnalytics(id: string): void {
  if (loadedId || !MEASUREMENT_ID.test(id)) return;
  loadedId = id;
  const w = window as unknown as GtagWindow;
  w.dataLayer = w.dataLayer ?? [];
  // gtag.js `arguments` nesnesini bekler (Google'ın resmi parçacığıyla aynı)
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  w.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  w.gtag('js', new Date());
  w.gtag('config', id, { send_page_view: false });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

export function trackPageView(path: string): void {
  const w = window as unknown as GtagWindow;
  if (!loadedId || !w.gtag) return;
  w.gtag('event', 'page_view', { page_path: path, page_location: window.location.href, page_title: document.title });
}

/** Onay geri alındı: ölçüm durur, GA çerezleri (_ga, _ga_*) silinir. */
export function revokeAnalytics(): void {
  const w = window as unknown as GtagWindow;
  w.gtag?.('consent', 'update', { analytics_storage: 'denied' });
  loadedId = null;
  const host = window.location.hostname;
  const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`];
  for (const name of document.cookie.split(';').map((c) => c.split('=')[0]!.trim())) {
    if (name !== '_ga' && !name.startsWith('_ga_')) continue;
    for (const d of domains) document.cookie = `${name}=; Max-Age=0; Path=/${d ? `; Domain=${d}` : ''}`;
  }
}
