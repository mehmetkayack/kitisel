import { ArrowLeft, ArrowRight, Newspaper } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Link } from 'react-router';
import { isLocale } from '@upvine/config';
import { Button, EmptyState } from '@upvine/ui';
import type { Route } from './+types/blog';
import { BlogCta, PostCard } from '../../components/marketing/blog-ui';
import { fetchBlogPage } from '../../lib/blog.server';
import { fixedT } from '../../lib/i18n';

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!isLocale(params.locale)) throw data(null, { status: 404 });
  const raw = new URL(request.url).searchParams.get('page');
  const page = raw === null ? 1 : Number(raw);
  // Geçersiz ya da boş sayfa numarası: 404 (arama motoru sonsuz sayfa taramasın)
  if (!Number.isInteger(page) || page < 1 || page > 1000) throw data(null, { status: 404 });
  const result = await fetchBlogPage(params.locale, page);
  if (page > 1 && result.items.length === 0) throw data(null, { status: 404 });
  return result;
}

export function meta({ params, loaderData }: Route.MetaArgs) {
  if (!isLocale(params.locale)) return [];
  const t = fixedT(params.locale, 'marketing');
  const suffix = loaderData && loaderData.page > 1 ? ` · ${t('blog.pageN', { page: loaderData.page })}` : '';
  return [{ title: `${t('blog.metaTitle')}${suffix}` }, { name: 'description', content: t('blog.body') }];
}

/** Blog listesi (SSR): yalnızca bu dildeki yayımlanmış yazılar, en yeni önce. */
export default function BlogPage({ params, loaderData }: Route.ComponentProps) {
  const { t } = useTranslation('marketing');
  const locale = params.locale;
  const { items, page, hasMore } = loaderData;
  return (
    <div className="flex flex-col">
      <section className="bg-night text-night-foreground">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 pt-10 pb-14 sm:px-6 sm:pt-14">
          <p className="text-sm font-semibold text-brand-light">{t('blog.eyebrow')}</p>
          <h1 className="text-4xl tracking-tight text-night-foreground sm:text-5xl">{t('blog.title')}</h1>
          <p className="measure text-lg text-night-text">{t('blog.body')}</p>
        </div>
      </section>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6">
        {items.length === 0 ? (
          <EmptyState
            icon={Newspaper}
            title={t('blog.emptyTitle')}
            body={t('blog.emptyBody')}
            action={
              <Button asChild>
                <Link to={`/${locale}/free-analysis`}>{t('blog.ctaButton')}</Link>
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((post) => (
              <li key={post.id} className="flex">
                <PostCard post={post} locale={locale} />
              </li>
            ))}
          </ul>
        )}
        {page > 1 || hasMore ? (
          <nav aria-label={t('blog.pagination')} className="flex flex-wrap justify-between gap-3">
            {page > 1 ? (
              <Button asChild variant="secondary">
                <Link to={page === 2 ? `/${locale}/blog` : `/${locale}/blog?page=${page - 1}`} rel="prev">
                  <ArrowLeft aria-hidden />
                  {t('blog.newer')}
                </Link>
              </Button>
            ) : (
              <span />
            )}
            {hasMore ? (
              <Button asChild variant="secondary">
                <Link to={`/${locale}/blog?page=${page + 1}`} rel="next">
                  {t('blog.older')}
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            ) : null}
          </nav>
        ) : null}
        {items.length > 0 ? <BlogCta locale={locale} /> : null}
      </div>
    </div>
  );
}
