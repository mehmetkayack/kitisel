import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { AdminOrgRow } from '@upvine/shared';
import { Alert, Badge, DataTable, Skeleton } from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { LoadMore, SearchField, useAdminList, useDebounced, useFormatDate } from '../../components/admin/admin-ui';
import { ApiError } from '../../lib/api';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

const STATUS_TONE = {
  none: 'neutral',
  trialing: 'info',
  active: 'success',
  past_due: 'warning',
  paused: 'warning',
  canceled: 'neutral',
} as const;

export function PlanStatusBadge({ status }: { status: AdminOrgRow['planStatus'] }) {
  const { t } = useTranslation('admin');
  return <Badge tone={STATUS_TONE[status]}>{t(`planStatus.${status}`)}</Badge>;
}

export default function AdminOrganizations() {
  const { t } = useTranslation('admin');
  const date = useFormatDate();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const list = useAdminList<AdminOrgRow>('organizations', { q: q || undefined, limit: '25' });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader title={t('orgs.title')} description={t('orgs.description')} />
      <SearchField label={t('list.search')} placeholder={t('list.searchOrgsPlaceholder')} value={search} onChange={setSearch} />
      {list.isError ? (
        <Alert tone="danger">{list.error instanceof ApiError ? list.error.message : String(list.error)}</Alert>
      ) : list.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <DataTable
          caption={t('orgs.caption')}
          empty={q ? t('list.noResults') : t('list.empty')}
          rows={rows}
          rowKey={(o) => o.id}
          columns={[
            {
              key: 'name',
              header: t('orgs.name'),
              cell: (o) => (
                <Link to={`/admin/organizations/${o.id}`} className="group flex flex-col">
                  <span className="font-medium text-primary group-hover:underline">{o.name}</span>
                  <span className="text-ink-muted">{o.slug}</span>
                </Link>
              ),
            },
            {
              key: 'plan',
              header: t('orgs.plan'),
              cell: (o) => (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {o.plan ?? t('orgs.noPlan')}
                  {o.planSource === 'complimentary' ? <Badge tone="info">{t('entitlements.complimentary')}</Badge> : null}
                </span>
              ),
            },
            { key: 'status', header: t('orgs.status'), cell: (o) => <PlanStatusBadge status={o.planStatus} /> },
            { key: 'members', header: t('orgs.members'), cell: (o) => o.memberCount, numeric: true },
            { key: 'created', header: t('orgs.created'), cell: (o) => date(o.createdAt) },
          ]}
        />
      )}
      <LoadMore show={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
    </>
  );
}
