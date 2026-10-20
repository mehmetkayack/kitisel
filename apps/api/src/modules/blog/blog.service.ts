import sharp from 'sharp';
import type { OutputInfo } from 'sharp';
import { auditLogsRepository, blogPostsRepository, UniqueConstraintError } from '@upvine/db';
import type { BlogPost } from '@upvine/db';
import { countWords, sanitizeArticleHtml } from '@upvine/seo';
import { BLOG_COVER_UPLOAD, BLOG_PAGE_SIZE } from '@upvine/shared';
import type { AdminBlogPost, AdminBlogPostRow, BlogCover, BlogPage, BlogPostInput, BlogPostPublic, BlogPostSummary, BlogQuery, Page, PublicBlogQuery } from '@upvine/shared';
import { AppError } from '../../lib/errors';
import type { AdminActor } from '../admin/admin.service';

/** Okuma hızı: dakikada ~220 kelime */
const WORDS_PER_MINUTE = 220;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Kapak adresi güncellenme zamanıyla sürümlenir: tarayıcı önbelleği eski görseli göstermez. */
function cover(p: BlogPost): BlogCover | null {
  if (!p.coverWidth || !p.coverHeight) return null;
  return { url: `/api/v1/blog/posts/${p.id}/cover?v=${p.updatedAt.getTime()}`, alt: p.coverAlt ?? '', width: p.coverWidth, height: p.coverHeight };
}

function summary(p: BlogPost): BlogPostSummary {
  return {
    id: p.id,
    locale: p.locale,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    cover: cover(p),
    publishedAt: (p.publishedAt ?? p.createdAt).toISOString(),
    readingMinutes: p.readingMinutes,
  };
}

function adminRow(p: BlogPost): AdminBlogPostRow {
  return { id: p.id, locale: p.locale, slug: p.slug, title: p.title, status: p.status, publishedAt: iso(p.publishedAt), updatedAt: p.updatedAt.toISOString() };
}

function adminDetail(p: BlogPost): AdminBlogPost {
  return { ...adminRow(p), excerpt: p.excerpt, bodyHtml: p.bodyHtml, metaTitle: p.metaTitle, metaDescription: p.metaDescription, cover: cover(p) };
}

/** Halka açık blog: sadece yayımlanmış ve yayın zamanı gelmiş yazılar. */
export function createBlogService() {
  return {
    async list(query: PublicBlogQuery): Promise<BlogPage> {
      const { items, hasMore } = await blogPostsRepository.publishedPage(query.locale, query.page, BLOG_PAGE_SIZE);
      return { items: items.map(summary), page: query.page, hasMore };
    },

    async get(locale: string, slug: string): Promise<BlogPostPublic> {
      const p = await blogPostsRepository.findPublished(locale, slug);
      if (!p) throw new AppError('not_found');
      return { ...summary(p), bodyHtml: p.bodyHtml, metaTitle: p.metaTitle, metaDescription: p.metaDescription, updatedAt: p.updatedAt.toISOString() };
    },

    async cover(id: string): Promise<Buffer> {
      const p = await blogPostsRepository.findCover(id);
      if (!p?.coverData) throw new AppError('not_found');
      return p.coverData;
    },
  };
}

/**
 * Admin: blog yazısı yazma. Gövde sunucuda temizlenir (makale kurallarıyla aynı güvenli etiketler).
 * İlk yayında yayın tarihi atanır; taslağa alıp yeniden yayınlamak tarihi değiştirmez.
 */
export function createAdminBlogService() {
  const audit = (actor: AdminActor, action: string, id: string, metadata?: Record<string, unknown>) =>
    auditLogsRepository.record({ action, userId: actor.adminId, targetType: 'blog_post', targetId: id, metadata, ip: actor.ip, userAgent: actor.userAgent });

  async function load(id: string): Promise<BlogPost> {
    const p = await blogPostsRepository.findById(id);
    if (!p) throw new AppError('not_found');
    return p;
  }

  async function ensureSlugFree(locale: string, slug: string, exceptId?: string): Promise<void> {
    const other = await blogPostsRepository.findBySlug(locale, slug);
    if (other && other.id !== exceptId) throw new AppError('slug_taken', { fields: [{ path: 'slug', message: 'validation.slugTaken' }] });
  }

  function prepare(input: BlogPostInput) {
    const bodyHtml = sanitizeArticleHtml(input.bodyHtml);
    return {
      locale: input.locale,
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt,
      bodyHtml,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      status: input.status,
      readingMinutes: Math.max(1, Math.round(countWords(bodyHtml) / WORDS_PER_MINUTE)),
    };
  }

  return {
    async list(query: BlogQuery): Promise<Page<AdminBlogPostRow>> {
      const { items, nextCursor } = await blogPostsRepository.adminList(query);
      return { items: items.map(adminRow), nextCursor };
    },

    async get(id: string): Promise<AdminBlogPost> {
      return adminDetail(await load(id));
    },

    async create(input: BlogPostInput, actor: AdminActor): Promise<AdminBlogPost> {
      await ensureSlugFree(input.locale, input.slug);
      const data = prepare(input);
      try {
        const p = await blogPostsRepository.create({ ...data, publishedAt: data.status === 'published' ? new Date() : null, authorId: actor.adminId });
        await audit(actor, 'admin.blog_created', p.id, { slug: data.slug, locale: data.locale, status: data.status });
        return this.get(p.id);
      } catch (err) {
        if (err instanceof UniqueConstraintError) throw new AppError('slug_taken');
        throw err;
      }
    },

    async update(id: string, input: BlogPostInput, actor: AdminActor): Promise<AdminBlogPost> {
      const current = await load(id);
      await ensureSlugFree(input.locale, input.slug, id);
      const data = prepare(input);
      await blogPostsRepository.update(id, {
        ...data,
        publishedAt: data.status === 'published' ? (current.publishedAt ?? new Date()) : current.publishedAt,
      });
      await audit(actor, 'admin.blog_updated', id, { slug: data.slug, status: data.status, statusBefore: current.status });
      return this.get(id);
    },

    async remove(id: string, actor: AdminActor): Promise<void> {
      const p = await load(id);
      await blogPostsRepository.remove(id);
      await audit(actor, 'admin.blog_deleted', id, { slug: p.slug, locale: p.locale });
    },

    /** Kapak: oran korunur (kırpılmaz), en fazla 1600 px, WebP. */
    async uploadCover(id: string, data: Buffer, alt: string, actor: AdminActor): Promise<AdminBlogPost> {
      await load(id);
      let out: { data: Buffer; info: OutputInfo };
      try {
        const meta = await sharp(data).metadata();
        // EXIF yönü: dikey çekilmiş fotoğrafta genişlik/yükseklik yer değiştirir
        const [w, h] = (meta.orientation ?? 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
        if (!['jpeg', 'png', 'webp', 'heif'].includes(meta.format ?? '') || (w ?? 0) < BLOG_COVER_UPLOAD.minWidth || (h ?? 0) < BLOG_COVER_UPLOAD.minHeight) {
          throw new AppError('invalid_image');
        }
        out = await sharp(data).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError('invalid_image');
      }
      await blogPostsRepository.setCover(id, { data: out.data, alt, width: out.info.width, height: out.info.height });
      await audit(actor, 'admin.blog_cover_uploaded', id, { width: out.info.width, height: out.info.height });
      return this.get(id);
    },

    async removeCover(id: string, actor: AdminActor): Promise<AdminBlogPost> {
      await load(id);
      await blogPostsRepository.setCover(id, null);
      await audit(actor, 'admin.blog_cover_removed', id);
      return this.get(id);
    },
  };
}
