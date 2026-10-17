import i18next from 'i18next';
import type { TFunction } from 'i18next';
import { DEFAULT_LOCALE, LOCALES } from '@upvine/config';
import type { Locale } from '@upvine/config';
import { resources } from '@upvine/locales';

const instance = i18next.createInstance();
await instance.init({
  resources,
  supportedLngs: [...LOCALES],
  fallbackLng: DEFAULT_LOCALE,
  ns: ['email'],
  defaultNS: 'email',
  interpolation: { escapeValue: false },
  initAsync: false,
});

export function emailT(locale: Locale): TFunction<'email'> {
  return instance.getFixedT(locale, 'email');
}
