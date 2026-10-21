import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, Landmark, LockKeyhole } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { COUNTRY_CODES, orderAmounts, PLAN_CODES, PLANS } from '@upvine/config';
import type { BillingInterval, PlanCode } from '@upvine/config';
import { checkoutSchema } from '@upvine/shared';
import type { BankAccountDto, BillingOrderDto, BillingOverview, CheckoutFormValues, CheckoutResponse } from '@upvine/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DataTable,
  Field,
  Input,
  RadioCards,
  Select,
  Skeleton,
  Spinner,
  Textarea,
  toast,
} from '@upvine/ui';
import { useFieldError } from '../../components/auth-ui';
import { OrderStatusBadge, planName, transferAmount, useMoney } from '../../components/billing/billing-ui';
import { PageHeader } from '../../components/page-header';
import { api, ApiError } from '../../lib/api';
import { useFormatters } from '../../lib/sites';

export function meta() {
  return [{ title: 'Kitisel' }];
}

declare global {
  interface Window {
    /** PayTR'nin iframeResizer betiği (https://www.paytr.com/js/iframeResizer.min.js) */
    iFrameResize?: (options: Record<string, unknown>, selector: string) => void;
  }
}

const OVERVIEW_KEY = ['billing'] as const;

/**
 * Paket ve ödeme (Bölüm 7.15): kart (PayTR, güvenli ödeme formu iframe'de) veya havale/EFT. Her ödeme bir
 * dönem açar; paket ödeme bildirimi (kart) ya da admin onayı (havale) gelince açılır.
 */
export default function BillingPage() {
  const { t } = useTranslation('app');
  const [params, setParams] = useSearchParams();
  const overview = useQuery({ queryKey: OVERVIEW_KEY, queryFn: () => api<BillingOverview>('/billing') });
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  // PayTR ödeme sonrası dönüş adresini iframe'in içinde açar: üst pencereye taşı
  useEffect(() => {
    if (window.top && window.top !== window.self) window.top.location.href = window.location.href;
  }, []);

  const payment = params.get('payment');
  const returnedOrder = params.get('order');
  const clearReturn = () => setParams({}, { replace: true });

  return (
    <>
      <PageHeader title={t('billing.title')} description={t('billing.description')} />
      {payment === 'success' && returnedOrder ? <PaymentReturn orderId={returnedOrder} onDone={clearReturn} /> : null}
      {payment === 'failed' ? (
        <Alert tone="danger" title={t('billing.return.failedTitle')}>
          {t('billing.return.failedBody')}
        </Alert>
      ) : null}
      {overview.isError ? (
        <Alert tone="danger">{overview.error instanceof ApiError ? overview.error.message : String(overview.error)}</Alert>
      ) : overview.isPending ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <>
          <CurrentPlan data={overview.data} />
          {overview.data.pendingTransfer ? <PendingTransfer order={overview.data.pendingTransfer} accounts={overview.data.bankAccounts} canManage={overview.data.canManage} /> : null}
          {iframeUrl ? (
            <CardPayment url={iframeUrl} onBack={() => setIframeUrl(null)} />
          ) : !overview.data.canManage ? (
            <Alert tone="info">{t('billing.notAllowed')}</Alert>
          ) : !overview.data.methods.card && overview.data.methods.bankTransfer.length === 0 ? (
            <Alert tone="warning" title={t('billing.unavailableTitle')}>
              {t('billing.unavailableBody')}
            </Alert>
          ) : (
            <CheckoutForm data={overview.data} initialPlan={params.get('plan')} onCard={setIframeUrl} />
          )}
          <OrderHistory orders={overview.data.orders} />
        </>
      )}
    </>
  );
}

function CurrentPlan({ data }: { data: BillingOverview }) {
  const { t } = useTranslation('app');
  const fmt = useFormatters();
  const body =
    data.plan && data.planSource === 'paid' && data.currentPeriodEnd
      ? t('billing.current.paid', { date: fmt.date(data.currentPeriodEnd) })
      : data.plan && data.planSource === 'complimentary'
        ? data.entitlementExpiresAt
          ? t('billing.current.complimentaryUntil', { date: fmt.date(data.entitlementExpiresAt) })
          : t('billing.current.complimentary')
        : t('billing.current.trial');
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{data.plan ? t('billing.current.title', { plan: planName(data.plan) }) : t('billing.current.trialTitle')}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
    </Card>
  );
}

