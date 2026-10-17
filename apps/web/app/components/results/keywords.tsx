import { KeyRound, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { KeywordRowDto, SiteDto } from '@upvine/shared';
import { Alert, Badge, Button, DataTable, EmptyState, Skeleton } from '@upvine/ui';
import type { DataTableColumn } from '@upvine/ui';
import { useKeywords } from '../../lib/results';
import { useFormatters } from '../../lib/sites';

const FILTERS = ['all', 'planned', 'google'] as const;
type Filter = (typeof FILTERS)[number];

/** Sıra ve önceki döneme göre değişim (yön ikon + metin; küçük sayı = üst sıra). */
function Position({ row }: { row: KeywordRowDto }) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  if (row.position === null) return <span className="text-ink-muted">—</span>;
  const gain = row.previousPosition === null ? null : Math.round((row.previousPosition - row.position) * 10) / 10;
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <span className="text-ink">{fmt.number(row.position)}</span>
      {gain === null ? null : gain > 0 ? (
        <span className="inline-flex items-center gap-0.5 text-xs text-growth-text">
          <TrendingUp className="size-3.5" aria-hidden />
          <span className="sr-only">{t('keywords.up')}</span>+{fmt.number(gain)}
        </span>
      ) : gain < 0 ? (
        <span className="inline-flex items-center gap-0.5 text-xs text-ink-muted">
          <TrendingDown className="size-3.5" aria-hidden />
          <span className="sr-only">{t('keywords.down')}</span>
          {fmt.number(gain)}
        </span>
      ) : (
        <span className="inline-flex items-center text-xs text-ink-muted">
          <Minus className="size-3.5" aria-hidden />
          <span className="sr-only">{t('keywords.same')}</span>
        </span>
      )}
    </span>
  );
}

/**
 * Sonuçlar → Anahtar kelimeler (Bölüm 7.11): konu planındaki kelimeler + Search Console'da gösterim
 * alan sorgular (son 28 gün). Gösterim alanlar önce.
 */
export function KeywordsTab({ site }: { site: SiteDto }) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  const keywords = useKeywords(site.id);
  const [filter, setFilter] = useState<Filter>('all');

  if (keywords.isPending) return <Skeleton className="h-64 w-full" />;
  const data = keywords.data;
  if (!data) return <Alert tone="danger">{t('overview.loadFailed')}</Alert>;
  if (data.rows.length === 0) return <EmptyState icon={KeyRound} title={t('keywords.emptyTitle')} body={t('keywords.emptyBody')} />;

  const rows = data.rows.filter((r) => filter === 'all' || (filter === 'planned' ? r.planned : (r.impressions ?? 0) > 0));
  const path = (url: string) => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  };
  const columns: DataTableColumn<KeywordRowDto>[] = [
    {
      key: 'keyword',
      header: t('keywords.columns.keyword'),
      cell: (r) => (
        <div className="flex min-w-48 flex-col gap-1">
          <span className="text-ink">{r.keyword}</span>
          <span>
            <Badge tone={r.planned ? 'info' : 'neutral'}>{t(r.planned ? 'keywords.planned' : 'keywords.fromGoogle')}</Badge>
          </span>
        </div>
      ),
    },
    { key: 'position', header: t('keywords.columns.position'), numeric: true, cell: (r) => <Position row={r} /> },
    { key: 'impressions', header: t('keywords.columns.impressions'), numeric: true, cell: (r) => (r.impressions === null ? '—' : fmt.number(r.impressions)) },
    { key: 'clicks', header: t('keywords.columns.clicks'), numeric: true, cell: (r) => (r.clicks === null ? '—' : fmt.number(r.clicks)) },
    {
      key: 'volume',
      header: t('keywords.columns.volume'),
      numeric: true,
      cell: (r) =>
        r.searchVolume === null ? (
          '—'
        ) : (
          <span className="inline-flex items-center justify-end gap-1.5">
            {fmt.number(r.searchVolume)}
            {r.source === 'estimated' ? <Badge>{t('topics.estimated')}</Badge> : null}
          </span>
        ),
    },
    { key: 'difficulty', header: t('keywords.columns.difficulty'), numeric: true, cell: (r) => (r.difficulty === null ? '—' : fmt.number(r.difficulty)) },
    {
      key: 'page',
      header: t('keywords.columns.page'),
      cell: (r) =>
        r.page ? (
          <a href={r.page} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">
            {path(r.page)}
          </a>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {!data.gscConnected ? (
        <Alert
          tone="info"
          action={
            <Button asChild variant="secondary">
              <Link to="/app/settings">{t('keywords.connectAction')}</Link>
            </Button>
          }
        >
          {t('keywords.connectBody')}
        </Alert>
      ) : data.from && data.to ? (
        <p className="text-sm text-ink-muted">{t('overview.period', { from: fmt.day(data.from), to: fmt.day(data.to) })}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('keywords.filterLabel')}>
          {FILTERS.map((f) => (
            <Button key={f} variant={filter === f ? 'secondary' : 'ghost'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {t(`keywords.filters.${f}`)}
            </Button>
          ))}
        </div>
        <p className="text-sm text-ink-muted">{t('keywords.count', { value: fmt.number(data.rows.length), limit: fmt.number(data.limit) })}</p>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.keyword} caption={t('keywords.caption')} empty={t('keywords.noneInFilter')} />
    </div>
  );
}
