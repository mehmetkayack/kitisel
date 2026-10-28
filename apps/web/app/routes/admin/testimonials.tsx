import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LOCALE_NATIVE_NAMES, isLocale } from '@upvine/config';
import type { AdminTestimonial } from '@upvine/shared';
import { Alert, Button, DataTable, Skeleton } from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { useFormatDate } from '../../components/admin/admin-ui';
import { BlogStatusBadge, TranslationStatusBadge } from '../../components/admin/site-ui';
import { api, ApiError } from '../../lib/api';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

/** Müşteri yorumları (ana sayfa), en yeni önce. Yayımlananlar ana sayfada görünür. */
export default function AdminTestimonials() {
  const { t } = useTranslation('admin');
  const date = useFormatDate();
  const list = useQuery({
    queryKey: ['admin', 'testimonials'],
    queryFn: () => api<{ items: AdminTestimonial[] }>('/admin/testimonials'),
    // Çeviri sürüyorsa durum kendiliğinden güncellensin
    refetchInterval: (q) => (q.state.data?.items.some((x) => x.translationStatus === 'pending' || x.translationStatus === 'running') ? 3000 : false),
  });

  return (
    <>
      <PageHeader
        title={t('testimonials.title')}
        description={t('testimonials.description')}
        action={
          <Button asChild>
            <Link to="/admin/testimonials/new">
              <Plus aria-hidden />
              {t('testimonials.new')}
            </Link>
          </Button>
        }
      />
      {list.isError ? (
        <Alert tone="danger">{list.error instanceof ApiError ? list.error.message : String(list.error)}</Alert>
      ) : list.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <DataTable
          caption={t('testimonials.title')}
          empty={t('testimonials.empty')}
          rows={list.data.items}
          rowKey={(r) => r.id}
          columns={[
            {
              key: 'author',
              header: t('testimonials.author'),
              cell: (r) => (
                <Link to={`/admin/testimonials/${r.id}`} className="text-primary hover:underline">
                  {r.authorName}
                </Link>
              ),
            },
            { key: 'quote', header: t('testimonials.quote'), cell: (r) => <span className="line-clamp-2 max-w-md">{r.quote}</span> },
            { key: 'locale', header: t('testimonials.language'), cell: (r) => (isLocale(r.locale) ? LOCALE_NATIVE_NAMES[r.locale] : r.locale) },
            { key: 'status', header: t('testimonials.statusLabel'), cell: (r) => <BlogStatusBadge status={r.status} /> },
            { key: 'translation', header: t('testimonials.translation.label'), cell: (r) => <TranslationStatusBadge status={r.translationStatus} /> },
            { key: 'updated', header: t('testimonials.updatedAt'), cell: (r) => <span className="whitespace-nowrap">{date(r.updatedAt, true)}</span> },
          ]}
        />
      )}
    </>
  );
}
