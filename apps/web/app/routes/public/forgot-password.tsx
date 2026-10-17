import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { isLocale } from '@upvine/config';
import { forgotPasswordSchema } from '@upvine/shared';
import type { ForgotPasswordInput } from '@upvine/shared';
import { Button, Field, Input } from '@upvine/ui';
import type { Route } from './+types/forgot-password';
import { AuthHeader, FormError, useFieldError } from '../../components/auth-ui';
import { api, ApiError } from '../../lib/api';
import { fixedT } from '../../lib/i18n';

export function meta({ params }: Route.MetaArgs) {
  return isLocale(params.locale) ? [{ title: `${fixedT(params.locale, 'auth')('forgot.metaTitle')} · Upvine` }] : [];
}

export default function ForgotPassword({ params }: Route.ComponentProps) {
  const { t } = useTranslation('auth');
  const fieldError = useFieldError();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), mode: 'onBlur' });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: values, auth: false });
      setSentTo(values.email);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('common:errorPage.body'));
    }
  });

  const back = (
    <Link to={`/${params.locale}/login`} className="text-sm font-medium text-primary hover:underline">
      {t('forgot.backToLogin')}
    </Link>
  );

  if (sentTo) {
    return (
      <div className="flex flex-col items-start gap-4" role="status">
        <span className="flex size-12 items-center justify-center rounded-full bg-growth-soft text-growth-text">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <AuthHeader title={t('forgot.sentTitle')} subtitle={t('forgot.sentBody', { email: sentTo })} />
        {back}
      </div>
    );
  }

  return (
    <>
      <AuthHeader title={t('forgot.title')} subtitle={t('forgot.subtitle')} />
      <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={serverError} />
        <Field label={t('fields.email')} error={fieldError(errors.email?.message)}>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
        </Field>
        <Button type="submit" block loading={isSubmitting}>
          {t('forgot.submit')}
        </Button>
      </form>
      <p className="mt-6 text-center">{back}</p>
    </>
  );
}
