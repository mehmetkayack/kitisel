import type { Locale } from '@upvine/config';
import {
  auditLogsRepository,
  emailVerificationsRepository,
  membershipsRepository,
  newId,
  organizationsRepository,
  passwordResetsRepository,
  refreshTokensRepository,
  UniqueConstraintError,
  usersRepository,
} from '@upvine/db';
import type { Transaction, User } from '@upvine/db';
import { renderResetPassword, renderVerifyEmail } from '@upvine/email';
import type { LoginInput, Me, ResetPasswordInput, SignupInput } from '@upvine/shared';
import type { AppDeps } from '../../deps';
import { randomToken, sha256 } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { buildMe, userLocale } from '../me/me.service';
import { signAccessToken } from './access-token';
import { exchangeGoogleCode, googleConfig } from './google';
import type { GoogleProfile } from './google';
import { orgSlug } from './org-slug';
import { burnPasswordCheck, hashPassword, verifyPassword } from './password';

const VERIFY_TTL_HOURS = 48;
const RESET_TTL_HOURS = 1;
const HOUR = 3_600_000;

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  locale: Locale;
}

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: Me;
}

export type AuthService = ReturnType<typeof createAuthService>;

export function createAuthService(deps: AppDeps) {
  const { env, sequelize, mailer, logger } = deps;

  async function issueSession(
    userId: string,
    meta: RequestMeta,
    familyId: string = newId(),
    t?: Transaction,
  ): Promise<IssuedSession & { refreshTokenId: string }> {
    const refreshToken = randomToken(32);
    const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * HOUR);
    const row = await refreshTokensRepository.create(
      {
        userId,
        tokenHash: sha256(refreshToken),
        familyId,
        expiresAt: refreshExpiresAt,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
        ip: meta.ip,
      },
      t,
    );
    return {
      accessToken: await signAccessToken(env, userId),
      expiresIn: env.JWT_ACCESS_TTL_SECONDS,
      refreshToken,
      refreshExpiresAt,
      refreshTokenId: row.id,
      user: await buildMe(userId, t),
    };
  }

  /** Kullanıcıyı ve ona ait ilk organizasyonu (owner) tek transaction'da oluşturur. */
  async function createUserWithOrg(
    data: {
      email: string;
      name: string;
      passwordHash: string | null;
      locale: Locale;
      googleId?: string;
      emailVerifiedAt?: Date;
    },
    t: Transaction,
  ): Promise<User> {
    const user = await usersRepository.create(data, t);
    const org = await organizationsRepository.create(
      { name: data.name, slug: orgSlug(data.name), defaultLocale: data.locale },
      t,
    );
    await membershipsRepository.create({ orgId: org.id, userId: user.id, role: 'owner' }, t);
    return user;
  }

  async function sendVerificationEmail(user: User): Promise<void> {
    const token = randomToken(32);
    await emailVerificationsRepository.invalidateAllForUser(user.id);
    await emailVerificationsRepository.create({
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + VERIFY_TTL_HOURS * HOUR),
    });
    const locale = userLocale(user);
    const url = `${env.WEB_URL}/${locale}/verify-email?token=${encodeURIComponent(token)}`;
    const email = await renderVerifyEmail(locale, { name: user.name, url, ttl: VERIFY_TTL_HOURS });
    try {
      await mailer.send({ to: user.email, ...email });
    } catch (err) {
      // E-posta hatası kaydı engellemez; kullanıcı panelden yeniden gönderebilir.
      logger.error({ err, userId: user.id }, 'verification email failed');
    }
  }

  return {
    async signup(input: SignupInput, meta: RequestMeta): Promise<IssuedSession> {
      const existing = await usersRepository.findByEmail(input.email);
      if (existing) throw new AppError('email_taken');
      const passwordHash = await hashPassword(input.password);
      const locale = input.locale ?? meta.locale;

      let user: User;
      try {
        user = await sequelize.transaction((t) =>
          createUserWithOrg({ email: input.email, name: input.name, passwordHash, locale }, t),
        );
      } catch (err) {
        if (err instanceof UniqueConstraintError) throw new AppError('email_taken');
        throw err;
      }

      await auditLogsRepository.record({ action: 'auth.signup', userId: user.id, ...metaLog(meta) });
      await sendVerificationEmail(user);
      return issueSession(user.id, meta);
    },

    async login(input: LoginInput, meta: RequestMeta): Promise<IssuedSession> {
      const user = await usersRepository.findByEmail(input.email);
      if (!user?.passwordHash) {
        await burnPasswordCheck(input.password);
        throw new AppError('invalid_credentials');
      }
      if (!(await verifyPassword(user.passwordHash, input.password))) {
        await auditLogsRepository.record({ action: 'auth.login_failed', userId: user.id, ...metaLog(meta) });
        throw new AppError('invalid_credentials');
      }
      await usersRepository.update(user.id, { lastLoginAt: new Date() });
      await auditLogsRepository.record({ action: 'auth.login', userId: user.id, ...metaLog(meta) });
      return issueSession(user.id, meta);
    },

    /**
     * Refresh token rotasyonu. Daha önce kullanılmış (iptal edilmiş) bir token tekrar gelirse
     * bu çalınma belirtisidir: aynı ailedeki tüm token'lar iptal edilir.
     */
    async refresh(rawToken: string, meta: RequestMeta): Promise<IssuedSession> {
      const outcome = await sequelize.transaction(async (t) => {
        const current = await refreshTokensRepository.findByHash(sha256(rawToken), t);
        if (!current) return { kind: 'invalid' as const };
        if (current.revokedAt) {
          await refreshTokensRepository.revokeFamily(current.familyId, t);
          return { kind: 'reuse' as const, userId: current.userId };
        }
        if (current.expiresAt.getTime() <= Date.now()) return { kind: 'invalid' as const };
        const next = await issueSession(current.userId, meta, current.familyId, t);
        await refreshTokensRepository.markReplaced(current.id, next.refreshTokenId, t);
        return { kind: 'ok' as const, session: next };
      });

      if (outcome.kind === 'reuse') {
        await auditLogsRepository.record({
          action: 'auth.refresh_reuse_detected',
          userId: outcome.userId,
          ...metaLog(meta),
        });
        logger.warn({ userId: outcome.userId }, 'refresh token reuse detected; family revoked');
      }
      if (outcome.kind !== 'ok') throw new AppError('session_expired');
      return outcome.session;
    },

    async logout(rawToken: string | undefined): Promise<void> {
      if (!rawToken) return;
      const current = await refreshTokensRepository.findByHash(sha256(rawToken));
      if (current) await refreshTokensRepository.revokeFamily(current.familyId);
    },

    async verifyEmail(token: string): Promise<void> {
      await sequelize.transaction(async (t) => {
        const row = await emailVerificationsRepository.findValid(sha256(token), t);
        if (!row) throw new AppError('token_invalid');
        await emailVerificationsRepository.markUsed(row.id, t);
        await usersRepository.update(row.userId, { emailVerifiedAt: new Date() }, t);
      });
    },

    async resendVerification(userId: string): Promise<void> {
      const user = await usersRepository.findById(userId);
      if (!user) throw new AppError('unauthenticated');
      if (user.emailVerifiedAt) return;
      await sendVerificationEmail(user);
    },

    /** Kullanıcı var olsun olmasın aynı yanıt döner (e-posta adresi sızdırılmaz). */
    async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
      const user = await usersRepository.findByEmail(email);
      if (!user) return;
      const token = randomToken(32);
      await passwordResetsRepository.invalidateAllForUser(user.id);
      await passwordResetsRepository.create({
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_TTL_HOURS * HOUR),
      });
      const locale = userLocale(user);
      const url = `${env.WEB_URL}/${locale}/reset-password?token=${encodeURIComponent(token)}`;
      const rendered = await renderResetPassword(locale, { name: user.name, url, ttl: RESET_TTL_HOURS * 60 });
      await auditLogsRepository.record({ action: 'auth.password_reset_requested', userId: user.id, ...metaLog(meta) });
      try {
        await mailer.send({ to: user.email, ...rendered });
      } catch (err) {
        logger.error({ err, userId: user.id }, 'password reset email failed');
      }
    },

    /** Şifre değişince tüm oturumlar kapatılır. */
    async resetPassword(input: ResetPasswordInput, meta: RequestMeta): Promise<void> {
      const passwordHash = await hashPassword(input.password);
      const userId = await sequelize.transaction(async (t) => {
        const row = await passwordResetsRepository.findValid(sha256(input.token), t);
        if (!row) throw new AppError('token_invalid');
        await passwordResetsRepository.markUsed(row.id, t);
        // Sıfırlama linkine tıklamak e-posta sahipliğini de kanıtlar.
        const user = await usersRepository.findById(row.userId, t);
        await usersRepository.update(
          row.userId,
          { passwordHash, ...(user?.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }) },
          t,
        );
        await refreshTokensRepository.revokeAllForUser(row.userId, t);
        return row.userId;
      });
      await auditLogsRepository.record({ action: 'auth.password_reset', userId, ...metaLog(meta) });
    },

    googleConfigured(): boolean {
      return googleConfig(env) !== null;
    },

    /**
     * Google ile giriş/kayıt. Eşleştirme sırası: google_id > doğrulanmış e-posta (hesap bağlama) > yeni kullanıcı.
     * Doğrulanmamış Google e-postasıyla mevcut hesaba bağlanılmaz (hesap ele geçirme riski).
     */
    async googleCallback(code: string, codeVerifier: string, meta: RequestMeta): Promise<IssuedSession> {
      const cfg = googleConfig(env);
      if (!cfg) throw new AppError('google_not_configured');
      const profile: GoogleProfile = await exchangeGoogleCode(cfg, code, codeVerifier, deps.fetch);

      let user = await usersRepository.findByGoogleId(profile.googleId);
      if (!user) {
        const byEmail = await usersRepository.findByEmail(profile.email);
        if (byEmail) {
          if (!profile.emailVerified) throw new AppError('google_failed');
          await usersRepository.update(byEmail.id, {
            googleId: profile.googleId,
            ...(byEmail.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
          });
          user = byEmail;
          await auditLogsRepository.record({ action: 'auth.google_linked', userId: user.id, ...metaLog(meta) });
        } else {
          const name = profile.name ?? profile.email.split('@')[0] ?? profile.email;
          user = await sequelize.transaction((t) =>
            createUserWithOrg(
              {
                email: profile.email,
                name,
                passwordHash: null,
                locale: meta.locale,
                googleId: profile.googleId,
                ...(profile.emailVerified ? { emailVerifiedAt: new Date() } : {}),
              },
              t,
            ),
          );
          await auditLogsRepository.record({ action: 'auth.signup_google', userId: user.id, ...metaLog(meta) });
        }
      }
      await usersRepository.update(user.id, { lastLoginAt: new Date() });
      await auditLogsRepository.record({ action: 'auth.login_google', userId: user.id, ...metaLog(meta) });
      return issueSession(user.id, meta);
    },
  };
}

function metaLog(meta: RequestMeta) {
  return { ip: meta.ip, userAgent: meta.userAgent };
}
