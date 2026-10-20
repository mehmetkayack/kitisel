import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LOCALES, LOCALE_NATIVE_NAMES, isLocale } from '@upvine/config';
import type { AdminBlogPostRow } from '@upvine/shared';
import { Alert, Button, DataTable, Field, Select, Skeleton } from '@upvine/ui';
import { PageHeader } from '../../components/page-header';
import { LoadMore, SearchField, useAdminList, useDebounced, useFormatDate } from '../../components/admin/admin-ui';
import { BlogStatusBadge } from '../../components/admin/site-ui';
import { ApiError } from '../../lib/api';

export function meta() {
  return [{ title: 'Admin · Upvine' }];
}

const ALL = 'all';

/** Blog yazıları (tüm diller, en yeni önce). Yazı her dil için ayrıdır. */
export default function AdminBlog() {
  const { t } = useTranslation('admin');
  const date = useFormatDate();
  const [search, setSearch] = useState('');
  const [locale, setLocale] = useState<string>(ALL);
  const q = useDebounced(search.trim());
  const list = useAdminList<AdminBlogPostRow>('blog-posts', { q: q || undefined, locale: locale === ALL ? undefined : locale });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title={t('blog.title')}
        description={t('blog.description')}
        action={
          <Button asChild>
            <Link to="/admin/blog/new">
              <Plus aria-hidden />
              {t('blog.new')}
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <SearchField label={t('list.search')} placeholder={t('blog.searchPlaceholder')} value={search} onChange={setSearch} />
        <Field label={t('blog.language')} className="w-full max-w-56">
          <Select
            value={locale}
            onValueChange={setLocale}
            options={[{ value: ALL, label: t('blog.allLanguages') }, ...LOCALES.map((l) => ({ value: l, label: LOCALE_NATIVE_NAMES[l] }))]}
          />
        </Field>
      </div>
      {list.isError ? (
        <Alert tone="danger">{list.error instanceof ApiError ? list.error.message : String(list.error)}</Alert>
      ) : list.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <DataTable
          caption={t('blog.title')}
          empty={q ? t('list.noResults') : t('blog.empty')}
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            {
              key: 'title',
              header: t('blog.postTitle'),
              cell: (r) => (
                <Link to={`/admin/blog/${r.id}`} className="text-primary hover:underline">
                  {r.title}
                </Link>
              ),
            },
            { key: 'locale', header: t('blog.language'), cell: (r) => (isLocale(r.locale) ? LOCALE_NATIVE_NAMES[r.locale] : r.locale) },
            { key: 'status', header: t('blog.statusLabel'), cell: (r) => <BlogStatusBadge status={r.status} /> },
            { key: 'published', header: t('blog.publishedAt'), cell: (r) => <span className="whitespace-nowrap">{date(r.publishedAt) ?? '—'}</span> },
            { key: 'updated', header: t('blog.updatedAt'), cell: (r) => <span className="whitespace-nowrap">{date(r.updatedAt, true)}</span> },
          ]}
        />
      )}
      <LoadMore show={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
    </>
  );
}
