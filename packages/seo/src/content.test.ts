import { describe, expect, it } from 'vitest';
import { addTableOfContents, buildArticleSchema, countWords, extractFaq, fitLength, pickInternalLinks, sanitizeArticleHtml, scoreArticle, slugify, stripTableOfContents, tocLabelOf, toMarkdown } from './content';

describe('slugify', () => {
  it('Türkçe ve Almanca karakterleri Latin harflere çevirir, kısaltır', () => {
    expect(slugify('İmplant Tedavisi Süresi: Ne Kadar?')).toBe('implant-tedavisi-suresi-ne-kadar');
    expect(slugify('Größe & Ölçü')).toBe('grosse-olcu');
    expect(slugify('a'.repeat(30) + ' ' + 'b'.repeat(30) + ' ' + 'c'.repeat(30)).length).toBeLessThanOrEqual(75);
  });
});

describe('sanitizeArticleHtml', () => {
  it('betik, olay öznitelikleri ve tehlikeli linkleri temizler; dış linke güvenli rel ekler', () => {
    const out = sanitizeArticleHtml('<p onclick="x()">a<script>alert(1)</script></p><a href="javascript:alert(1)">x</a><a href="https://ex.com">y</a><img src="x">');
    expect(out).toBe('<p>a</p><a>x</a><a href="https://ex.com" rel="noopener" target="_blank">y</a>');
  });
});

describe('addTableOfContents', () => {
  it('3+ H2 varsa başa içindekiler ekler, tekrar çalıştırınca yinelemez', () => {
    const html = '<p>Giriş</p><h2>Bir</h2><p>a</p><h2>İki</h2><h2>Üç</h2>';
    const once = addTableOfContents(html, 'İçindekiler');
    expect(once).toContain('<nav data-toc');
    expect(once).toContain('href="#iki"');
    expect(addTableOfContents(once, 'İçindekiler').match(/<nav/g)).toHaveLength(1);
    expect(addTableOfContents('<h2>a</h2>', 'x')).not.toContain('<nav');
  });
});

describe('scoreArticle', () => {
  const sentence = 'İmplant tedavisi süresi hastaya göre değişir ve hekim muayenesiyle netleşir.';
  const body = (n: number) => Array.from({ length: n }, () => `<p>${sentence} ${'Kısa bir açıklama ekliyoruz burada.'}</p>`).join('');
  const base = {
    keyword: 'implant tedavisi süresi',
    language: 'tr',
    title: 'İmplant tedavisi süresi: adım adım rehber',
    metaTitle: 'İmplant tedavisi süresi: kaç seans sürer, nelere dikkat?',
    metaDescription: 'İmplant tedavisi süresi kişiye göre değişir. Seans sayısı, iyileşme ve dikkat edilmesi gerekenleri uzman hekimlerimizden öğrenin, kararınızı kolayca verin.',
    slug: 'implant-tedavisi-suresi',
    siteUrl: 'https://klinik.example/',
    faqCount: 4,
    schemaTypes: ['Article', 'FAQPage'],
    coverAlt: 'Diş kliniği',
    internalLinkCandidates: 2,
  };

  it('iyi yapılandırılmış yazı 75 üstü alır', () => {
    const html = addTableOfContents(
      `${body(1)}<h2>İmplant tedavisi nedir?</h2>${body(25)}<h2>Süreç</h2>${body(25)}<h2>Sonuç</h2>${body(20)}` +
        '<p><a href="https://klinik.example/implant">implant</a> <a href="/ortodonti">ortodonti</a> <a href="https://who.int">WHO</a> <a href="https://saglik.gov.tr">Bakanlık</a></p>',
      'İçindekiler',
    );
    const res = scoreArticle({ ...base, html });
    expect(res.score).toBeGreaterThanOrEqual(75);
    expect(Object.fromEntries(res.checks.map((c) => [c.id, c.status]))).toMatchObject({ keyword_in_title: 'pass', internal_links: 'pass', external_links: 'pass', toc: 'pass', word_count: 'pass' });
  });

  it('kısa, linksiz, başlıksız yazı düşük alır', () => {
    const res = scoreArticle({ ...base, title: 'Bir yazı', metaTitle: 'Kısa', metaDescription: 'Kısa açıklama', html: '<p>Merhaba</p>', faqCount: 0, schemaTypes: [] });
    expect(res.score).toBeLessThan(40);
    expect(res.checks.find((c) => c.id === 'word_count')?.status).toBe('fail');
  });
});

describe('diğer yardımcılar', () => {
  it('fitLength kelime sınırında keser', () => {
    expect(fitLength('Bir iki üç dört beş altı', 14)).toBe('Bir iki üç…');
    expect(fitLength('Kısa', 10)).toBe('Kısa');
  });
  it('pickInternalLinks konuyla örtüşen sayfaları seçer', () => {
    const pages = [{ url: '/a', title: 'İmplant fiyatları' }, { url: '/b', title: 'İletişim' }, { url: '/c', title: 'İmplant sonrası bakım' }];
    expect(pickInternalLinks('İmplant tedavisi süresi', pages, 5, 'tr').map((p) => p.url)).toEqual(['/a', '/c']);
  });
  it('schema: Article + FAQPage + BreadcrumbList', () => {
    const s = buildArticleSchema({ title: 'T', description: 'D', language: 'tr', brandName: 'B', siteUrl: 'https://x.com/', datePublished: '2026-10-10T00:00:00Z', faq: [{ question: 'q', answer: 'a' }] });
    expect(s.map((x) => (x as { '@type': string })['@type'])).toEqual(['Article', 'FAQPage', 'BreadcrumbList']);
  });
  it('markdown ve kelime sayımı', () => {
    expect(toMarkdown('<h2>Başlık</h2><p>Metin <strong>kalın</strong></p>')).toBe('## Başlık\n\nMetin **kalın**');
    expect(countWords('<p>bir iki</p><p>üç</p>')).toBe(3);
  });
});

describe('editör yardımcıları', () => {
  it('içindekileri çıkarır, etiketi okur ve SSS bölümünü metinden yeniden çıkarır', () => {
    const html = addTableOfContents('<p>Giriş</p><h2>Bir</h2><p>a</p><h2>İki</h2><p>b</p><h2>SSS</h2><h3>Soru bir?</h3><p>Cevap bir.</p><h3>Yeni soru?</h3><p>Yeni</p><p>cevap.</p><h2>Kaynaklar</h2><ul><li>x</li></ul>', 'İçindekiler');
    expect(tocLabelOf(html)).toBe('İçindekiler');
    const body = stripTableOfContents(html);
    expect(body).not.toContain('<nav');
    expect(body).not.toContain('id=');
    expect(extractFaq(body, [{ question: 'Soru bir?' }])).toEqual([
      { question: 'Soru bir?', answer: 'Cevap bir.' },
      { question: 'Yeni soru?', answer: 'Yeni cevap.' },
    ]);
    expect(extractFaq('<h2>SSS</h2><p>yok</p>', [{ question: 'Soru bir?' }])).toEqual([]);
  });
});
