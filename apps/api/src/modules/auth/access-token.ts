import { jwtVerify, SignJWT } from 'jose';
import type { Env } from '@upvine/config/env';

const ISSUER = 'upvine-api';
const AUDIENCE = 'upvine-web';

function key(env: Env): Uint8Array {
  return new TextEncoder().encode(env.JWT_ACCESS_SECRET);
}

export interface AccessClaims {
  userId: string;
  /** Doluysa bu token bir superadmin'in "kullanıcının gözünden görüntüleme" token'ıdır (salt okunur). */
  actorId: string | null;
}

/** Kısa ömürlü (varsayılan 15 dk) access token. Sadece bellekte tutulur, çereze yazılmaz. */
export async function signAccessToken(
  env: Env,
  userId: string,
  opts: { actorId?: string; ttlSeconds?: number } = {},
): Promise<string> {
  return new SignJWT(opts.actorId ? { act: { sub: opts.actorId } } : {})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${opts.ttlSeconds ?? env.JWT_ACCESS_TTL_SECONDS}s`)
    .sign(key(env));
}

/** Geçerliyse kullanıcı ve (varsa) adına işlem yapan admin id'sini, değilse null döner. */
export async function verifyAccessToken(env: Env, token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(env), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string') return null;
    const act = payload.act as { sub?: unknown } | undefined;
    return { userId: payload.sub, actorId: typeof act?.sub === 'string' ? act.sub : null };
  } catch {
    return null;
  }
}
