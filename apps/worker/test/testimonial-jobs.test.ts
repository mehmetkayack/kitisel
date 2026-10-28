import pino from 'pino';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { UnconfiguredAIProvider } from '@upvine/ai';
import { loadEnv } from '@upvine/config/env';
import { connectDb, testimonialsRepository } from '@upvine/db';
import { truncateAll } from '@upvine/db/testing';
import { translateTestimonial } from '../src/jobs/testimonial-jobs';
import { createFakeAI } from '../src/testing/fake-externals';

const env = loadEnv({ NODE_ENV: 'test' });
const sequelize = connectDb(env, { database: env.MYSQL_TEST_DATABASE });
const logger = pino({ level: 'silent' });
const final = { finalAttempt: true };

async function seed() {
  return testimonialsRepository.create({
    authorName: 'Ayşe Yılmaz',
    authorTitle: 'Kurucu, Gülüş Diş Kliniği',
    website: null,
    rating: 5,
    locale: 'tr',
    quote: 'Randevu talepleri arttı.',
    status: 'published',
  });
}

beforeEach(() => truncateAll(sequelize));
afterAll(() => sequelize.close());

describe('translateTestimonial', () => {
  it('kaynak dil dışındaki dört dile çevirir', async () => {
    const t = await seed();
    const ai = createFakeAI();
    await translateTestimonial({ ai, logger }, { testimonialId: t.id }, final);
    const after = (await testimonialsRepository.findById(t.id))!;
    expect(after.translationStatus).toBe('done');
    expect(Object.keys(after.translations ?? {}).sort()).toEqual(['de', 'en', 'es', 'fr']);
    expect(after.translations?.de).toEqual({ quote: '[de] Randevu talepleri arttı.', authorTitle: '[de] Kurucu, Gülüş Diş Kliniği', source: 'ai' });
    expect(ai.calls[0]?.prompt).toContain('from Turkish');
  });

  it('elle düzeltilen dil istenmez ve ezilmez', async () => {
    const t = await seed();
    const mine = { quote: 'Appointment requests went up.', authorTitle: null, source: 'user' as const };
    await testimonialsRepository.update(t.id, { translations: { en: mine } });
    const ai = createFakeAI();
    await translateTestimonial({ ai, logger }, { testimonialId: t.id }, final);
    expect(ai.calls[0]?.prompt).not.toContain('(en)');
    const after = (await testimonialsRepository.findById(t.id))!;
    expect(after.translations?.en).toEqual(mine);
    expect(Object.keys(after.translations ?? {}).sort()).toEqual(['de', 'en', 'es', 'fr']);
  });

  it('çeviri sürerken kaynak metin değiştiyse sonuç yazılmaz', async () => {
    const t = await seed();
    const ai = createFakeAI();
    const original = ai.generateStructured.bind(ai);
    ai.generateStructured = (async (opts: Parameters<typeof original>[0]) => {
      await testimonialsRepository.update(t.id, { quote: 'Admin metni değiştirdi.', translationStatus: 'pending' });
      return original(opts);
    }) as typeof ai.generateStructured;
    await translateTestimonial({ ai, logger }, { testimonialId: t.id }, final);
    const after = (await testimonialsRepository.findById(t.id))!;
    expect(after.translations).toBeNull();
    expect(after.translationStatus).toBe('pending');
  });

  it('yapay zekâ yoksa başarısız olarak işaretlenir', async () => {
    const t = await seed();
    await translateTestimonial({ ai: new UnconfiguredAIProvider(), logger }, { testimonialId: t.id }, final);
    expect(await testimonialsRepository.findById(t.id)).toMatchObject({ translationStatus: 'failed', translationError: 'ai_not_configured' });
  });
});
