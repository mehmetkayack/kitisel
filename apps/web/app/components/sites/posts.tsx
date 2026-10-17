import { AlertCircle, AlertTriangle, CheckCircle2, ExternalLink, FileSearch, Info, Plug, RefreshCw, Sparkles, TrendingDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { PostDto, PostIssueDto, SiteDto } from '@upvine/shared';
import { Alert, Badge, Button, Card, CardContent, EmptyState, Skeleton } from '@upvine/ui';
import { useFormatters, usePosts, useRefreshMutations, useSiteMutations } from '../../lib/sites';
import { HealthScore } from './health';
import { RefreshDialog, useRefreshErrorText } from './refresh-dialog';

const PAGE = 20;

const SEVERITY: Record<PostIssueDto['severity'], { tone: 'danger' | 'warning' | 'neutral'; icon: LucideIcon }> = {
  high: { tone: 'danger', icon: AlertCircle },
  medium: { tone: 'warning', icon: AlertTriangle },
  low: { tone: 'neutral', icon: Info },
};

function IssueItem({ issue }: { issue: PostIssueDto }) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  const s = SEVERITY[issue.severity];
  const Icon = s.icon;
  const value = issue.value !== undefined ? fmt.number(issue.value) : '';
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={s.tone}>
          <Icon aria-hidden />
          {t(`posts.severity.${issue.severity}`)}
        </Badge>
        <span className="text-sm text-ink">{t(`posts.issues.${issue.code}.title`, { value })}</span>
      </div>
      <p className="measure text-sm text-ink-muted">{t(`posts.issues.${issue.code}.fix`)}</p>
    </li>
  );
}

/** Yazının güncelleme önerisi durumu ve eylemi (tek düğme; birincil değil, ekranda birden çok yazı var). */
function RefreshAction({ post, onRequest, onOpen, requesting, canRequest }: { post: PostDto; onRequest: () => void; onOpen: (id: string) => void; requesting: boolean; canRequest: boolean }) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  const errorText = useRefreshErrorText();
  const r = post.refresh;
  if (r?.status === 'generating') {
    return (
      <Button variant="secondary" loading onClick={() => onOpen(r.id)}>
        {t('posts.refresh.generatingShort')}
      </Button>
    );
  }
  if (r?.status === 'ready') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">
          <Sparkles aria-hidden />
          {t('posts.refresh.readyBadge')}
        </Badge>
        <Button variant="secondary" onClick={() => onOpen(r.id)}>
          {t('posts.refresh.review')}
        </Button>
      </div>
    );
  }
  if (r?.status === 'applied') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="success">
          <CheckCircle2 aria-hidden />
          {t('posts.refresh.appliedBadge', { date: r.appliedAt ? fmt.date(r.appliedAt) : '' })}
        </Badge>
        <Button variant="ghost" onClick={() => onOpen(r.id)}>
          {t('posts.refresh.details')}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="secondary" onClick={onRequest} loading={requesting} disabled={!canRequest}>
        <Sparkles aria-hidden />
        {t('posts.refresh.request')}
      </Button>
      {r?.status === 'failed' ? <p className="text-sm text-danger-text">{errorText(r.error)}</p> : null}
    </div>
  );
}

function PostRow({ post, action }: { post: PostDto; action: ReactNode }) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  const date = post.modifiedAt ?? post.publishedAt;
  return (
    <li className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <a href={post.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-medium break-words text-primary hover:underline">
            {post.title}
            <ExternalLink className="size-4 shrink-0" aria-hidden />
            <span className="sr-only">{t('posts.opensNewTab')}</span>
          </a>
          <p className="text-sm text-ink-muted">
            {t('posts.meta', { words: fmt.number(post.wordCount), date: date ? fmt.date(date) : '—' })}
          </p>
          {post.declining && post.clicks ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
              <Badge tone="warning">
                <TrendingDown aria-hidden />
                {t('posts.declining')}
              </Badge>
              {t('posts.clicksTrend', { current: fmt.number(post.clicks.current), previous: fmt.number(post.clicks.previous) })}
            </p>
          ) : null}
        </div>
        <HealthScore score={post.seoScore} size="sm" />
      </div>
      {action}
      {post.issues.length > 0 ? (
        <details className="text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary">
            {t('posts.issueCount', { value: fmt.number(post.issues.length) })}
          </summary>
          <ul className="mt-2 flex flex-col gap-3">
            {post.issues.map((issue) => (
              <IssueItem key={issue.code} issue={issue} />
            ))}
          </ul>
        </details>
      ) : (
        <p className="text-sm text-ink-muted">{t('posts.noIssues')}</p>
      )}
    </li>
  );
}

