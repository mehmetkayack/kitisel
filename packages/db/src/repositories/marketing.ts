import { Op } from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { BlogPost, ContactMessage, Testimonial } from '../models';
import type { BlogPostStatus, ContactMessageStatus, TestimonialStatus } from '../models';

/**
 * Halka açık sitenin verisi: iletişim mesajları ve blog yazıları. Kiracıya bağlı değildir;
 * yazma ve listeleme admin servisinden, okuma halka açık uç noktalardan.
 */

function likeTerm(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** UUID v7 zamana göre sıralı: id DESC = en yeni önce; cursor son görülen id. */
function page<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

/** Listelerde kapak görselinin kendisi okunmaz (MEDIUMBLOB) */
const WITHOUT_COVER = { exclude: ['coverData'] as string[] };

export const contactMessagesRepository = {
  create(data: Pick<ContactMessage, 'name' | 'email' | 'phone' | 'company' | 'message' | 'locale' | 'recaptchaScore' | 'ipHash' | 'userAgent'>) {
    return ContactMessage.create(data);
  },

  async list({ cursor, limit, q, status }: { cursor?: string; limit: number; q?: string; status?: ContactMessageStatus }) {
    const where: WhereOptions = {
      ...(cursor ? { id: { [Op.lt]: cursor } } : {}),
      // Arşiv ayrı sekmede; "tümü" arşivlenmemişleri gösterir
      status: status ?? { [Op.ne]: 'archived' },
      ...(q
        ? { [Op.or]: [{ name: { [Op.like]: likeTerm(q) } }, { email: { [Op.like]: likeTerm(q) } }, { company: { [Op.like]: likeTerm(q) } }] }
        : {}),
    };
    const rows = await ContactMessage.findAll({ where, order: [['id', 'DESC']], limit: limit + 1 });
    return page(rows, limit);
  },

  findById(id: string) {
    return ContactMessage.findByPk(id);
  },

  async update(id: string, patch: Partial<Pick<ContactMessage, 'status' | 'readAt'>>): Promise<void> {
    await ContactMessage.update(patch, { where: { id } });
  },

  countNew() {
    return ContactMessage.count({ where: { status: 'new' } });
  },
};

export type BlogPostData = Pick<
  BlogPost,
  'locale' | 'slug' | 'title' | 'excerpt' | 'bodyHtml' | 'metaTitle' | 'metaDescription' | 'status' | 'publishedAt' | 'readingMinutes'
>;

export const blogPostsRepository = {
  create(data: BlogPostData & { authorId: string | null }) {
    return BlogPost.create(data);
  },

  async update(id: string, patch: Partial<BlogPostData>): Promise<void> {
    await BlogPost.update(patch, { where: { id } });
  },

  async setCover(id: string, cover: { data: Buffer; alt: string; width: number; height: number } | null): Promise<void> {
    await BlogPost.update(
      cover
        ? { coverData: cover.data, coverAlt: cover.alt, coverWidth: cover.width, coverHeight: cover.height }
        : { coverData: null, coverAlt: null, coverWidth: null, coverHeight: null },
      { where: { id } },
    );
  },

  async remove(id: string): Promise<void> {
    await BlogPost.destroy({ where: { id } });
  },

  findById(id: string) {
    return BlogPost.findByPk(id, { attributes: WITHOUT_COVER });
  },

  /** Aynı dilde aynı adres (silinmemiş yazılar arasında) */
  findBySlug(locale: string, slug: string) {
    return BlogPost.findOne({ where: { locale, slug }, attributes: WITHOUT_COVER });
  },

  findPublished(locale: string, slug: string) {
    return BlogPost.findOne({
      where: { locale, slug, status: 'published', publishedAt: { [Op.lte]: new Date() } },
      attributes: WITHOUT_COVER,
    });
  },

  /** Kapak görseli (sadece yayımlanmış yazılar ya da admin önizlemesi için) */
  findCover(id: string) {
    return BlogPost.findByPk(id, { attributes: ['id', 'status', 'coverData', 'updatedAt'] });
  },

  async adminList({ cursor, limit, q, locale }: { cursor?: string; limit: number; q?: string; locale?: string }) {
    const rows = await BlogPost.findAll({
      where: {
        ...(cursor ? { id: { [Op.lt]: cursor } } : {}),
        ...(locale ? { locale } : {}),
        ...(q ? { [Op.or]: [{ title: { [Op.like]: likeTerm(q) } }, { slug: { [Op.like]: likeTerm(q) } }] } : {}),
      },
      attributes: ['id', 'locale', 'slug', 'title', 'status', 'publishedAt', 'updatedAt'],
      order: [['id', 'DESC']],
      limit: limit + 1,
    });
    return page(rows, limit);
  },

  /** Halka açık liste: en yeni yayın önce, sayfa numarasıyla */
  async publishedPage(locale: string, pageNo: number, size: number) {
    const rows = await BlogPost.findAll({
      where: { locale, status: 'published' satisfies BlogPostStatus, publishedAt: { [Op.lte]: new Date() } },
      attributes: WITHOUT_COVER,
      order: [
        ['publishedAt', 'DESC'],
        ['id', 'DESC'],
      ],
      offset: (pageNo - 1) * size,
      limit: size + 1,
    });
    return { items: rows.slice(0, size), hasMore: rows.length > size };
  },
};

export type TestimonialData = Pick<Testimonial, 'authorName' | 'authorTitle' | 'website' | 'rating' | 'locale' | 'quote' | 'status'>;
export type TestimonialPatch = Partial<TestimonialData & Pick<Testimonial, 'translations' | 'translationStatus' | 'translationError'>>;

/** Yorumlar az (onlarca): sayfalama yok. */
export const testimonialsRepository = {
  create(data: TestimonialData) {
    return Testimonial.create(data);
  },

  findById(id: string) {
    return Testimonial.findByPk(id);
  },

  async update(id: string, patch: TestimonialPatch): Promise<void> {
    await Testimonial.update(patch, { where: { id } });
  },

  async remove(id: string): Promise<void> {
    await Testimonial.destroy({ where: { id } });
  },

  /** Admin listesi: en yeni önce */
  list() {
    return Testimonial.findAll({ order: [['id', 'DESC']] });
  },

  /** Ana sayfa: yayımlanmış yorumlar, en yeni önce */
  published(limit: number) {
    return Testimonial.findAll({ where: { status: 'published' satisfies TestimonialStatus }, order: [['id', 'DESC']], limit });
  },
};
