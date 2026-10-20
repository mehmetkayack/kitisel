import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data, Link } from 'react-router';
import { isLocale } from '@upvine/config';
import type { Route } from './+types/blog-post';
import { BlogCta, PostMeta } from '../../components/marketing/blog-ui';
import { fetchBlogPost } from '../../lib/blog.server';
import { fixedT } from '../../lib/i18n';
import { publicOrigin } from '../../lib/origin.server';

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!isLocale(params.locale)) throw data(null, { status: 404 });
  const post = await fetchBlogPost(params.locale, params.slug);
  if (!post) throw data(null, { status: 404 });
  return { post, origin: publicOrigin(request) };
}

export function meta({ params, loaderData }: Route.MetaArgs) {
  if (!loaderData || !isLocale(params.locale)) return [];
  const t = fixedT(params.locale, 'common');
  const { post, origin } = loaderData;
  const title = post.metaTitle ?? `${post.title} · ${t('brandName')}`;
  const description = post.metaDescription ?? post.excerpt;
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:type', content: 'article' },
    { property: 'og:title', content: post.metaTitle ?? post.title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: `${origin}/${post.locale}/blog/${post.slug}` },
    ...(post.cover ? [{ property: 'og:image', content: `${origin}${post.cover.url}` }] : []),
    { property: 'article:published_time', content: post.publishedAt },
    { property: 'article:modified_time', content: post.updatedAt },
  ];
}

/** Blog yazısı (SSR). Gövde API'de güvenli etiketlerle temizlenmiş HTML; yapılandırılmış veri BlogPosting. */
export default function BlogPostPage({ params, loaderData }: Route.ComponentProps) {
  const { t } = useTranslation('marketing');
  const tc = useTranslation('common').t;
  const { post, origin } = loaderData;
  const url = `${origin}/${post.locale}/blog/${post.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.metaDescription ?? post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    inLanguage: post.locale,
    mainEntityOfPage: url,
    ...(post.cover ? { image: `${origin}${post.cover.url}` } : {}),
    publisher: { '@type': 'Organization', name: tc('brandName'), url: origin },
  };
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <Link to={`/${params.locale}/blog`} className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        {t('blog.back')}
      </Link>
      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl tracking-tight text-ink sm:text-5xl">{post.title}</h1>
          <PostMeta post={post} />
        </header>
        {post.cover ? (
          <img
            src={post.cover.url}
            alt={post.cover.alt}
            width={post.cover.width}
            height={post.cover.height}
            className="h-auto w-full rounded-card bg-surface-muted"
          />
        ) : null}
        {/* Gövde sunucuda temizlendi (sanitizeArticleHtml): sadece güvenli etiketler, betik yok */}
        <div className="article-body min-w-0 text-ink" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />
      </article>
      <BlogCta locale={params.locale} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </div>
  );
}
