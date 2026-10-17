import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PLAN_CODES } from '@upvine/config';
import type { AdminEntitlementsInput, AdminOrgDetail } from '@upvine/shared';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Field, Input, Select, Textarea, toast } from '@upvine/ui';
import { ApiError, api } from '../../lib/api';

const TRIAL = 'trial';

/**
 * Admin → Organizasyon → Paket ve haklar: ödeme almadan paket (tam yetki: Agency), özel aylık makale
 * hakkı, bitiş tarihi ve not. Ödemeli abonelikte paket buradan değişmez (sadece ek hak).
 */
export function EntitlementsCard({ org }: { org: AdminOrgDetail }) {
  const { t } = useTranslation('admin');
  const qc = useQueryClient();
  const paid = org.planSource === 'paid';
  const [plan, setPlan] = useState<string>(org.plan ?? TRIAL);
  const [quota, setQuota] = useState(org.articleQuotaOverride === null ? '' : String(org.articleQuotaOverride));
  const [expires, setExpires] = useState(org.entitlementExpiresAt?.slice(0, 10) ?? '');
  const [note, setNote] = useState(org.entitlementNote ?? '');
  const [quotaError, setQuotaError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: AdminEntitlementsInput) => api<AdminOrgDetail>(`/admin/organizations/${org.id}/entitlements`, { method: 'PUT', body: input }),
    onSuccess: (d) => {
      qc.setQueryData(['admin', 'org', org.id], d);
      void qc.invalidateQueries({ queryKey: ['admin', 'orgs'] });
      toast.success(t('entitlements.saved'));
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = quota.trim() === '' ? null : Number(quota);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 1000)) return setQuotaError(t('entitlements.quotaInvalid'));
    setQuotaError(null);
    save.mutate({ plan: plan === TRIAL ? null : (plan as AdminEntitlementsInput['plan']), articleQuotaOverride: n, expiresAt: expires || null, note: note.trim() || null });
  };

  const fullAccess = () => {
    setPlan('agency');
    setQuota('');
  };

  const u = org.usage;
  return (
    <Card>
      <form method="post" noValidate onSubmit={submit}>
        <CardHeader>
          <CardTitle as="h2">{t('entitlements.title')}</CardTitle>
          <CardDescription>{t('entitlements.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
            <span>{t('entitlements.current', { plan: u.effectivePlan ? t(`entitlements.plans.${u.effectivePlan}`) : t('entitlements.plans.trial') })}</span>
            {org.planSource === 'complimentary' ? (
              <Badge tone="info">
                <Gift aria-hidden />
                {t('entitlements.complimentary')}
              </Badge>
            ) : null}
            <span className="text-ink-muted">
              {t('entitlements.usage', { used: u.articlesThisMonth, limit: u.articleLimit, sites: u.sites, siteLimit: u.siteLimit })}
            </span>
          </div>
          {paid ? <Alert tone="info">{t('entitlements.paidNote')}</Alert> : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('entitlements.plan')} hint={t('entitlements.planHint')}>
              <Select
                value={plan}
                onValueChange={setPlan}
                disabled={paid}
                options={[TRIAL, ...PLAN_CODES].map((p) => ({ value: p, label: t(`entitlements.plans.${p}`) }))}
              />
            </Field>
            <Field label={t('entitlements.quota')} hint={t('entitlements.quotaHint')} error={quotaError}>
              <Input type="number" inputMode="numeric" min={0} max={1000} value={quota} onChange={(e) => setQuota(e.target.value)} />
            </Field>
            <Field label={t('entitlements.expires')} hint={t('entitlements.expiresHint')}>
              <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </Field>
            <Field label={t('entitlements.note')} hint={t('entitlements.noteHint')}>
              <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button type="submit" loading={save.isPending}>
            {t('entitlements.save')}
          </Button>
          {!paid ? (
            <Button type="button" variant="secondary" onClick={fullAccess}>
              <Gift aria-hidden />
              {t('entitlements.fullAccess')}
            </Button>
          ) : null}
        </CardFooter>
      </form>
    </Card>
  );
}
