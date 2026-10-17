import i18next from 'i18next';
import type { i18n as I18n, TFunction } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, LOCALES } from '@upvine/config';
import type { Locale } from '@upvine/config';
import { NAMESPACES, resources } from '@upvine/locales';

function create(locale: Locale): I18n {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    lng: locale,
    resources,
    supportedLngs: [...LOCALES],
    fallbackLng: DEFAULT_LOCALE,
    ns: [...NAMESPACES],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    initAsync: false,
  });
  return instance;
}

const clientInstances = new Map<Locale, I18n>();

/**
 * Sunucuda her istek için yeni örnek (eşzamanlı istekler birbirinin dilini değiştirmesin);
 * tarayıcıda dil başına bir örnek. Dil değişince sağlayıcıya başka örnek verilir: render sırasında
 * `changeLanguage` çağrılmaz (diğer bileşenlerde "setState in render" uyarısına yol açıyordu).
 * Tüm çeviriler pakete gömülü olduğu için senkron.
 */
export function getI18n(locale: Locale): I18n {
  if (typeof document === 'undefined') return create(locale);
  let instance = clientInstances.get(locale);
  if (!instance) {
    instance = create(locale);
    clientInstances.set(locale, instance);
  }
  return instance;
}

const metaInstances = new Map<Locale, I18n>();

/** React dışı kullanım (meta fonksiyonları): sabit dilli çeviri fonksiyonu. */
export function fixedT(locale: Locale, ns: (typeof NAMESPACES)[number] = 'common'): TFunction {
  let instance = metaInstances.get(locale);
  if (!instance) {
    instance = create(locale);
    metaInstances.set(locale, instance);
  }
  return instance.getFixedT(locale, ns);
}
