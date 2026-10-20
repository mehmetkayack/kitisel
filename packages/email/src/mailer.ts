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

export function createMailer(env: Env): Mailer {
  if (env.EMAIL_PROVIDER === 'resend') {
    // Resend entegrasyonu canlıya geçişte (Faz 7) dokümantasyon kontrol edilerek eklenecek.
    throw new Error('EMAIL_PROVIDER=resend henüz desteklenmiyor; şimdilik smtp kullanın');
  }
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
