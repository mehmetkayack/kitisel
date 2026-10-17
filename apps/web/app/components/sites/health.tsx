import { AlertCircle, AlertTriangle, CheckCircle2, MinusCircle, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AuditCheckDto, CheckStatusDto, SiteAuditDto, SiteDto } from '@upvine/shared';
import { Alert, Badge, Button, Card, CardContent, DataTable } from '@upvine/ui';
import { cn } from '@upvine/ui';
import { useFormatters } from '../../lib/sites';

const STATUS_STYLE: Record<CheckStatusDto, { tone: 'success' | 'warning' | 'danger' | 'neutral'; icon: LucideIcon }> = {
  pass: { tone: 'success', icon: CheckCircle2 },
  warning: { tone: 'warning', icon: AlertTriangle },
  fail: { tone: 'danger', icon: AlertCircle },
  not_applicable: { tone: 'neutral', icon: MinusCircle },
};

/** Kontrol durumu: renk + ikon + metin (Bölüm 6.5, durum asla sadece renkle verilmez). */
export function CheckStatusBadge({ status }: { status: CheckStatusDto }) {
  const { t } = useTranslation('sites');
  const s = STATUS_STYLE[status];
  const Icon = s.icon;
  return (
    <Badge tone={s.tone}>
      <Icon aria-hidden />
      {t(`health.status.${status}`)}
    </Badge>
  );
}

export function scoreLevel(score: number): 'good' | 'fair' | 'poor' {
  return score >= 80 ? 'good' : score >= 50 ? 'fair' : 'poor';
}

/** Puan + seviye (renk + ikon + metin). Yeşil sadece iyi haber için. */
export function HealthScore({ score, size = 'lg' }: { score: number; size?: 'lg' | 'sm' }) {
  const { t } = useTranslation('sites');
  const level = scoreLevel(score);
  const style = level === 'good' ? STATUS_STYLE.pass : level === 'fair' ? STATUS_STYLE.warning : STATUS_STYLE.fail;
  const Icon = style.icon;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className={cn('font-heading font-bold text-ink tabular-nums', size === 'lg' ? 'text-4xl' : 'text-2xl')}>
        {t('health.outOf', { score })}
      </span>
      <Badge tone={style.tone}>
        <Icon aria-hidden />
        {t(`health.levels.${level}`)}
      </Badge>
    </div>
  );
}

