import { FakeAIProvider } from '@upvine/ai';
import type { BrandProfileOutput, TopicSuggestion } from '@upvine/ai';
export { createFixtureHttpClient, FAKE_WORDPRESS, fakeOutbox, fixtureSite } from '@upvine/seo/testing';

/**
 * Testler ve uçtan uca (e2e) testler için dış dünya sahteleri: gerçek siteye ve Gemini'ye istek atılmaz.
 * Worker'da sadece `E2E_FAKE_EXTERNALS=true` ve production dışında kullanılır.
 */

export const FAKE_BRAND: BrandProfileOutput = {
  brandName: 'Gülüş Diş Kliniği',
  description: 'İstanbul’da implant, ortodonti ve estetik diş tedavisi sunan bir diş kliniği.',
  industry: 'Diş sağlığı',
  productsServices: ['İmplant', 'Ortodonti', 'Diş beyazlatma'],
  targetAudience: 'İstanbul’da diş tedavisi arayan yetişkinler.',
  suggestedTone: 'friendly',
  contentLanguage: 'tr',
  country: 'TR',
};

export const FAKE_TOPICS: TopicSuggestion[] = [
  { title: 'İmplant tedavisi kaç seans sürer?', keyword: 'implant tedavisi süresi', intent: 'informational', searchVolume: 1900, difficulty: 28 },
  { title: 'Şeffaf plak ile ortodonti: kimlere uygun?', keyword: 'şeffaf plak tedavisi', intent: 'commercial', searchVolume: 1300, difficulty: 35 },
  { title: 'Diş beyazlatma zararlı mı? Bilmeniz gerekenler', keyword: 'diş beyazlatma zararları', intent: 'informational', searchVolume: 880, difficulty: 22 },
  // Mevcut sayfayla aynı konu: tekrar koruması bunu elemeli.
  { title: 'İmplant tedavisi', keyword: 'implant tedavisi', intent: 'commercial', searchVolume: 5400, difficulty: 60 },
];

const paragraph = (keyword: string, i: number) =>
  `<p>${i === 0 ? `${keyword} hakkında bilmeniz gerekenleri bu rehberde topladık. ` : ''}Bu bölümde hastaların en çok sorduğu konuyu sade bir dille anlatıyoruz. Tedavi planı her hastada farklıdır ve muayene ile netleşir. Uzman hekim, çene yapınızı ve genel sağlığınızı değerlendirir. Süreç boyunca düzenli kontroller iyileşmeyi hızlandırır. Sorularınızı randevu öncesinde not almanız faydalı olur.</p>`;

/** Sahte makale: prompt'taki başlık ve odak kelimeyle, SEO eşiğini geçecek yapıda. */
export function fakeArticle(prompt: string) {
  const title = /Working title: (.+)/.exec(prompt)?.[1]?.trim() ?? 'Örnek yazı';
  const keyword = /\): (.+)/.exec(/Focus keyword[^\n]*/.exec(prompt)?.[0] ?? '')?.[1]?.trim() ?? 'örnek konu';
  const links = [...prompt.matchAll(/- [^:\n]+: (https?:\/\/\S+)/g)].map((m) => m[1]!);
  const internal = links.filter((l) => l.includes('klinik.example')).slice(0, 3);
  const sectionHtml = (i: number) =>
    [0, 1, 2, 3].map((j) => paragraph(keyword, i * 10 + j + 1)).join('') +
    (internal[i] ? `<p>Ayrıntılar için <a href="${internal[i]}">ilgili sayfamıza</a> göz atabilirsiniz.</p>` : '');
  return {
    title: `${keyword.charAt(0).toLocaleUpperCase('tr')}${keyword.slice(1)}: ${title}`.slice(0, 110),
    metaTitle: `${keyword} rehberi: süre, adımlar ve ipuçları`.padEnd(52, '.').slice(0, 58),
    metaDescription: `${keyword} hakkında merak ettiğiniz her şey: süreç nasıl ilerler, nelere dikkat etmelisiniz ve uzman hekimlerimiz size nasıl yardımcı olur? Hemen okuyun.`.slice(0, 158),
    introduction: paragraph(keyword, 0) + paragraph(keyword, 99),
    sections: [`${keyword} nedir?`, 'Tedavi adımları', 'İyileşme süreci', 'Sık yapılan hatalar', 'Maliyeti etkileyen etkenler'].map((heading, i) => ({ heading, html: sectionHtml(i) })),
    conclusion: `<p>Doğru bilgiyle karar vermek kolaylaşır. Kaynaklar: <a href="https://www.who.int/health-topics/oral-health">WHO</a> ve <a href="https://www.saglik.gov.tr/">Sağlık Bakanlığı</a>. Sorularınız için bize ulaşın.</p>`,
    faq: [1, 2, 3, 4].map((n) => ({ question: `${keyword} ile ilgili soru ${n}?`, answer: 'Kısa ve net bir yanıt: muayene sonrası hekiminiz size özel bir plan önerir.' })),
    claims: ['Tedavi planı her hastada farklıdır ve muayene ile netleşir.'],
    coverImagePrompt: 'A bright, modern dental clinic with a friendly dentist, natural light',
    coverAlt: `${keyword} için aydınlık bir diş kliniği`,
    labels: { tableOfContents: 'İçindekiler', faq: 'Sık sorulan sorular', sources: 'Kaynaklar' },
    keyTakeaways: ['Tedavi planı muayene ile netleşir.', 'Düzenli kontroller iyileşmeyi hızlandırır.', 'Sorularınızı randevu öncesinde not alın.', 'Süre kişiye göre değişir.'],
  };
}

