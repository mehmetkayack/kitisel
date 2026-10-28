import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ExternalLink, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import type { SalesPostDto } from '@upvine/shared';
import { Alert, Badge, Button, cn, Skeleton } from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { addDays, istanbulToday, META_BUSINESS_URL, mondayOf, PostStatusBadge, SalesTabs } from '../../components/admin/sales-ui';
import { api, ApiError } from '../../lib/api';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

function PostCard({ post }: { post: SalesPostDto }) {
  const { t } = useTranslation('admin');
  return (
    <Link
      to={`/admin/sales/posts/${post.id}`}
      className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 transition-colors duration-150 hover:border-primary"
    >
      <span className="text-xs text-ink-muted tabular-nums">
        {[post.time, post.format].filter(Boolean).join(' · ')}
      </span>
      <span className="font-medium break-words text-ink">{post.title}</span>
      <span className="flex flex-wrap gap-1.5">
        <Badge tone="neutral">{t(`sales.posts.pillar.${post.pillar}`)}</Badge>
        <PostStatusBadge status={post.status} />
      </span>
    </Link>
  );
}

/** Satış → Instagram planı: Pazartesi-Pazar hafta görünümü. Hafta adreste (`?week=`) tutulur. */
export default function AdminSalesPosts() {
  const { t, i18n } = useTranslation('admin');
  const [params, setParams] = useSearchParams();
  const today = istanbulToday();
  const thisMonday = mondayOf(today);
  const raw = params.get('week');
  const monday = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? mondayOf(raw) : thisMonday;
  const sunday = addDays(monday, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const posts = useQuery({
    queryKey: ['admin', 'sales-posts', monday],
    queryFn: () => api<{ items: SalesPostDto[] }>(`/admin/sales/posts?from=${monday}&to=${sunday}`),
  });

  const goTo = (week: string) => setParams(week === thisMonday ? {} : { week }, { replace: true });
  const fmt = (day: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(i18n.language, { ...opts, timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
  const range = `${fmt(monday, { day: 'numeric', month: 'short' })} – ${fmt(sunday, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const newDate = today >= monday && today <= sunday ? today : monday;

  return (
    <>
      <PageHeader title={t('sales.title')} description={t('sales.description')} />
      <SalesTabs />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={t('sales.posts.prevWeek')} onClick={() => goTo(addDays(monday, -7))}>
            <ChevronLeft aria-hidden />
          </Button>
          <h2 className="min-w-0 px-1 text-lg font-semibold text-ink tabular-nums" aria-live="polite">
            <span className="sr-only">{t('sales.posts.week')}: </span>
            {range}
          </h2>
          <Button variant="ghost" size="icon" aria-label={t('sales.posts.nextWeek')} onClick={() => goTo(addDays(monday, 7))}>
            <ChevronRight aria-hidden />
          </Button>
          {monday !== thisMonday ? (
            <Button variant="ghost" onClick={() => goTo(thisMonday)}>
              {t('sales.posts.thisWeek')}
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <a href={META_BUSINESS_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              {t('sales.posts.meta')}
            </a>
          </Button>
          <Button asChild>
            <Link to={`/admin/sales/posts/new?date=${newDate}`}>
              <Plus aria-hidden />
              {t('sales.posts.newPost')}
            </Link>
          </Button>
        </div>
      </div>

      {posts.isError ? (
        <Alert tone="danger">{posts.error instanceof ApiError ? posts.error.message : String(posts.error)}</Alert>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {days.map((day) => {
            const items = posts.data?.items.filter((p) => p.date === day) ?? [];
            const isToday = day === today;
            return (
              <section
                key={day}
                aria-labelledby={`day-${day}`}
                className={cn('flex min-w-0 flex-col gap-2 rounded-card border p-2', isToday ? 'border-primary bg-primary-soft/40' : 'border-border bg-surface-muted/40')}
              >
                <h3 id={`day-${day}`} className="flex items-baseline justify-between gap-2 px-1 text-sm font-semibold text-ink">
                  <span>{fmt(day, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  {isToday ? <span className="text-xs font-medium text-primary">{t('sales.posts.today')}</span> : null}
                </h3>
                {posts.isPending ? (
                  <Skeleton className="h-24" />
                ) : items.length === 0 ? (
                  <p className="px-1 pb-1 text-sm text-ink-muted">{t('sales.posts.emptyDay')}</p>
                ) : (
                  items.map((p) => <PostCard key={p.id} post={p} />)
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
