import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { updateMeSchema } from '@upvine/shared';
import type { Me } from '@upvine/shared';
import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Field, Input, toast } from '@upvine/ui';
import { ConnectionPanel } from '../../components/connections/connection-panel';
import { SearchConsolePanel } from '../../components/results/search-console-panel';
import { LanguageSelect, ThemeSelect } from '../../components/preference-controls';
import { useSearchParams } from 'react-router';
import { PageHeader } from '../../components/page-header';
import { useFieldError } from '../../components/auth-ui';
import { api, ApiError } from '../../lib/api';
import { authStore, useCurrentUser } from '../../lib/auth-store';
import { useCurrentSite } from '../../lib/sites';

export function meta() {
  return [{ title: 'Kitisel' }];
}

const nameSchema = z.object({ name: updateMeSchema.shape.name.unwrap() });
type NameForm = z.infer<typeof nameSchema>;

/**
 * Ayarlar: Hesap, Site bağlantısı ve Search Console. Marka, Ekip, Faturalandırma ve Bildirimler ilgili fazlarda (Bölüm 8).
 */
export default function SettingsPage() {
  const { t } = useTranslation('app');
  const fieldError = useFieldError();
  const user = useCurrentUser();
  const form = useForm<NameForm>({ resolver: zodResolver(nameSchema), mode: 'onBlur', defaultValues: { name: user.name } });

  const tContent = useTranslation('content').t;
  const { site } = useCurrentSite();
  const [params, setParams] = useSearchParams();

  // WordPress tek tıkla yetkilendirme dönüşü (?connection=connected|failed|rejected)
  useEffect(() => {
    const result = params.get('connection');
    if (!result) return;
    if (result === 'connected') toast.success(tContent('connections.callback.connected'));
    else toast.error(tContent(`connections.callback.${result === 'rejected' ? 'rejected' : 'failed'}`));
    setParams({}, { replace: true });
  }, [params, setParams, tContent]);

  // Search Console dönüşü (?gsc=connected|pick|failed|rejected)
  const tSites = useTranslation('sites').t;
  useEffect(() => {
    const result = params.get('gsc');
    if (!result) return;
    if (result === 'connected') toast.success(tSites('searchConsole.callback.connected'));
    else if (result === 'pick') toast.info(tSites('searchConsole.callback.pick'));
    else toast.error(tSites(`searchConsole.callback.${result === 'rejected' ? 'rejected' : 'failed'}`));
    setParams({}, { replace: true });
  }, [params, setParams, tSites]);

  const save = useMutation({
    mutationFn: (values: NameForm) => api<Me>('/me', { method: 'PATCH', body: values }),
    onSuccess: (me) => {
      authStore.setUser(me);
      form.reset({ name: me.name });
      toast.success(t('settings.account.saved'));
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <>
      <PageHeader title={t('settings.title')} />
      <Card>
        <form method="post" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
          <CardHeader>
            <CardTitle as="h2">{t('settings.account.title')}</CardTitle>
            <CardDescription>{t('settings.account.description')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Field label={t('settings.account.name')} error={fieldError(form.formState.errors.name?.message)}>
              <Input autoComplete="name" {...form.register('name')} />
            </Field>
            <Field label={t('settings.account.email')}>
              <Input value={user.email} readOnly disabled />
            </Field>
            <Field label={t('common:language.label')} hint={t('settings.account.languageHint')}>
              <LanguageSelect mode="app" className="w-full" />
            </Field>
            <Field label={t('common:theme.label')}>
              <ThemeSelect className="w-full" />
            </Field>
          </CardContent>
          <CardFooter>
            <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>
              {t('common:actions.save')}
            </Button>
          </CardFooter>
        </form>
      </Card>
      {site ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{tContent('connections.title')}</CardTitle>
            <CardDescription>{tContent('connections.body')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectionPanel site={site} />
          </CardContent>
        </Card>
      ) : null}
      {site ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{tSites('searchConsole.title')}</CardTitle>
            <CardDescription>{tSites('searchConsole.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <SearchConsolePanel siteId={site.id} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