export function createFakeAI(): FakeAIProvider {
  return new FakeAIProvider({
    'site.brand_profile': () => FAKE_BRAND,
    'site.topics': () => ({ topics: FAKE_TOPICS }),
    'article.research': () => '- Hastalar en çok süreyi ve maliyeti soruyor.',
    'article.draft': (prompt) => fakeArticle(prompt),
    'article.fact_check': () => JSON.stringify({ claims: [{ claim: 'Tedavi planı her hastada farklıdır ve muayene ile netleşir.', verdict: 'verified', correction: null, sourceUrl: 'https://www.who.int/health-topics/oral-health' }] }),
    // Editör: seçilen parçanın başına işaret koyar (e2e'de değişiklik görülsün diye)
    'article.rewrite': (prompt) => ({ html: `<p>Yeniden yazıldı: daha net ve kısa bir anlatım.</p>${prompt.slice(prompt.indexOf('\n\n') + 2)}` }),
    // İçerik yenileme: kısa yazıyı bölümlere, SSS'ye ve iç linke kavuşturur
    'content.refresh': () => ({
      summary: 'Yazı genişletildi, güncel öneriler ve sık sorulan sorular eklendi.',
      changes: [
        { kind: 'content', description: 'Beyazlatma yöntemleri ve süreleri anlatıldı.' },
        { kind: 'faq', description: 'Sık sorulan sorular bölümü eklendi.' },
        { kind: 'links', description: 'İmplant bakımı yazısına iç link verildi.' },
      ],
      title: 'Diş beyazlatma: yöntemler, süre ve dikkat edilecekler',
      metaTitle: 'Diş beyazlatma yöntemleri ve süresi',
      metaDescription: 'Diş beyazlatma yöntemleri, ne kadar sürdüğü, kimlere uygun olduğu ve sonrasında nelere dikkat etmeniz gerektiği hekimlerimizden.',
      html: `<h2>Yöntemler</h2><p>${'Muayenehanede ve evde uygulanan beyazlatma yöntemleri farklı sürelerde sonuç verir. '.repeat(20)}</p><h2>Sonrası</h2><p>${'İlk günlerde renkli içeceklerden kaçınmak sonucu korur. '.repeat(20)}</p><p><a href="https://wp.example/implant-bakimi/">İmplant bakımı</a></p><h2>Sık sorulan sorular</h2><h3>Kalıcı mı?</h3><p>Bakıma göre birkaç yıl sürebilir.</p>`,
    }),
    // Müşteri yorumu çevirisi: istenen her dile dil kodu önekiyle
    'testimonial.translate': (prompt) => {
      const quote = /^Testimonial: (.*)$/m.exec(prompt)?.[1] ?? '';
      const title = /^Author title: (.*)$/m.exec(prompt)?.[1] ?? '';
      const locales = [...prompt.matchAll(/\((en|de|es|fr|tr)\)/g)].map((m) => m[1]!);
      return { translations: locales.map((locale) => ({ locale, quote: `[${locale}] ${quote}`, authorTitle: title ? `[${locale}] ${title}` : '' })) };
    },
    'article.improve': () => {
      throw new Error('iyileştirme gerekmemeli');
    },
    'free.brand': () => FAKE_BRAND,
    'free.keywords': () => ({
      keywords: FAKE_TOPICS.slice(0, 3).map((t) => ({ keyword: t.keyword, searchVolume: t.searchVolume, difficulty: t.difficulty, intent: t.intent })),
      clusters: [
        { name: 'İmplant', topics: ['İmplant tedavisi kaç seans sürer?', 'İmplant sonrası beslenme'] },
        { name: 'Ortodonti', topics: ['Şeffaf plak kimlere uygun?', 'Tel tedavisi süresi'] },
      ],
    }),
    'free.competitors': () => JSON.stringify([{ name: 'Rakip Klinik', domain: 'rakip.example', reason: 'Aynı aramalarda üst sıralarda.' }]),
    // AI görünürlük: implant sorusunda marka anılır, diğerlerinde anılmaz
    'visibility.questions': () => ({ questions: ['İstanbul’da implant için hangi klinik önerilir?', 'Şeffaf plak tedavisi nerede yaptırılır?', 'Diş beyazlatma için güvenilir klinik var mı?'] }),
    'visibility.answer': (prompt) => (prompt.includes('implant') ? 'Gülüş Diş Kliniği implant tedavisinde deneyimli bir kliniktir.' : 'Bu hizmeti veren birçok klinik bulunur; muayene olup karar verin.'),
  });
}
