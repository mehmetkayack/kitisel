import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ghostConnectSchema, shopifyConnectSchema, wixConnectSchema } from '@upvine/shared';
import type { ConnectionDto, GhostConnectInput, ShopifyConnectInput, SiteDto, WebflowSiteDto, WixConnectInput } from '@upvine/shared';
import { Button, Field, Input, RadioCards, Select } from '@upvine/ui';
import { FormError, useFieldError } from '../auth-ui';
import { api, ApiError } from '../../lib/api';

/** Bağlantı hatasını sade dile çevirir (API `connection_failed` + `details.reason`). */
export function useConnectionError() {
  const { t } = useTranslation('content');
  return (err: unknown): string => {
    if (err instanceof ApiError) {
      const reason = (err.details as { reason?: string } | undefined)?.reason;
      if (err.code === 'connection_failed' && reason) return t(`connections.errors.${reason}`, { defaultValue: t('connections.errors.internal') });
      return err.message;
    }
    return t('connections.errors.internal');
  };
}

type OnConnected = (c: ConnectionDto) => void;

/** Ortak gönderim: başarıda bağlantı, hatada sade dilde mesaj. */
function useConnect<T>(path: string, onConnected: OnConnected) {
  const toError = useConnectionError();
  const [serverError, setServerError] = useState<string | null>(null);
  const submit = async (values: T) => {
    setServerError(null);
    try {
      onConnected(await api<ConnectionDto>(path, { method: 'PUT', body: values }));
    } catch (err) {
      setServerError(toError(err));
    }
  };
  return { serverError, submit, toError, setServerError };
}

export function GhostForm({ site, onConnected }: { site: SiteDto; onConnected: OnConnected }) {
  const { t } = useTranslation('content');
  const fieldError = useFieldError();
  const { serverError, submit } = useConnect<GhostConnectInput>(`/sites/${site.id}/connection/ghost`, onConnected);
  const form = useForm<GhostConnectInput>({ resolver: zodResolver(ghostConnectSchema), mode: 'onSubmit', defaultValues: { siteUrl: site.url.replace(/\/$/, ''), adminApiKey: '' } });
  const { errors, isSubmitting } = form.formState;
  return (
    <form method="post" onSubmit={form.handleSubmit(submit)} noValidate className="flex flex-col gap-4">
      <FormError message={serverError} />
      <Field label={t('connections.ghost.siteUrl')} error={fieldError(errors.siteUrl?.message)}>
        <Input type="url" inputMode="url" {...form.register('siteUrl')} />
      </Field>
      <Field label={t('connections.ghost.adminApiKey')} hint={t('connections.ghost.adminApiKeyHint')} error={fieldError(errors.adminApiKey?.message)}>
        <Input type="password" autoComplete="off" spellCheck={false} {...form.register('adminApiKey')} />
      </Field>
      <div>
        <Button type="submit" variant="secondary" loading={isSubmitting}>
          {t('connections.ghost.connect')}
        </Button>
      </div>
    </form>
  );
}

