import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { LOCALE_NATIVE_NAMES, isLocale } from '@upvine/config';
import type { AdminOrgDetail } from '@upvine/shared';
import { Alert, Card, CardContent, CardHeader, CardTitle, DataTable, Skeleton } from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { DetailRow, useFormatDate } from '../../components/admin/admin-ui';
import { EntitlementsCard } from '../../components/admin/entitlements-card';
import { ApiError, api } from '../../lib/api';
import { PlanStatusBadge } from './organizations';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

export default function AdminOrganization() {
  const { t } = useTranslation('admin');
  const { id = '' } = useParams();
  const date = useFormatDate();
  const org = useQuery({ queryKey: ['admin', 'org', id], queryFn: () => api<AdminOrgDetail>(`/admin/organizations/${id}`) });

  const back = (
    <Link to="/admin/organizations" className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-primary hover:underline">
      <ArrowLeft className="size-4" aria-hidden />
      {t('org.back')}
    </Link>
  );

  if (org.isError) {
    return (
      <>
        {back}
        <Alert tone="danger">{org.error instanceof ApiError ? org.error.message : String(org.error)}</Alert>
      </>
    );
  }
  if (!org.data) {
    return (
      <>
        {back}
        <Skeleton className="h-64" />
      </>
    );
  }

  const o = org.data;
  return (
    <>
      {back}
      <PageHeader title={o.name} description={o.slug} action={<PlanStatusBadge status={o.planStatus} />} />
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t('org.details')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-3">
            <DetailRow label={t('orgs.plan')}>{o.plan ?? t('orgs.noPlan')}</DetailRow>
            <DetailRow label={t('org.language')}>{isLocale(o.defaultLocale) ? LOCALE_NATIVE_NAMES[o.defaultLocale] : o.defaultLocale}</DetailRow>
            <DetailRow label={t('org.trialEnds')}>{date(o.trialEndsAt) ?? t('org.notSet')}</DetailRow>
            <DetailRow label={t('org.periodEnds')}>{date(o.currentPeriodEnd) ?? t('org.notSet')}</DetailRow>
            <DetailRow label={t('org.country')}>{o.billingCountry ?? t('org.notSet')}</DetailRow>
            <DetailRow label={t('orgs.created')}>{date(o.createdAt, true)}</DetailRow>
          </dl>
        </CardContent>
      </Card>
      <EntitlementsCard key={`${o.id}-${o.plan}-${o.articleQuotaOverride}-${o.entitlementExpiresAt}`} org={o} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('org.members')}</h2>
        <DataTable
          caption={t('org.members')}
          empty={t('list.empty')}
          rows={o.members}
          rowKey={(m) => m.userId}
          columns={[
            {
              key: 'user',
              header: t('users.user'),
              cell: (m) => (
                <Link to={`/admin/users/${m.userId}`} className="group flex flex-col">
                  <span className="font-medium text-primary group-hover:underline">{m.name}</span>
                  <span className="text-ink-muted">{m.email}</span>
                </Link>
              ),
            },
            { key: 'role', header: t('user.role'), cell: (m) => t(`user.roles.${m.role}`) },
            { key: 'joined', header: t('org.joined'), cell: (m) => date(m.joinedAt) },
          ]}
        />
      </section>
    </>
  );
}