/**
 * Sonuçlar → Yazılarım: bağlı CMS'teki mevcut yazılar ve ölçülebilen SEO sorunları (trafiği düşenler,
 * sonra en çok sorunu olan önce). Her yazı için yapay zekâ güncelleme önerisi (Bölüm 7.9): kullanıcı
 * önce/sonra görür, onaylarsa sitede uygulanır, geri alınabilir.
 */
export function PostsTab({ site }: { site: SiteDto }) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  const posts = usePosts(site.id, site.postsSyncedAt);
  const { syncPosts } = useSiteMutations(site.id);
  const { request } = useRefreshMutations(site.id);
  const [shown, setShown] = useState(PAGE);
  const [openRefresh, setOpenRefresh] = useState<string | null>(null);
  const syncing = site.postsSyncStatus === 'running' || syncPosts.isPending;

  if (posts.isPending) return <Skeleton className="h-64 w-full" />;
  const data = posts.data;
  if (!data?.connected) {
    return (
      <EmptyState
        icon={Plug}
        title={t('posts.connectTitle')}
        body={t('posts.connectBody')}
        action={
          <Button asChild>
            <Link to="/app/settings">{t('posts.connectAction')}</Link>
          </Button>
        }
      />
    );
  }
  if (!data.supported) return <EmptyState icon={Plug} title={t('posts.unsupportedTitle')} body={t('posts.unsupportedBody')} />;

  const failed = site.postsSyncStatus === 'failed' && !syncPosts.isPending;
  const errorText = failed ? t(`posts.errors.${site.postsSyncError ?? 'internal'}`, { defaultValue: t('posts.errors.internal') }) : null;

  if (data.posts.length === 0) {
    if (syncing) {
      return (
        <div className="flex flex-col gap-4" aria-busy="true">
          <p role="status" className="text-sm text-ink-muted">
            {t('posts.syncing')}
          </p>
          <Skeleton className="h-64 w-full" />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        {errorText ? <Alert tone="danger">{errorText}</Alert> : null}
        <EmptyState
          icon={FileSearch}
          title={t(site.postsSyncStatus === 'done' ? 'posts.noneTitle' : 'posts.scanTitle')}
          body={t(site.postsSyncStatus === 'done' ? 'posts.noneBody' : 'posts.scanBody')}
          action={
            <Button onClick={() => syncPosts.mutate()} loading={syncPosts.isPending}>
              {t(failed ? 'posts.retry' : 'posts.scan')}
            </Button>
          }
        />
      </div>
    );
  }

  const withIssues = data.posts.filter((p) => p.issues.length > 0).length;
  const declining = data.posts.filter((p) => p.declining).length;
  const usage = data.refreshUsage;
  const quotaLeft = usage.used < usage.limit;
  const average = Math.round(data.posts.reduce((sum, p) => sum + p.seoScore, 0) / data.posts.length);
  return (
    <div className="flex flex-col gap-4">
      {errorText ? <Alert tone="danger">{errorText}</Alert> : null}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h2 className="font-heading text-lg font-semibold text-ink">{t('posts.title')}</h2>
              <HealthScore score={average} />
              <p className="measure text-sm text-ink-muted">
                {t('posts.summary', { total: fmt.number(data.posts.length), withIssues: fmt.number(withIssues) })}
              </p>
              {site.postsSyncedAt ? <p className="text-xs text-ink-muted">{t('posts.syncedAt', { date: fmt.dateTime(site.postsSyncedAt) })}</p> : null}
            </div>
            <Button variant="secondary" onClick={() => syncPosts.mutate()} loading={syncing}>
              <RefreshCw aria-hidden />
              {t(syncing ? 'posts.syncingShort' : 'posts.rescan')}
            </Button>
          </div>
          {declining > 0 ? <Alert tone="warning">{t('posts.decliningSummary', { value: fmt.number(declining) })}</Alert> : null}
          <Alert tone="info">{t('posts.refreshIntro')}</Alert>
          <p className="text-sm text-ink-muted">{t('posts.refresh.usage', { used: fmt.number(usage.used), limit: fmt.number(usage.limit) })}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <ul>
            {data.posts.slice(0, shown).map((post) => (
              <PostRow
                key={post.id}
                post={post}
                action={
                  <RefreshAction
                    post={post}
                    canRequest={quotaLeft}
                    requesting={request.isPending && request.variables === post.id}
                    onRequest={() => request.mutate(post.id, { onSuccess: (r) => setOpenRefresh(r.id) })}
                    onOpen={setOpenRefresh}
                  />
                }
              />
            ))}
          </ul>
          {shown < data.posts.length ? (
            <Button variant="ghost" className="mt-2" onClick={() => setShown((n) => n + PAGE)}>
              {t('posts.showMore', { value: fmt.number(data.posts.length - shown) })}
            </Button>
          ) : null}
        </CardContent>
      </Card>
      <RefreshDialog siteId={site.id} refreshId={openRefresh} onClose={() => setOpenRefresh(null)} />
    </div>
  );
}