export function ShopifyForm({ site, onConnected }: { site: SiteDto; onConnected: OnConnected }) {
  const { t } = useTranslation('content');
  const fieldError = useFieldError();
  const { serverError, submit } = useConnect<ShopifyConnectInput>(`/sites/${site.id}/connection/shopify`, onConnected);
  const form = useForm<ShopifyConnectInput>({
    resolver: zodResolver(shopifyConnectSchema),
    mode: 'onSubmit',
    defaultValues: { shop: '', method: 'app', clientId: '', clientSecret: '', accessToken: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const method = form.watch('method');
  return (
    <form method="post" onSubmit={form.handleSubmit(submit)} noValidate className="flex flex-col gap-4">
      <FormError message={serverError} />
      <Field label={t('connections.shopify.shop')} hint={t('connections.shopify.shopHint')} error={fieldError(errors.shop?.message)}>
        <Input placeholder="magaza.myshopify.com" autoCapitalize="off" spellCheck={false} {...form.register('shop')} />
      </Field>
      <RadioCards
        legend={t('connections.shopify.method')}
        columns={1}
        value={method}
        onValueChange={(v) => form.setValue('method', v as 'app' | 'token')}
        options={(['app', 'token'] as const).map((m) => ({ value: m, label: t(`connections.shopify.methods.${m}.label`), description: t(`connections.shopify.methods.${m}.hint`) }))}
      />
      {method === 'app' ? (
        <>
          <Field label={t('connections.shopify.clientId')} error={fieldError(errors.clientId?.message)}>
            <Input autoComplete="off" spellCheck={false} {...form.register('clientId')} />
          </Field>
          <Field label={t('connections.shopify.clientSecret')} error={fieldError(errors.clientSecret?.message)}>
            <Input type="password" autoComplete="off" spellCheck={false} {...form.register('clientSecret')} />
          </Field>
        </>
      ) : (
        <Field label={t('connections.shopify.accessToken')} error={fieldError(errors.accessToken?.message)}>
          <Input type="password" autoComplete="off" spellCheck={false} placeholder="shpat_…" {...form.register('accessToken')} />
        </Field>
      )}
      <p className="text-sm text-ink-muted">{t('connections.shopify.scopes')}</p>
      <div>
        <Button type="submit" variant="secondary" loading={isSubmitting}>
          {t('connections.shopify.connect')}
        </Button>
      </div>
    </form>
  );
}

const WEBFLOW_ROLES = [
  { role: 'body', types: ['RichText'], required: true },
  { role: 'summary', types: ['PlainText', 'RichText'], required: false },
  { role: 'image', types: ['Image'], required: false },
  { role: 'metaTitle', types: ['PlainText'], required: false },
  { role: 'metaDescription', types: ['PlainText'], required: false },
] as const;
type WebflowRole = (typeof WEBFLOW_ROLES)[number]['role'];
const NONE = '__none';

/**
 * Webflow: 1) site token'ı ile siteler/koleksiyonlar bulunur, 2) kullanıcı koleksiyonu ve hangi alanın
 * yazı gövdesi, özet, kapak vb. olduğunu seçer (koleksiyonlar siteden siteye farklı).
 */
export function WebflowForm({ site, onConnected }: { site: SiteDto; onConnected: OnConnected }) {
  const { t } = useTranslation('content');
  const { serverError, submit, toError, setServerError } = useConnect<unknown>(`/sites/${site.id}/connection/webflow`, onConnected);
  const [token, setToken] = useState('');
  const [sites, setSites] = useState<WebflowSiteDto[] | null>(null);
  const [collectionKey, setCollectionKey] = useState('');
  const [fields, setFields] = useState<Partial<Record<WebflowRole, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const discover = useMutation({
    mutationFn: () => api<{ sites: WebflowSiteDto[] }>(`/sites/${site.id}/connection/webflow/discover`, { method: 'POST', body: { token } }),
    onSuccess: (r) => {
      setServerError(null);
      setSites(r.sites);
      const first = r.sites.flatMap((s) => s.collections.map((c) => ({ s, c }))).find(({ c }) => c.fields.some((f) => f.type === 'RichText'));
      if (first) choose(`${first.s.id}/${first.c.id}`, r.sites);
    },
    onError: (err) => setServerError(toError(err)),
  });

  const options = useMemo(() => (sites ?? []).flatMap((s) => s.collections.map((c) => ({ value: `${s.id}/${c.id}`, label: `${s.displayName} · ${c.displayName}`, site: s, collection: c }))), [sites]);
  const selected = options.find((o) => o.value === collectionKey) ?? null;

  /** Koleksiyon seçilince alanları adlarına göre tahmin et (kullanıcı değiştirebilir). */
  function choose(key: string, list = sites ?? []) {
    setCollectionKey(key);
    const collection = list.flatMap((s) => s.collections.map((c) => ({ id: `${s.id}/${c.id}`, c }))).find((x) => x.id === key)?.c;
    if (!collection) return;
    const guess = (types: readonly string[], words: RegExp) => collection.fields.find((f) => types.includes(f.type) && words.test(`${f.slug} ${f.displayName}`))?.slug;
    setFields({
      body: guess(['RichText'], /body|content|post|içerik|icerik|inhalt|contenido|contenu/i) ?? collection.fields.find((f) => f.type === 'RichText')?.slug,
      summary: guess(['PlainText', 'RichText'], /summary|excerpt|özet|ozet|zusammenfassung|resumen|résumé/i),
      image: guess(['Image'], /main|cover|thumbnail|kapak|hero|bild|imagen/i) ?? collection.fields.find((f) => f.type === 'Image')?.slug,
      metaTitle: guess(['PlainText'], /seo.?title|meta.?title/i),
      metaDescription: guess(['PlainText'], /meta.?desc|seo.?desc/i),
    });
  }

  const connect = async () => {
    if (!selected || !fields.body) return;
    setSubmitting(true);
    await submit({ token, siteId: selected.site.id, collectionId: selected.collection.id, fields });
    setSubmitting(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <FormError message={serverError} />
      <form
        method="post"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (token.trim()) discover.mutate();
        }}
      >
        <Field label={t('connections.webflow.token')} hint={t('connections.webflow.tokenHint')}>
          <Input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} />
        </Field>
        <div>
          <Button type="submit" variant="secondary" loading={discover.isPending} disabled={!token.trim()}>
            <Search aria-hidden />
            {t('connections.webflow.find')}
          </Button>
        </div>
      </form>
      {sites && options.length === 0 ? <p className="text-sm text-ink-muted">{t('connections.webflow.noCollections')}</p> : null}
      {options.length ? (
        <div className="flex flex-col gap-4 rounded-card border border-border p-4">
          <Field label={t('connections.webflow.collection')}>
            <Select value={collectionKey} onValueChange={(v) => choose(v)} options={options.map((o) => ({ value: o.value, label: o.label }))} placeholder={t('connections.webflow.pick')} />
          </Field>
          {selected ? (
            <>
              <p className="text-sm text-ink-muted">{t('connections.webflow.mapHint')}</p>
              {WEBFLOW_ROLES.map(({ role, types, required }) => {
                const choices = selected.collection.fields.filter((f) => (types as readonly string[]).includes(f.type) && f.slug !== 'name' && f.slug !== 'slug');
                return (
                  <Field key={role} label={t(`connections.webflow.roles.${role}`)} hint={required ? t('connections.webflow.required') : undefined}>
                    <Select
                      value={fields[role] ?? NONE}
                      onValueChange={(v) => setFields((f) => ({ ...f, [role]: v === NONE ? undefined : v }))}
                      options={[...(required ? [] : [{ value: NONE, label: t('connections.webflow.none') }]), ...choices.map((f) => ({ value: f.slug, label: f.displayName }))]}
                    />
                  </Field>
                );
              })}
              <div>
                <Button variant="secondary" onClick={() => void connect()} loading={submitting} disabled={!fields.body}>
                  {t('connections.webflow.connect')}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function WixForm({ site, onConnected }: { site: SiteDto; onConnected: OnConnected }) {
  const { t } = useTranslation('content');
  const fieldError = useFieldError();
  const { serverError, submit } = useConnect<WixConnectInput>(`/sites/${site.id}/connection/wix`, onConnected);
  const form = useForm<WixConnectInput>({ resolver: zodResolver(wixConnectSchema), mode: 'onSubmit', defaultValues: { apiKey: '', siteId: '' } });
  const { errors, isSubmitting } = form.formState;
  return (
    <form method="post" onSubmit={form.handleSubmit(submit)} noValidate className="flex flex-col gap-4">
      <FormError message={serverError} />
      <Field label={t('connections.wix.apiKey')} hint={t('connections.wix.apiKeyHint')} error={fieldError(errors.apiKey?.message)}>
        <Input type="password" autoComplete="off" spellCheck={false} {...form.register('apiKey')} />
      </Field>
      <Field label={t('connections.wix.siteId')} hint={t('connections.wix.siteIdHint')} error={fieldError(errors.siteId?.message)}>
        <Input autoComplete="off" spellCheck={false} {...form.register('siteId')} />
      </Field>
      <p className="text-sm text-ink-muted">{t('connections.wix.authorNote')}</p>
      <div>
        <Button type="submit" variant="secondary" loading={isSubmitting}>
          {t('connections.wix.connect')}
        </Button>
      </div>
    </form>
  );
}
