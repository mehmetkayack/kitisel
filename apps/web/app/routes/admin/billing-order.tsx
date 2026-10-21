import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import type { AdminBillingOrder } from '@upvine/shared';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Field, Skeleton, Textarea, toast } from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { DetailRow, useFormatDate } from '../../components/admin/admin-ui';
import { OrderStatusBadge, planName, transferAmount, useMoney } from '../../components/billing/billing-ui';
import { useFormatters } from '../../lib/sites';
import { api, ApiError } from '../../lib/api';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

/**
 * Sipariş ayrıntısı. Havale/EFT: ödeme hesaba geçince "Ödeme alındı" ile onaylanır, paket o an açılır
 * (iptal edilmiş havale de onaylanabilir: müşteri sonradan ödemiş olabilir). Kart siparişleri sadece PayTR
 * bildirimiyle kesinleşir.
 */
export default function AdminBillingOrderPage() {
  const { t } = useTranslation('admin');
  const tApp = useTranslation('app').t;
  const { id = '' } = useParams();
  const date = useFormatDate();
  const money = useMoney();
  const fmt = useFormatters();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const order = useQuery({ queryKey: ['admin', 'billing-order', id], queryFn: () => api<AdminBillingOrder>(`/admin/billing/orders/${id}`) });

  const act = useMutation({
    mutationFn: (action: 'approve' | 'cancel') => api<AdminBillingOrder>(`/admin/billing/orders/${id}/${action}`, { method: 'POST', body: { note } }),
    onSuccess: (o, action) => {
      qc.setQueryData(['admin', 'billing-order', id], o);
      void qc.invalidateQueries({ queryKey: ['admin', 'billing/orders'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'billing-pending'] });
      toast.success(t(action === 'approve' ? 'billing.approved' : 'billing.canceled'));
      setNote('');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  const back = (
    <Button asChild variant="ghost" className="self-start">
      <Link to="/admin/billing">
        <ArrowLeft aria-hidden />
        {t('billing.back')}
      </Link>
    </Button>
  );

  if (order.isError) {
    return (
      <>
        {back}
        <Alert tone="danger">{order.error instanceof ApiError ? order.error.message : String(order.error)}</Alert>
      </>
    );
  }
  if (order.isPending) return <Skeleton className="h-96" />;
  const o = order.data;
  const canApprove = o.method === 'bank_transfer' && (o.status === 'pending' || o.status === 'canceled');
  const canCancel = o.status === 'pending';

  return (
    <>
      {back}
      <PageHeader title={o.reference} description={date(o.createdAt, true)} action={<OrderStatusBadge status={o.status} />} />
      {o.testMode ? <Alert tone="warning">{t('billing.testMode')}</Alert> : null}
      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t('billing.order')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              <DetailRow label={t('billing.customer')}>
                <Link to={`/admin/organizations/${o.organizationId}`} className="text-primary hover:underline">
                  {o.organizationName ?? o.organizationId}
                </Link>
              </DetailRow>
              <DetailRow label={t('billing.plan')}>{`${planName(o.plan)} · ${tApp(`billing.interval.${o.interval}`)}`}</DetailRow>
              <DetailRow label={t('billing.method')}>{tApp(`billing.method.${o.method}`)}</DetailRow>
              <DetailRow label={t('billing.net')}>{money.usd(o.netCents)}</DetailRow>
              <DetailRow label={t('billing.vat', { rate: o.vatRate })}>{money.usd(o.vatCents)}</DetailRow>
              <DetailRow label={t('billing.total')}>
                <span className="font-semibold">{money.usd(o.totalCents)}</span>
              </DetailRow>
              {o.method === 'bank_transfer' ? (
                <DetailRow label={t('billing.transferAmount')}>
                  <span className="font-semibold">{transferAmount(o, money)}</span>
                  {o.exchangeRate ? <span className="block text-sm text-ink-muted">{t('billing.rate', { rate: fmt.number(o.exchangeRate) })}</span> : null}
                </DetailRow>
              ) : null}
              {o.paidCents !== null ? <DetailRow label={t('billing.paid')}>{money.usd(o.paidCents)}</DetailRow> : null}
              {o.paidAt ? <DetailRow label={t('billing.paidAt')}>{date(o.paidAt, true)}</DetailRow> : null}
              {o.periodStart && o.periodEnd ? (
                <DetailRow label={t('billing.period')}>
                  {date(o.periodStart)} – {date(o.periodEnd)}
                </DetailRow>
              ) : null}
              {o.failureMessage ? <DetailRow label={t('billing.failure')}>{o.failureMessage}</DetailRow> : null}
              {o.adminNote ? <DetailRow label={t('billing.note')}>{o.adminNote}</DetailRow> : null}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t('billing.invoiceInfo')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              <DetailRow label={t('billing.billingType')}>{tApp(`billing.form.type.${o.billingType}`)}</DetailRow>
              <DetailRow label={t('billing.name')}>{o.billingName}</DetailRow>
              <DetailRow label={t('billing.email')}>
                <a href={`mailto:${o.billingEmail}`} className="break-all text-primary hover:underline">
                  {o.billingEmail}
                </a>
              </DetailRow>
              <DetailRow label={t('billing.phone')}>{o.billingPhone}</DetailRow>
              <DetailRow label={t('billing.address')}>
                <span className="whitespace-pre-wrap">{o.billingAddress}</span>
              </DetailRow>
              <DetailRow label={t('billing.country')}>{fmt.country(o.billingCountry)}</DetailRow>
              <DetailRow label={t('billing.taxId')}>{o.taxId ?? '—'}</DetailRow>
              {o.taxOffice ? <DetailRow label={t('billing.taxOffice')}>{o.taxOffice}</DetailRow> : null}
            </dl>
          </CardContent>
        </Card>
      </div>
      {canApprove || canCancel ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t('billing.actions')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {canApprove ? <p className="measure text-sm text-ink-muted">{t('billing.approveHint', { reference: o.reference, amount: transferAmount(o, money) })}</p> : null}
            <Field label={t('billing.noteLabel')} hint={t('billing.noteHint')}>
              <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              {canApprove ? (
                <Button loading={act.isPending && act.variables === 'approve'} disabled={act.isPending} onClick={() => act.mutate('approve')}>
                  <Check aria-hidden />
                  {t('billing.approve')}
                </Button>
              ) : null}
              {canCancel ? (
                <Button variant="secondary" loading={act.isPending && act.variables === 'cancel'} disabled={act.isPending} onClick={() => act.mutate('cancel')}>
                  <X aria-hidden />
                  {t('billing.cancel')}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
