import { createHash } from 'node:crypto';
import { decodeJwt } from 'jose';
import { z } from 'zod';
import type { Env } from '@upvine/config/env';
import { randomToken } from '../../lib/crypto';
import { AppError } from '../../lib/errors';

/**
 * Google OAuth 2.0 / OpenID Connect, authorization code + PKCE + state.
 * Uç noktalar Google'ın discovery dokümanındaki değerlerdir:
 * https://accounts.google.com/.well-known/openid-configuration
 */
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function googleConfig(env: Env): GoogleConfig | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  };
}

export interface OAuthStart {
  url: string;
  state: string;
  codeVerifier: string;
}

export function createGoogleAuthorization(cfg: GoogleConfig, uiLocale: string): OAuthStart {
  const state = randomToken(24);
  const codeVerifier = randomToken(48);
  const challenge = createHash('sha256').update(codeVerifier).digest('base64url');
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
    hl: uiLocale,
  });
  return { url: `${AUTH_ENDPOINT}?${params.toString()}`, state, codeVerifier };
}

const tokenResponseSchema = z.object({ id_token: z.string() });

const idTokenSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  sub: z.string().min(1),
  email: z.email(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  exp: z.number(),
});

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

/**
 * Yetkilendirme kodunu token ile değiştirir. ID token doğrudan Google'ın token uç noktasından
 * HTTPS ile alındığı için imza doğrulaması gerekmez (Google OIDC dokümanı); yine de
 * iss/aud/exp kontrol edilir.
 */
export async function exchangeGoogleCode(
  cfg: GoogleConfig,
  code: string,
  codeVerifier: string,
  fetchImpl: typeof fetch,
): Promise<GoogleProfile> {
  const res = await fetchImpl(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new AppError('google_failed');
  const tokens = tokenResponseSchema.safeParse(await res.json());
  if (!tokens.success) throw new AppError('google_failed');

  const claims = idTokenSchema.safeParse(decodeJwt(tokens.data.id_token));
  if (!claims.success) throw new AppError('google_failed');
  const c = claims.data;
  const audOk = Array.isArray(c.aud) ? c.aud.includes(cfg.clientId) : c.aud === cfg.clientId;
  if (!ISSUERS.includes(c.iss) || !audOk || c.exp * 1000 < Date.now()) {
    throw new AppError('google_failed');
  }
  return {
    googleId: c.sub,
    email: c.email.toLowerCase(),
    emailVerified: c.email_verified === true,
    name: c.name ?? null,
  };
}
