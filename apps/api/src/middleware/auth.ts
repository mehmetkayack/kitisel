import type { RequestHandler } from 'express';
import type { Env } from '@upvine/config/env';
import { usersRepository } from '@upvine/db';
import { AppError } from '../lib/errors';
import { verifyAccessToken } from '../modules/auth/access-token';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * `Authorization: Bearer <accessToken>` zorunlu kılar ve `req.auth` doldurur.
 * Admin "kullanıcının gözünden görüntüleme" token'ları salt okunurdur: veri değiştiren istekler reddedilir.
 */
export function requireAuth(env: Env): RequestHandler {
  return async (req, _res, next) => {
    const header = req.get('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const claims = token ? await verifyAccessToken(env, token) : null;
    if (!claims) throw new AppError('unauthenticated');
    if (claims.actorId && !READ_METHODS.has(req.method)) throw new AppError('impersonation_read_only');
    req.auth = { userId: claims.userId, actorId: claims.actorId };
    next();
  };
}

/** Sadece superadmin. Yetki her istekte veritabanından okunur (token'a güvenilmez). */
export const requireSuperadmin: RequestHandler = async (req, _res, next) => {
  if (!req.auth || req.auth.actorId) throw new AppError('forbidden');
  const user = await usersRepository.findById(req.auth.userId);
  if (!user?.isSuperadmin) throw new AppError('forbidden');
  next();
};
