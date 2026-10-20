/** @jsxRuntime automatic */
/** @jsxImportSource react */
// tsx (API dev) JSX ayarını tsconfig'ten almıyor; çalışma modu dosyada sabitlendi.
import { render } from 'react-email';
import type { Locale } from '@upvine/config';
import { emailT } from './i18n';
import { ActionEmail } from './templates/action-email';

export type { Mailer, OutgoingEmail } from './mailer';
export { createBrevoMailer, createMailer, createResendMailer, createSmtpMailer, MemoryMailer, parseAddress } from './mailer';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

type ActionTemplate = 'verifyEmail' | 'resetPassword' | 'articleReady' | 'freeAnalysis';

async function renderAction(
  template: ActionTemplate,
  locale: Locale,
  vars: { name?: string; url: string } & Record<string, string | number | undefined>,
): Promise<RenderedEmail> {
  const t = emailT(locale);
  const k = (key: string) => t(`${template}.${key}`, vars);
  const element = (
    <ActionEmail
      lang={locale}
      preview={k('preview')}
      heading={k('heading')}
      paragraphs={[vars.name ? t('greeting', vars) : t('greetingPlain'), k('body'), k('expires')]}
      buttonLabel={k('button')}
      buttonUrl={vars.url}
      fallbackLabel={t('fallbackLink')}
      footer={k('ignore')}
    />
  );
  return {
    subject: k('subject'),
    html: await render(element),
    text: await render(element, { plainText: true }),
  };
}

/** E-posta doğrulama (5 dil) */
export function renderVerifyEmail(locale: Locale, vars: { name: string; url: string; ttl: number }) {
  return renderAction('verifyEmail', locale, vars);
}

/** Şifre sıfırlama (5 dil) */
export function renderResetPassword(
  locale: Locale,
  vars: { name: string; url: string; ttl: number },
) {
  return renderAction('resetPassword', locale, vars);
}

/** Onay modunda: yazı incelemenizi bekliyor (5 dil) */
export function renderArticleReady(locale: Locale, vars: { name: string; url: string; title: string }) {
  return renderAction('articleReady', locale, vars);
}

/** Yeni iletişim formu mesajı: yöneticiye bildirim (5 dil). Mesaj düz metin olarak, satır sonlarıyla. */
export async function renderContactNotification(
  locale: Locale,
  vars: { name: string; email: string; phone: string | null; company: string | null; message: string; url: string },
): Promise<RenderedEmail> {
  const t = emailT(locale);
  const k = (key: string, extra: Record<string, string> = {}) => t(`contactNotification.${key}`, { ...vars, ...extra });
  const none = k('none');
  const details = [
    `${k('fromLabel')}: ${vars.name} <${vars.email}>`,
    `${k('phoneLabel')}: ${vars.phone ?? none}`,
    `${k('companyLabel')}: ${vars.company ?? none}`,
  ].join('\n');
  const element = (
    <ActionEmail
      lang={locale}
      preview={k('preview')}
      heading={k('heading')}
      paragraphs={[details, vars.message]}
      buttonLabel={k('button')}
      buttonUrl={vars.url}
      fallbackLabel={t('fallbackLink')}
      footer={k('footer')}
    />
  );
  return {
    // Konu satırına satır sonu girmesin (başlık enjeksiyonu)
    subject: k('subject').replace(/[\r\n]+/g, ' '),
    html: await render(element),
    text: await render(element, { plainText: true }),
  };
}

/** Ücretsiz analiz raporu linki (5 dil) */
export function renderFreeAnalysisReport(locale: Locale, vars: { url: string; domain: string; score: number }) {
  return renderAction('freeAnalysis', locale, vars);
}
