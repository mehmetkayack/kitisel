import type { TopicsInput } from './topics.v1';

/**
 * Konu önerisi, sürüm 2: v1 + sitedeki mevcut blog yazıları ayrı ve öncelikli listelenir (en fazla 150),
 * diğer sayfalar (ürün, kategori) ayrı (en fazla 50). v1'de tüm başlıklar 80 ile kesiliyordu; çok yazılı
 * sitelerde yazılar listeye girmiyor ve aynı konular tekrar öneriliyordu. Şema ve sistem mesajı v1'le aynı.
 */
export const TOPICS_PROMPT_V2_VERSION = 'topics.v2';

export interface TopicsInputV2 extends Omit<TopicsInput, 'existingTitles'> {
  /** Sitedeki yayında blog yazıları ve planlı konular (aynı konu tekrar önerilmez) */
  existingPosts: string[];
  /** Diğer sayfalar: ürün, kategori, kurumsal (konu bunları anlatabilir ama kopyalamaz) */
  otherPages: string[];
}

const list = (items: string[], max: number) => items.slice(0, max).map((t) => `- ${t}`).join('\n') || '- none';

export function topicsPromptV2(input: TopicsInputV2): string {
  return [
    `Business: ${input.brandName}`,
    `About: ${input.description}`,
    `Products and services: ${input.productsServices.join(', ') || '-'}`,
    `Target audience: ${input.targetAudience || '-'}`,
    `Write titles and keywords in: ${input.languageName}`,
    `Target country: ${input.country ?? 'not specified'}`,
    '',
    'Articles that ALREADY EXIST on the site or are already planned. Never suggest the same topic or the same search intent again, even with different wording:',
    list(input.existingPosts, 150),
    '',
    'Other pages on the site (products, categories, company pages). Blog topics may explain or support them, but must not just repeat a page:',
    list(input.otherPages, 50),
    '',
    `Keywords already planned or rejected (do not repeat):\n${input.excludeKeywords.map((k) => `- ${k}`).join('\n') || '- none'}`,
    '',
    `Return exactly ${input.count} topics as JSON: { "topics": [{ title, keyword, intent, searchVolume, difficulty }] }.`,
  ].join('\n');
}
