import type { Env } from '@upvine/config/env';
import { contactMessagesRepository } from '@upvine/db';
import { renderContactNotification } from '@upvine/email';
import type { Mailer } from '@upvine/email';
import type { ContactMessageInput } from '@upvine/shared';
import { sha256 } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import type { Logger } from '../../lib/logger';

export interface ContactDeps {
  env: Env;
  logger: Logger;
  fetch: typeof fetch;
  mailer: Mailer;
}

/** reCAPTCHA v3'te formun eylem adı (istemci `grecaptcha.execute` ile aynısını gönderir) */
export const RECAPTCHA_ACTION = 'contact';

interface SiteVerifyResponse {
  success?: boolean;
  score?: number;
  action?: string;
  'error-codes'?: string[];
}

export function createContactService(deps: ContactDeps) {
  const { env, logger } = deps;

  /**
   * Google reCAPTCHA v3: token doğrulanır, eylem adı ve puan kontrol edilir. Gizli anahtar yoksa
   * geliştirmede atlanır (puan boş), production'da gönderim reddedilir (form korumasız çalışmaz).
   */
  async function verifyRecaptcha(token: string | undefined, ip: string | undefined): Promise<number | null> {
    if (!env.RECAPTCHA_SECRET_KEY) {
      if (env.NODE_ENV === 'production') {
        logger.error('RECAPTCHA_SECRET_KEY tanımlı değil: iletişim formu gönderimi reddedildi');
        throw new AppError('captcha_failed');
      }
      return null;
    }
    if (!token) throw new AppError('captcha_failed');
    const body = new URLSearchParams({ secret: env.RECAPTCHA_SECRET_KEY, response: token, ...(ip ? { remoteip: ip } : {}) });
    let data: SiteVerifyResponse;
    try {
      const res = await deps.fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body });
      data = (await res.json()) as SiteVerifyResponse;
    } catch (err) {
      logger.warn({ err }, 'reCAPTCHA doğrulaması yapılamadı');
      throw new AppError('captcha_failed');
    }
    if (!data.success || data.action !== RECAPTCHA_ACTION) {
      logger.info({ errors: data['error-codes'], action: data.action }, 'reCAPTCHA token geçersiz');
      throw new AppError('captcha_failed');
    }
    const score = typeof data.score === 'number' ? data.score : 0;
    if (score < env.RECAPTCHA_MIN_SCORE) throw new AppError('captcha_low_score');
    return score;
  }

  /**
   * Yöneticiye bildirim e-postası. Gönderilemezse mesaj yine kayıtlıdır (admin panelinde görünür);
   * hata sadece loglanır, ziyaretçiye hata gösterilmez.
   */
  async function notify(input: ContactMessageInput, id: string): Promise<void> {
    const to = env.CONTACT_NOTIFY_EMAIL ?? env.LEGAL_EMAIL;
    if (!to) {
      logger.info('CONTACT_NOTIFY_EMAIL ve LEGAL_EMAIL boş: iletişim bildirimi gönderilmedi');
      return;
    }
    try {
      const email = await renderContactNotification(env.CONTACT_NOTIFY_LOCALE, {
        name: input.name,
        email: input.email,
        phone: input.phone,
        company: input.company,
        message: input.message,
        url: `${env.WEB_URL}/admin/messages/${id}`,
      });
      await deps.mailer.send({ to, replyTo: input.email, ...email });
    } catch (err) {
      logger.error({ err, id }, 'iletişim bildirimi gönderilemedi');
    }
  }

  return {
    async submit(input: ContactMessageInput, meta: { ip?: string; userAgent?: string }): Promise<void> {
      const score = await verifyRecaptcha(input.recaptchaToken, meta.ip);
      const saved = await contactMessagesRepository.create({
        name: input.name,
        email: input.email,
        phone: input.phone,
        company: input.company,
        message: input.message,
        locale: input.locale,
        recaptchaScore: score,
        // IP ham saklanmaz (GDPR/KVKK); kötüye kullanım incelemesi için anahtarlı hash
        ipHash: meta.ip ? sha256(`${meta.ip}:${env.JWT_ACCESS_SECRET}`) : null,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
      });
      await notify(input, saved.id);
    },
  };
}
