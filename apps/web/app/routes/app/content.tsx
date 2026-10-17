import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, PenLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ContentDetailDto, TopicDto } from '@upvine/shared';
import { Alert, Button, DataTable, Skeleton } from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { SetupEmptyState } from '../../components/setup-empty-state';
import { ContentStatusBadge } from '../../components/sites/content-status';
import { api } from '../../lib/api';
import { contentKey, useApiErrorToast, useConnection, useContentList, useCurrentSite, useFormatters } from '../../lib/sites';

export function meta() {
  return [{ title: 'Upvine' }];
}

function WriteNow({ item, disabled }: { item: TopicDto; disabled: boolean }) {
  const { t } = useTranslation('content');
  const qc = useQueryClient();
  const onError = useApiErrorToast();
  const write = useMutation({
    mutationFn: () => api<ContentDetailDto>(`/content/${item.id}/generate`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: contentKey }),
    onError,
  });
  return (
    <Button variant="ghost" onClick={() => write.mutate()} loading={write.isPending} disabled={disabled} aria-label={`${t('list.write')}: ${item.title}`}>
      <PenLine aria-hidden />
      <span className="hidden sm:inline">{t('list.write')}</span>
    </Button>
  );
}

/** İçerikler: planlanan, yazılan, onay bekleyen ve yayınlanan yazılar (Bölüm 7.6, 7.13). */
export default function ContentPage() {
  const { t } = useTranslation('app');
  const tContent = useTranslation('content').t;
  const tSites = useTranslation('sites').t;
  const fmt = useFormatters();
  const { site } = useCurrentSite();
  const content = useContentList();
  const connection = useConnection(site?.id);

  if (content.isPending) {
    return (
      <>
        <PageHeader title={t('content.title')} />
        <Skeleton className="h-48 w-full" />
      </>
    );
  }
  const items = content.data?.items ?? [];
  const usage = content.data?.usage ?? { used: 0, limit: 0 };
  if (items.length === 0) {
    return (
      <>
        <PageHeader title={t('content.title')} />
        <SetupEmptyState icon={FileText} title={t('content.emptyTitle')} body={t('content.emptyBody')} />
      </>
    );
  }
  const quotaFull = usage.used >= usage.limit;
  const notConnected = connection.isSuccess && !connection.data.connection;

  return (
    <>
      <PageHeader title={t('content.title')} description={tContent('list.usage', { used: fmt.number(usage.used), limit: fmt.number(usage.limit) })} />
      {notConnected ? (
        <Alert
          tone="info"
          action={
            <Button asChild variant="secondary">
              <Link to="/app/settings">{tContent('list.connect')}</Link>
            </Button>
          }
        >
          {tContent('list.notConnected')}
        </Alert>
      ) : null}
      <DataTable
        caption={t('content.title')}
        rows={items}
        rowKey={(i) => i.id}
        empty={t('content.emptyTitle')}
        columns={[
          {
            key: 'title',
            header: tSites('topics.addTopic'),
            cell: (i) => (
              <div className="flex min-w-48 flex-col gap-0.5">
                <Link to={`/app/content/${i.id}`} className="font-medium text-primary hover:underline">
                  {i.title}
                </Link>
                {i.keyword ? <span className="text-ink-muted">“{i.keyword}”</span> : null}
              </div>
            ),
          },
          {
            key: 'planned',
            header: tSites('content.planned'),
            cell: (i) => <span className="whitespace-nowrap">{i.plannedAt ? fmt.dateTime(i.plannedAt, site?.timezone) : tSites('content.notScheduled')}</span>,
          },
          { key: 'status', header: tSites('content.status'), cell: (i) => <ContentStatusBadge status={i.status} /> },
          {
            key: 'actions',
            header: <span className="sr-only">{tContent('list.open')}</span>,
            cell: (i) => (i.status === 'planned' ? <WriteNow item={i} disabled={quotaFull} /> : null),
          },
        ]}
      />
    </>
  );
}
