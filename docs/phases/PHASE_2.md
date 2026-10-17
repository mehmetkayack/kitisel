# Faz 2-3 — İçerik üretimi ve yayın (ödeme hariç) + Faz 1 ücretsiz analiz

Durum: **çekirdek tamamlandı, yerelde doğrulandı (2026-10-10)** — kullanıcı isteğiyle ödeme adımı (iyzico) ertelendi; ücretsiz analiz ve içerik/yayın hattı öne alındı.

## Tamamlanan

### Ücretsiz site analizi (Bölüm 7.2)
- [x] `/{locale}/free-analysis` (SSR, 5 dil): tek alanlı form, Turnstile (anahtar varsa), ana sayfanın tek CTA'sı
- [x] Worker `free-analysis` kuyruğu: tarama (15 sayfa) + 25 kontrol + marka özeti + 10 anahtar kelime fırsatı (tahmini hacim, zorluk, niyet) + konu kümeleri + 3 organik rakip (Google Search)
- [x] Paylaşılabilir rapor `/{locale}/free-analysis/r/:token` (`noindex`), ilerleme adımları, "PDF olarak indir" (yazdırma görünümü), link kopyalama
- [x] E-posta ile rapor linki (5 dil), pazarlama izni ayrı onay kutusu
- [x] IP başına günde 3 analiz, alan adı başına 24 saat önbellek, IP sadece anahtarlı hash
- [x] Rapor sonunda "Bu planı otomatik uygula — 7 gün dene"

### İçerik üretim hattı (Bölüm 7.6)
- [x] Araştırma (grounding) → yazım (marka sesi, ton, örnek metin, yasaklı kelimeler, CTA, iç linkler, SSS, kaynak linkleri) → kısa kalırsa genişletme → bilgi doğrulama (düzelt / çıkar) → temizleme + içindekiler + kaynaklar → SEO skoru (16 kontrol; 75 altı iyileştirme turu) → kapak (Gemini görseli, yoksa marka renklerinde soyut kapak, WebP) → JSON-LD (Article, FAQPage, BreadcrumbList)
- [x] İlerleme adımları panelde canlı; geçici hatalarda yeniden deneme, son denemede sade dilde sebep
- [x] Onay modunda inceleme + "yazı onayınızı bekliyor" e-postası (5 dil); otomatik modda eşik + doğrulama geçerse planlanır
- [x] Kurulum bitince ilk 3 konu hemen yazılır; diğerleri yayın tarihinden 72 saat önce (zamanlayıcı)
- [x] Aylık hak (paket yoksa deneme: 3), yeniden yazım hak tüketmez
- [x] Reddetme sebebi bir sonraki yazımda prompt'a eklenir

### İnceleme ekranı
- [x] `/app/content/:id`: Google önizlemesi, kapak, temizlenmiş makale (sunucuda sanitize-html + istemcide DOMPurify), SEO puanı ve kontroller, doğrulama özeti ve ayrıntıları, kaynaklar
- [x] "Onayla ve planla" (tek ana eylem), "Yeniden yaz", "Reddet" (sebepli, 5 sn geri al), HTML/Markdown indir (kapak gömülü)
- [x] İçerikler listesi: aylık hak göstergesi, "Şimdi yaz", bağlantı yoksa yönlendirme

### Yayın (Bölüm 7.8)
- [x] `Publisher` arayüzü; WordPress (REST + Application Passwords; medya kütüphanesine yükleme, öne çıkan görsel, alt metin) ve webhook (HMAC-SHA256 + zaman damgası)
- [x] Kimlik bilgileri AES-256-GCM ile şifreli (`site_credentials`, anahtar sürümü), tarayıcıya asla dönmez; webhook imza anahtarı bir kez gösterilir
- [x] Bağlantı testi, bağlantıyı kaldırma, WordPress tek tıkla yetkilendirme (HTTPS ortamda)
- [x] Dakikalık zamanlayıcı: zamanı gelen onaylı yazılar yayınlanır; geçici hatada 5 deneme, sonra sade dilde sebep + "Yeniden yayınla"
- [x] Ayarlar → Site bağlantısı; sihirbazın CMS adımı gerçek bağlantı

### Testler
- [x] seo (+9), publishers (6), ai, api (+10: ücretsiz analiz, bağlantılar, içerik akışı, kota, takılı iş), worker (+14: hat, kota, genişletme, yayın, zamanlayıcı, ücretsiz analiz), e2e (+4: ücretsiz analiz, 375 px Almanca, içerik → inceleme → onay → indirme, reddet + geri al)

## İkinci tur (2026-10-10): iyzico hariç kalanlar

