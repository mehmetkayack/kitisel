import { z } from 'zod';

/** Müşteri yorumunu diğer arayüz dillerine çevirme, sürüm 1. Tek, kısa yapılandırılmış çağrı. */
export const TESTIMONIAL_TRANSLATE_PROMPT_VERSION = 'testimonial-translate.v1';

export const testimonialTranslateOutputSchema = z.object({
  translations: z
    .array(
      z.object({
        /** Hedef dil kodu (istekte verilenlerden biri) */
        locale: z.string().min(2).max(5),
        quote: z.string().min(1),
        /** Unvan yoksa boş metin */
        authorTitle: z.string(),
      }),
    )
    .min(1),
});

export const testimonialTranslateSystem = [
  'You translate short customer testimonials for a SaaS marketing website.',
  'Keep the meaning, tone and first-person voice. Sound natural, like a real customer wrote it in that language; do not translate word by word.',
  'Never add, remove or exaggerate claims, numbers or praise. Keep brand, product, company and person names unchanged.',
  'Plain text only: no quotation marks around the testimonial, no HTML, no emojis unless the original has them.',
  'In French, put a non-breaking space before ? ! : ;',
].join(' ');

export function testimonialTranslatePrompt(opts: {
  sourceLanguageName: string;
  targets: { locale: string; languageName: string }[];
  quote: string;
  authorTitle: string | null;
}): string {
  return [
    `Translate this testimonial from ${opts.sourceLanguageName} into: ${opts.targets.map((t) => `${t.languageName} (${t.locale})`).join(', ')}.`,
    opts.authorTitle
      ? 'Also translate the author title (job title and company type). Keep the company name itself unchanged.'
      : 'There is no author title: return an empty string for authorTitle.',
    'Return JSON: { "translations": [{ "locale": "<code>", "quote": "...", "authorTitle": "..." }] } with exactly one item per target language.',
    '',
    `Testimonial: ${opts.quote}`,
    opts.authorTitle ? `Author title: ${opts.authorTitle}` : '',
  ]
    .filter((line, i, all) => line !== '' || i < all.length - 1)
    .join('\n');
}
