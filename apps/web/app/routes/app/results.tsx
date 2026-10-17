import { Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import type { SiteDto } from '@upvine/shared';
import { EmptyState, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { SetupEmptyState } from '../../components/setup-empty-state';
import { KeywordsTab } from '../../components/results/keywords';
import { OverviewTab } from '../../components/results/overview';
import { VisibilityTab } from '../../components/results/visibility';
import { HealthReport } from '../../components/sites/health';
import { PostsTab } from '../../components/sites/posts';
import { useAudit, useCurrentSite, useSiteMutations } from '../../lib/sites';

export function meta() {
  return [{ title: 'Kitisel' }];
}

const TABS = ['overview', 'articles', 'keywords', 'health', 'ai'] as const;

function HealthTab({ site }: { site: SiteDto }) {
  const { t } = useTranslation('sites');
  const audit = useAudit(site.id);
  const { reanalyze } = useSiteMutations(site.id);
  if (audit.isPending) return <Skeleton className="h-64 w-full" />;
  if (!audit.data) return <EmptyState icon={Activity} title={t('health.emptyTitle')} body={t('analysis.body')} />;
  return <HealthReport site={site} audit={audit.data} onReanalyze={() => reanalyze.mutate()} reanalyzing={reanalyze.isPending} />;
}

/**
 * Sonuçlar (Bölüm 7.11): Genel Bakış · Yazılarım · Anahtar Kelimeler · Site Sağlığı · AI Görünürlük.
 * Genel bakış ve Anahtar kelimeler Search Console verisiyle (bağlı değilse içerik özeti ve planlanan
 * kelimeler); AI görünürlük Gemini ile ölçülür.
 */
export default function ResultsPage() {
  const { t } = useTranslation('app');
  const tSites = useTranslation('sites').t;
  const { site, isPending } = useCurrentSite();
  // Başka sayfadan doğrudan sekmeye: /app/results?tab=articles
  const [params] = useSearchParams();
  const requested = params.get('tab');
  const initialTab = (TABS as readonly string[]).includes(requested ?? '') ? requested! : 'overview';

  if (isPending) {
    return (
      <>
        <PageHeader title={t('results.title')} />
        <Skeleton className="h-64 w-full" />
      </>
    );
  }
  if (!site) {
    return (
      <>
        <PageHeader title={t('results.title')} />
        <SetupEmptyState icon={Activity} title={tSites('health.emptyTitle')} body={tSites('health.emptyBody')} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('results.title')} />
      <Tabs defaultValue={initialTab}>
        <TabsList aria-label={t('results.title')}>
          {TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {tSites(`results.tabs.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab site={site} />
        </TabsContent>
        <TabsContent value="articles">
          <PostsTab site={site} />
        </TabsContent>
        <TabsContent value="keywords">
          <KeywordsTab site={site} />
        </TabsContent>
        <TabsContent value="health">
          <HealthTab site={site} />
        </TabsContent>
        <TabsContent value="ai">
          <VisibilityTab site={site} />
        </TabsContent>
      </Tabs>
    </>
  );
}