### Editör ve sürüm geçmişi (Bölüm 7.6)
- [x] Tiptap editör (`RichTextEditor`, `packages/ui`, /dev/ui'da): H2/H3, kalın, italik, liste, alıntı, link, tablo; başlık, Google başlığı/açıklaması (karakter sayacı), kısa adres
- [x] Kaydedince sunucuda temizleme + içindekiler + SSS (metinden) + JSON-LD + SEO skoru yeniden; iyimser kilit (`baseVersion` → `version_conflict`); kaydedilmemiş değişiklik uyarısı (gezinme + sekme kapatma)
- [x] Sürüm geçmişi (`article_versions`, makale başına 50): üretim, düzenleme, geri dönüş; önizleme ve "Bu sürüme dön" (geçmiş silinmez)
- [x] Seçilen bölümü yapay zekâyla yeniden yazdır: geliştir / genişlet / kısalt / sadeleştir / örnek ekle / kendi talimatım; worker `assist` kuyruğu (makale üretiminin arkasında beklemez), sonuç önizlenir, "Yerine koy" ile editöre; saatte 60 istek

### İndirme ve görseller
- [x] Bilgi grafiği (satori + sharp, 1080×1350 WebP): başlık + 4-6 ana çıkarım (yazım çağrısının çıktısı, `article.v2`), marka renkleri (AA kontrastlı seçilir), Inter fontu; Arapça/İbranice/Hintçe/CJK/Tay dışında
- [x] Yayında yazının ilk bölümünden sonra eklenir (WordPress, Ghost, Shopify, Webflow); webhook'ta ayrı alan
- [x] ZIP indirme: `index.html` + Markdown + `images/` (görseller göreli adresle); HTML ve Markdown tek dosyada gömülü görselle

### Takvim (Bölüm 7.13)
- [x] Ay ve hafta görünümü (sitenin saat diliminde), sürükle-bırak (`@dnd-kit/core`, işaretçinin altındaki gün), saat korunur; geçmiş güne taşınamaz
- [x] Klavye/ekran okuyucu için her yazıda "Tarihi değiştir" penceresi; dar ekranda gün listesi (375 px Almanca taşmasız)

### Anahtar kelime ve konu tekrarı (Bölüm 7.3)
- [x] `KeywordProvider` + DataForSEO Labs `keyword_overview` (konum = 2000 + ISO sayısal ülke kodu): anahtar varsa konu önerisi ve ücretsiz analizde gerçek hacim/zorluk/CPC/niyet, `dataforseo` etiketi; yoksa "tahmini"
- [x] `VectorStore` (MySQL BLOB Float32, cosine uygulamada): sayfa vektörleri analizden sonra (başlık değişince yeniden), konu vektörleri önerilirken; tekrar eşiği 0,85; iç linkler önce anlamca yakın sayfalardan (≥ 0,75)

### CMS bağlantıları (Bölüm 7.8)
- [x] Ghost (Admin API anahtarı → JWT; HTML kartı; görseller + `codeinjection_head`)
- [x] Shopify (Admin GraphQL `articleCreate`; Dev Dashboard uygulaması client credentials ya da eski `shpat_` token; görseller Shopify CDN'e; SEO meta alanları)
- [x] Webflow (Data API v2; token → siteler/koleksiyonlar/alanlar; kullanıcı alan eşlemesi, adlarından tahmin; varlık yükleme + `items/live`)
- [x] Wix (API anahtarı + site kimliği; HTML → Ricos dönüşümü; kapak Wix Medya'ya; yazar = ilk site üyesi)

### Mevcut yazılar ve site görselleriyle kapak (kullanıcı geri bildirimi, 2026-10-10)
- [x] WordPress bağlanınca yayındaki yazılar REST API'den okunur (`sync-posts`, en fazla 300, sadece okuma): her yazı için 10 ölçülebilir SEO kontrolü (`auditPost`), Sonuçlar → Yazılarım'da en sorunlu önce, nasıl düzeltileceğiyle. Yazılar iç link ve konu tekrarı korumasına katılır. Elle "Yeniden oku".
- [x] Tarama kotası: yarısı menü linkleri, yarısı sitemap (yazı sitemap'leri önce, alt sitemap'lerden sırayla). Önce menü/kategori sayfaları kotanın tamamını tüketiyordu, blog yazıları hiç taranmıyordu.
- [x] Kapak: görsel modeli yoksa sitenin konuya en yakın sayfasının görseli (og:image / öne çıkan görsel; site geneli logo elenir, ≥ 800×400, SVG yok), o da yoksa marka renkleri. "Paketinizde yapay zekâ görseli yok" yanıltıcı metni kaldırıldı.
- [x] Mevcut yazıların aynısını yazmama: konu önerisinde blog yazıları ayrı ve öncelikli (`topics.v2`, 150 yazı + 50 sayfa); yazım öncesi son kontrol (blog yazısıyla cosine ≥ 0,94, vektör yoksa başlık benzerliği): yazılmaz, `duplicate_post` + yazının adresi, içerik sayfasında "Mevcut yazıyı güncelle" / "Yine de yaz" — 2026-10-12
- [x] İçerik yenileme (Bölüm 7.9, Faz 5'ten öne): yazı başına yapay zekâ güncelleme önerisi (`refresh.v1`, `assist` kuyruğu; ölçülen sorunlar + Search Console sorguları + iç link adayları), değişiklik listesi, SEO skoru önce/sonra, önce/sonra görünümü; onayla WordPress'te başlık + gövde güncelleme (öneriden sonra sitede değişen yazıya uygulanmaz), ham içerikle geri alma, aylık öneri hakkı (paket `refreshesPerMonth`); Search Console'da trafiği düşen yazılar (≥ %20 ve ≥ 5 tıklama) önce — 2026-10-12
- [ ] Yenileme: Yoast/Rank Math meta alanlarını yazma (WordPress eklentisi), Ghost/Shopify/Webflow/Wix için `getPost`/`updatePost`
- [ ] Ghost/Shopify/Webflow/Wix için `listPosts`

### Sonuçlar sayfası (Faz 4'ten öne alındı, 2026-10-12)
- [x] Search Console OAuth (sadece okuma), mülk eşleştirme/seçimi, günlük eşitleme (ilk 90 gün), bağlantıyı kesince izin iptali + veri silme
- [x] Genel bakış: gösterim, tıklama, ortalama sıra, ilk 10'daki kelime (önceki 28 günle), günlük grafik, son kazanımlar; içerik özeti
- [x] Anahtar kelimeler: plan + Search Console sorguları, sıra değişimi, sayfa, paketteki takip sınırı
- [x] AI görünürlük: soru üretimi, haftalık ölçüm, anılma oranı ve trend, soru ekle/sil (Starter'da kapalı)
- [ ] URL Inspection (dizinlenme), DataForSEO SERP takibi, haftalık e-posta raporu, ana sayfa metrik kartları

### Yol boyunca düzeltilen hatalar
- Paneldeki dil seçici seçimi geri alıyordu (yeniden doğrulamada eski profil dili çereze yazılıyordu)
- Takvim kartındaki link tarayıcının yerleşik sürüklemesini başlatıp kartın sürüklenmesini engelliyordu
- e2e axe: gelip giden bildirimler rastgele kontrast hatası veriyordu (bildirimler artık /dev/ui'da ayrıca, animasyon bitince denetleniyor)

## Gerçek Gemini ile doğrulama (2026-10-10)
- Ücretsiz analiz (python.org): teknik rapor 85, marka, 10 anahtar kelime, 3 küme. Rakipler bölümü bu anahtarda Google Search kotası olmadığı için boş.
- Makale ("Python ile dosya okuma ve yazma rehberi", Türkçe): 1238 kelime, SEO 86, içindekiler + SSS, iç linkler, ~40 sn. Yoğunlukta 3.8/3.6 Flash 503 verdi, hat hızlı modele düştü.
- Embedding (`gemini-embedding-001`, 768 boyut, ücretsiz katmanda çalışıyor): eşanlamlı başlıklar 0,96, alakasız 0,68. Bölüm yeniden yazımı ~3 sn.

## Kalanlar
| İş | Not |
|---|---|
| Ödeme (iyzico): paket seçimi, deneme, abonelik, iade | Kullanıcı isteğiyle ertelendi |
| Shopify ve Wix için Upvine'ın kendi uygulamasıyla OAuth | Shopify Partner / Wix Dev Center'da uygulama kaydı ve HTTPS dönüş adresi gerekiyor (kullanıcı kararı) |
| Yoast/Rank Math meta alanları | WordPress eklentisiyle (Faz 5) |
| Embedding ile konu kümeleri (pillar + destek yazıları) | Tekrar koruması ve iç linkler hazır |
| DataForSEO ile SERP takibi | Faz 5 (Search Console ile birlikte) |
| Google Search grounding | Ücretsiz katman kotası yok; ücretli katmanda araştırma, doğrulama ve rakipler tam çalışır |

### Canlıya çıkış (beta, ödeme kuruluşu başvurusu), 2026-10-12
- [x] Yasal sayfalar (`/{dil}/legal/*`): Gizlilik, Kullanım Koşulları, Çerez, İptal/İade/Teslimat, Mesafeli Satış, Ön Bilgilendirme, KVKK Aydınlatma, DPA. Türkçe + İngilizce (de/es/fr İngilizce sürüm + not). Satıcı bilgileri `LEGAL_*` değişkenlerinden; boşsa [yer tutucu]. **Avukat kontrolü gerekli.**
- [x] Fiyatlar (`/pricing`), Hakkımızda, İletişim sayfaları; alt bilgide tüm yasal belgeler, iyzico notu, satıcı unvanı; kayıt formunda Koşullar/Gizlilik/KVKK linkleri
- [ ] Ödeme sayfasında Mesafeli Satış + Ön Bilgilendirme onay kutusu (iyzico entegrasyonuyla, Faz 3)
- [ ] Hesap silme ve veri dışa aktarma (panelden; şimdilik e-postayla talep)

