import type { RequestHandler } from 'express';
import { isLocale, pickLocale } from '@upvine/config';
import { PREF_COOKIES } from '@upvine/shared';

/** Web istemcisinin o anki arayüz dilini bildirdiği başlık */
export const LOCALE_HEADER = 'x-locale';

/**
 * Dil sırası: istemcinin bildirdiği arayüz dili > dil çerezi > Accept-Language > varsayılan.
 * Giriş yapmış kullanıcıya giden e-postalarda servisler profil dilini kullanır.
 */
export const localeMiddleware: RequestHandler = (req, _res, next) => {
  const fromHeader = req.get(LOCALE_HEADER);
  const fromCookie = (req.cookies as Record<string, string | undefined>)[PREF_COOKIES.locale];
  req.locale = isLocale(fromHeader)
    ? fromHeader
    : isLocale(fromCookie)
      ? fromCookie
      : pickLocale(req.get('accept-language'));
  next();
};
