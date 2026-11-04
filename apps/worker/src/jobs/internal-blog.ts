import sharp from 'sharp';
import { AIError, blogTranslateOutputSchema, blogTranslatePrompt, blogTranslateSystem } from '@upvine/ai';
import { CONTENT_LANGUAGES, LOCALES } from '@upvine/config';
import { blogPostsRepository } from '@upvine/db';
import type { KitiselBlogSink, PublishableArticle, PublishResult } from '@upvine/publishers';
import { PublishError } from '@upvine/publishers';
import { countWords, sanitizeArticleHtml, slugify } from '@upvine/seo';
import type { BlogTranslateJobData } from '@upvine/shared';
import { RetryableJobError } from './site-jobs';
import type { JobDeps, JobRun } from './site-jobs';

/** Okuma hızı: dakikada ~220 kelime (admin blog servisiyle aynı) */
const WORDS_PER_MINUTE = 220;

const languageName = (code: string) => CONTENT_LANGUAGES.find((l) => l.code === code)?.englishName ?? code;
const readingMinutes = (html: string) => Math.max(1, Math.round(countWords(html) / WORDS_PER_MINUTE));
const clip = (s: string | null | undefined, max: number) => {
  const v = (s ?? '').replace(/\s+/g, ' ').trim();
  return v.length <= max ? v : `${v.slice(0, max - 1).trimEnd()}…`;
};
/** İlk paragrafın düz metni (özet yoksa) */
const firstParagraph = (html: string) => /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, '') ?? '';

/** Kapak blog kurallarıyla: oran korunur, en fazla 1600 px, WebP */
async function blogCover(cover: PublishableArticle['cover']) {
  if (!cover) return null;
  try {
    const out = await sharp(cover.data).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    return { data: out.data, alt: clip(cover.alt, 250), width: out.info.width, height: out.info.height };
  } catch {
    return null;
  }
}

/**
 * Yazım hattının yazısını Kitisel blogunda taslak açar ve diğer arayüz dillerine çeviri işlerini kuyruğa ekler.
 * Admin her dili okuyup ayrı ayrı yayınlar.
 */
export function internalBlogSink(opts: {
  orgId: string;
  webUrl: string;
  enqueueTranslation: (data: BlogTranslateJobData) => Promise<void>;
}): KitiselBlogSink {
  return {
    async createDraft(article: PublishableArticle): Promise<PublishResult> {
      const locale = article.language.toLowerCase();
      if (!(LOCALES as readonly string[]).includes(locale)) throw new PublishError('rejected', `Kitisel blogu ${locale} dilini desteklemiyor`);
      const bodyHtml = sanitizeArticleHtml(article.html);
      const post = await blogPostsRepository.createFromPipeline({
        locale,
        translationGroupId: null,
        slug: await blogPostsRepository.freeSlug(locale, slugify(article.slug || article.title, 110)),
        title: clip(article.title, 200),
        excerpt: clip(article.metaDescription || firstParagraph(bodyHtml) || article.title, 320),
        bodyHtml,
        metaTitle: clip(article.metaTitle, 80) || null,
        metaDescription: clip(article.metaDescription, 200) || null,
        status: 'draft',
        publishedAt: null,
        readingMinutes: readingMinutes(bodyHtml),
        cover: await blogCover(article.cover),
      });
      for (const target of LOCALES.filter((l) => l !== locale)) {
        await opts.enqueueTranslation({ orgId: opts.orgId, sourcePostId: post.id, locale: target });
      }
      return { remoteId: post.id, remoteUrl: `${opts.webUrl.replace(/\/+$/, '')}/${locale}/blog/${post.slug}` };
    },
  };
}

/**
 * Kaynak taslağı bir dile çevirip aynı grupta taslak açar. O dilde sürüm zaten varsa (yeniden deneme ya da
 * admin elle ekledi) dokunulmaz. Kaynak silindiyse iş biter.
 */
export async function translateBlogPost(deps: Pick<JobDeps, 'ai' | 'logger'>, data: BlogTranslateJobData, run: JobRun): Promise<void> {
  const log = deps.logger.child({ job: 'assist.translate-blog-post', sourcePostId: data.sourcePostId, locale: data.locale });
  const source = await blogPostsRepository.findWithCover(data.sourcePostId);
  if (!source?.translationGroupId || source.locale === data.locale) return;
  if (await blogPostsRepository.findInGroup(source.translationGroupId, data.locale)) return;

  try {
    const res = await deps.ai.generateStructured({
      operation: 'blog.translate',
      system: blogTranslateSystem,
      prompt: blogTranslatePrompt({
        sourceLanguageName: languageName(source.locale),
        targetLanguageName: languageName(data.locale),
        targetLocale: data.locale,
        title: source.title,
        excerpt: source.excerpt,
        metaTitle: source.metaTitle,
        metaDescription: source.metaDescription,
        coverAlt: source.coverAlt,
        html: source.bodyHtml,
      }),
      schema: blogTranslateOutputSchema,
      model: 'quality',
      temperature: 0.3,
    });
    const out = res.data;
    const bodyHtml = sanitizeArticleHtml(out.html);
    if (!bodyHtml.trim() || !out.title.trim()) throw new AIError('invalid_output', 'empty translation');

    // Çeviri sürerken aynı dil eklendiyse (paralel iş) ikinciyi yazma
    if (await blogPostsRepository.findInGroup(source.translationGroupId, data.locale)) return;
    const post = await blogPostsRepository.createFromPipeline({
      locale: data.locale,
      translationGroupId: source.translationGroupId,
      slug: await blogPostsRepository.freeSlug(data.locale, slugify(out.slug || out.title, 110)),
      title: clip(out.title, 200),
      excerpt: clip(out.excerpt || out.metaDescription || out.title, 320),
      bodyHtml,
      metaTitle: clip(out.metaTitle, 80) || null,
      metaDescription: clip(out.metaDescription, 200) || null,
      status: 'draft',
      publishedAt: null,
      readingMinutes: readingMinutes(bodyHtml),
      cover:
        source.coverData && source.coverWidth && source.coverHeight
          ? { data: source.coverData, alt: clip(out.coverAlt || source.coverAlt, 250), width: source.coverWidth, height: source.coverHeight }
          : null,
    });
    log.info({ postId: post.id }, 'blog post translated');
  } catch (err) {
    if (err instanceof AIError && err.retryable && !run.finalAttempt) throw new RetryableJobError(err.code);
    // Başarısız çeviri: kaynak taslak durur, admin o dili elle ekleyebilir
    log.warn({ err }, 'blog translation failed');
  }
}
