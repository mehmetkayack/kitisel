import { useMutation, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, Download, ExternalLink, MinusCircle, Pencil, PenLine, RefreshCw, ThumbsDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { REJECT_REASONS } from '@upvine/shared';
import type { ArticleDto, ContentDetailDto, GenerationStep } from '@upvine/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogClose,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ProgressSteps,
  RadioCards,
  Skeleton,
  toast,
  toastUndo,
} from '@upvine/ui';
import type { ProgressStep } from '@upvine/ui';
import { ArticleEditor } from '../../components/content/article-editor';
import { CoverUpload } from '../../components/content/cover-upload';
import { VersionHistory } from '../../components/content/version-history';
import { ContentStatusBadge } from '../../components/sites/content-status';
import { api, ApiError, refreshSession } from '../../lib/api';
import { authStore } from '../../lib/auth-store';
import { contentDetailKey, contentKey, useApiErrorToast, useContentDetail, useContentList, useCurrentSite, useFormatters } from '../../lib/sites';

export function meta() {
  return [{ title: 'Kitisel' }];
}

const STEPS: GenerationStep[] = ['research', 'draft', 'factCheck', 'seo', 'images'];

function Generating({ step }: { step: GenerationStep | null }) {
  const { t } = useTranslation('content');
  const current = STEPS.indexOf(step ?? 'research');
  const steps: ProgressStep[] = STEPS.map((id, i) => ({ id, label: t(`steps.${id}`), state: i < current ? 'done' : i === current ? 'current' : 'pending' }));
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div role="status" aria-live="polite" className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ink">{t('generating.title')}</h2>
          <p className="text-sm text-ink-muted">{t('generating.body')}</p>
        </div>
        <ProgressSteps steps={steps} label={t('generating.title')} />
      </CardContent>
    </Card>
  );
}

const CHECK_ICON: Record<string, { icon: LucideIcon; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  pass: { icon: CheckCircle2, tone: 'success' },
  warning: { icon: AlertTriangle, tone: 'warning' },
  fail: { icon: AlertCircle, tone: 'danger' },
  not_applicable: { icon: MinusCircle, tone: 'neutral' },
};

