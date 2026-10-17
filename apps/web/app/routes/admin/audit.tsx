import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { AdminAuditRow } from '@upvine/shared';
import { Alert, DataTable, Skeleton } from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { LoadMore, SearchField, useAdminList, useDebounced, useFormatDate } from '../../components/admin/admin-ui';
import { ApiError } from '../../lib/api';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

/** Denetim kaydı tablosu (sayfa ve kullanıcı detayı ortak kullanır). Eylem adları teknik kimliktir, çevrilmez. */
export function AuditTable({ rows, empty }: { rows: AdminAuditRow[]; empty: string }) {
  const { t } = useTranslation('admin');
  const date = useFormatDate();
  return (
    <DataTable
      caption={t('audit.caption')}
      empty={empty}
      rows={rows}
      rowKey={(r) => r.id}
      columns={[
        { key: 'time', header: t('audit.time'), cell: (r) => <span className="whitespace-nowrap">{date(r.createdAt, true)}</span> },
        { key: 'action', header: t('audit.action'), cell: (r) => <code className="text-xs">{r.action}</code> },
        {
          key: 'user',
          header: t('audit.user'),
          cell: (r) =>
            r.userId ? (
              <Link to={`/admin/users/${r.userId}`} className="text-primary hover:underline">
                {r.userEmail ?? r.userId}
              </Link>
            ) : (
              <span className="text-ink-muted">{t('audit.system')}</span>
            ),
        },
        {
          key: 'target',
          header: t('audit.target'),
          cell: (r) =>
            r.targetType === 'user' && r.targetId ? (
              <Link to={`/admin/users/${r.targetId}`} className="text-primary hover:underline">
                {r.targetType}
              </Link>
            ) : (
              (r.targetType ?? '—')
            ),
        },
        { key: 'ip', header: t('audit.ip'), cell: (r) => <span className="tabular-nums">{r.ip ?? '—'}</span> },
      ]}
    />
  );
}

export default function AdminAudit() {
  const { t } = useTranslation('admin');
  const [filter, setFilter] = useState('');
  const action = useDebounced(filter.trim());
  const list = useAdminList<AdminAuditRow>('audit-logs', { action: action || undefined, limit: '50' });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader title={t('audit.title')} description={t('audit.description')} />
      <SearchField label={t('audit.filter')} placeholder={t('audit.filterPlaceholder')} value={filter} onChange={setFilter} />
      {list.isError ? (
        <Alert tone="danger">{list.error instanceof ApiError ? list.error.message : String(list.error)}</Alert>
      ) : list.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <AuditTable rows={rows} empty={action ? t('list.noResults') : t('list.empty')} />
      )}
      <LoadMore show={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
    </>
  );
}
