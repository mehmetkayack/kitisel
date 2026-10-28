import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { SalesSummary } from '@upvine/shared';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@upvine/ui';
import { api } from '../../lib/api';
import { useFormatNumber } from './admin-ui';

/** Admin genel bakışında satış özeti. Özet alınamazsa kart hiç görünmez (genel bakışı bozmaz). */
export function SalesOverviewCard() {
  const { t } = useTranslation('admin');
  const num = useFormatNumber();
  const summary = useQuery({ queryKey: ['admin', 'sales-summary'], queryFn: () => api<SalesSummary>('/admin/sales/leads/summary') });
  const s = summary.data;
  if (!s) return null;
  const rows = [
    ['addedToday', s.addedToday, '/admin/sales'],
    ['due', s.due, '/admin/sales?status=due'],
    ['postsThisWeek', s.postsThisWeek, '/admin/sales/posts'],
  ] as const;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle as="h2">{t('sales.overviewCard.title')}</CardTitle>
        <Button asChild variant="ghost">
          <Link to="/admin/sales">
            {t('sales.overviewCard.open')}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-3">
          {rows.map(([key, value, to]) => (
            <div key={key} className="flex flex-col gap-1 rounded-control border border-border p-3">
              <dt className="text-sm text-ink-muted">
                <Link to={to} className="hover:text-ink hover:underline">
                  {t(`sales.overviewCard.${key}`)}
                </Link>
              </dt>
              <dd className="text-2xl font-bold text-ink tabular-nums">{num(value)}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