function CheckItem({ check }: { check: AuditCheckDto }) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  const value = typeof check.value === 'number' ? fmt.number(check.value) : (check.value ?? '');
  const key = `checks.${check.id}`;
  const showFix = check.status === 'fail' || check.status === 'warning';
  return (
    <li className="flex flex-col gap-2 border-b border-border py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium text-ink">{t(`${key}.title`)}</h4>
        <CheckStatusBadge status={check.status} />
      </div>
      <p className="measure text-sm text-ink-muted">{t(showFix ? `${key}.issue` : `${key}.pass`, { value })}</p>
      {showFix ? (
        <div className="measure rounded-control bg-surface-muted p-3 text-sm text-ink">
          <span className="font-medium">{t('health.howToFix')}: </span>
          {t(`${key}.fix`)}
        </div>
      ) : null}
      {showFix && check.affected.length > 0 ? (
        <details className="text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary">
            {t('health.affected', { value: fmt.number(check.affectedCount) })}
          </summary>
          <ul className="mt-1 flex flex-col gap-1 pl-4">
            {check.affected.map((url) => (
              <li key={url} className="break-all text-ink-muted">
                {url}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

const GROUP_ORDER: CheckStatusDto[] = ['fail', 'warning', 'pass', 'not_applicable'];
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/** Kontroller önem sırasına göre gruplu: sorunlar, iyileştirilebilecekler, yolunda olanlar. */
export function CheckGroups({ checks, headingLevel = 3 }: { checks: AuditCheckDto[]; headingLevel?: 2 | 3 }) {
  const { t } = useTranslation('sites');
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const groups = GROUP_ORDER.map((status) => ({ status, checks: checks.filter((c) => c.status === status) })).filter((g) => g.checks.length > 0);
  return (
    <>
      {groups.map((g) => (
        <section key={g.status} aria-labelledby={`group-${g.status}`} className="flex flex-col gap-2">
          <Heading id={`group-${g.status}`} className="text-base font-semibold text-ink">
            {t(`health.groups.${g.status}`)} ({g.checks.length})
          </Heading>
          <Card>
            <CardContent className="py-1 sm:py-1">
              <ul>
                {[...g.checks]
                  .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
                  .map((c) => (
                    <CheckItem key={c.id} check={c} />
                  ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ))}
    </>
  );
}

/** Taranan sayfalar ve yinelenen başlık uyarısı. */
export function PagesTable({ pages }: { pages: { url: string; title: string | null; duplicateTitle: boolean; wordCount?: number }[] }) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  const hasWords = pages.some((p) => p.wordCount !== undefined);
  return (
    <DataTable
      caption={t('health.pages.title')}
      empty="—"
      rows={pages}
      rowKey={(p) => p.url}
      columns={[
        { key: 'url', header: t('health.pages.url'), cell: (p) => <span className="break-all">{p.url.replace(/^https?:\/\//, '')}</span> },
        {
          key: 'title',
          header: t('health.pages.pageTitle'),
          cell: (p) => (
            <div className="flex flex-col items-start gap-1">
              <span>{p.title ?? t('health.pages.noTitle')}</span>
              {p.duplicateTitle ? (
                <Badge tone="warning">
                  <AlertTriangle aria-hidden />
                  {t('health.pages.duplicate')}
                </Badge>
              ) : null}
            </div>
          ),
        },
        ...(hasWords ? [{ key: 'words', header: t('health.pages.words'), numeric: true, cell: (p: { wordCount?: number }) => fmt.number(p.wordCount ?? 0) }] : []),
      ]}
    />
  );
}

/** Kontrol özeti: sorun / uyarı / geçen sayıları (renk + metin). */
export function CheckSummary({ checks }: { checks: AuditCheckDto[] }) {
  const { t } = useTranslation('sites');
  return (
    <ul className="flex flex-wrap gap-2">
      {(['fail', 'warning', 'pass'] as const).map((s) => {
        const Icon = STATUS_STYLE[s].icon;
        return (
          <li key={s}>
            <Badge tone={STATUS_STYLE[s].tone}>
              <Icon aria-hidden />
              {t(`health.groups.${s}`)}: {checks.filter((c) => c.status === s).length}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

/** Site sağlığı raporu: puan, özet ve sorunlar önem sırasına göre (Bölüm 7.2, 7.10). */
export function HealthReport({ site, audit, onReanalyze, reanalyzing }: { site: SiteDto; audit: SiteAuditDto; onReanalyze: () => void; reanalyzing: boolean }) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  const busy = site.analysisStatus === 'pending' || site.analysisStatus === 'running';

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-ink">{t('health.title')}</h2>
              <HealthScore score={audit.score} />
              <p className="text-sm text-ink-muted">
                {t('health.analyzedAt', { date: fmt.dateTime(audit.createdAt) })} · {t('health.pagesCrawled', { value: fmt.number(audit.pagesCrawled) })}
              </p>
            </div>
            <Button variant="secondary" onClick={onReanalyze} loading={reanalyzing} disabled={busy}>
              <RefreshCw aria-hidden />
              {t('health.reanalyze')}
            </Button>
          </div>
          <CheckSummary checks={audit.checks} />
        </CardContent>
      </Card>

      {busy ? <Alert tone="info">{t('health.reanalyzing')}</Alert> : null}

      <CheckGroups checks={audit.checks} />

      <section aria-labelledby="pages-title" className="flex flex-col gap-2">
        <h3 id="pages-title" className="text-base font-semibold text-ink">
          {t('health.pages.title')}
        </h3>
        <PagesTable pages={audit.pages} />
      </section>
    </div>
  );
}
