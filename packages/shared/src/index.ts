export * from './errors';
export * from './schemas/auth';
export * from './schemas/admin';
export * from './schemas/sites';
export * from './schemas/content';
export * from './schemas/results';
export * from './schemas/marketing';
export * from './schemas/billing';
export * from './site-url';
export * from './jobs';
export * from './schedule';

/** Kimlik doğrulama çerez ve başlık adları (API ve web aynı değerleri kullanır). */
export const AUTH_COOKIES = {
  refresh: 'upvine_rt',
  csrf: 'upvine_csrf',
  oauthState: 'upvine_oauth',
} as const;
export const CSRF_HEADER = 'x-csrf-token';

/** Kullanıcının dil ve tema seçimini saklayan çerezler (SSR'da flaşsız uygulama için). */
export const PREF_COOKIES = { locale: 'upvine_locale', theme: 'upvine_theme', consent: 'upvine_consent' } as const;
