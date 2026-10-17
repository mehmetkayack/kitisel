import { CheckCircle2, CircleDashed, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { AdminUserRow } from '@upvine/shared';
import { Alert, Badge, DataTable, Skeleton } from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { LoadMore, SearchField, useAdminList, useDebounced, useFormatDate } from '../../components/admin/admin-ui';
import { ApiError } from '../../lib/api';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

export function UserStatusBadges({ user }: { user: Pick<AdminUserRow, 'emailVerified' | 'isSuperadmin' | 'hasGoogle'> }) {
  const { t } = useTranslation('admin');
  return (
    <div className="flex flex-wrap gap-1.5">
      {user.emailVerified ? (
        <Badge tone="success">
          <CheckCircle2 aria-hidden />
          {t('users.verified')}
        </Badge>
      ) : (
        <Badge tone="warning">
          <CircleDashed aria-hidden />
          {t('users.unverified')}
        </Badge>
      )}
      {user.isSuperadmin ? (
        <Badge tone="info">
          <ShieldCheck aria-hidden />
          {t('users.superadmin')}
        </Badge>
      ) : null}
      {user.hasGoogle ? <Badge tone="neutral">{t('users.google')}</Badge> : null}
    </div>
  );
}

export default function AdminUsers() {
  const { t } = useTranslation('admin');
  const date = useFormatDate();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const list = useAdminList<AdminUserRow>('users', { q: q || undefined, limit: '25' });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader title={t('users.title')} description={t('users.description')} />
      <SearchField label={t('list.search')} placeholder={t('list.searchUsersPlaceholder')} value={search} onChange={setSearch} />
      {list.isError ? (
        <Alert tone="danger">{list.error instanceof ApiError ? list.error.message : String(list.error)}</Alert>
      ) : list.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <DataTable
          caption={t('users.caption')}
          empty={q ? t('list.noResults') : t('list.empty')}
          rows={rows}
          rowKey={(u) => u.id}
          columns={[
            {
              key: 'user',
              header: t('users.user'),
              cell: (u) => (
                <Link to={`/admin/users/${u.id}`} className="group flex flex-col rounded-control">
                  <span className="font-medium text-primary group-hover:underline">{u.name}</span>
                  <span className="text-ink-muted">{u.email}</span>
                </Link>
              ),
            },
            { key: 'status', header: t('users.status'), cell: (u) => <UserStatusBadges user={u} /> },
            { key: 'orgs', header: t('users.organizations'), cell: (u) => u.organizationCount, numeric: true },
            { key: 'login', header: t('users.lastLogin'), cell: (u) => date(u.lastLoginAt, true) ?? t('users.never') },
            { key: 'joined', header: t('users.joined'), cell: (u) => date(u.createdAt) },
          ]}
        />
      )}
      <LoadMore show={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
    </>
  );
}