/** Kartla ödemeden dönüş: paket ödeme bildirimiyle açılır; birkaç saniye bildirim beklenir. */
function PaymentReturn({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const { t } = useTranslation('app');
  const qc = useQueryClient();
  const started = useRef(Date.now());
  const order = useQuery({
    queryKey: ['billing', 'order', orderId],
    queryFn: () => api<BillingOrderDto>(`/billing/orders/${orderId}`),
    // Bildirim gelene kadar 2 sn'de bir, en fazla 2 dakika
    refetchInterval: (q) => (q.state.data?.status === 'pending' && Date.now() - started.current < 120_000 ? 2000 : false),
  });
  const status = order.data?.status;
  useEffect(() => {
    if (status && status !== 'pending') void qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
  }, [status, qc]);

  if (order.isError) return null;
  if (status === 'paid') {
    return (
      <Alert tone="success" title={t('billing.return.paidTitle')} action={<Button variant="ghost" onClick={onDone}>{t('billing.return.dismiss')}</Button>}>
        {t('billing.return.paidBody')}
      </Alert>
    );
  }
  if (status === 'failed' || status === 'canceled') {
    return (
      <Alert tone="danger" title={t('billing.return.failedTitle')}>
        {t('billing.return.failedBody')}
      </Alert>
    );
  }
  return (
    <Alert tone="info" title={t('billing.return.waitingTitle')}>
      <span className="flex items-center gap-2">
        <Spinner />
        {t('billing.return.waitingBody')}
      </span>
    </Alert>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation('app');
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(value.replace(/\s+/g, value.startsWith('TR') ? '' : ' ')).then(() => toast.success(t('billing.transfer.copied')));
      }}
    >
      <Copy aria-hidden />
    </Button>
  );
}

