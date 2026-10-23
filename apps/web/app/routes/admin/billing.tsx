import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { AdminBillingOrder, BillingMethodValue, OrderStatusValue } from '@upvine/shared';
import { Alert, DataTable, Field, Select, Skeleton } from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { LoadMore, SearchField, useAdminList, useDebounced, useFormatDate } from '../../components/admin/admin-ui';
import { OrderStatusBadge, planName, transferAmount, useMoney } from '../../components/billing/billing-ui';
import { ApiError } from '../../lib/api';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

type StatusFilter = 'all' | OrderStatusValue;
type MethodFilter = 'all' | BillingMethodValue;

/** Ödemeler: tüm siparişler (en yeni önce). Havale siparişleri buradan açılıp onaylanır. */
export default function AdminBilling() {
  const { t } = useTranslation('admin');
  const tApp = useTranslation('app').t;
  const date = useFormatDate();
  const money = useMoney();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [method, setMethod] = useState<MethodFilter>('all');
  const q = useDebounced(search.trim());
  const list = useAdminList<AdminBillingOrder>('billing/orders', {
    q: q || undefined,
    status: status === 'all' ? undefined : status,
    method: method === 'all' ? undefined : method,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader title={t('billing.title')} description={t('billing.description')} />
      <div className="flex flex-wrap items-end gap-3">
        <SearchField label={t('list.search')} placeholder={t('billing.searchPlaceholder')} value={search} onChange={setSearch} />
        <Field label={t('billing.statusFilter')} className="w-full max-w-48">
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as StatusFilter)}
            options={(['all', 'pending', 'paid', 'failed', 'canceled'] as const).map((v) => ({ value: v, label: v === 'all' ? t('billing.all') : tApp(`billing.status.${v}`) }))}
          />
        </Field>
        <Field label={t('billing.methodFilter')} className="w-full max-w-48">
          <Select
            value={method}
            onValueChange={(v) => setMethod(v as MethodFilter)}
            options={(['all', 'card', 'bank_transfer'] as const).map((v) => ({ value: v, label: v === 'all' ? t('billing.all') : tApp(`billing.method.${v}`) }))}
          />
        </Field>
      </div>
      {list.isError ? (
        <Alert tone="danger">{list.error instanceof ApiError ? list.error.message : String(list.error)}</Alert>
      ) : list.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <DataTable
          caption={t('billing.title')}
          empty={q ? t('list.noResults') : t('billing.empty')}
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { key: 'date', header: t('billing.date'), cell: (r) => <span className="whitespace-nowrap">{date(r.createdAt, true)}</span> },
            {
              key: 'reference',
              header: t('billing.reference'),
              cell: (r) => (
                <Link to={`/admin/billing/${r.id}`} className="font-mono text-sm text-primary hover:underline">
                  {r.reference}
                </Link>
              ),
            },
            { key: 'org', header: t('billing.customer'), cell: (r) => <span className="break-words">{r.organizationName ?? r.billingName}</span> },
            { key: 'plan', header: t('billing.plan'), cell: (r) => `${planName(r.plan)} · ${tApp(`billing.interval.${r.interval}`)}` },
            { key: 'method', header: t('billing.method'), cell: (r) => tApp(`billing.method.${r.method}`) },
            { key: 'amount', header: t('billing.amount'), cell: (r) => <span className="whitespace-nowrap tabular-nums">{transferAmount(r, money)}</span> },
            { key: 'status', header: t('billing.status'), cell: (r) => <OrderStatusBadge status={r.status} /> },
          ]}
        />
      )}
      <LoadMore show={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
    </>
  );
}
