import i18next from 'i18next';
import type { TFunction } from 'i18next';
import { DEFAULT_LOCALE, LOCALES } from '@upvine/config';
import type { Locale } from '@upvine/config';
import { resources } from '@upvine/locales';

/** Sunucu tarafı çeviri: hata mesajları ve e-postalar (Bölüm 2). */
const instance = i18next.createInstance();
await instance.init({
  resources,
  supportedLngs: [...LOCALES],
  fallbackLng: DEFAULT_LOCALE,
  ns: ['errors', 'email', 'common'],
  defaultNS: 'errors',
  interpolation: { escapeValue: false },
  initAsync: false,
});

export function tFor(locale: Locale, ns: 'errors' | 'email' | 'common' = 'errors'): TFunction {
  return instance.getFixedT(locale, ns);
}