function PendingTransfer({ order, accounts, canManage }: { order: BillingOrderDto; accounts: BankAccountDto[]; canManage: boolean }) {
  const { t } = useTranslation('app');
  const money = useMoney();
  const fmt = useFormatters();
  const qc = useQueryClient();
  const account = accounts.find((a) => a.currency === order.transferCurrency);
  const test = order.testMode || !!account?.test;
  const cancel = useMutation({
    mutationFn: () => api<BillingOrderDto>(`/billing/orders/${order.id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
      toast.success(t('billing.transfer.canceled'));
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });
  const amount = transferAmount(order, money);
  const rows: { label: string; value: string; copy?: boolean }[] = [
    ...(account ? [{ label: t('billing.transfer.holder'), value: account.holder, copy: true }] : []),
    ...(account?.bankName ? [{ label: t('billing.transfer.bank'), value: account.bankName }] : []),
    ...(account ? [{ label: t('billing.transfer.iban'), value: account.iban, copy: true }] : []),
    { label: t('billing.transfer.amount'), value: amount },
    { label: t('billing.transfer.reference'), value: order.reference, copy: true },
  ];
  return (
    <Card className="border-warning">
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Landmark className="size-5 text-warning" aria-hidden />
          {t('billing.transfer.title')}
        </CardTitle>
        <CardDescription>
          {t('billing.transfer.body', { plan: planName(order.plan), interval: t(`billing.interval.${order.interval}`) })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {test ? <Alert tone="warning" title={t('billing.test.title')}>{t('billing.test.body')}</Alert> : null}
        <dl className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-control bg-surface-muted px-3 py-2">
              <dt className="text-sm text-ink-muted">{r.label}</dt>
              <dd className="flex min-w-0 items-center gap-1 font-medium break-all text-ink tabular-nums">
                {r.value}
                {r.copy ? <CopyButton value={r.value} label={t('billing.transfer.copy', { field: r.label })} /> : null}
              </dd>
            </div>
          ))}
        </dl>
        <Alert tone="warning">{t('billing.transfer.referenceNote', { reference: order.reference })}</Alert>
        {order.transferCurrency === 'TRY' && order.exchangeRate ? (
          <p className="text-sm text-ink-muted">
            {t('billing.transfer.rateNote', { usd: money.usd(order.totalCents), rate: fmt.number(order.exchangeRate) })}
          </p>
        ) : null}
        <p className="text-sm text-ink-muted">{t('billing.transfer.approvalNote')}</p>
      </CardContent>
      {canManage ? (
        <CardFooter>
          <Button variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate()}>
            {t('billing.transfer.cancel')}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

/** PayTR güvenli ödeme formu: kart bilgisi PayTR'nin sayfasında girilir, bize gelmez. */
function CardPayment({ url, onBack }: { url: string; onBack: () => void }) {
  const { t } = useTranslation('app');
  useEffect(() => {
    const resize = () => window.iFrameResize?.({}, '#paytriframe');
    if (window.iFrameResize) {
      resize();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://www.paytr.com/js/iframeResizer.min.js';
    script.async = true;
    script.onload = resize;
    document.body.appendChild(script);
  }, [url]);
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <LockKeyhole className="size-5 text-growth-text" aria-hidden />
          {t('billing.card.title')}
        </CardTitle>
        <CardDescription>{t('billing.card.body')}</CardDescription>
      </CardHeader>
      <CardContent>
        <iframe id="paytriframe" src={url} title={t('billing.card.frameTitle')} className="min-h-[640px] w-full border-0" />
      </CardContent>
      <CardFooter>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden />
          {t('billing.card.back')}
        </Button>
      </CardFooter>
    </Card>
  );
}

function CheckoutForm({ data, initialPlan, onCard }: { data: BillingOverview; initialPlan: string | null; onCard: (url: string) => void }) {
  const { t, i18n } = useTranslation('app');
  const fieldError = useFieldError();
  const money = useMoney();
  const fmt = useFormatters();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  // Ödenmiş dönem sürerken sadece aynı paket yenilenebilir (paket değişikliği destek ile)
  const locked = data.planSource === 'paid' && data.plan ? data.plan : null;
  const plans: PlanCode[] = locked ? [locked] : [...PLAN_CODES];
  const startPlan: PlanCode = locked ?? ((PLAN_CODES as readonly string[]).includes(initialPlan ?? '') ? (initialPlan as PlanCode) : (data.plan ?? 'growth'));
  const methods = [...(data.methods.card ? (['card'] as const) : []), ...(data.methods.bankTransfer.length ? (['bank_transfer'] as const) : [])];
  const p = data.profile;

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    mode: 'onBlur',
    defaultValues: {
      plan: startPlan,
      interval: 'monthly',
      method: methods[0],
      transferCurrency: data.methods.bankTransfer[0] ?? null,
      billingType: p.billingType ?? 'individual',
      billingName: p.billingName ?? '',
      phone: p.phone ?? '',
      address: p.address ?? '',
      country: p.country ?? (i18n.language === 'tr' ? 'TR' : ''),
      taxId: p.taxId ?? '',
      taxOffice: p.taxOffice ?? '',
      acceptTerms: false,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const values = form.watch();
  const country = (values.country ?? '').toUpperCase();
  const amounts = orderAmounts(values.plan, values.interval, country || 'XX', data.vatRate);
  const setOpts = { shouldDirty: true, shouldValidate: form.formState.isSubmitted };

  const countries = [...COUNTRY_CODES].map((c) => ({ value: c, label: fmt.country(c) })).sort((a, b) => a.label.localeCompare(b.label, i18n.language));
  const legal = (slug: string) => `/${i18n.language}/legal/${slug}`;

  const onSubmit = form.handleSubmit(async (v) => {
    setServerError(null);
    try {
      const res = await api<CheckoutResponse>('/billing/checkout', { method: 'POST', body: v });
      if (res.iframeUrl) {
        onCard(res.iframeUrl);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        await qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
        toast.success(t('billing.transfer.created'));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'validation_failed') {
        const fields = err.fieldErrors();
        for (const [name, message] of Object.entries(fields)) {
          if (name in form.getValues()) form.setError(name as keyof CheckoutFormValues, { message });
        }
        if (Object.keys(fields).length > 0) return;
      }
      setServerError(err instanceof ApiError ? err.message : String(err));
    }
  });

  return (
    <Card>
      <form method="post" onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle as="h2">{locked ? t('billing.form.renewTitle') : t('billing.form.title')}</CardTitle>
          <CardDescription>{locked ? t('billing.form.renewBody') : t('billing.form.body')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {serverError ? <Alert tone="danger">{serverError}</Alert> : null}
          {data.bankAccounts.some((a) => a.test) ? (
            <Alert tone="warning" title={t('billing.test.title')}>
              {t('billing.test.body')}
            </Alert>
          ) : null}
          <RadioCards
            legend={t('billing.form.plan')}
            columns={1}
            value={values.plan}
            onValueChange={(v) => form.setValue('plan', v as PlanCode, setOpts)}
            options={plans.map((code) => ({
              value: code,
              label: planName(code),
              description: t('billing.form.planLine', {
                price: money.usd(PLANS[code].priceCents[values.interval]),
                per: t(`billing.per.${values.interval}`),
                articles: PLANS[code].articlesPerMonth,
                sites: PLANS[code].sites,
              }),
            }))}
          />
          <RadioCards
            legend={t('billing.form.interval')}
            value={values.interval}
            onValueChange={(v) => form.setValue('interval', v as BillingInterval, setOpts)}
            options={(['monthly', 'yearly'] as const).map((i) => ({
              value: i,
              label: t(`billing.interval.${i}`),
              description: i === 'yearly' ? t('billing.form.yearlyHint') : t('billing.form.monthlyHint'),
            }))}
          />

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-2 text-base font-semibold text-ink">{t('billing.form.billingInfo')}</legend>
            <RadioCards
              legend={t('billing.form.billingType')}
              value={values.billingType}
              onValueChange={(v) => form.setValue('billingType', v as 'individual' | 'company', setOpts)}
              options={(['individual', 'company'] as const).map((v) => ({ value: v, label: t(`billing.form.type.${v}`) }))}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={values.billingType === 'company' ? t('billing.form.companyName') : t('billing.form.fullName')} error={fieldError(errors.billingName?.message)}>
                <Input autoComplete={values.billingType === 'company' ? 'organization' : 'name'} {...form.register('billingName')} />
              </Field>
              <Field label={t('billing.form.phone')} hint={t('billing.form.phoneHint')} error={fieldError(errors.phone?.message)}>
                <Input type="tel" autoComplete="tel" inputMode="tel" {...form.register('phone')} />
              </Field>
              <Field label={t('billing.form.country')} error={fieldError(errors.country?.message)}>
                <Select value={country || undefined} onValueChange={(v) => form.setValue('country', v, setOpts)} placeholder={t('billing.form.countryPlaceholder')} options={countries} />
              </Field>
              <Field
                label={values.billingType === 'company' ? t('billing.form.taxId') : t('billing.form.taxIdOptional')}
                hint={values.billingType === 'company' ? undefined : t('billing.form.taxIdHint')}
                error={fieldError(errors.taxId?.message)}
              >
                <Input inputMode="numeric" {...form.register('taxId')} />
              </Field>
              {values.billingType === 'company' && country === 'TR' ? (
                <Field label={t('billing.form.taxOffice')} error={fieldError(errors.taxOffice?.message)}>
                  <Input {...form.register('taxOffice')} />
                </Field>
              ) : null}
              <Field label={t('billing.form.address')} error={fieldError(errors.address?.message)} className="sm:col-span-2">
                <Textarea rows={3} autoComplete="street-address" {...form.register('address')} />
              </Field>
            </div>
          </fieldset>

          {methods.length > 1 ? (
            <RadioCards
              legend={t('billing.form.method')}
              value={values.method}
              onValueChange={(v) => form.setValue('method', v as 'card' | 'bank_transfer', setOpts)}
              options={methods.map((m) => ({ value: m, label: t(`billing.method.${m}`), description: t(`billing.form.methodHint.${m}`) }))}
            />
          ) : (
            <p className="text-sm text-ink-muted">
              {t('billing.form.onlyMethod', { method: t(`billing.method.${methods[0] ?? 'card'}`) })}
            </p>
          )}
          {values.method === 'bank_transfer' && data.methods.bankTransfer.length > 1 ? (
            <RadioCards
              legend={t('billing.form.transferCurrency')}
              value={values.transferCurrency ?? ''}
              onValueChange={(v) => form.setValue('transferCurrency', v as 'USD' | 'TRY', setOpts)}
              options={data.methods.bankTransfer.map((c) => ({ value: c, label: t(`billing.currency.${c}`), description: t(`billing.form.currencyHint.${c}`) }))}
            />
          ) : null}

          <section aria-labelledby="billing-summary" className="flex flex-col gap-2 rounded-card bg-surface-muted p-4">
            <h3 id="billing-summary" className="font-semibold text-ink">
              {t('billing.form.summary')}
            </h3>
            <dl className="flex flex-col gap-1 text-sm tabular-nums">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t('billing.form.subtotal', { plan: planName(values.plan), interval: t(`billing.interval.${values.interval}`) })}</dt>
                <dd className="text-ink">{money.usd(amounts.netCents)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{amounts.vatRate ? t('billing.form.vat', { rate: amounts.vatRate }) : t('billing.form.vatExempt')}</dt>
                <dd className="text-ink">{money.usd(amounts.vatCents)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold">
                <dt className="text-ink">{t('billing.form.total')}</dt>
                <dd className="text-ink">{money.usd(amounts.totalCents)}</dd>
              </div>
            </dl>
            {values.method === 'bank_transfer' && values.transferCurrency === 'TRY' ? <p className="text-xs text-ink-muted">{t('billing.form.tryNote')}</p> : null}
            <p className="text-xs text-ink-muted">{t('billing.form.noAutoRenew')}</p>
          </section>

          <div className="flex flex-col gap-1">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-ink">
              <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" aria-invalid={!!errors.acceptTerms} {...form.register('acceptTerms')} />
              <span>
                <Trans
                  t={t}
                  i18nKey="billing.form.accept"
                  components={{
                    sales: <Link to={legal('distance-sales')} target="_blank" className="font-medium text-primary underline-offset-2 hover:underline" />,
                    pre: <Link to={legal('pre-information')} target="_blank" className="font-medium text-primary underline-offset-2 hover:underline" />,
                    refund: <Link to={legal('refund')} target="_blank" className="font-medium text-primary underline-offset-2 hover:underline" />,
                  }}
                />
              </span>
            </label>
            {errors.acceptTerms?.message ? (
              <p className="text-sm text-danger-text" role="alert">
                {fieldError(errors.acceptTerms.message)}
              </p>
            ) : null}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-3">
          <Button type="submit" loading={isSubmitting}>
            {values.method === 'card' ? t('billing.form.submitCard', { amount: money.usd(amounts.totalCents) }) : t('billing.form.submitTransfer')}
          </Button>
          {values.method === 'card' ? (
            <p className="flex items-center gap-2 text-xs text-ink-muted">
              <LockKeyhole className="size-4 shrink-0" aria-hidden />
              {t('billing.form.secure')}
            </p>
          ) : null}
        </CardFooter>
      </form>
    </Card>
  );
}

function OrderHistory({ orders }: { orders: BillingOrderDto[] }) {
  const { t } = useTranslation('app');
  const money = useMoney();
  const fmt = useFormatters();
  if (orders.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('billing.history.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          caption={t('billing.history.title')}
          empty={t('billing.history.empty')}
          rows={orders}
          rowKey={(o) => o.id}
          columns={[
            { key: 'date', header: t('billing.history.date'), cell: (o) => <span className="whitespace-nowrap">{fmt.date(o.createdAt)}</span> },
            { key: 'plan', header: t('billing.history.plan'), cell: (o) => `${planName(o.plan)} · ${t(`billing.interval.${o.interval}`)}` },
            { key: 'method', header: t('billing.history.method'), cell: (o) => t(`billing.method.${o.method}`) },
            { key: 'amount', header: t('billing.history.amount'), cell: (o) => <span className="tabular-nums">{o.method === 'bank_transfer' ? transferAmount(o, money) : money.usd(o.totalCents)}</span> },
            { key: 'reference', header: t('billing.history.reference'), cell: (o) => <span className="font-mono text-xs">{o.reference}</span> },
            {
              key: 'period',
              header: t('billing.history.period'),
              cell: (o) => (o.periodEnd ? <span className="whitespace-nowrap">{fmt.date(o.periodEnd)}</span> : '—'),
            },
            { key: 'status', header: t('billing.history.status'), cell: (o) => <OrderStatusBadge status={o.status} /> },
          ]}
        />
      </CardContent>
    </Card>
  );
}
