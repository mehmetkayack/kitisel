import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { BlogPostSummary } from '@upvine/shared';
import { Button } from '@upvine/ui';

/** "12 Eki 2026 · 4 dk okuma" */
export function PostMeta({ post, className }: { post: Pick<BlogPostSummary, 'publishedAt' | 'readingMinutes'>; className?: string }) {
  const { t, i18n } = useTranslation('marketing');
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(post.publishedAt));
  return (
    <p className={className ?? 'text-sm text-ink-muted'}>
      <time dateTime={post.publishedAt}>{date}</time>
      <span aria-hidden> · </span>
      {t('blog.readingTime', { minutes: post.readingMinutes })}
    </p>
  );
}

/** Blog listesi kartı: kapak (yoksa marka zemini), başlık, özet, tarih */
export function PostCard({ post, locale }: { post: BlogPostSummary; locale: string }) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-border bg-surface transition-shadow duration-150 hover:shadow-popover">
      {post.cover ? (
        <img
          src={post.cover.url}
          alt=""
          width={post.cover.width}
          height={post.cover.height}
          loading="lazy"
          className="aspect-[16/9] w-full bg-surface-muted object-cover"
        />
      ) : (
        // Kapaksız yazı: koyu zemin ve logodaki üçgen (dekoratif)
        <div aria-hidden className="flex aspect-[16/9] w-full items-end bg-night p-6">
          <svg viewBox="0 0 16 13" className="h-10 w-auto fill-brand">
            <path d="M8 0 L16 13 L0 13 Z" />
          </svg>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-5">
        <PostMeta post={post} />
        <h2 className="text-xl font-bold text-ink">
          {/* Tüm kart tıklanabilir; tek link (ekran okuyucu tek kez okur) */}
          <Link to={`/${locale}/blog/${post.slug}`} className="after:absolute after:inset-0 hover:text-primary">
            {post.title}
          </Link>
        </h2>
        <p className="text-sm text-ink-muted">{post.excerpt}</p>
      </div>
    </article>
  );
}

/** Yazı sonu çağrısı: tek ana eylem (ücretsiz analiz) */
export function BlogCta({ locale }: { locale: string }) {
  const { t } = useTranslation('marketing');
  return (
    <aside className="flex flex-col gap-4 rounded-[28px] bg-night px-6 py-8 text-night-foreground sm:flex-row sm:items-center sm:justify-between sm:px-10">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-2xl text-night-foreground">{t('blog.ctaTitle')}</h2>
        <p className="text-night-text">{t('blog.ctaBody')}</p>
      </div>
      <Button asChild size="lg" className="h-auto shrink-0 self-start bg-brand py-3 whitespace-normal text-night hover:bg-brand-light sm:self-center">
        <Link to={`/${locale}/free-analysis`}>
          {t('blog.ctaButton')}
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </aside>
  );
}
