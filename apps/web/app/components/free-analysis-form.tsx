import { zodResolver } from '@hookform/resolvers/zod';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { siteUrlSchema } from '@upvine/shared';
import { Button, Field, Input, cn } from '@upvine/ui';
import { FormError, useFieldError } from './auth-ui';
import { api, ApiError } from '../lib/api';
import { useCaptchaKeys } from '../lib/captcha-keys';

const formSchema = z.object({ url: siteUrlSchema });
type FormValues = z.infer<typeof formSchema>;

/** Cloudflare Turnstile: site anahtarı (`TURNSTILE_SITE_KEY`, çalışma anında) tanımlıysa yüklenir (kötüye kullanım önlemi, Bölüm 7.2). */
function useTurnstile(locale: string): {
  enabled: boolean;
  ref: RefObject<HTMLDivElement | null>;
  token: string | null;
  reset: () => void;
} {
  const key = useCaptchaKeys().turnstile;
  const ref = useRef<HTMLDivElement | null>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (!key || !ref.current) return;
    const render = () => {
      if (!window.turnstile || !ref.current || widget.current) return;
      widget.current = window.turnstile.render(ref.current, {
        sitekey: key,
        callback: setToken,
        'expired-callback': () => setToken(null),
        language: locale,
      });
    };
    if (window.turnstile) render();
    else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }
  }, [key, locale]);
  return {
    enabled: !!key,
    ref,
    token,
    reset: () => {
      setToken(null);
      if (widget.current) window.turnstile?.reset(widget.current);
    },
  };
}

/**
 * Ücretsiz site analizi formu (Bölüm 7.2): kayıt gerektirmez, rapor paylaşılabilir linkte açılır.
 * Ana sayfanın hero'sunda ve /free-analysis sayfasında aynı bileşen.
 */
export function FreeAnalysisForm({
  locale,
  className,
  compact = false,
  variant = 'card',
}: {
  locale: string;
  className?: string;
  compact?: boolean;
  /** hero: ana sayfanın koyu bandında satır içi (adres + buton), etiket ekran okuyucuya */
  variant?: 'card' | 'hero';
}) {
  const { t } = useTranslation('analysis');
  const fieldError = useFieldError();
  const navigate = useNavigate();
  const turnstile = useTurnstile(locale);
  const [serverError, setServerError] = useState<string | null>(null);
  // Tek alanlı form: doğrulama gönderimde (bkz. sihirbaz adres adımı)
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onSubmit',
    defaultValues: { url: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const res = await api<{ token: string }>('/free-analyses', {
        method: 'POST',
        auth: false,
        body: {
          url: values.url,
          locale,
          ...(turnstile.token ? { turnstileToken: turnstile.token } : {}),
        },
      });
      await navigate(`/${locale}/free-analysis/r/${res.token}`);
    } catch (err) {
      turnstile.reset();
      if (err instanceof ApiError && err.code === 'validation_failed') {
        const message = err.fieldErrors().url;
        if (message) form.setError('url', { message });
        return;
      }
      setServerError(err instanceof ApiError ? err.message : t('common:errorPage.body'));
    }
  });

  if (variant === 'hero') {
    return (
      <form
        method="post"
        onSubmit={onSubmit}
        noValidate
        // Koyu bantta hata metni açık kırmızı (kontrast)
        className={cn(
          'flex w-full max-w-xl flex-col gap-3 text-left [--danger:var(--danger-on-night)]',
          className,
        )}
      >
        <FormError message={serverError} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <Field
            label={t('form.label')}
            hideLabel
            error={fieldError(errors.url?.message)}
            className="min-w-0 flex-1"
          >
            <Input
              type="text"
              inputMode="url"
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t('form.placeholder')}
              className="min-h-12 border-night-2 bg-night-2 text-night-foreground placeholder:text-night-muted hover:border-night-muted"
              {...form.register('url')}
            />
          </Field>
          <Button
            type="submit"
            size="lg"
            loading={isSubmitting}
            disabled={turnstile.enabled && !turnstile.token}
            className="h-auto min-h-12 shrink-0 self-start bg-brand py-2 whitespace-normal text-night hover:bg-brand-light"
          >
            {t('form.submit')}
          </Button>
        </div>
        {turnstile.enabled ? <div ref={turnstile.ref} /> : null}
      </form>
    );
  }

  return (
    <form
      method="post"
      onSubmit={onSubmit}
      noValidate
      className={cn(
        'flex w-full flex-col gap-4 rounded-card border border-border bg-surface p-5 text-left shadow-card sm:p-6',
        className,
      )}
    >
      <FormError message={serverError} />
      <Field
        label={t('form.label')}
        hint={compact ? undefined : t('form.hint')}
        error={fieldError(errors.url?.message)}
      >
        <Input
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t('form.placeholder')}
          {...form.register('url')}
        />
      </Field>
      {turnstile.enabled ? <div ref={turnstile.ref} /> : null}
      <Button
        type="submit"
        size="lg"
        block
        loading={isSubmitting}
        disabled={turnstile.enabled && !turnstile.token}
      >
        <Search aria-hidden />
        {t('form.submit')}
      </Button>
      <p className="text-center text-sm text-ink-muted">{t('form.note')}</p>
    </form>
  );
}
