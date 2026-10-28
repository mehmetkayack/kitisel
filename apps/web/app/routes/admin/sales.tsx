import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, ExternalLink, FileUp, MoreHorizontal, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { SALES_CHANNELS, SALES_LEAD_STATUSES, SALES_SECTORS } from '@upvine/shared';
import type { SalesLeadDto, SalesLeadPage, SalesSummary } from '@upvine/shared';
import {
  Alert,
  Badge,
  Button,
  cn,
  DataTable,
  Dialog,
  DialogClose,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  Select,
  Skeleton,
  toast,
} from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { LoadMore, SearchField, useDebounced, useFormatDate } from '../../components/admin/admin-ui';
import { SalesImportDialog } from '../../components/admin/sales-import-dialog';
import { DoNotContactBadge, downloadAuthed, FollowUpDueBadge, LeadStatusBadge, SalesTabs } from '../../components/admin/sales-ui';
import { api, ApiError } from '../../lib/api';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

const ALL = 'all';
/** Durum şeridi: tüm adaylar, tek durum, takip zamanı gelenler ya da "bir daha yazma" işaretliler */
type StripValue = typeof ALL | (typeof SALES_LEAD_STATUSES)[number] | 'due' | 'dnc';

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : String(err));

function StripButton({
  active,
  warning,
  label,
  count,
  onClick,
}: {
  active: boolean;
  warning?: boolean;
  label: string;
  count: number | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors duration-150',
        warning
          ? 'border-warning bg-warning-soft text-warning'
          : active
            ? 'border-primary bg-primary-soft text-primary'
            : 'border-border bg-surface text-ink hover:bg-surface-muted',
        active && warning && 'ring-2 ring-warning',
      )}
    >
      {active ? <Check className="size-4" aria-hidden /> : null}
      {label}
      {count !== undefined ? <span className="tabular-nums">{count}</span> : null}
    </button>
  );
}

