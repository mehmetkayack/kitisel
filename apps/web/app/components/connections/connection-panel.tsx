import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Copy, Link2, Unplug } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { webhookConnectSchema, wordpressConnectSchema } from '@upvine/shared';
import { CONNECTION_KINDS } from '@upvine/shared';
import type { ConnectionDto, ConnectionKind, SiteDto, WebhookConnectInput, WordpressConnectInput } from '@upvine/shared';
import { Alert, Badge, Button, Dialog, DialogClose, DialogContent, Field, Input, RadioCards, Skeleton, toast } from '@upvine/ui';
import { FormError, useFieldError } from '../auth-ui';
import { api } from '../../lib/api';
import { GhostForm, ShopifyForm, useConnectionError, WebflowForm, WixForm } from './cms-forms';
import { connectionKey, sitesKey, useConnection, useFormatters } from '../../lib/sites';

function WordPressForm({ site, oneClick, onConnected }: { site: SiteDto; oneClick: boolean; onConnected: (c: ConnectionDto) => void }) {
  const { t } = useTranslation('content');
  const fieldError = useFieldError();
  const toError = useConnectionError();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<WordpressConnectInput>({
    resolver: zodResolver(wordpressConnectSchema),
    mode: 'onSubmit',
    defaultValues: { siteUrl: site.url.replace(/\/$/, ''), username: '', appPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      onConnected(await api<ConnectionDto>(`/sites/${site.id}/connection/wordpress`, { method: 'PUT', body: values }));
    } catch (err) {
      setServerError(toError(err));
    }
  });

  const startOneClick = async () => {
    try {
      const { url } = await api<{ url: string }>(`/sites/${site.id}/connection/wordpress/authorize-url?siteUrl=${encodeURIComponent(form.getValues('siteUrl'))}`);
      window.location.assign(url);
    } catch (err) {
      setServerError(toError(err));
    }
  };

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={serverError} />
      <Field label={t('connections.wordpress.siteUrl')} error={fieldError(errors.siteUrl?.message)}>
        <Input type="url" inputMode="url" autoComplete="url" {...form.register('siteUrl')} />
      </Field>
      {oneClick ? (
        <>
          <div>
            <Button type="button" variant="secondary" onClick={() => void startOneClick()}>
              <Link2 aria-hidden />
              {t('connections.wordpress.oneClick')}
            </Button>
          </div>
          <p className="text-sm text-ink-muted">{t('connections.wordpress.or')}</p>
        </>
      ) : null}
      <Field label={t('connections.wordpress.username')} error={fieldError(errors.username?.message)}>
        <Input autoComplete="username" {...form.register('username')} />
      </Field>
      <Field label={t('connections.wordpress.appPassword')} hint={t('connections.wordpress.appPasswordHint')} error={fieldError(errors.appPassword?.message)}>
        <Input type="password" autoComplete="off" spellCheck={false} {...form.register('appPassword')} />
      </Field>
      <div>
        <Button type="submit" variant="secondary" loading={isSubmitting}>
          {t('connections.wordpress.connect')}
        </Button>
      </div>
    </form>
  );
}

function WebhookForm({ site, onConnected }: { site: SiteDto; onConnected: (c: ConnectionDto) => void }) {
  const { t } = useTranslation('content');
  const fieldError = useFieldError();
  const toError = useConnectionError();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<WebhookConnectInput>({ resolver: zodResolver(webhookConnectSchema), mode: 'onSubmit', defaultValues: { url: '' } });
  const { errors, isSubmitting } = form.formState;
  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      onConnected(await api<ConnectionDto>(`/sites/${site.id}/connection/webhook`, { method: 'PUT', body: values }));
    } catch (err) {
      setServerError(toError(err));
    }
  });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={serverError} />
      <Field label={t('connections.webhook.url')} hint={t('connections.webhook.urlHint')} error={fieldError(errors.url?.message)}>
        <Input type="url" inputMode="url" placeholder="https://" {...form.register('url')} />
      </Field>
      <div>
        <Button type="submit" variant="secondary" loading={isSubmitting}>
          {t('connections.webhook.connect')}
        </Button>
      </div>
    </form>
  );
}

