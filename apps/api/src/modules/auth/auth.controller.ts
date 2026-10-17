import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { isLocale } from '@upvine/config';
import type { AuthResponse, ForgotPasswordInput, LoginInput, ResetPasswordInput, SignupInput } from '@upvine/shared';
import { AUTH_COOKIES } from '@upvine/shared';
import type { AppDeps } from '../../deps';
import { safeEqual } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import type { AuthService, IssuedSession, RequestMeta } from './auth.service';
import { clearOAuthCookie, clearSessionCookies, setOAuthCookie, setSessionCookies } from './cookies';
import type { OAuthCookie } from './cookies';
import { createGoogleAuthorization, googleConfig } from './google';

/** Controller'lar sadece HTTP ile ilgilenir: girdi okur, servisi çağırır, yanıt yazar. */
export function createAuthController(deps: AppDeps, service: AuthService) {
  const { env } = deps;

  const meta = (req: Request): RequestMeta => ({
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
    locale: req.locale,
  });

  const cookie = (req: Request, name: string): string | undefined =>
    (req.cookies as Record<string, string | undefined>)[name];

  const respondWithSession = (res: Response, session: IssuedSession, status = 200) => {
    setSessionCookies(res, env, session.refreshToken, session.refreshExpiresAt);
    const body: AuthResponse = {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
    };
    res.status(status).json(body);
  };

  const loginErrorRedirect = (res: Response, locale: string, code: string) =>
    res.redirect(`${env.WEB_URL}/${locale}/login?error=${code}`);

  const handlers = {
    signup: (async (req, res) => {
      respondWithSession(res, await service.signup(req.body as SignupInput, meta(req)), 201);
    }) satisfies RequestHandler,

    login: (async (req, res) => {
      respondWithSession(res, await service.login(req.body as LoginInput, meta(req)));
    }) satisfies RequestHandler,

    refresh: (async (req, res) => {
      const token = cookie(req, AUTH_COOKIES.refresh);
      if (!token) throw new AppError('session_expired');
      try {
        respondWithSession(res, await service.refresh(token, meta(req)));
      } catch (err) {
        clearSessionCookies(res, env);
        throw err;
      }
    }) satisfies RequestHandler,

    logout: (async (req, res) => {
      await service.logout(cookie(req, AUTH_COOKIES.refresh));
      clearSessionCookies(res, env);
      res.status(204).end();
    }) satisfies RequestHandler,

    verifyEmail: (async (req, res) => {
      await service.verifyEmail((req.body as { token: string }).token);
      res.status(204).end();
    }) satisfies RequestHandler,

    resendVerification: (async (req, res) => {
      await service.resendVerification(req.auth!.userId);
      res.status(204).end();
    }) satisfies RequestHandler,

    forgotPassword: (async (req, res) => {
      await service.forgotPassword((req.body as ForgotPasswordInput).email, meta(req));
      res.status(204).end();
    }) satisfies RequestHandler,

    resetPassword: (async (req, res) => {
      await service.resetPassword(req.body as ResetPasswordInput, meta(req));
      clearSessionCookies(res, env);
      res.status(204).end();
    }) satisfies RequestHandler,

    googleStart: ((req, res) => {
      const cfg = googleConfig(env);
      if (!cfg) return loginErrorRedirect(res, req.locale, 'google_not_configured');
      const start = createGoogleAuthorization(cfg, req.locale);
      const value: OAuthCookie = { state: start.state, codeVerifier: start.codeVerifier, locale: req.locale };
      setOAuthCookie(res, env, value);
      res.redirect(start.url);
    }) satisfies RequestHandler,

    googleCallback: (async (req, res) => {
      const stored = parseOAuthCookie(cookie(req, AUTH_COOKIES.oauthState));
      clearOAuthCookie(res, env);
      const query = callbackQuery.safeParse(req.query);
      const locale = stored?.locale ?? req.locale;
      if (!stored || !query.success || !query.data.code || !safeEqual(query.data.state, stored.state)) {
        // Kullanıcı Google ekranında vazgeçtiyse de buraya düşer.
        return loginErrorRedirect(res, locale, 'google_failed');
      }
      try {
        // Google dönüşünde dil bilgisi yok: akış başlarken kaydedilen arayüz dili kullanılır.
        const flowLocale = isLocale(stored.locale) ? stored.locale : req.locale;
        const session = await service.googleCallback(query.data.code, stored.codeVerifier, { ...meta(req), locale: flowLocale });
        setSessionCookies(res, env, session.refreshToken, session.refreshExpiresAt);
        res.redirect(`${env.WEB_URL}/app`);
      } catch (err) {
        req.log.warn({ err }, 'google callback failed');
        const code = err instanceof AppError ? err.code : 'google_failed';
        loginErrorRedirect(res, locale, code);
      }
    }) satisfies RequestHandler,
  };
  return handlers;
}

const callbackQuery = z.object({
  state: z.string().max(200),
  code: z.string().max(2000).optional(),
  error: z.string().max(200).optional(),
});

const oauthCookieSchema = z.object({
  state: z.string(),
  codeVerifier: z.string(),
  locale: z.string(),
});

function parseOAuthCookie(raw: string | undefined): OAuthCookie | null {
  if (!raw) return null;
  try {
    const parsed = oauthCookieSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