function SeoPanel({ article }: { article: ArticleDto }) {
  const { t } = useTranslation('content');
  const tSites = useTranslation('sites').t;
  const level = article.seoScore >= 75 ? 'good' : article.seoScore >= 50 ? 'fair' : 'poor';
  const style = level === 'good' ? CHECK_ICON.pass! : level === 'fair' ? CHECK_ICON.warning! : CHECK_ICON.fail!;
  const Icon = style.icon;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-ink">{t('review.seoTitle')}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-heading text-3xl font-bold text-ink tabular-nums">{tSites('health.outOf', { score: article.seoScore })}</span>
          <Badge tone={style.tone}>
            <Icon aria-hidden />
            {t(`review.seoLevels.${level}`)}
          </Badge>
        </div>
        <details>
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-primary">{t('review.seoDetails')}</summary>
          <ul className="mt-1 flex flex-col gap-2">
            {article.seoChecks.map((c) => {
              const s = CHECK_ICON[c.status] ?? CHECK_ICON.pass!;
              const CIcon = s.icon;
              return (
                <li key={c.id} className="flex items-start justify-between gap-2 text-sm">
                  <span className="text-ink">{t(`seoChecks.${c.id}`, { defaultValue: c.id })}</span>
                  <Badge tone={s.tone}>
                    <CIcon aria-hidden />
                    {tSites(`health.status.${c.status}`)}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}

function VerificationPanel({ article }: { article: ArticleDto }) {
  const { t } = useTranslation('content');
  const v = article.verification;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-ink">{t('review.verificationTitle')}</h2>
        {!v.checked ? (
          <Alert tone="warning">{t('review.verificationUnchecked')}</Alert>
        ) : v.items.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('review.verificationNone')}</p>
        ) : (
          <>
            <p className="text-sm text-ink">{t('review.verificationSummary', { verified: v.verified, corrected: v.corrected, removed: v.removed })}</p>
            <details>
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-primary">{t('review.verificationDetails')}</summary>
              <ul className="mt-1 flex flex-col gap-3">
                {v.items.map((item, i) => (
                  <li key={i} className="flex flex-col gap-1 text-sm">
                    <Badge tone={item.verdict === 'verified' ? 'success' : item.verdict === 'corrected' ? 'warning' : 'danger'} className="self-start">
                      {t(`review.verdicts.${item.verdict}`)}
                    </Badge>
                    <span className="text-ink">{item.verdict === 'corrected' && item.correction ? item.correction : item.claim}</span>
                    {item.sourceUrl ? (
                      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
                        {item.sourceUrl}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Preview({ article }: { article: ArticleDto }) {
  const { t } = useTranslation('content');
  const fmt = useFormatters();
  // Sunucuda sanitize-html ile temizlendi; istemcide ikinci kez DOMPurify (Bölüm 10).
  const safe = useMemo(() => DOMPurify.sanitize(article.html, { ADD_ATTR: ['target'] }), [article.html]);
  return (
    <article className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4">
        <span className="text-xs font-medium tracking-wide text-ink-muted uppercase">{t('review.googlePreview')}</span>
        <span className="text-lg text-primary">{article.metaTitle}</span>
        <span className="text-sm text-ink-muted">{article.metaDescription}</span>
      </div>
      {article.cover ? (
        <figure className="flex flex-col gap-1">
          <img src={article.cover.dataUrl} alt={article.cover.alt} className="aspect-video w-full rounded-card border border-border object-cover" />
          {article.cover.source !== 'ai' ? (
            <figcaption className="text-xs text-ink-muted">
              {t(article.cover.source === 'site' ? 'review.coverSite' : article.cover.source === 'user' ? 'review.coverUser' : 'review.coverGenerated')}
            </figcaption>
          ) : null}
        </figure>
      ) : null}
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">{article.title}</h1>
      <p className="text-sm text-ink-muted">
        {t('detail.words', { value: fmt.number(article.wordCount) })} · {t('detail.version', { value: article.version })}
      </p>
      <div className="article-body" dangerouslySetInnerHTML={{ __html: safe }} />
      {article.infographic ? (
        <figure className="flex max-w-md flex-col gap-2">
          <img
            src={article.infographic.dataUrl}
            alt={article.infographic.alt}
            width={article.infographic.width}
            height={article.infographic.height}
            className="w-full rounded-card border border-border"
          />
          <figcaption className="text-xs text-ink-muted">{t('review.infographicCaption')}</figcaption>
        </figure>
      ) : null}
    </article>
  );
}

/** İndirme: yetkili istek (Bearer) ile dosya alınır ve tarayıcıda kaydedilir. */
async function downloadFile(id: string, format: 'html' | 'md' | 'zip', fileName: string): Promise<void> {
  const go = () => fetch(`/api/v1/content/${id}/download?format=${format}`, { headers: { authorization: `Bearer ${authStore.get().accessToken ?? ''}` } });
  let res = await go();
  if (res.status === 401 && (await refreshSession())) res = await go();
  if (!res.ok) throw new Error(String(res.status));
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function RejectDialog({ open, onOpenChange, onReject, pending }: { open: boolean; onOpenChange: (o: boolean) => void; onReject: (reason: string) => void; pending: boolean }) {
  const { t } = useTranslation('content');
  const [reason, setReason] = useState<string>('too_generic');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('reject.title')} description={t('reject.body')}>
        <RadioCards legend={t('reject.title')} columns={1} value={reason} onValueChange={setReason} options={REJECT_REASONS.map((r) => ({ value: r, label: t(`reject.reasons.${r}`) }))} />
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">{t('common:actions.cancel')}</Button>
          </DialogClose>
          <Button variant="danger" onClick={() => onReject(reason)} loading={pending}>
            {t('reject.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** İçerik üzerinde tek bir POST eylemi (yaz, onayla, yeniden yayınla, geri al). */
function useContentAction(id: string, path: 'generate' | 'approve' | 'retry-publish' | 'restore', onSuccess: (d: ContentDetailDto) => void) {
  const onError = useApiErrorToast();
  return useMutation({ mutationFn: () => api<ContentDetailDto>(`/content/${id}/${path}`, { method: 'POST' }), onSuccess, onError });
}

/**
 * İnceleme ekranı (Bölüm 7.6): solda makale önizlemesi, sağda SEO skoru, doğrulama özeti, kaynaklar ve
 * "Onayla ve planla". Yazılırken adımlar canlı görünür.
 */
export default function ContentDetailPage() {
  const { t } = useTranslation('content');
  const { id = '' } = useParams();
  const fmt = useFormatters();
  const qc = useQueryClient();
  const onError = useApiErrorToast();
  const { site } = useCurrentSite();
  const detail = useContentDetail(id);
  const list = useContentList();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const store = (d: ContentDetailDto) => {
    qc.setQueryData(contentDetailKey(id), d);
    void qc.invalidateQueries({ queryKey: contentKey, exact: true });
  };
  const generate = useContentAction(id, 'generate', store);
  const approve = useContentAction(id, 'approve', store);
  const retryPublish = useContentAction(id, 'retry-publish', store);
  const restore = useContentAction(id, 'restore', store);
  const reject = useMutation({
    mutationFn: (reason: string) => api<ContentDetailDto>(`/content/${id}/reject`, { method: 'POST', body: { reason } }),
    onSuccess: (d) => {
      store(d);
      setRejectOpen(false);
      toastUndo(t('reject.done'), t('common:actions.undo'), () => restore.mutate());
    },
    onError,
  });

  if (detail.isPending) return <Skeleton className="h-96 w-full" />;
  if (detail.isError) return <Alert tone="danger">{detail.error instanceof ApiError ? detail.error.message : t('errors.internal')}</Alert>;
  const d = detail.data;
  const article = d.article;
  const usage = list.data?.usage;
  const quotaFull = !article && !!usage && usage.used >= usage.limit;
  const tz = site?.timezone;
  const errorText = d.errorMessage ? t(`errors.${d.errorMessage}`, { defaultValue: t('errors.internal') }) : null;

  const download = (format: 'html' | 'md' | 'zip') => {
    if (!article) return;
    downloadFile(id, format, `${article.slug}.${format}`).catch(onError);
  };

  const header = (
    <div className="flex flex-col gap-3">
      <Link to="/app/content" className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        {t('detail.back')}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <ContentStatusBadge status={d.status} />
        {d.plannedAt ? <span className="text-sm text-ink-muted">{t('detail.plannedFor', { date: fmt.weekdayDate(d.plannedAt, tz) })}</span> : null}
      </div>
      {!article ? <h1 className="text-2xl font-bold text-ink sm:text-3xl">{d.title}</h1> : null}
    </div>
  );

  // Durum mesajı (yayın, hata, red)
  let statusAlert = null;
  if (d.status === 'failed' && d.errorMessage === 'duplicate_post') {
    // Konu sitedeki bir yazıda zaten var: ikinci yazı yerine o yazının güncellenmesi önerilir.
    statusAlert = (
      <Alert
        tone="warning"
        title={t('duplicate.title')}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link to="/app/results?tab=articles">{t('duplicate.refresh')}</Link>
            </Button>
            <Button variant="ghost" onClick={() => generate.mutate()} loading={generate.isPending}>
              {t('duplicate.writeAnyway')}
            </Button>
          </div>
        }
      >
        <p>{t('duplicate.body')}</p>
        {d.duplicateOfUrl ? (
          <a href={d.duplicateOfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium break-all text-primary hover:underline">
            {d.duplicateOfUrl}
            <ExternalLink className="size-4 shrink-0" aria-hidden />
          </a>
        ) : null}
      </Alert>
    );
  } else if (d.status === 'failed' && errorText) {
    const publishError = d.errorMessage?.startsWith('publish_');
    statusAlert = (
      <Alert
        tone="danger"
        action={
          publishError ? (
            <Button variant="secondary" onClick={() => retryPublish.mutate()} loading={retryPublish.isPending}>
              {t('retryPublish')}
            </Button>
          ) : d.errorMessage !== 'ai_not_configured' ? (
            <Button variant="secondary" onClick={() => generate.mutate()} loading={generate.isPending}>
              {t('retry')}
            </Button>
          ) : undefined
        }
      >
        {errorText}
      </Alert>
    );
  } else if (d.status === 'planned' && d.errorMessage === 'quota_exceeded') {
    statusAlert = <Alert tone="warning">{t('notWritten.quotaFull')}</Alert>;
  } else if (d.status === 'published') {
    statusAlert = (
      <Alert
        tone="success"
        action={
          d.publication?.remoteUrl ? (
            <Button asChild variant="secondary">
              <a href={d.publication.remoteUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                {t('status.viewLive')}
              </a>
            </Button>
          ) : undefined
        }
      >
        {t('status.published')}
      </Alert>
    );
  } else if (d.status === 'scheduled') {
    const now = !d.plannedAt || Date.parse(d.plannedAt) <= Date.now();
    statusAlert = (
      <Alert tone="info">
        {!d.siteConnected ? t('status.scheduledNotConnected') : now ? t('status.scheduledNow') : t('status.scheduledConnected', { date: fmt.weekdayDate(d.plannedAt!, tz) })}
      </Alert>
    );
  } else if (d.status === 'rejected') {
    statusAlert = <Alert tone="warning">{t('status.rejected')}</Alert>;
  }

  if (d.status === 'generating') {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Generating step={d.progressStep} />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {statusAlert}
        {d.status !== 'failed' ? (
          <EmptyState
            icon={PenLine}
            title={t('notWritten.title')}
            body={quotaFull ? t('notWritten.quotaFull') : t('notWritten.body')}
            action={
              <Button onClick={() => generate.mutate()} loading={generate.isPending} disabled={quotaFull}>
                <PenLine aria-hidden />
                {t('notWritten.write')}
              </Button>
            }
          />
        ) : null}
      </div>
    );
  }

  const canApprove = d.status === 'review' || (d.status === 'failed' && !d.errorMessage?.startsWith('publish_'));
  const canRegenerate = ['review', 'failed', 'rejected'].includes(d.status);
  // Yayınlanan yazı CMS'te düzenlenir; burada sadece yayından önce.
  const canEdit = ['review', 'scheduled', 'failed', 'rejected'].includes(d.status);

  if (editing && canEdit) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ArticleEditor
          itemId={id}
          article={article}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            store(saved);
            setEditing(false);
            toast.success(t('editor.saved'));
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      {statusAlert}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Preview article={article} />
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start" aria-label={t('review.seoTitle')}>
          {canApprove ? (
            <Button size="lg" block onClick={() => approve.mutate()} loading={approve.isPending}>
              <CheckCircle2 aria-hidden />
              {t('review.approve')}
            </Button>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                {t('editor.edit')}
              </Button>
            ) : null}
            {canEdit ? (
              <CoverUpload
                itemId={id}
                currentAlt={article.cover?.alt ?? ''}
                onSaved={(saved) => {
                  store(saved);
                  toast.success(t('cover.saved'));
                }}
              />
            ) : null}
            {canRegenerate ? (
              <Button
                variant="secondary"
                onClick={() => generate.mutate()}
                loading={generate.isPending}
                disabled={d.regenerations.used >= d.regenerations.limit}
              >
                <RefreshCw aria-hidden />
                {t('review.regenerateLeft', { left: Math.max(0, d.regenerations.limit - d.regenerations.used), limit: d.regenerations.limit })}
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary">
                  <Download aria-hidden />
                  {t('review.download')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => download('html')}>{t('review.downloadHtml')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => download('md')}>{t('review.downloadMd')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => download('zip')}>{t('review.downloadZip')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <VersionHistory itemId={id} currentVersion={article.version} canRestore={canEdit} onRestored={(restored) => {
              store(restored);
              toast.success(t('versions.restored'));
            }} />
            {['review', 'failed', 'scheduled'].includes(d.status) ? (
              <Button variant="ghost" onClick={() => setRejectOpen(true)}>
                <ThumbsDown aria-hidden />
                {t('review.reject')}
              </Button>
            ) : null}
          </div>
          <SeoPanel article={article} />
          <VerificationPanel article={article} />
          {article.sources.length ? (
            <Card>
              <CardContent className="flex flex-col gap-2">
                <h2 className="text-base font-semibold text-ink">{t('review.sourcesTitle')}</h2>
                <ul className="flex flex-col gap-1 text-sm">
                  {article.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
                        {s.title || s.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
      <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} onReject={(r) => reject.mutate(r)} pending={reject.isPending} />
    </div>
  );
}