/** Webhook imza anahtarı: sadece bağlantı anında bir kez gösterilir. */
function SecretBox({ secret }: { secret: string }) {
  const { t } = useTranslation('content');
  const copy = async () => {
    await navigator.clipboard.writeText(secret).catch(() => {});
    toast.success(t('connections.webhook.copied'));
  };
  return (
    <Alert tone="warning" title={t('connections.webhook.secretTitle')}>
      <p>{t('connections.webhook.secretBody')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="rounded-control bg-surface px-2 py-1 text-sm break-all text-ink">{secret}</code>
        <Button variant="secondary" onClick={() => void copy()}>
          <Copy aria-hidden />
          {t('connections.webhook.copy')}
        </Button>
      </div>
    </Alert>
  );
}

/**
 * Site bağlantısı (Bölüm 7.8): WordPress (uygulama şifresi / tek tıkla), Ghost, Shopify, Webflow (alan
 * eşlemeli), Wix veya webhook. Kimlik bilgileri
 * sunucuda şifreli saklanır ve tarayıcıya asla geri gönderilmez. Ayarlar ve sihirbaz kullanır.
 */
export function ConnectionPanel({ site, onConnected }: { site: SiteDto; onConnected?: () => void }) {
  const { t } = useTranslation('content');
  const fmt = useFormatters();
  const qc = useQueryClient();
  const toError = useConnectionError();
  const connection = useConnection(site.id);
  const [kind, setKind] = useState<ConnectionKind>('wordpress');
  const [secret, setSecret] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const connected = (c: ConnectionDto) => {
    if (c.secret) setSecret(c.secret);
    qc.setQueryData(connectionKey(site.id), { connection: { ...c, secret: undefined }, oneClickAvailable: connection.data?.oneClickAvailable ?? false });
    void qc.invalidateQueries({ queryKey: sitesKey });
    void qc.invalidateQueries({ queryKey: ['content'] });
    toast.success(t('connections.tested'));
    onConnected?.();
  };

  const test = useMutation({
    mutationFn: () => api<ConnectionDto>(`/sites/${site.id}/connection/test`, { method: 'POST' }),
    onSuccess: (c) => {
      qc.setQueryData(connectionKey(site.id), { connection: c, oneClickAvailable: connection.data?.oneClickAvailable ?? false });
      toast.success(t('connections.tested'));
    },
    onError: (err) => toast.error(toError(err)),
  });
  const disconnect = useMutation({
    mutationFn: () => api(`/sites/${site.id}/connection`, { method: 'DELETE' }),
    onSuccess: () => {
      setConfirm(false);
      setSecret(null);
      void qc.invalidateQueries({ queryKey: connectionKey(site.id) });
      void qc.invalidateQueries({ queryKey: sitesKey });
      toast.success(t('connections.disconnected'));
    },
    onError: (err) => toast.error(toError(err)),
  });

  if (connection.isPending) return <Skeleton className="h-40 w-full" />;
  const current = connection.data?.connection ?? null;

  if (current) {
    const details = Object.entries(current.display).filter(([, v]) => v);
    return (
      <div className="flex flex-col gap-4">
        {secret ? <SecretBox secret={secret} /> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success">
            <CheckCircle2 aria-hidden />
            {t('connections.connected')}
          </Badge>
          <span className="font-medium text-ink">{t(`connections.kinds.${current.kind}.label`)}</span>
        </div>
        <ul className="flex flex-col gap-1 text-sm">
          {details.map(([k, v]) => (
            <li key={k} className="break-all text-ink">
              {v}
            </li>
          ))}
          {current.lastVerifiedAt ? <li className="text-ink-muted">{t('connections.lastChecked', { date: fmt.dateTime(current.lastVerifiedAt) })}</li> : null}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => test.mutate()} loading={test.isPending}>
            {t('connections.test')}
          </Button>
          <Dialog open={confirm} onOpenChange={setConfirm}>
            <Button variant="ghost" onClick={() => setConfirm(true)}>
              <Unplug aria-hidden />
              {t('connections.disconnect')}
            </Button>
            <DialogContent title={t('connections.disconnectTitle')} description={t('connections.disconnectBody')}>
              <div className="flex flex-wrap justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="secondary">{t('common:actions.cancel')}</Button>
                </DialogClose>
                <Button variant="danger" onClick={() => disconnect.mutate()} loading={disconnect.isPending}>
                  {t('connections.disconnect')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <RadioCards
        legend={t('connections.choose')}
        columns={2}
        value={kind}
        onValueChange={(v) => setKind(v as ConnectionKind)}
        options={CONNECTION_KINDS.map((k) => ({ value: k, label: t(`connections.kinds.${k}.label`), description: t(`connections.kinds.${k}.hint`) }))}
      />
      {kind === 'wordpress' ? <WordPressForm site={site} oneClick={connection.data?.oneClickAvailable ?? false} onConnected={connected} /> : null}
      {kind === 'ghost' ? <GhostForm site={site} onConnected={connected} /> : null}
      {kind === 'shopify' ? <ShopifyForm site={site} onConnected={connected} /> : null}
      {kind === 'webflow' ? <WebflowForm site={site} onConnected={connected} /> : null}
      {kind === 'wix' ? <WixForm site={site} onConnected={connected} /> : null}
      {kind === 'webhook' ? <WebhookForm site={site} onConnected={connected} /> : null}
    </div>
  );
}
