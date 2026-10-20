import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { AdminContactMessage, ContactStatus } from '@upvine/shared';
import { Alert, DataTable, Field, Select, Skeleton } from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { LoadMore, SearchField, useAdminList, useDebounced, useFormatDate } from '../../components/admin/admin-ui';
import { MessageStatusBadge } from '../../components/admin/site-ui';
import { ApiError } from '../../lib/api';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

type Filter = 'inbox' | ContactStatus;

/** İletişim formundan gelen mesajlar (en yeni önce). "Gelen kutusu" arşivlenmemiş mesajlardır. */
export default function AdminMessages() {
  const { t } = useTranslation('admin');
  const date = useFormatDate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('inbox');
  const q = useDebounced(search.trim());
  const list = useAdminList<AdminContactMessage>('contact-messages', { q: q || undefined, status: filter === 'inbox' ? undefined : filter });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader title={t('messages.title')} description={t('messages.description')} />
      <div className="flex flex-wrap items-end gap-3">
        <SearchField label={t('list.search')} placeholder={t('messages.searchPlaceholder')} value={search} onChange={setSearch} />
        <Field label={t('messages.filter')} className="w-full max-w-56">
          <Select
            value={filter}
            onValueChange={(v) => setFilter(v as Filter)}
            options={(['inbox', 'new', 'read', 'archived'] as const).map((v) => ({ value: v, label: t(`messages.filters.${v}`) }))}
          />
        </Field>
      </div>
      {list.isError ? (
        <Alert tone="danger">{list.error instanceof ApiError ? list.error.message : String(list.error)}</Alert>
      ) : list.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <DataTable
          caption={t('messages.title')}
          empty={q ? t('list.noResults') : t('messages.empty')}
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { key: 'date', header: t('messages.date'), cell: (r) => <span className="whitespace-nowrap">{date(r.createdAt, true)}</span> },
            {
              key: 'name',
              header: t('messages.name'),
              cell: (r) => (
                <Link to={`/admin/messages/${r.id}`} className={r.status === 'new' ? 'font-semibold text-primary hover:underline' : 'text-primary hover:underline'}>
                  {r.name}
                </Link>
              ),
            },
            { key: 'email', header: t('messages.email'), cell: (r) => <span className="break-all">{r.email}</span> },
            { key: 'company', header: t('messages.company'), cell: (r) => r.company ?? '—' },
            { key: 'preview', header: t('messages.message'), cell: (r) => <span className="line-clamp-1 max-w-72 text-ink-muted">{r.message}</span> },
            { key: 'status', header: t('messages.statusLabel'), cell: (r) => <MessageStatusBadge status={r.status} /> },
          ]}
        />
      )}
      <LoadMore show={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
    </>
  );
}