/** Satış → Müşteri adayları. Filtreler adreste tutulur: ayrıntıdan dönünce liste aynı kalır. */
export default function AdminSalesLeads() {
  const { t, i18n } = useTranslation('admin');
  const date = useFormatDate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const strip = (params.get('status') ?? ALL) as StripValue;
  const sector = params.get('sector') ?? ALL;
  const channel = params.get('channel') ?? ALL;
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounced(search.trim());
  const [importOpen, setImportOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value && value !== ALL) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  useEffect(() => {
    if ((params.get('q') ?? '') !== q) setParam('q', q);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sadece arama değişince
  }, [q]);

  const filter = new URLSearchParams(
    Object.entries({
      status: strip !== ALL && strip !== 'due' && strip !== 'dnc' ? strip : undefined,
      due: strip === 'due' ? '1' : undefined,
      dnc: strip === 'dnc' ? '1' : undefined,
      sector: sector !== ALL ? sector : undefined,
      channel: channel !== ALL ? channel : undefined,
      q: q || undefined,
    }).filter((e): e is [string, string] => !!e[1]),
  ).toString();

  const summary = useQuery({ queryKey: ['admin', 'sales-summary'], queryFn: () => api<SalesSummary>('/admin/sales/leads/summary') });
  const list = useInfiniteQuery({
    queryKey: ['admin', 'sales-leads', filter],
    queryFn: ({ pageParam }) => api<SalesLeadPage>(`/admin/sales/leads?${filter}&limit=50&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const all = list.data?.pages.flatMap((p) => p.items) ?? [];
  // "Bir daha yazma" süzgeci: sunucu işaretlileri de katar, burada sadece onlar gösterilir
  const rows = strip === 'dnc' ? all.filter((l) => l.doNotContact) : all;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'sales-leads'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'sales-summary'] });
  };
  const match = useMutation({
    mutationFn: () => api<{ linked: number }>('/admin/sales/leads/match-users', { method: 'POST' }),
    onSuccess: (r) => {
      toast.success(t('sales.actions.matched', { count: r.linked }));
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const cleanup = useMutation({
    mutationFn: () => api<{ removed: number }>('/admin/sales/leads/cleanup', { method: 'POST' }),
    onSuccess: (r) => {
      toast.success(t('sales.actions.cleaned', { count: r.removed }));
      setCleanupOpen(false);
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadAuthed(`/admin/sales/export.csv?${filter}`, `kitisel-adaylar-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      toast.error(t('sales.actions.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const s = summary.data;
  const replyRate = s?.funnel.find((f) => f.stage === 'replied')?.rate;
  const pct = (n: number) => new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 0 }).format(n);
  const filtered = strip !== ALL || sector !== ALL || channel !== ALL || !!q;

  return (
    <>
      <PageHeader title={t('sales.title')} description={t('sales.description')} />
      <SalesTabs />

      <div className="flex flex-col gap-3">
        <div role="group" aria-label={t('sales.statusFilter.label')} className="flex flex-wrap gap-2">
          <StripButton active={strip === ALL} label={t('sales.statusFilter.all')} count={s?.total} onClick={() => setParam('status', ALL)} />
          {SALES_LEAD_STATUSES.map((st) => (
            <StripButton key={st} active={strip === st} label={t(`sales.status.${st}`)} count={s?.byStatus[st]} onClick={() => setParam('status', st)} />
          ))}
          <StripButton active={strip === 'due'} warning label={t('sales.statusFilter.due')} count={s?.due} onClick={() => setParam('status', 'due')} />
          <StripButton active={strip === 'dnc'} label={t('sales.statusFilter.dnc')} count={s?.doNotContact} onClick={() => setParam('status', 'dnc')} />
        </div>
        {s ? (
          <p className="text-sm text-ink-muted">
            <span className="font-medium text-ink">{t('sales.week.label')}</span>
            {' · '}
            {t('sales.week.sent', { count: s.sentThisWeek })}
            {' · '}
            {t('sales.week.replyRate', { rate: replyRate == null ? t('sales.week.noRate') : pct(replyRate) })}
            {' · '}
            {t('sales.week.customers', { count: s.byStatus.customer })}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:flex lg:w-auto lg:flex-wrap lg:items-end">
          <Field label={t('sales.filters.sector')} className="lg:w-48">
            <Select
              value={sector}
              onValueChange={(v) => setParam('sector', v)}
              options={[{ value: ALL, label: t('sales.filters.all') }, ...SALES_SECTORS.map((v) => ({ value: v, label: t(`sales.sector.${v}`) }))]}
            />
          </Field>
          <Field label={t('sales.filters.channel')} className="lg:w-48">
            <Select
              value={channel}
              onValueChange={(v) => setParam('channel', v)}
              options={[{ value: ALL, label: t('sales.filters.all') }, ...SALES_CHANNELS.map((v) => ({ value: v, label: t(`sales.channel.${v}`) }))]}
            />
          </Field>
          <div className="sm:col-span-2 lg:col-span-1 lg:w-72">
            <SearchField label={t('sales.filters.search')} placeholder={t('sales.filters.searchPlaceholder')} value={search} onChange={setSearch} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/admin/sales/leads/new">
              <Plus aria-hidden />
              {t('sales.actions.newLead')}
            </Link>
          </Button>
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            <FileUp aria-hidden />
            {t('sales.actions.import')}
          </Button>
          <Button variant="secondary" loading={exporting} onClick={() => void exportCsv()}>
            <Download aria-hidden />
            {t('sales.actions.export')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('sales.actions.more')} loading={match.isPending}>
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => match.mutate()}>{t('sales.actions.matchUsers')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCleanupOpen(true)}>{t('sales.actions.cleanup')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {list.isError ? (
        <Alert tone="danger">{errorMessage(list.error)}</Alert>
      ) : list.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <DataTable<SalesLeadDto>
          caption={t('sales.table.caption')}
          empty={filtered ? t('sales.table.empty') : t('sales.table.emptyAll')}
          rows={rows}
          rowKey={(l) => l.id}
          columns={[
            {
              key: 'name',
              header: t('sales.table.name'),
              cell: (l) => (
                <div className="flex min-w-48 flex-col gap-0.5">
                  <Link
                    to={`/admin/sales/leads/${l.id}`}
                    className={cn('font-medium hover:underline', l.doNotContact ? 'text-ink-muted line-through' : 'text-primary')}
                  >
                    {l.name}
                  </Link>
                  <a
                    href={l.website ?? `https://${l.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('sales.table.openSite', { domain: l.domain })}
                    className="inline-flex items-center gap-1 self-start text-ink-muted hover:text-ink hover:underline"
                  >
                    {l.domain}
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </div>
              ),
            },
            { key: 'sector', header: t('sales.table.sector'), cell: (l) => <Badge tone="neutral">{t(`sales.sector.${l.sector}`)}</Badge> },
            { key: 'city', header: t('sales.table.city'), cell: (l) => l.city ?? '-' },
            { key: 'channel', header: t('sales.table.channel'), cell: (l) => <span className="whitespace-nowrap">{t(`sales.channel.${l.channel}`)}</span> },
            { key: 'added', header: t('sales.table.added'), cell: (l) => <span className="whitespace-nowrap">{date(l.addedAt)}</span> },
            {
              key: 'status',
              header: t('sales.table.status'),
              cell: (l) => (
                <div className="flex flex-wrap gap-1.5">
                  <LeadStatusBadge status={l.status} />
                  {l.followUpDue ? <FollowUpDueBadge /> : null}
                  {l.doNotContact ? <DoNotContactBadge /> : null}
                </div>
              ),
            },
          ]}
        />
      )}
      <LoadMore show={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />

      <SalesImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <Dialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
        <DialogContent
          title={t('sales.actions.cleanupTitle')}
          description={t('sales.actions.cleanupBody')}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{t('common:actions.cancel')}</Button>
              </DialogClose>
              <Button variant="danger" loading={cleanup.isPending} onClick={() => cleanup.mutate()}>
                {t('sales.actions.cleanupConfirm')}
              </Button>
            </>
          }
        />
      </Dialog>
    </>
  );
}
