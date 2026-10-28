import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PublicTestimonial } from '@upvine/shared';
import { cn } from '@upvine/ui';
import { SectionHeading } from './pricing';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toLocaleUpperCase())
    .join('');
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Puan: yıldızlar görsel, ekran okuyucu "5 üzerinden 4" duyar */
function Rating({ value }: { value: number }) {
  const { t } = useTranslation('marketing');
  return (
    <span className="flex gap-0.5" role="img" aria-label={t('testimonials.rating', { rating: value })}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('size-4', n <= value ? 'fill-current text-ink' : 'text-ink-subtle')} aria-hidden />
      ))}
    </span>
  );
}

/** Ana sayfa: "Müşterilerimiz ne diyor?" — admin panelinden eklenen, bu dilde metni olan yorumlar. */
export function Testimonials({ items }: { items: PublicTestimonial[] }) {
  const { t } = useTranslation('marketing');
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="testimonials" className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6">
      <SectionHeading id="testimonials" eyebrow={t('testimonials.eyebrow')} title={t('testimonials.title')} />
      <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.id} className="flex">
            <figure className="flex w-full min-w-0 flex-col gap-4 rounded-card border border-border bg-surface p-6">
              {item.rating ? <Rating value={item.rating} /> : null}
              <blockquote className="flex-1 text-ink">
                <p className="break-words">{item.quote}</p>
              </blockquote>
              <figcaption className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary"
                >
                  {initials(item.authorName)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold break-words text-ink">{item.authorName}</span>
                  {item.authorTitle ? <span className="text-sm break-words text-ink-muted">{item.authorTitle}</span> : null}
                  {item.website ? (
                    <a href={item.website} rel="nofollow noopener" className="inline-flex min-h-11 items-center self-start text-sm break-all text-primary hover:underline">
                      {hostname(item.website)}
                    </a>
                  ) : null}
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
