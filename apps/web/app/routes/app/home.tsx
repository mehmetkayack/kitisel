import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { SiteDto, TopicDto } from '@upvine/shared';
import { Alert, Button, Card, CardContent, ChecklistCard, Skeleton } from '@upvine/ui';
import type { ChecklistItem } from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { ContentStatusBadge } from '../../components/sites/content-status';
import { HealthScore } from '../../components/sites/health';
import { useCurrentUser } from '../../lib/auth-store';
import { useContent, useCurrentSite, useFormatters } from '../../lib/sites';

export function meta() {
  return [{ title: 'Upvine' }];
}

function setupSteps(site: SiteDto | null, content: TopicDto[]): Record<'analyzed' | 'brand' | 'connected' | 'searchConsole' | 'firstArticle', boolean> {
  return {
    analyzed: site?.analysisStatus === 'done',
    brand: !!site?.brand?.approved,
    connected: site?.connectionStatus === 'connected',
    searchConsole: false,
    firstArticle: content.some((c) => c.status === 'approved' || c.status === 'scheduled' || c.status === 'published'),
  };
}

function Upcoming({ items, timeZone }: { items: TopicDto[]; timeZone: string }) {
  const { t } = useTranslation('sites');
  const fmt = useFormatters();
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">{t('home.upcomingTitle')}</h2>
          <Link to="/app/calendar" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">
            {t('home.seeCalendar')}
          </Link>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('home.upcomingEmpty')}</p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium text-ink">{item.title}</span>
                  {item.plannedAt ? <span className="text-sm text-ink-muted">{fmt.weekdayDate(item.plannedAt, timeZone)}</span> : null}
                </div>
                <ContentStatusBadge status={item.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Ana sayfa (Bölüm 6.5 madde 4): durum şeridi → kurulum listesi → site sağlığı → sıradaki yazılar.
 * Metrik kartları (yayınlanan yazı, Google'da görünme) Search Console bağlanınca eklenecek (Faz 4).
 */
export default function AppHome() {
  const { t } = useTranslation('app');
  const tSites = useTranslation('sites').t;
  const user = useCurrentUser();
  const fmt = useFormatters();
  const { site, isPending } = useCurrentSite();
  const content = useContent();

  if (isPending) {
    return (
      <>
        <PageHeader title={t('home.greeting', { name: user.name })} />
        <Skeleton className="h-48 w-full" />
      </>
    );
  }

  const items = content.data ?? [];
  const done = setupSteps(site, items);
  const steps: ChecklistItem[] = (Object.keys(done) as (keyof typeof done)[]).map((id) => ({ id, label: t(`setup.steps.${id}`), done: done[id] }));
  const doneCount = steps.filter((s) => s.done).length;
  const upcoming = items.filter((i) => i.plannedAt && i.status !== 'published').slice(0, 5);
  const analyzing = site && (site.analysisStatus === 'pending' || site.analysisStatus === 'running');
  const firstDate = upcoming[0]?.plannedAt;

  return (
    <>
      <PageHeader title={t('home.greeting', { name: user.name })} description={site?.onboardingCompleted ? undefined : t('home.statusSetup')} />
      {analyzing ? <Alert tone="info">{tSites('home.statusAnalyzing', { domain: site.domain })}</Alert> : null}
      {site?.onboardingCompleted && firstDate ? (
        <Alert tone="success">{tSites('home.statusDone', { date: fmt.weekdayDate(firstDate, site.timezone) })}</Alert>
      ) : null}
      {site?.onboardingCompleted ? null : (
        <ChecklistCard
          title={t('setup.title')}
          progressLabel={t('setup.progress', { done: doneCount, total: steps.length })}
          items={steps}
          action={
            <Button asChild>
              <Link to="/app/onboarding">{site ? tSites('home.continueSetup') : t('setup.cta')}</Link>
            </Button>
          }
        />
      )}
      {site?.auditScore !== null && site?.auditScore !== undefined ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-ink">{tSites('home.healthTitle')}</h2>
              <HealthScore score={site.auditScore} size="sm" />
            </div>
            <Link to="/app/results" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">
              {tSites('home.healthLink')}
            </Link>
          </CardContent>
        </Card>
      ) : null}
      {site?.onboardingCompleted ? <Upcoming items={upcoming} timeZone={site.timezone} /> : null}
    </>
  );
}
