import type { CookieOptions, Response } from 'express';
import type { Env } from '@upvine/config/env';
import { AUTH_COOKIES } from '@upvine/shared';
import { randomToken } from '../../lib/crypto';

/** Refresh token sadece auth uç noktalarına gönderilir. */
const REFRESH_PATH = '/api/v1/auth';
const OAUTH_PATH = '/api/v1/auth/google';

function base(env: Env): CookieOptions {
  return { secure: env.COOKIE_SECURE, sameSite: 'strict' };
}

export function setSessionCookies(res: Response, env: Env, refreshToken: string, expiresAt: Date): void {
  res.cookie(AUTH_COOKIES.refresh, refreshToken, {
    ...base(env),
    httpOnly: true,
    path: REFRESH_PATH,
    expires: expiresAt,
  });
  // Double-submit CSRF token: JavaScript okuyup başlığa koyar.
  res.cookie(AUTH_COOKIES.csrf, randomToken(24), {
    ...base(env),
    httpOnly: false,
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookies(res: Response, env: Env): void {
  res.clearCookie(AUTH_COOKIES.refresh, { ...base(env), httpOnly: true, path: REFRESH_PATH });
  res.clearCookie(AUTH_COOKIES.csrf, { ...base(env), path: '/' });
}

export interface OAuthCookie {
  state: string;
  codeVerifier: string;
  locale: string;
}

/**
 * Google'dan dönüş siteler arası bir yönlendirme olduğundan bu çerez SameSite=Lax olmalı
 * (Strict çerez o istekte gönderilmez). Kısa ömürlü ve sadece callback yolunda geçerli.
 */
export function setOAuthCookie(res: Response, env: Env, value: OAuthCookie): void {
  res.cookie(AUTH_COOKIES.oauthState, JSON.stringify(value), {
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    httpOnly: true,
    path: OAUTH_PATH,
    maxAge: 10 * 60_000,
  });
}

export function clearOAuthCookie(res: Response, env: Env): void {
  res.clearCookie(AUTH_COOKIES.oauthState, {
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    httpOnly: true,
    path: OAUTH_PATH,
  });
}
