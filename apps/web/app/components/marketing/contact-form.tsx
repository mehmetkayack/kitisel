import { zodResolver } from '@hookform/resolvers/zod';
import { Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { contactFormSchema } from '@upvine/shared';
import type { ContactFormValues } from '@upvine/shared';
import { Alert, Button, Field, Input, Textarea } from '@upvine/ui';
import { FormError, useFieldError } from '../auth-ui';
import { api, ApiError } from '../../lib/api';

/** reCAPTCHA v3'te bu formun eylem adı (API aynı adı bekler) */
const RECAPTCHA_ACTION = 'contact';

/**
 * Google reCAPTCHA v3 (görünmez): site anahtarı tanımlıysa betik bu sayfada yüklenir, token gönderim
 * anında alınır (2 dakika geçerli). Rozet gizli; Google'ın istediği bilgilendirme formun altında.
 */
function useRecaptcha(locale: string): { enabled: boolean; token: () => Promise<string | undefined> } {
  const key = __RECAPTCHA_SITE_KEY__;
  useEffect(() => {
    if (!key || document.querySelector('script[data-recaptcha]')) return;
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(key)}&hl=${encodeURIComponent(locale)}`;
    script.async = true;
    script.dataset.recaptcha = 'true';
    document.head.appendChild(script);
  }, [key, locale]);
  return {
    enabled: !!key,
    token: async () => {
      if (!key) return undefined;
      const g = window.grecaptcha;
      if (!g) return undefined; // betik yüklenemediyse sunucu `captcha_failed` döner
      await new Promise<void>((resolve) => g.ready(resolve));
      return g.execute(key, { action: RECAPTCHA_ACTION });
    },
  };
}

const optional = (text: string) => <span className="text-sm font-normal text-ink-muted">{text}</span>;

/** İletişim formu: ad, e-posta, telefon ve şirket (isteğe bağlı), mesaj. Mesajlar admin panelinde listelenir. */
export function ContactForm({ locale }: { locale: string }) {
  const { t } = useTranslation('marketing');
  const fieldError = useFieldError();
  const recaptcha = useRecaptcha(locale);
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    mode: 'onBlur',
    defaultValues: { name: '', email: '', phone: '', company: '', message: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const recaptchaToken = await recaptcha.token();
      await api('/contact', { method: 'POST', auth: false, body: { ...values, locale, ...(recaptchaToken ? { recaptchaToken } : {}) } });
      form.reset();
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'validation_failed') {
        const fields = err.fieldErrors();
        for (const [name, message] of Object.entries(fields)) {
          if (name in form.getValues()) form.setError(name as keyof ContactFormValues, { message });
        }
        if (Object.keys(fields).length > 0) return;
      }
      setServerError(err instanceof ApiError ? err.message : t('common:errorPage.body'));
    }
  });

  if (sent) {
    return (
      <div className="flex flex-col items-start gap-4">
        <Alert tone="success" title={t('contact.form.sentTitle')}>
          {t('contact.form.sentBody')}
        </Alert>
        <Button variant="secondary" onClick={() => setSent(false)}>
          {t('contact.form.another')}
        </Button>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={serverError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('contact.form.name')} error={fieldError(errors.name?.message)}>
          <Input autoComplete="name" {...form.register('name')} />
        </Field>
        <Field label={t('contact.form.email')} error={fieldError(errors.email?.message)}>
          <Input type="email" autoComplete="email" inputMode="email" spellCheck={false} {...form.register('email')} />
        </Field>
        <Field label={t('contact.form.phone')} labelAddon={optional(t('contact.form.optional'))} error={fieldError(errors.phone?.message)}>
          <Input type="tel" autoComplete="tel" inputMode="tel" {...form.register('phone')} />
        </Field>
        <Field label={t('contact.form.company')} labelAddon={optional(t('contact.form.optional'))} error={fieldError(errors.company?.message)}>
          <Input autoComplete="organization" {...form.register('company')} />
        </Field>
      </div>
      <Field label={t('contact.form.message')} error={fieldError(errors.message?.message)}>
        <Textarea rows={6} {...form.register('message')} />
      </Field>
      <p className="text-sm text-ink-muted">
        {t('contact.form.consent')}{' '}
        <Link to={`/${locale}/legal/privacy`} className="font-medium text-primary hover:underline">
          {t('legal.docs.privacy')}
        </Link>
      </p>
      <Button type="submit" loading={isSubmitting} className="self-start">
        <Send aria-hidden />
        {t('contact.form.submit')}
      </Button>
      {recaptcha.enabled ? (
        // Rozet gizlendiği için Google'ın istediği bilgilendirme (reCAPTCHA kullanım şartları)
        <p className="text-xs text-ink-muted">
          {t('contact.form.recaptcha')}{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline">
            {t('contact.form.googlePrivacy')}
          </a>{' '}
          ·{' '}
          <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline">
            {t('contact.form.googleTerms')}
          </a>
        </p>
      ) : null}
    </form>
  );
}
