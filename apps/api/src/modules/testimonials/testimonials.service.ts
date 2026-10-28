import { LOCALES } from '@upvine/config';
import { auditLogsRepository, testimonialsRepository } from '@upvine/db';
import type { Testimonial, TestimonialTranslation } from '@upvine/db';
import { ASSIST_JOBS, HOME_TESTIMONIAL_LIMIT } from '@upvine/shared';
import type { AdminTestimonial, PublicTestimonial, TestimonialInput, TestimonialTranslationInput } from '@upvine/shared';
import { AppError } from '../../lib/errors';
import type { JobQueue } from '../../lib/jobs';
import type { AdminActor } from '../admin/admin.service';

function adminDto(t: Testimonial): AdminTestimonial {
  return {
    id: t.id,
    authorName: t.authorName,
    authorTitle: t.authorTitle,
    website: t.website,
    rating: t.rating,
    locale: t.locale,
    quote: t.quote,
    status: t.status,
    translations: t.translations ?? {},
    translationStatus: t.translationStatus,
    translationError: t.translationError,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** İstenen dildeki metin: kaynak dil ya da çeviri; yoksa null (o dilde gösterilmez) */
function inLocale(t: Testimonial, locale: string): PublicTestimonial | null {
  const base = { id: t.id, authorName: t.authorName, website: t.website, rating: t.rating, locale };
  if (t.locale === locale) return { ...base, quote: t.quote, authorTitle: t.authorTitle };
  const tr = t.translations?.[locale];
  return tr ? { ...base, quote: tr.quote, authorTitle: tr.authorTitle } : null;
}

/** Halka açık: ana sayfadaki yorumlar (sadece o dilde metni olan yayımlanmışlar). */
export function createTestimonialsService() {
  return {
    async list(locale: string): Promise<PublicTestimonial[]> {
      // Çevirisi henüz gelmemiş yorumlar atlanır: biraz fazlasını okuyup süz
      const rows = await testimonialsRepository.published(HOME_TESTIMONIAL_LIMIT * 4);
      return rows.flatMap((t) => inLocale(t, locale) ?? []).slice(0, HOME_TESTIMONIAL_LIMIT);
    },
  };
}

/**
 * Admin: yorum yazma ve çeviri. Kaynak metin (dil, yorum, unvan) değişince yapay zekâ çevirileri silinir ve
 * yeniden çeviri kuyruğa atılır; elle düzeltilmiş çeviriler korunur. Yapay zekâ çağrısı worker'da.
 */
export function createAdminTestimonialsService(jobs: JobQueue) {
  const audit = (actor: AdminActor, action: string, id: string, metadata?: Record<string, unknown>) =>
    auditLogsRepository.record({ action, userId: actor.adminId, targetType: 'testimonial', targetId: id, metadata, ip: actor.ip, userAgent: actor.userAgent });

  async function load(id: string): Promise<Testimonial> {
    const t = await testimonialsRepository.findById(id);
    if (!t) throw new AppError('not_found');
    return t;
  }

  async function queueTranslation(id: string): Promise<void> {
    await testimonialsRepository.update(id, { translationStatus: 'pending', translationError: null });
    await jobs.enqueueAssistJob(ASSIST_JOBS.translateTestimonial, { testimonialId: id });
  }

  /** Sadece elle düzeltilenler (kaynak dil hariç) kalır */
  function keepUserTranslations(translations: Record<string, TestimonialTranslation> | null, sourceLocale: string) {
    return Object.fromEntries(Object.entries(translations ?? {}).filter(([locale, tr]) => tr.source === 'user' && locale !== sourceLocale));
  }

  function assertTranslatable(t: Testimonial, locale: string): void {
    if (!(LOCALES as readonly string[]).includes(locale) || locale === t.locale) throw new AppError('validation_failed');
  }

  return {
    async list(): Promise<AdminTestimonial[]> {
      return (await testimonialsRepository.list()).map(adminDto);
    },

    async get(id: string): Promise<AdminTestimonial> {
      return adminDto(await load(id));
    },

    async create(input: TestimonialInput, actor: AdminActor): Promise<AdminTestimonial> {
      const t = await testimonialsRepository.create(input);
      await audit(actor, 'admin.testimonial_created', t.id, { locale: input.locale, status: input.status });
      await queueTranslation(t.id);
      return this.get(t.id);
    },

    async update(id: string, input: TestimonialInput, actor: AdminActor): Promise<AdminTestimonial> {
      const current = await load(id);
      const sourceChanged = current.locale !== input.locale || current.quote !== input.quote || current.authorTitle !== input.authorTitle;
      await testimonialsRepository.update(id, { ...input, ...(sourceChanged ? { translations: keepUserTranslations(current.translations, input.locale) } : {}) });
      await audit(actor, 'admin.testimonial_updated', id, { status: input.status, statusBefore: current.status, sourceChanged });
      if (sourceChanged) await queueTranslation(id);
      return this.get(id);
    },

    async remove(id: string, actor: AdminActor): Promise<void> {
      await load(id);
      await testimonialsRepository.remove(id);
      await audit(actor, 'admin.testimonial_deleted', id);
    },

    /** Elle düzeltilmemiş tüm dilleri yeniden çevir */
    async translate(id: string, actor: AdminActor): Promise<AdminTestimonial> {
      await load(id);
      await queueTranslation(id);
      await audit(actor, 'admin.testimonial_translate', id);
      return this.get(id);
    },

    /** Bir dildeki çeviriyi elle düzelt: sonraki çevirilerde korunur */
    async setTranslation(id: string, locale: string, input: TestimonialTranslationInput, actor: AdminActor): Promise<AdminTestimonial> {
      const t = await load(id);
      assertTranslatable(t, locale);
      await testimonialsRepository.update(id, { translations: { ...t.translations, [locale]: { ...input, source: 'user' } } });
      await audit(actor, 'admin.testimonial_translation_edited', id, { locale });
      return this.get(id);
    },

    /** Elle düzeltmeyi bırak: o dil yeniden yapay zekâyla çevrilir */
    async resetTranslation(id: string, locale: string, actor: AdminActor): Promise<AdminTestimonial> {
      const t = await load(id);
      assertTranslatable(t, locale);
      const { [locale]: _removed, ...rest } = t.translations ?? {};
      await testimonialsRepository.update(id, { translations: rest });
      await audit(actor, 'admin.testimonial_translation_reset', id, { locale });
      await queueTranslation(id);
      return this.get(id);
    },
  };
}
