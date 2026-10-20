import nodemailer from 'nodemailer';
import type { Env } from '@upvine/config/env';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** "Yanıtla" bu adrese gider (ör. iletişim formunu gönderen kişi) */
  replyTo?: string;
}

/** E-posta gönderim sağlayıcısı arayüzü (SMTP, Resend veya testlerde bellek). */
export interface Mailer {
  send(email: OutgoingEmail): Promise<void>;
}

export function createSmtpMailer(env: Env): Mailer {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } : undefined,
  });
  return {
    async send(email) {
      await transport.sendMail({ from: env.EMAIL_FROM, ...email });
    },
  };
}

/** "Kitisel <no-reply@kitisel.com>" → { name, email } */
export function parseAddress(value: string): { name?: string; email: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
  if (!match) return { email: value.trim() };
  const name = match[1]?.trim();
  return { ...(name ? { name } : {}), email: match[2]!.trim() };
}

/** API'li servis hata döndürürse: durum kodu ve gövdenin başı (anahtar loglanmaz) */
async function ensureOk(provider: string, res: Response): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => '');
  throw new Error(`${provider} e-posta gönderemedi: HTTP ${res.status} ${body.slice(0, 300)}`);
}

/**
 * Resend (HTTPS API): https://resend.com/docs/api-reference/emails/send-email
 * SMTP portları kapalı sunucularda çalışır (443).
 */
export function createResendMailer(env: Env, fetchImpl: typeof fetch = fetch): Mailer {
  if (!env.RESEND_API_KEY) throw new Error('EMAIL_PROVIDER=resend için RESEND_API_KEY gerekli');
  const key = env.RESEND_API_KEY;
  return {
    async send(email) {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
          ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(20_000),
      });
      await ensureOk('Resend', res);
    },
  };
}

/**
 * Brevo (HTTPS API): https://developers.brevo.com/reference/sendtransacemail
 * SMTP portları kapalı sunucularda çalışır (443).
 */
export function createBrevoMailer(env: Env, fetchImpl: typeof fetch = fetch): Mailer {
  if (!env.BREVO_API_KEY) throw new Error('EMAIL_PROVIDER=brevo için BREVO_API_KEY gerekli');
  const key = env.BREVO_API_KEY;
  const sender = parseAddress(env.EMAIL_FROM);
  return {
    async send(email) {
      const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender,
          to: [{ email: email.to }],
          subject: email.subject,
          htmlContent: email.html,
          textContent: email.text,
          ...(email.replyTo ? { replyTo: { email: email.replyTo } } : {}),
        }),
        signal: AbortSignal.timeout(20_000),
      });
      await ensureOk('Brevo', res);
    },
  };
}

export function createMailer(env: Env, fetchImpl: typeof fetch = fetch): Mailer {
  if (env.EMAIL_PROVIDER === 'resend') return createResendMailer(env, fetchImpl);
  if (env.EMAIL_PROVIDER === 'brevo') return createBrevoMailer(env, fetchImpl);
  return createSmtpMailer(env);
}

/** Testler için: gönderilen e-postaları bellekte tutar. */
export class MemoryMailer implements Mailer {
  readonly sent: OutgoingEmail[] = [];
  async send(email: OutgoingEmail): Promise<void> {
    this.sent.push(email);
  }
  last(): OutgoingEmail | undefined {
    return this.sent.at(-1);
  }
  clear(): void {
    this.sent.length = 0;
  }
}
