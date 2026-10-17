import type { RequestHandler } from 'express';
import { AUTH_COOKIES, CSRF_HEADER } from '@upvine/shared';
import { AppError } from '../lib/errors';
import { safeEqual } from '../lib/crypto';

/**
 * Double-submit CSRF koruması: refresh çerezi kullanan uç noktalarda (refresh, logout)
 * okunabilir CSRF çerezi ile başlık aynı olmalıdır. SameSite=Strict'e ek savunma katmanı.
 */
export const requireCsrf: RequestHandler = (req, _res, next) => {
  const cookies = req.cookies as Record<string, string | undefined>;
  const cookie = cookies[AUTH_COOKIES.csrf];
  const header = req.get(CSRF_HEADER);
  if (!cookie || !header || !safeEqual(cookie, header)) throw new AppError('csrf_invalid');
  next();
};
