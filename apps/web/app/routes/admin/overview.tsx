import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PLAN_STATUSES } from '@upvine/shared';
import type { AdminStats } from '@upvine/shared';
import { Alert, Card, CardContent, CardHeader, CardTitle, DataTable, Skeleton, StatCard } from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { HealthBadge, useFormatNumber } from '../../components/admin/admin-ui';
import { api, ApiError } from '../../lib/api';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

export default function AdminOverview() {
  const { t, i18n } = useTranslation('admin');
  const num = useFormatNumber();
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api<AdminStats>('/admin/stats') });

  if (stats.isError) {
    return (
      <>
        <PageHeader title={t('overview.title')} />
        <Alert tone="danger">{stats.error instanceof ApiError ? stats.error.message : String(stats.error)}</Alert>
      </>
    );
  }

  const s = stats.data;
  const verifiedPct = s && s.users.total ? Math.round((s.users.verified / s.users.total) * 100) : 0;
  const dayFmt = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <>
      <PageHeader title={t('overview.title')} description={t('overview.description')} />

      {!s ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t('overview.users')}
              value={num(s.users.total)}
              change={{ direction: 'flat', text: t('overview.verified', { percent: verifiedPct }) }}
            />
            <StatCard
              label={t('overview.newUsers')}
              value={num(s.users.newLast7Days)}
              change={{ direction: s.users.newLast7Days > 0 ? 'up' : 'flat', text: t('overview.newUsers30', { count: s.users.newLast30Days }) }}
            />
            <StatCard label={t('overview.organizations')} value={num(s.organizations.total)} />
            <StatCard label={t('overview.sessions')} value={num(s.activeSessions)} help={t('overview.sessionsHint')} />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle as="h2">{t('overview.signupsTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64" role="img" aria-label={t('overview.signupsTitle')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={s.signupsByDay.map((d) => ({ ...d, label: dayFmt.format(new Date(`${d.date}T00:00:00Z`)) }))}>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--ink-muted)', fontSize: 12 }} interval="preserveStartEnd" />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={{ fill: 'var(--ink-muted)', fontSize: 12 }} />
                      <Tooltip
                        cursor={{ fill: 'var(--surface-muted)' }}
                        contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--ink)' }}
                        labelStyle={{ color: 'var(--ink)' }}
                      />
                      {/* "Bizim" büyüme verimiz: yeşil (Bölüm 6.2 grafik paleti) */}
                      <Bar dataKey="count" name={t('overview.signupsSeries')} fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle as="h2">{t('overview.healthTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-3">
                  {(
                    [
                      ['healthDatabase', s.health.database],
                      ['healthRedis', s.health.redis],
                      ['healthWorker', s.health.worker],
                    ] as const
                  ).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <dt className="text-sm text-ink">{t(`overview.${key}`)}</dt>
                      <dd>
                        <HealthBadge value={value} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('overview.planTitle')}</h2>
            <DataTable
              caption={t('overview.planTitle')}
              empty={t('list.empty')}
              rows={PLAN_STATUSES.map((status) => ({ status, count: s.organizations.byPlanStatus[status] }))}
              rowKey={(r) => r.status}
              columns={[
                { key: 'status', header: t('orgs.status'), cell: (r) => t(`planStatus.${r.status}`) },
                { key: 'count', header: t('orgs.title'), cell: (r) => num(r.count), numeric: true },
              ]}
            />
          </section>
        </>
      )}
    </>
  );
}
