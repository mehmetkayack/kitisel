/** @jsxRuntime automatic */
/** @jsxImportSource react */
// tsx (API dev) JSX ayarını tsconfig'ten almıyor; çalışma modu dosyada sabitlendi.
import { render } from 'react-email';
import type { Locale } from '@upvine/config';
import { emailT } from './i18n';
import { ActionEmail } from './templates/action-email';

export type { Mailer, OutgoingEmail } from './mailer';
export { createMailer, createSmtpMailer, MemoryMailer } from './mailer';

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

/** Ücretsiz analiz raporu linki (5 dil) */
export function renderFreeAnalysisReport(locale: Locale, vars: { url: string; domain: string; score: number }) {
  return renderAction('freeAnalysis', locale, vars);
}
