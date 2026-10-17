import DOMPurify from 'dompurify';
import { ArrowRight, Check, Copy, ExternalLink } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { RefreshDto } from '@upvine/shared';
import { Alert, Badge, Button, Dialog, DialogContent, Skeleton, Spinner, Tabs, TabsContent, TabsList, TabsTrigger, toast } from '@upvine/ui';
import { useFormatters, useRefresh, useRefreshMutations } from '../../lib/sites';
import { HealthScore } from './health';

/** Öneri hatası: önce yenilemeye özel metin, yoksa yazı okuma hatası metni. */
export function useRefreshErrorText() {
  const { t } = useTranslation('sites');
  return (code: string | null) => t(`posts.refresh.errors.${code ?? 'internal'}`, { defaultValue: t(`posts.errors.${code ?? 'internal'}`, { defaultValue: t('posts.refresh.errors.internal') }) });
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation('sites');
  const copy = () => {
    navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t('posts.refresh.copied')))
      .catch(() => toast.error(t('posts.refresh.copyFailed')));
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{label}</span>
        <Button variant="ghost" onClick={copy}>
          <Copy aria-hidden />
          {t('posts.refresh.copy')}
          <span className="sr-only">: {label}</span>
        </Button>
      </div>
      <p className="rounded-control border border-border bg-surface-muted p-3 text-sm break-words text-ink">{value}</p>
    </div>
  );
}

function Body({ data }: { data: RefreshDto }) {
  const { t } = useTranslation('sites');
  const suggested = useMemo(() => (data.suggestion ? DOMPurify.sanitize(data.suggestion.html) : ''), [data.suggestion]);
  const current = useMemo(() => (data.original ? DOMPurify.sanitize(data.original.html) : ''), [data.original]);
  const s = data.suggestion;
  if (!s) return null;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <p className="measure text-ink">{s.summary}</p>
      {data.scoreBefore !== null && data.scoreAfter !== null ? (
        <div className="flex flex-wrap items-center gap-3" aria-label={t('posts.refresh.scoreLabel')}>
          <HealthScore score={data.scoreBefore} size="sm" />
          <ArrowRight className="size-4 text-ink-muted" aria-hidden />
          <HealthScore score={data.scoreAfter} size="sm" />
          <span className="text-sm text-ink-muted">{t('posts.refresh.scoreHint')}</span>
        </div>
      ) : null}
      <section className="flex flex-col gap-2">
        <h3 className="font-heading font-semibold text-ink">{t('posts.refresh.changesTitle')}</h3>
        <ul className="flex flex-col gap-2">
          {s.changes.map((c, i) => (
            <li key={i} className="flex flex-wrap items-start gap-2 text-sm">
              <Badge tone="neutral">{t(`posts.refresh.kinds.${c.kind}`)}</Badge>
              <span className="min-w-0 flex-1 text-ink">{c.description}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="font-heading font-semibold text-ink">{t('posts.refresh.metaTitle')}</h3>
        <p className="measure text-sm text-ink-muted">{t('posts.refresh.metaHint')}</p>
        <CopyField label={t('posts.refresh.fields.metaTitle')} value={s.metaTitle} />
        <CopyField label={t('posts.refresh.fields.metaDescription')} value={s.metaDescription} />
      </section>
      <Tabs defaultValue="suggested">
        <TabsList aria-label={t('posts.refresh.compare')}>
          <TabsTrigger value="suggested">{t('posts.refresh.after')}</TabsTrigger>
          <TabsTrigger value="current">{t('posts.refresh.before')}</TabsTrigger>
        </TabsList>
        <TabsContent value="suggested" className="flex flex-col gap-2">
          <h4 className="text-lg font-semibold text-ink">{s.title}</h4>
          <div className="article-body max-h-[50vh] overflow-y-auto rounded-control border border-border p-3 text-sm" dangerouslySetInnerHTML={{ __html: suggested }} />
        </TabsContent>
        <TabsContent value="current" className="flex flex-col gap-2">
          <h4 className="text-lg font-semibold text-ink">{data.original?.title}</h4>
          <div className="article-body max-h-[50vh] overflow-y-auto rounded-control border border-border p-3 text-sm" dangerouslySetInnerHTML={{ __html: current }} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Güncelleme önerisi (Bölüm 7.9): özet, değişiklik listesi, SEO skoru önce/sonra, meta önerisi ve
 * yazının önce/sonra hâli. "Uygula" yazıyı sitede değiştirir; uygulanan öneri tek tıkla geri alınır.
 */
export function RefreshDialog({ siteId, refreshId, onClose }: { siteId: string; refreshId: string | null; onClose: () => void }) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  const refresh = useRefresh(siteId, refreshId);
  const { apply, revert, dismiss } = useRefreshMutations(siteId);
  const errorText = useRefreshErrorText();
  const data = refresh.data;

  let content = <Skeleton className="h-64 w-full" />;
  let footer = null;
  if (refresh.isError) {
    content = <Alert tone="danger">{t('posts.refresh.errors.internal')}</Alert>;
  } else if (data?.status === 'generating') {
    content = (
      <div className="flex items-center gap-3 py-6" role="status">
        <Spinner />
        <p className="text-ink-muted">{t('posts.refresh.generating')}</p>
      </div>
    );
  } else if (data?.status === 'failed') {
    content = <Alert tone="danger">{errorText(data.error)}</Alert>;
  } else if (data) {
    content = (
      <div className="flex flex-col gap-4">
        {data.status === 'applied' ? (
          <Alert tone="success">{t('posts.refresh.appliedAt', { date: data.appliedAt ? fmt.dateTime(data.appliedAt) : '' })}</Alert>
        ) : data.status === 'reverted' ? (
          <Alert tone="info">{t('posts.refresh.revertedNote')}</Alert>
        ) : data.status === 'dismissed' ? (
          <Alert tone="info">{t('posts.refresh.dismissedNote')}</Alert>
        ) : (
          <Alert tone="info">{t('posts.refresh.applyNote')}</Alert>
        )}
        <Body data={data} />
      </div>
    );
    if (data.status === 'ready') {
      footer = (
        <>
          <Button variant="ghost" onClick={() => dismiss.mutate(data.id, { onSuccess: onClose })} loading={dismiss.isPending}>
            {t('posts.refresh.dismiss')}
          </Button>
          <Button onClick={() => apply.mutate(data.id, { onSuccess: () => toast.success(t('posts.refresh.appliedToast')) })} loading={apply.isPending}>
            <Check aria-hidden />
            {t('posts.refresh.apply')}
          </Button>
        </>
      );
    } else if (data.status === 'applied') {
      footer = (
        <>
          <Button asChild variant="ghost">
            <a href={data.postUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              {t('posts.refresh.viewPost')}
            </a>
          </Button>
          <Button variant="secondary" onClick={() => revert.mutate(data.id, { onSuccess: () => toast.success(t('posts.refresh.revertedToast')) })} loading={revert.isPending}>
            {t('posts.refresh.revert')}
          </Button>
        </>
      );
    }
  }

  return (
    <Dialog open={!!refreshId} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent title={t('posts.refresh.title')} className="sm:max-w-3xl" footer={footer}>
        {content}
      </DialogContent>
    </Dialog>
  );
}
