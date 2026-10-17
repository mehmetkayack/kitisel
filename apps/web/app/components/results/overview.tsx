import { BarChart3, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetricChangeDto, OverviewDto, SiteDto } from '@upvine/shared';
import { Alert, Button, Card, CardContent, EmptyState, LineChart, Skeleton, StatCard } from '@upvine/ui';
import type { StatCardProps } from '@upvine/ui';
import { useOverview, useSearchConsole, useSearchConsoleMutations } from '../../lib/results';
import { useFormatters } from '../../lib/sites';

type Fmt = ReturnType<typeof useFormatters>;

/** Önceki döneme göre değişim: yön ikon + metinle (sadece renkle değil). `lowerIsBetter`: sıra. */
function change(m: MetricChangeDto, fmt: Fmt, t: (k: string, o?: Record<string, unknown>) => string, lowerIsBetter = false): StatCardProps['change'] {
  if (m.previous === null) return undefined;
  const diff = m.value - m.previous;
  if (lowerIsBetter) {
    const gain = Math.round(-diff * 10) / 10;
    if (gain === 0) return { direction: 'flat', text: t('overview.change.flat') };
    return { direction: gain > 0 ? 'up' : 'down', text: t(gain > 0 ? 'overview.change.positionUp' : 'overview.change.positionDown', { value: fmt.number(Math.abs(gain)) }) };
  }
  if (diff === 0) return { direction: 'flat', text: t('overview.change.flat') };
  const pct = m.previous > 0 ? Math.round((diff / m.previous) * 100) : null;
  const value = pct === null ? fmt.number(Math.abs(diff)) : fmt.percent(Math.abs(pct) / 100);
  return { direction: diff > 0 ? 'up' : 'down', text: t(diff > 0 ? 'overview.change.up' : 'overview.change.down', { value }) };
}

function GscSection({ gsc }: { gsc: NonNullable<OverviewDto['gsc']> }) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  const [series, setSeries] = useState<'impressions' | 'clicks'>('impressions');
  const total = gsc[series].value;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">{t('overview.period', { from: fmt.day(gsc.from), to: fmt.day(gsc.to) })}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('overview.metrics.impressions')} value={fmt.number(gsc.impressions.value)} change={change(gsc.impressions, fmt, t)} help={t('overview.help.impressions')} />
        <StatCard label={t('overview.metrics.clicks')} value={fmt.number(gsc.clicks.value)} change={change(gsc.clicks, fmt, t)} help={t('overview.help.clicks')} />
        <StatCard label={t('overview.metrics.position')} value={gsc.position.value ? fmt.number(gsc.position.value) : '—'} change={change(gsc.position, fmt, t, true)} help={t('overview.help.position')} />
        <StatCard label={t('overview.metrics.top10')} value={fmt.number(gsc.top10.value)} change={change(gsc.top10, fmt, t)} help={t('overview.help.top10')} />
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('overview.chartSeries')}>
            {(['impressions', 'clicks'] as const).map((s) => (
              <Button key={s} variant={series === s ? 'secondary' : 'ghost'} aria-pressed={series === s} onClick={() => setSeries(s)}>
                {t(`overview.metrics.${s}`)}
              </Button>
            ))}
          </div>
          <LineChart
            title={t(`overview.chartTitle.${series}`)}
            summary={t('overview.chartSummary', { value: fmt.number(total), metric: t(`overview.metrics.${series}`).toLocaleLowerCase() })}
            points={gsc.daily.map((d) => ({ label: fmt.shortDate(d.date), value: d[series] }))}
            formatValue={(n) => fmt.number(Math.round(n))}
            tableLabel={t('overview.showTable')}
            columnLabel={t('overview.date')}
            valueLabel={t(`overview.metrics.${series}`)}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h3 className="font-heading font-semibold text-ink">{t('overview.winsTitle')}</h3>
          {gsc.wins.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('overview.noWins')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {gsc.wins.map((w) => (
                <li key={w.query} className="flex items-start gap-2 text-sm text-ink">
                  <TrendingUp className="mt-0.5 size-4 shrink-0 text-growth-text" aria-hidden />
                  <span>{t('overview.win', { query: w.query, from: fmt.number(w.from), to: fmt.number(w.to) })}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Sonuçlar → Genel bakış (Bölüm 7.11): Search Console bağlıysa son 28 gün (önceki 28 günle), trend ve
 * kazanımlar; her durumda içerik, site sağlığı ve AI görünürlük özeti.
 */
export function OverviewTab({ site }: { site: SiteDto }) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  const overview = useOverview(site.id);
  const gsc = useSearchConsole(site.id);
  const { connect } = useSearchConsoleMutations(site.id);

  if (overview.isPending || gsc.isPending) return <Skeleton className="h-64 w-full" />;
  const data = overview.data;
  if (!data) return <Alert tone="danger">{t('overview.loadFailed')}</Alert>;
  const conn = gsc.data?.connection;

  let gscBlock;
  if (data.gsc) gscBlock = <GscSection gsc={data.gsc} />;
  else if (!gsc.data?.configured) gscBlock = <Alert tone="info">{t('searchConsole.notConfigured')}</Alert>;
  else if (!conn)
    gscBlock = (
      <EmptyState
        icon={BarChart3}
        title={t('overview.connectTitle')}
        body={t('overview.connectBody')}
        action={
          <Button onClick={() => connect.mutate()} loading={connect.isPending}>
            {t('searchConsole.connect')}
          </Button>
        }
      />
    );
  else if (conn.syncStatus === 'running' || !conn.lastSyncedAt)
    gscBlock = (
      <p role="status" className="text-sm text-ink-muted">
        {t('overview.syncing')}
      </p>
    );
  else gscBlock = <Alert tone="info">{t('overview.noData')}</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="overview-google">
        <h2 id="overview-google" className="font-heading text-lg font-semibold text-ink">
          {t('overview.googleTitle')}
        </h2>
        {gscBlock}
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="overview-content">
        <h2 id="overview-content" className="font-heading text-lg font-semibold text-ink">
          {t('overview.contentTitle')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('overview.content.publishedThisMonth')} value={fmt.number(data.content.publishedThisMonth)} />
          <StatCard label={t('overview.content.waiting')} value={fmt.number(data.content.inReview + data.content.scheduled)} />
          <StatCard label={t('overview.content.averageSeo')} value={data.content.averageSeoScore === null ? '—' : t('health.outOf', { score: data.content.averageSeoScore })} />
          <StatCard
            label={t('overview.content.aiMention')}
            value={data.visibility.rate === null ? '—' : fmt.percent(data.visibility.rate)}
            help={t('overview.help.aiMention')}
          />
        </div>
        {data.auditScore !== null ? <p className="text-sm text-ink-muted">{t('overview.auditScore', { score: data.auditScore })}</p> : null}
      </section>
    </div>
  );
}
