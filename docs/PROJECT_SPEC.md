# Otomatik SEO İçerik Platformu — Claude Code Kurulum Promptu (v2)

> **Nasıl kullanılır?**
> 1. Boş bir klasör aç ve bu dosyayı `docs/PROJECT_SPEC.md` olarak içine koy.
> 2. Claude Code'u o klasörde başlat ve şunu yaz:
>    `docs/PROJECT_SPEC.md dosyasını baştan sona oku. Bölüm 0'daki kurallara uy ve Faz 0'dan başla. Her fazın sonunda dur, bana özet ver ve onayımı bekle.`
> 3. `Upvine` yazan yerleri kendi marka adınla değiştir.
>
> Aşağıdaki her şey Claude Code'a verilecek talimattır.

---

## 0. ROLÜN VE ÇALIŞMA KURALLARIN

Sen kıdemli bir full-stack mühendis, SaaS mimarı ve ürün tasarımcısısın. `Upvine` adlı, çok kiracılı (multi-tenant), production'a hazır bir **otomatik SEO içerik platformu** kuracaksın.

**Zorunlu teknoloji kararları (değiştirme):**
- **Backend:** Node.js, Express, TypeScript
- **Frontend:** React, TypeScript
- **Veritabanı:** MySQL 8, ORM olarak Sequelize
- **Yapay zekâ:** Google Gemini
- **Ödeme:** iyzico (abonelik API'si), fiyatlar **USD**

**Çalışma kuralları:**
- **Fazlara bölerek çalış** (Bölüm 15). Her fazın sonunda dur. Ne yaptığını, nasıl test edileceğini ve açık kalan konuları özetle, sonra onayımı bekle.
- Her fazın başında görevleri bir yapılacaklar listesine yaz ve ilerledikçe işaretle.
- Proje kökünde bir `CLAUDE.md` oluştur ve güncel tut: mimari kararlar, komutlar, klasör yapısı, tasarım kuralları.
- **Harici API'lerin (Gemini, iyzico, WordPress, Shopify, Webflow, Ghost, Wix, DataForSEO, Google Search Console) güncel resmî dokümantasyonunu kod yazmadan önce kontrol et.** Model adlarını, endpoint'leri ve SDK sürümlerini ezberden yazma. iyzico dokümantasyonu `docs.iyzico.com` adresinde. Sayfa URL'lerinin sonuna `.md` eklenince markdown sürümü açılıyor.
- Gizli bilgileri asla koda gömme. Her şey `.env` dosyasından gelsin ve `.env.example` her zaman güncel kalsın.
- TypeScript `strict` modda çalış. `any` kullanma.
- Her dış servis bir **arayüzün (interface) arkasında** dursun. Gemini ve iyzico ileride değiştirilebilir (Bölüm 4).
- Belirsiz bir karar varsa makul bir varsayım yap, `CLAUDE.md` içindeki "Kararlar" bölümüne yaz ve devam et. Sadece geri dönüşü zor kararlarda bana sor.
- **Kullanılabilirlik bir özellik değil, şarttır.** Bölüm 6'daki tasarım ve UX kuralları her ekran için kabul kriteridir.

---

## 1. ÜRÜN ÖZETİ

`Upvine`, küçük işletmelerin, e-ticaret sitelerinin ve ajansların web sitesine bağlanır ve SEO içerik operasyonunun tamamını otomatik yürütür:

1. Siteyi analiz eder. Marka, sektör, hedef kitle ve teknik SEO durumunu çıkarır.
2. Gerçek arama verisiyle anahtar kelime ve konu fırsatlarını bulur.
3. Bir içerik takvimi oluşturur.
4. Her konu için şunları üretir: SEO uyumlu, doğrulanmış bilgi içeren makale, kapak görseli, infografik, iç linkler ve schema.
5. Makaleyi müşterinin sitesine yayınlar. Müşteri isterse önce onayına sunar.
6. Sıralamayı ve Search Console verisini takip eder.
7. Sıralaması düşen eski yazıları yeniler ve teknik SEO hatalarını düzeltir.

**Hedef kullanıcı SEO uzmanı değil.** Bir diş hekimi, bir e-ticaret sahibi ya da bir avukat hiçbir eğitim almadan paneli kullanabilmeli.

### Rakiplere göre farklılaşma (ürünün çekirdeği, atlanmamalı)

Pazardaki benzer araçlarda (SEOTANK, Arvow, Outrank vb.) görülen eksikler ve kullanıcı şikayetleri araştırıldı:

| Rakiplerdeki sorun | Bizim çözümümüz |
|---|---|
| Uydurma veya doğrulanmamış bilgi | Yayından önce zorunlu **bilgi doğrulama aşaması**: Gemini Google Search grounding ile iddialar kontrol edilir ve kaynak linkleri eklenir |
| Kalıplaşmış, sıradan yapay zekâ metni | Marka sesi profili, müşterinin örnek yazılarından öğrenme, özgün örnekler, SSS bölümü |
| Sadece yeni içerik ekleme | **İçerik yenileme motoru**: Search Console'da düşen sayfalar bulunur ve güncellenir |
| Teknik hataları raporlayıp düzeltmeme | **Tek tıkla düzeltme**: meta, alt metin, schema (WordPress eklentisi üzerinden) |
| Fatura ve iptal şikayetleri, iade yapılmaması | Panelden tek tıkla iptal, deneme bitmeden 3 gün önce hatırlatma e-postası, ilk ödemede 14 gün koşulsuz iade |
| Anlaşılmaz kredi ve puan sistemleri | **Kredi sistemi yok.** Her pakette sabit ve net kotalar |
| Görsellerin araç sunucusunda kalması | Görseller her zaman **müşterinin kendi CMS medya kütüphanesine** yüklenir |
| Ücretsiz analizde verinin gizlenmesi | Ücretsiz analiz ilk 10 anahtar kelimenin hacmini ve 3 rakibi açıkça gösterir |
| Aşırı yayın riski | Yeni sitelerde yavaş başlangıç, kalite eşiği altındaki yazıların yayınlanmaması |
| Riskli backlink değişim ağları | **Backlink değişimi kesinlikle yok** |
| Yapay zekâ aramalarında görünürlüğün ölçülmemesi | **AI görünürlük takibi** |
| Dar platform desteği | WordPress, Shopify, Webflow, Ghost, Wix, webhook ve indirme |
| Karmaşık, jargonlu paneller | **Sade dil**, 5 menü öğesi, her ekranda tek ana eylem (Bölüm 6) |

---

## 2. HEDEF PAZARLAR VE DİLLER

Fiyatlar USD. Bu yüzden alım gücü yüksek pazarlar hedeflendi.

**Arayüz dilleri (5):**

| Kod | Dil | Hedef pazarlar |
|---|---|---|
| `en` | İngilizce (varsayılan) | ABD, İngiltere, Kanada, Avustralya, global |
| `de` | Almanca | Almanya, Avusturya, İsviçre |
| `es` | İspanyolca | İspanya, Meksika, Latin Amerika |
| `fr` | Fransızca | Fransa, Belçika, İsviçre, Kanada |
| `tr` | Türkçe | Türkiye, ihracat yapan Türk işletmeleri |

Kurallar:
- Frontend'de `react-i18next`, backend'de (e-postalar ve hata mesajları için) `i18next` kullan.
- Halka açık sayfalarda URL yapısı `/{locale}/...` olsun ve her dil için `hreflang` etiketleri eklensin.
- Tarayıcı dilinden otomatik dil algıla. Kullanıcının seçimi saklansın.
- Çeviri dosyaları `locales/{locale}/*.json` altında dursun. Kodda sabit metin olmasın.
- CI kontrolü: bir dil dosyasında eksik anahtar varsa build başarısız olsun.
- Almanca metinler İngilizceden yaklaşık %30 daha uzun olur. Arayüz bileşenleri taşmaya dayanıklı tasarlanmalı ve her ekran Almanca ile test edilmeli.
- **İçerik üretim dili arayüz dilinden bağımsızdır.** Makaleler en az 25 dilde üretilebilir. Liste bir config dosyasında dursun. Makaleler çeviri değil, hedef dilde sıfırdan yazılır.
- Yasal metinler için şablon oluştur ve bunların bir avukat tarafından gözden geçirilmesi gerektiğini not düş.

---

## 3. TEKNOLOJİ YIĞINI

### 3.1 Backend (`apps/api` ve `apps/worker`)

| Katman | Seçim |
|---|---|
| Çalışma ortamı | Node.js (güncel LTS), TypeScript strict |
| HTTP framework | Express ve `helmet`, `cors`, `compression`, `express-rate-limit` |
| Veritabanı | **MySQL 8**, karakter seti `utf8mb4` ve `utf8mb4_unicode_ci` (5 dil ve emoji desteği için zorunlu) |
| ORM | **Sequelize v6** ve TypeScript (`InferAttributes` / `InferCreationAttributes` ile tip güvenli modeller) |
| Migration | Umzug ile Sequelize migration'ları. `sync()` **kesinlikle kullanılmaz**, her şema değişikliği bir migration dosyasıdır |
| Doğrulama | Zod (istek gövdeleri, query parametreleri ve yapay zekâ çıktıları) |
| Kimlik doğrulama | E-posta ve şifre (`argon2` ile hash) ve Google OAuth. Kısa ömürlü JWT access token (15 dk) ve `httpOnly`, `secure`, `sameSite` refresh token çerezi. Refresh token rotasyonu yapılır ve iptal edilebilir |
| Arka plan işleri | BullMQ ve Redis (ayrı `worker` süreci), zamanlanmış işler için repeatable jobs |
| Yapay zekâ | Google Gemini API, resmî `@google/genai` SDK (Bölüm 9) |
| Anahtar kelime verisi | DataForSEO API (birincil). Gemini tahminleri yedektir ve "tahmini" diye işaretlenir |
| Ödeme | **iyzico abonelik API'si.** Resmî `iyzipay` Node paketini kullan, abonelik metotları eksikse kendi ince istemcini yaz (IYZWSv2 imzalama) |
| E-posta | Resend veya SMTP (Nodemailer), şablonlar için React Email |
| Dosya depolama | S3 uyumlu depolama (Cloudflare R2). Sadece geçici dosyalar burada tutulur |
| Site tarama | `undici` ve `cheerio`, JavaScript ile render edilen siteler için isteğe bağlı Playwright |
| Görsel işleme | `sharp` (WebP dönüşümü), `satori` ve `@resvg/resvg-js` (infografik) |
| Log ve hata takibi | Pino, Sentry |
| API dokümantasyonu | OpenAPI (zod-to-openapi ile), `/api/docs` altında Swagger UI (sadece geliştirme ortamında) |
| Test | Vitest, Supertest |

### 3.2 Frontend (`apps/web`)

| Katman | Seçim |
|---|---|
| Framework | React ve TypeScript, Vite |
| Routing | **React Router v7 (framework mode).** Halka açık sayfalar (pazarlama sitesi, blog, fiyatlar, ücretsiz analiz) **SEO için sunucu tarafında render edilir (SSR)**. Panel (`/app/*`) ve admin (`/admin/*`) sadece istemci tarafında çalışır |
| Sunucu durumu | TanStack Query |
| Formlar | React Hook Form ve Zod (şemalar backend ile paylaşılır) |
| Arayüz | Tailwind CSS ve shadcn/ui (Radix tabanlı, erişilebilir). Bölüm 6'daki tasarım token'larıyla özelleştirilir |
| İkonlar | Lucide |
| Grafikler | Recharts |
| Editör | Tiptap |
| Takvim | Sürükle-bırak için `@dnd-kit` |
| Bildirim balonları | Sonner |
| Test | Vitest, React Testing Library, Playwright (uçtan uca) |

### 3.3 Monorepo yapısı (pnpm workspaces)

```
apps/
  api/          # Express REST API
  worker/       # BullMQ worker'ları: içerik üretimi, yayın, tarama, takip, faturalandırma
  web/          # React: pazarlama sitesi (SSR), müşteri paneli, admin paneli
packages/
  db/           # Sequelize modelleri, migration'lar, seed'ler
  shared/       # paylaşılan Zod şemaları, tipler, sabitler (frontend + backend)
  ai/           # AIProvider arayüzü, Gemini implementasyonu, prompt şablonları
  seo/          # tarayıcı, denetim kuralları, SEO skorlama, iç link motoru
  publishers/   # CMS adaptörleri
  keywords/     # KeywordProvider, DataForSEO
  billing/      # BillingProvider arayüzü, iyzico implementasyonu
  email/        # e-posta şablonları (5 dil)
  config/       # paketler, kotalar, desteklenen diller
  ui/           # tasarım token'ları ve ortak React bileşenleri
wordpress-plugin/  # müşterinin WordPress sitesine kurulan yardımcı eklenti (PHP)
docker/            # Dockerfile'lar
```

### 3.4 API tasarım kuralları

- REST, `/api/v1/...` önekiyle sürümlenir.
- Tutarlı hata formatı: `{ error: { code, message, details? } }`. `message` kullanıcının diline göre çevrilir.
- Sayfalama: cursor tabanlı (`?cursor=&limit=`).
- Her rota için katmanlar: `routes → controllers → services → repositories (Sequelize)`. Controller içinde iş mantığı olmaz.
- Merkezî hata yakalayıcı middleware. Async hatalar yakalanır.
- İstek başına `requestId` üretilir, loglara ve hata yanıtlarına eklenir.

---

## 4. MİMARİ İLKELER

### 4.1 Değiştirilebilir sağlayıcılar (kritik)

```ts
// packages/ai
interface AIProvider {
  generateText(opts: { system: string; prompt: string; model: ModelTier; temperature?: number }): Promise<AIResult<string>>;
  generateStructured<T>(opts: { system: string; prompt: string; schema: ZodSchema<T>; model: ModelTier }): Promise<AIResult<T>>;
  generateGrounded(opts: { prompt: string; model: ModelTier }): Promise<AIResult<{ text: string; sources: Source[] }>>;
  generateImage(opts: { prompt: string; aspectRatio: '16:9' | '1:1' | '4:5'; style: ImageStyle }): Promise<AIResult<Buffer>>;
  embed(texts: string[]): Promise<AIResult<number[][]>>;
}
type ModelTier = 'fast' | 'quality' | 'reasoning';
// AIResult: data, inputTokens, outputTokens, model, latencyMs, costUsd

// packages/billing
interface BillingProvider {
  createCustomer(org: Organization, billing: BillingDetails): Promise<string>;
  startCheckout(opts: { orgId: string; planCode: PlanCode; interval: 'monthly' | 'yearly'; locale: Locale; callbackUrl: string }): Promise<{ checkoutFormContent: string; token: string }>;
  completeCheckout(token: string): Promise<SubscriptionState>;
  getSubscription(ref: string): Promise<SubscriptionState>;
  changePlan(ref: string, newPlanCode: PlanCode, when: 'now' | 'next_period'): Promise<SubscriptionState>;
  cancel(ref: string): Promise<SubscriptionState>;
  startCardUpdate(ref: string, callbackUrl: string): Promise<{ checkoutFormContent: string }>;
  refund(paymentRef: string, amount: number): Promise<RefundResult>;
  chargeOneTime(opts: { orgId: string; amount: number; description: string }): Promise<PaymentResult>;
  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean;
  parseWebhook(rawBody: string): BillingEvent;
}
```

- Yapay zekâ sağlayıcısı `AI_PROVIDER=gemini`, ödeme sağlayıcısı `BILLING_PROVIDER=iyzico` ortam değişkeniyle seçilir. İleride Stripe, Paddle veya Claude eklenmesi sadece yeni bir implementasyon dosyası gerektirmeli.
- Her yapay zekâ çağrısı `ai_usage_logs` tablosuna yazılır. Admin panelinde kiracı başına maliyet görünür.
- Prompt şablonları `packages/ai/prompts/` altında, sürüm numaralı dosyalarda dursun.
- Aynı yaklaşım `KeywordProvider` ve `Publisher` için de geçerli.

### 4.2 Yayın adaptörleri

```ts
interface Publisher {
  id: 'wordpress' | 'shopify' | 'webflow' | 'ghost' | 'wix' | 'webhook';
  testConnection(): Promise<ConnectionStatus>;
  listExistingContent(): Promise<ExistingPage[]>;
  uploadMedia(file: Buffer, meta: MediaMeta): Promise<{ url: string; id: string }>;
  publish(article: PublishableArticle, mode: 'draft' | 'publish' | 'schedule'): Promise<PublishResult>;
  update(remoteId: string, article: PublishableArticle): Promise<PublishResult>;
  getCategories?(): Promise<Category[]>;
  setSeoMeta?(remoteId: string, meta: SeoMeta): Promise<void>;
}
```

### 4.3 Çok kiracılı yapı

- `Organization → Site → Content` hiyerarşisi. Roller: `owner`, `admin`, `editor`, `viewer`.
- Tüm sorgular `organization_id` ile filtrelenir. Bunu repository katmanında zorunlu kıl: her repository metodu `orgId` parametresi alır. Sequelize'ın global scope özelliğiyle ek koruma ekle.
- Kiracılar arası veri sızıntısı için ayrı testler yaz.

### 4.4 Arka plan işleri

- İçerik üretimi hiçbir zaman HTTP isteği içinde çalışmaz, her zaman kuyruğa atılır.
- Her iş adımı idempotent ve yeniden denenebilir olmalı: üstel geri çekilme ile en fazla 5 deneme.
- Gemini'den gelen 429 hatalarında kuyruk otomatik yavaşlar.
- İş durumu panelde canlı görünsün (Server-Sent Events, yoksa polling).

---

## 5. VERİ MODELİ (Sequelize, MySQL)

Genel kurallar:
- Tablo adları `snake_case` ve çoğul, Sequelize'da `underscored: true`.
- Birincil anahtarlar `CHAR(36)` UUID v7 (sıralanabilir). Dış dünyaya otomatik artan id gösterilmez.
- Her tabloda `created_at` ve `updated_at`. Silinebilir kullanıcı verilerinde `paranoid: true` (yumuşak silme, `deleted_at`).
- Esnek alanlar için MySQL `JSON` tipi.
- Para tutarları `DECIMAL(10,2)` ve ayrı bir `currency` alanı. Asla `FLOAT` kullanılmaz.
- Sık sorgulanan alanlara indeks ekle (`organization_id`, `site_id`, `status`, `scheduled_at`). Her migration'da indeksleri düşün.
- **Embedding'ler:** MySQL'de pgvector yok. Embedding'leri `BLOB` olarak (Float32Array) sakla. Benzerlik hesabını uygulama katmanında yap: site başına embedding'ler belleğe alınır ve cosine benzerliği hesaplanır. Site başına birkaç bin sayfa için bu yeterince hızlıdır. Redis'te site bazında önbelleğe al. Kodu bir `VectorStore` arayüzünün arkasına koy ki ileride bir vektör veritabanına geçilebilsin.

Tablolar (başlangıç noktası, gerektikçe genişlet):

- `users`: e-posta, şifre hash'i, ad, dil tercihi, e-posta doğrulandı mı, Google id
- `refresh_tokens`: kullanıcı, token hash'i, son kullanma, iptal edildi mi, cihaz bilgisi
- `email_verifications`, `password_resets`
- `organizations`: ad, slug, plan, plan durumu, deneme bitiş tarihi, dönem sonu, varsayılan dil, fatura bilgileri (ad, adres, ülke, vergi no / VAT ID, şirket mi bireysel mi)
- `memberships`: kullanıcı, organizasyon, rol
- `invitations`: e-posta, organizasyon, rol, token, son kullanma
- `sites`: organizasyon, URL, ad, ülke, içerik dili, ek diller, CMS türü, bağlantı durumu, yayın modu (`approval` / `auto`), haftalık yayın sayısı, yayın günleri ve saati, saat dilimi, onboarding adımı
- `site_credentials`: site, tür, AES-256-GCM ile şifrelenmiş veri, IV, auth tag, anahtar sürümü, son doğrulama
- `brand_profiles`: site, marka adı, açıklama, ürünler ve hizmetler, hedef kitle, ses tonu, ses tonu yönergesi, yasaklı kelimeler, örnek yazılar, rakipler, CTA metni ve linki, marka renkleri
- `site_audits`: site, skor, kontrol sonuçları (JSON)
- `existing_pages`: site, URL, başlık, H1, embedding (BLOB), son tarama
- `keywords`: site, terim, dil, ülke, arama hacmi, zorluk, CPC, niyet, kaynak (`dataforseo` / `estimated`), küme id
- `keyword_clusters`: site, ad, pillar keyword
- `content_items`: site, keyword, başlık, planlanan tarih, durum (`planned`, `generating`, `review`, `approved`, `scheduled`, `published`, `failed`, `rejected`), tür (`new` / `refresh`), hata mesajı, ilerleme adımı
- `articles`: content item, dil, başlık, slug, meta başlık, meta açıklama, HTML içerik (`MEDIUMTEXT`), yapı JSON'u, SSS JSON'u, schema JSON-LD, SEO skoru, SEO kontrolleri JSON'u, doğrulama raporu JSON'u, kaynaklar JSON'u, kelime sayısı, sürüm
- `article_versions`: makale, sürüm, içerik, düzenleyen kullanıcı
- `article_images`: makale, tür (`cover` / `infographic`), prompt, depolama anahtarı, uzak URL, alt metin
- `publications`: makale, site, uzak id, uzak URL, yayın zamanı, durum, hata
- `rank_snapshots`: site, keyword, pozisyon, URL, tarih, kaynak (`gsc` / `serp`)
- `gsc_connections`: site, şifrelenmiş token'lar, mülk
- `gsc_daily_metrics`: site, sayfa, sorgu, tarih, gösterim, tıklama, CTR, pozisyon (tarih ve site üzerinde bileşik indeks)
- `ai_visibility_checks`: site, prompt, model, bahsedildi mi, alıntılanan URL, tarih
- `tech_fixes`: site, sayfa URL'i, sorun türü, mevcut değer, önerilen değer, durum (`pending`, `applied`, `dismissed`, `reverted`)
- `subscriptions`: organizasyon, sağlayıcı (`iyzico`), iyzico abonelik referans kodu, iyzico müşteri referans kodu, plan kodu, fiyatlandırma planı referans kodu, aralık, durum, deneme bitişi, dönem başlangıcı ve sonu, dönem sonunda iptal edilecek mi
- `payments`: organizasyon, abonelik, iyzico ödeme id'si, sipariş referans kodu, tutar, para birimi, durum, iade edilen tutar, ödeme tarihi
- `refund_requests`: organizasyon, ödeme, sebep, durum, işleyen admin
- `usage_counters`: organizasyon, dönem başlangıcı, üretilen makale, yenilenen makale, analiz sorgusu, takip edilen anahtar kelime
- `processed_webhook_events`: sağlayıcı, event id veya hash (benzersiz), işlenme zamanı
- `ai_usage_logs`: organizasyon, işlem, model, input token, output token, maliyet, gecikme
- `audit_logs`: kullanıcı, işlem, hedef, IP, user agent
- `free_analyses`: URL, e-posta, sonuç JSON'u, IP hash'i, paylaşım token'ı
- `notifications`: kullanıcı, tür, veri, okundu mu
- `notification_preferences`: kullanıcı, tür, e-posta açık mı, panel açık mı

---

## 6. TASARIM SİSTEMİ VE KULLANILABİLİRLİK (kabul kriteri)

### 6.1 Tasarım yönü

Ürün bir **güven** ürünüdür: kullanıcı sitesinin yönetim anahtarını bize veriyor. Aynı zamanda bir **büyüme** ürünüdür: kullanıcı sıralamasının yükseldiğini görmek istiyor. Renk sistemi bu iki duyguya dayanır:

- **Kobalt mavi = güven ve eylem.** Sakin, profesyonel ve kurumsal. Tüm ana butonlar ve linkler bu renkte.
- **Zümrüt yeşil = büyüme ve sonuç.** Sadece anlamlı yerlerde kullanılır: sıralama yükselişi, yayınlanan yazı, başarı durumu, grafiklerde "bizim" çizgimiz. Böylece kullanıcının gözü yeşili "iyi haber" olarak öğrenir.
- **Sıcak amber = dikkat.** Sadece uyarılar ve "onayınızı bekliyor" durumları için.
- Geri kalan her şey sakin gri tonları. Ekranın %90'ı nötr renklerdir, renk bilgi taşır.

Kaçınılacaklar: mor-pembe "yapay zekâ" gradyanları, neon renkler, her yere gölge, aynı ekranda birden fazla parlak renk. Bunlar ürünü sıradan ve güvensiz gösterir.

### 6.2 Renk token'ları

Token'lar `packages/ui/tokens.css` içinde CSS değişkeni olarak tanımlanır ve Tailwind config'e bağlanır. Bileşenlerde **ham hex kodu kullanılmaz**, sadece token adı kullanılır.

**Açık tema:**

| Token | Hex | Kullanım | Kontrast notu |
|---|---|---|---|
| `--primary` | `#3B5BDB` | Ana butonlar, linkler, aktif menü öğesi, odak halkası | Beyaz metinle 5,7:1 (AA) |
| `--primary-hover` | `#2F4AC0` | Hover durumu | |
| `--primary-soft` | `#EDF2FF` | Seçili satır, bilgi kutusu zemini, aktif menü zemini | |
| `--growth` | `#0E9F6E` | Grafik çizgileri, yükseliş okları, rozet ikonları | Metin için kullanılmaz |
| `--growth-text` | `#047857` | Yeşil metin ("↑ 5 sıra yükseldi") | Beyaz zeminde 5,5:1 (AA) |
| `--growth-soft` | `#E6F6F0` | Başarı rozeti zemini | |
| `--warning` | `#B45309` | Uyarı metni ve ikonu | Beyaz zeminde AA |
| `--warning-soft` | `#FEF3C7` | Uyarı kutusu zemini, "onay bekliyor" rozeti | |
| `--danger` | `#DC2626` | Hata, silme butonu | Beyaz metinle AA |
| `--danger-soft` | `#FEE2E2` | Hata kutusu zemini | |
| `--ink` | `#0F172A` | Başlıklar ve ana metin | |
| `--ink-muted` | `#475569` | İkincil metin, açıklamalar | Beyaz zeminde 7,5:1 |
| `--ink-subtle` | `#94A3B8` | Sadece placeholder ve pasif ikonlar (metin için değil) | |
| `--border` | `#E2E8F0` | Kart ve input kenarlıkları | |
| `--surface` | `#FFFFFF` | Kartlar, modaller | |
| `--background` | `#F8FAFC` | Sayfa zemini | |

**Koyu tema** (panelde kullanıcı seçebilir, varsayılan sistem ayarı):

| Token | Hex |
|---|---|
| `--primary` | `#748FFC` |
| `--primary-soft` | `#1E2A4F` |
| `--growth` | `#34D399` |
| `--growth-text` | `#6EE7B7` |
| `--warning` | `#FBBF24` |
| `--danger` | `#F87171` |
| `--ink` | `#F1F5F9` |
| `--ink-muted` | `#94A3B8` |
| `--border` | `#1E293B` |
| `--surface` | `#111827` |
| `--background` | `#0B1120` |

**Grafik paleti** (sırayla): `#3B5BDB`, `#0E9F6E`, `#F59E0B`, `#7C8CA8`. "Bizim içeriğimiz" her zaman yeşil, karşılaştırma verisi gri.

**Kural:** Durum bilgisi asla sadece renkle verilmez. Her zaman ikon ve metin de eşlik eder (renk körlüğü erişilebilirliği). Örnek: ✓ ikonu, yeşil rozet ve "Yayında" yazısı birlikte.

### 6.3 Tipografi

- **Başlıklar:** Plus Jakarta Sans (600 ve 700). Modern, samimi ve okunaklı.
- **Gövde ve arayüz:** Inter (400, 500, 600). Sayılarda `font-variant-numeric: tabular-nums` kullan (tablolar ve istatistikler hizalı dursun).
- Her iki font da Türkçe (ğ, ş, ı, İ), Almanca (ß, ü), Fransızca ve İspanyolca karakterleri destekler. Fontlar kendi sunucumuzdan servis edilir (`@fontsource`), Google Fonts'a istek atılmaz (GDPR).
- Ölçek: 12 / 14 / 16 (gövde) / 18 / 20 / 24 / 30 / 36 / 48 px. Panelde gövde metni 14-16 px, pazarlama sitesinde 16-18 px.
- Satır uzunluğu en fazla 70 karakter. Satır yüksekliği gövdede 1,6, başlıklarda 1,2.

### 6.4 Boşluk, şekil ve hareket

- 4 px tabanlı boşluk ölçeği (4, 8, 12, 16, 24, 32, 48, 64).
- Köşe yuvarlaklığı: input ve butonlarda 8 px, kartlarda 12 px, modallerde 16 px.
- Gölge minimum: kartlarda sadece ince kenarlık ve çok hafif gölge. Belirgin gölge sadece modal ve açılır menülerde.
- Animasyonlar 150-250 ms, `ease-out`. `prefers-reduced-motion` ayarına uyulur.
- Dokunma hedefleri en az 44×44 px.

### 6.5 Kullanılabilirlik kuralları (her ekran için zorunlu)

1. **Sade dil, jargon yok.** Teknik terimler kullanıcı diline çevrilir:
   - "Impression" yerine "Google'da görünme sayısı"
   - "CTR" yerine "Tıklanma oranı"
   - "SERP pozisyonu" yerine "Google sırası"
   - "Kanibalizasyon" yerine "Aynı konuda başka yazınız var"
   - "Schema / JSON-LD" yerine "Google için yapılandırılmış bilgi"
   
   Kaçınılmaz terimlerin yanında `?` ikonu ve tek cümlelik açıklama balonu bulunur.
2. **Her ekranda tek ana eylem.** Ekranda sadece bir tane dolu `primary` buton olur. Diğer eylemler ikincil (çerçeveli) veya metin butonudur.
3. **Panel menüsü en fazla 5 ana öğe:** Ana Sayfa · İçerikler · Takvim · Sonuçlar · Ayarlar. Teknik SEO, AI görünürlük ve rakipler "Sonuçlar" altında sekme olarak durur. Admin ve fatura ayarlar altındadır.
4. **Ana sayfa 5 saniye testi:** Kullanıcı ana sayfaya girdiğinde 5 saniye içinde şu üç soruyu cevaplayabilmeli: "İşler yolunda mı?", "Bir şey yapmam gerekiyor mu?", "Sonuç alıyor muyum?" Bu yüzden ana sayfa yukarıdan aşağıya şöyle dizilir:
   - **Durum şeridi:** "Her şey yolunda — sıradaki yazı Perşembe 10:00'da yayınlanacak" (yeşil) veya "2 yazı onayınızı bekliyor" (amber, butonlu).
   - **3 ana metrik kartı:** Bu ay yayınlanan yazı, Google'da görünme (önceki aya göre değişimle), İlk 10'daki yazı sayısı.
   - **Sıradaki yazılar** (en fazla 5).
   - **Son kazanımlar:** "'X' yazınız 12. sıradan 4. sıraya çıktı".
5. **Boş durumlar asla boş değildir.** Her boş liste ne olduğunu açıklar ve tek bir sonraki adım sunar. Örnek: "Henüz yayınlanmış yazınız yok. İlk yazınız 2 gün içinde hazır olacak." ve "Takvime bak" butonu.
6. **Kurulum kontrol listesi.** Onboarding tamamlanana kadar ana sayfanın üstünde ilerleme çubuklu bir liste durur: Site analiz edildi ✓, Marka profili onaylandı ✓, Site bağlandı, Search Console bağlandı, İlk yazı onaylandı.
7. **Her uzun işlem ilerleme gösterir.** Makale üretirken adımlar görünür: "Konu araştırılıyor → Taslak yazılıyor → Bilgiler doğrulanıyor → Görseller hazırlanıyor". İskelet (skeleton) yükleme ekranları kullanılır, boş beyaz ekran kullanılmaz.
8. **Hata mesajları insan dilinde ve çözüm odaklı.** "Error 401" yerine "WordPress bağlantınızın süresi dolmuş. Yeniden bağlamak 30 saniye sürer." ve "Yeniden bağla" butonu.
9. **Geri alınabilirlik.** Silme, reddetme ve teknik düzeltme gibi işlemlerde 5 saniyelik "Geri al" bildirimi gösterilir. Gerçekten geri alınamaz işlemlerde (hesap silme, iptal) onay modalı açılır ve sonuç açıkça yazılır.
10. **Mobil uyumlu.** Panel 375 px genişlikte tam çalışır. Mobilde yan menü alt navigasyon çubuğuna dönüşür. Onay kuyruğu mobilde kart görünümünde açılır (yazıyı oku → onayla, telefondan rahatça yapılabilmeli).
11. **Erişilebilirlik (WCAG 2.1 AA):** Tüm metinlerde kontrast en az 4,5:1. Klavye ile tam gezinme ve görünür odak halkası. Form alanlarında `label` ve hata mesajlarında `aria-live`. Otomatik test için `@axe-core/playwright`.
12. **Formlar kısa.** Sadece gerekli alanlar sorulur. Mümkün olan her şey otomatik doldurulur (taramadan gelen marka bilgisi, tarayıcıdan gelen saat dilimi). Doğrulama alan terk edildiğinde yapılır, her tuş vuruşunda yapılmaz.
13. **Tutarlılık.** Aynı eylem her yerde aynı adı ve ikonu taşır. Durum rozetleri tek bir bileşenden gelir:

| Durum | Renk | İkon | Metin |
|---|---|---|---|
| `planned` | Gri | takvim | Planlandı |
| `generating` | Mavi (yumuşak) | dönen ikon | Hazırlanıyor |
| `review` | Amber | göz | Onayınızı bekliyor |
| `scheduled` | Mavi | saat | Yayına hazır |
| `published` | Yeşil | ✓ | Yayında |
| `failed` | Kırmızı | ! | Sorun var |

### 6.6 Pazarlama sitesi tasarımı

- Hero alanında tek bir net vaat ve tek bir CTA ("Ücretsiz site analizi al"). İkincil eylem metin linki olarak durur.
- Ürün ekran görüntüleri gerçek panelden alınır (seed verisiyle).
- Bölüm sırası: Hero → "3 adımda nasıl çalışır" → Farklılaşma tablosu ("Ajans / Klasik SEO aracı / Sadece yapay zekâ / Upvine") → Panel önizlemesi → Fiyatlar → SSS → Son CTA.
- Fiyat sayfasında önerilen paket görsel olarak vurgulanır (kenarlık ve "En popüler" rozeti). Aylık/yıllık geçişi tek tıkla yapılır. İptal ve iade politikası fiyatların hemen altında tek cümleyle yazar.
- Başka bir SaaS'ın tasarımını, metnini, logosunu veya maskotunu **kopyalama.** Özgün bir görsel dil kullan.

### 6.7 Bileşen kütüphanesi

- `packages/ui` içinde shadcn/ui bileşenleri token'larla özelleştirilir: Button, Input, Select, Card, Badge (durum rozeti), Dialog, Sheet, Tabs, Tooltip, Toast, Skeleton, EmptyState, StatCard, ProgressSteps, ChecklistCard, DataTable.
- Faz 0'da bir `/dev/ui` sayfası (sadece geliştirme ortamında) tüm bileşenleri açık ve koyu temada gösterir. Böylece tasarım tutarlılığı tek ekrandan kontrol edilir.

---

## 7. ÖZELLİKLER (MODÜLLER)

### 7.1 Kayıt ve onboarding sihirbazı

Adımlar (her adım tek ekran, üstte ilerleme çubuğu):
1. Site URL'i (tek alan)
2. Otomatik tarama animasyonu ve marka profili özeti. Kullanıcı düzenleyebilir.
3. İçerik dili ve hedef ülke (tarayıcıdan ve siteden otomatik önerilir)
4. Ses tonu seçimi (görsel kartlar ve örnek cümleler), isteğe bağlı örnek yazı
5. Önerilen ilk 10 konu (kullanıcı çıkarabilir)
6. CMS bağlantısı ("Şimdilik atla" seçeneği belirgin)
7. Yayın modu ve sıklığı
8. Paket seçimi ve iyzico ödeme formu

Kurallar:
- İlerleme kaydedilir, kullanıcı kaldığı yerden devam eder.
- Hedef: kayıttan ilk makale taslağına kadar 10 dakikadan kısa.

### 7.2 Ücretsiz site analizi (kayıt gerektirmez)

- Halka açık `/{locale}/free-analysis` sayfası (SSR). URL girilir, sonuç yaklaşık 60 saniyede gelir (ilerleme adımları görünür).
- Kapsam:
  - **25 teknik kontrol:** title, meta açıklama, H1, canonical, robots.txt, sitemap.xml, HTTPS, mobil viewport, Open Graph, schema, görsel alt metinleri, kırık iç linkler, TTFB, sayfa boyutu, hreflang, noindex, yinelenen başlıklar vb. Her kontrol için durum, sade dille açıklama ve düzeltme yolu.
  - **Marka özeti** ve önerilen konu kümeleri.
  - **İlk 10 anahtar kelime fırsatı** (arama hacimleriyle).
  - **3 organik rakip.**
  - Sitenin sayfa listesi ve yinelenen başlık uyarıları.
- Kötüye kullanım önlemleri: IP başına günde 3 analiz, Cloudflare Turnstile. Aynı alan adı için 24 saat önbellek.
- Sonuç paylaşılabilir linke sahip olsun ve PDF olarak indirilebilsin.
- İsteğe bağlı e-posta: sonuç PDF'i gönderilir. Pazarlama izni ayrı onay kutusuyla alınır (GDPR ve KVKK).
- Sonuç sayfasının sonunda net CTA: "Bu planı otomatik uygula — 7 gün dene".

### 7.3 Marka profili ve ses tonu

- Tarama ve Gemini ile otomatik çıkarılır, kullanıcı düzenleyebilir.
- Ses tonu ön ayarları: Profesyonel, Samimi, Uzman ve teknik, Eğlenceli. Ek olarak serbest talimat yazılabilir.
- Örnek yazılar analiz edilir ve ses tonu yönergesine dönüştürülür.
- Yasaklı kelime ve konu listesi, makale sonu CTA metni ve linki, marka renkleri (infografikler için).

### 7.4 Anahtar kelime araştırması ve konu planlama

- Başlangıç kelimeleri: marka profili, site içeriği, rakipler ve kullanıcının kendi kelimeleri. **Kendi kelimesini girmek tüm paketlerde serbest.**
- `KeywordProvider` (DataForSEO): arama hacmi, zorluk, CPC, ilgili kelimeler. Anahtar yoksa Gemini tahmini kullanılır ve "tahmini" etiketi gösterilir.
- Kümeleme: embedding'lerle konu kümeleri (pillar sayfası ve destek yazıları).
- Önceliklendirme skoru: arama hacmi, zorluk, ticari niyet, sitenin konuyla ilgisi ve mevcut içerikte boşluk.
- Takvim paket kotasına ve seçilen sıklığa göre otomatik dolar. Sürükle-bırak ile düzenlenebilir. Yeni sitelerde ilk ay haftada en fazla 3 yazı yayınlanır.

### 7.5 Konu tekrarı koruması

- Mevcut sayfalar sitemap'ten ve CMS'ten okunur. Başlık ve H1 embedding'leri kaydedilir.
- Yeni konu adayı mevcut bir sayfaya cosine benzerliği 0,85'in üzerindeyse (ayarlanabilir) elenir ve alternatif önerilir.
- Her yazıya benzersiz odak anahtar kelime atanır.
- Elenen konular "Bu konuda zaten bir yazınız var" açıklamasıyla ve ilgili yazının linkiyle gösterilir.

### 7.6 İçerik üretim hattı (worker)

Her `content_item` için sıralı ve ayrı ayrı yeniden denenebilir adımlar:

1. **Araştırma:** Gemini grounding ile üst sıralardaki içeriklerin alt konuları, sık sorulan sorular ve güncel veriler.
2. **Taslak plan:** H2/H3 yapısı, bölüm amaçları, veriler, SSS, iç link hedefleri. Zod ile doğrulanan yapılandırılmış çıktı.
3. **Yazım:** Bölüm bölüm, marka sesiyle, hedef dile ve ülkeye özgü örneklerle. Kelime sayısı rakiplere göre (varsayılan 1200-2200).
4. **Bilgi doğrulama:** Somut iddialar (sayı, tarih, istatistik, yasal bilgi) çıkarılır ve grounding ile kontrol edilir. Doğrulanamayanlar yeniden yazılır veya çıkarılır. Kaynaklar dış link olarak eklenir. Rapor: doğrulanan, düzeltilen, kaldırılan iddialar.
5. **SEO skorlama (0-100):** başlıkta odak kelime, meta başlık (50-60 karakter), meta açıklama (140-160 karakter), slug, ilk paragrafta kelime, H2 varyasyonları, kelime yoğunluğu (doldurma yok), okunabilirlik, iç ve dış linkler, alt metinler, SSS, içindekiler, schema. **Skor 75'in altındaysa otomatik iyileştirme turu yapılır.** Hâlâ düşükse yazı otomatik yayınlanmaz, incelemeye düşer.
6. **İç linkleme:** En alakalı 3-5 mevcut sayfaya doğal anchor metinlerle link. Eski yazılardan bu yazıya link önerisi (WordPress eklentisi varsa otomatik uygulanabilir).
7. **Görseller** (Bölüm 7.7).
8. **Schema:** `Article`, `FAQPage`, `BreadcrumbList` JSON-LD.
9. **Son kontrol:** HTML temizleme, kırık link kontrolü, kelime sayısı doğrulaması.
10. **Durum:** `approval` modunda `review` durumuna geçer ve e-posta gider. `auto` modunda `scheduled` olur.

Ek gereksinimler:
- **İnceleme ekranı:** solda makale önizlemesi (sitede nasıl görüneceğine yakın), sağda sade bir yan panel: SEO skoru (renkli halka), doğrulama özeti ("12 bilgi doğrulandı, 1 bilgi düzeltildi"), kapak görseli ve büyük "Onayla ve planla" butonu.
- Tiptap editör ile düzenleme, sürüm geçmişi, seçilen bölümü yapay zekâya yeniden yazdırma.
- İndirme: HTML veya Markdown, görsellerle birlikte ZIP. Görseller dosyaya gömülür, hiçbir şey bizim sunucumuza bağlı kalmaz.

### 7.7 Görseller

- **Kapak:** metinsiz, 16:9, seçilen stilde (fotogerçekçi, 3D, düz vektör, editoryal, minimal). Gemini görsel modeliyle üretilir.
- **İnfografik:** görsel modelle **üretilmez** (yapay zekâ görsellerinde metin hatalı çıkar). Makaledeki veriler yapılandırılmış olarak çıkarılır, marka renkleriyle bir SVG şablonuna yerleştirilir ve `satori` ile `resvg` kullanılarak PNG'ye dönüştürülür. 3-4 şablon: adımlar, karşılaştırma, istatistik, kontrol listesi.
- WebP dönüşümü ve sıkıştırma (`sharp`), SEO dostu dosya adı, üretilmiş alt metin.
- Görseller yayında müşterinin CMS medya kütüphanesine yüklenir. Bizim depomuzdaki kopya 30 gün sonra silinir.

### 7.8 Yayın entegrasyonları

Her adaptör için güncel dokümantasyonu kontrol et. Kimlik bilgileri şifreli saklanır, tarayıcıya asla geri gönderilmez ve kullanıcı bağlantıyı tek tıkla iptal edebilir.

| Platform | Yöntem | Faz |
|---|---|---|
| **WordPress** | REST API ve Application Passwords. Bağlantı WordPress'in yerleşik `authorize-application.php` akışıyla tek tıkla kurulur, kullanıcı şifre kopyalamaz. Kategori, etiket, öne çıkan görsel, Yoast ve Rank Math meta alanları desteklenir | Faz 3 |
| **WordPress eklentisi** | Hafif PHP eklentisi: SEO meta yazma, eski yazılara iç link ekleme, teknik düzeltmeler, schema enjeksiyonu. HMAC imzalı istekler | Faz 5 |
| **Shopify** | Admin GraphQL API ile blog makaleleri. Uygulama ve kimlik doğrulama modelini Shopify'ın **güncel** dokümantasyonuna göre kur, çünkü özel uygulama oluşturma akışı son dönemde değişti | Faz 3 |
| **Webflow** | Data API v2, CMS alan eşleştirmesi (kullanıcı hangi alanın ne olduğunu seçer) | Faz 4 |
| **Ghost** | Admin API (JWT) | Faz 4 |
| **Wix** | Wix Blog API (OAuth) | Faz 4 |
| **Webhook / özel API** | HMAC-SHA256 imzalı JSON POST, yeniden deneme, teslimat logları | Faz 3 |
| **İndirme** | HTML, Markdown veya ZIP | Faz 3 |

- Bağlantı ekranı her platform için ekran görüntülü, en fazla 3 adımlık talimat gösterir. "Bağlantıyı test et" butonu anında sonuç verir.
- Planlı yayın sitenin saat dilimine göre yapılır. Başarısız yayın yeniden denenir, kullanıcı bilgilendirilir ve sebep sade dille gösterilir.
- Yayından sonra Search Console'a sitemap ping'i gönderilir.

### 7.9 İçerik yenileme motoru

- Search Console bağlıysa: son 28 günde önceki 28 güne göre görünme veya sıra kaybı yaşayan sayfalar tespit edilir.
- Her biri için yenileme önerisi: güncel olmayan bilgiler, eksik alt başlıklar, yeni SSS, güncellenmiş meta açıklama. Önce/sonra karşılaştırması gösterilir.
- Onaylanırsa `Publisher.update` ile yayınlanır ve yenileme kotasından düşülür.
- Bizim üretmediğimiz eski yazılar için de çalışır.

### 7.10 Teknik SEO düzeltmeleri

- Haftalık otomatik tarama (paket limitine göre sayfa sayısı).
- Sorunlar önem sırasına göre listelenir ve yapay zekâ düzeltme önerisi üretir.
- "Uygula" butonu WordPress eklentisi veya CMS API'si üzerinden düzeltir. Desteklenmeyen platformlarda kopyalanabilir öneri gösterilir.
- Toplu uygulama ve geri alma (önceki değer saklanır).

### 7.11 Sonuçlar: sıralama ve Search Console

- Google Search Console OAuth. Günlük metrikler ve URL Inspection API ile dizinlenme durumu.
- Search Console ücretsiz birincil kaynaktır. İsteğe bağlı DataForSEO SERP takibi (Growth'ta haftalık, Agency'de günlük).
- "Sonuçlar" sayfası sekmeleri: Genel Bakış · Yazılarım · Anahtar Kelimeler · Site Sağlığı · AI Görünürlük.
- Her makale için sıralama geçmişi grafiği. "Kazanılan anahtar kelimeler" listesi.
- Haftalık e-posta raporu (5 dilde). Rapor 3 sayı ve 1 kazanımla başlar, kısa ve okunaklıdır.

### 7.12 AI görünürlük takibi (Growth ve Agency)

- Her site için 10-20 müşteri sorusu oluşturulur ve haftada bir Gemini'ye grounding ile sorulur. Cevapta marka veya alan adının anılıp anılmadığı kaydedilir.
- Trend grafiği ve "anılma oranı" metriği.
- Mimari, ileride başka modellerin eklenebileceği şekilde kurulsun.

### 7.13 Takvim, onay ve bildirimler

- Ay ve hafta görünümü, sürükle-bırak.
- İnceleme kuyruğu: onayla, düzenle, reddet (sebep seçilir ve sonraki yazılarda dikkate alınır), yeniden üret.
- Bildirimler: panel içi ve e-posta (yazı onay bekliyor, yayınlandı, yayın başarısız, kota bitiyor, deneme bitiyor, ödeme başarısız). Kullanıcı tercihlerini yönetebilir.

### 7.14 Ekip ve ajans özellikleri

- E-posta ile davet ve rol atama.
- Agency paketi: çoklu site ve üst barda site değiştirici, beyaz etiketli PDF raporlar, müşteriye salt okunur paylaşım linki.

### 7.15 Faturalandırma (iyzico, USD)

**Paketler.** Değerler `packages/config/plans.ts` içinde tanımlanır. iyzico ürün ve fiyatlandırma planları `pnpm billing:setup` script'iyle API üzerinden oluşturulur ve referans kodları veritabanına yazılır.

| | **Starter** | **Growth** | **Agency** |
|---|---|---|---|
| Aylık fiyat | $29 | $79 | $199 |
| Yıllık fiyat (2 ay hediye) | $290/yıl | $790/yıl | $1.990/yıl |
| Site sayısı | 1 | 1 | 5 |
| Yeni makale / ay | 10 | 30 | 100 (siteler arasında paylaşılır) |
| İçerik yenileme / ay | 3 | 10 | 40 |
| Takip edilen anahtar kelime | 50 | 200 | 1.000 |
| İçerik dili | 1 | 3 | Sınırsız |
| Teknik SEO düzeltme | ✓ | ✓ | ✓ |
| Search Console entegrasyonu | ✓ | ✓ | ✓ |
| Bilgi doğrulama | ✓ | ✓ | ✓ |
| AI görünürlük takibi | — | ✓ | ✓ |
| SERP pozisyon takibi | — | Haftalık | Günlük |
| Beyaz etiketli rapor | — | — | ✓ |
| Ekip üyesi | 1 | 3 | 10 |

**iyzico entegrasyon detayları** (her adımı `docs.iyzico.com` üzerindeki abonelik dokümantasyonuyla doğrula):

- **Ürün ve planlar:** Her paket ve aralık için bir fiyatlandırma planı oluşturulur: `currencyCode: USD`, `paymentInterval: MONTHLY` veya `YEARLY`, `planPaymentType: RECURRING`, deneme için `trialPeriodDays: 7`. Bir planın fiyatı sonradan değiştirilemez (sadece ad ve deneme süresi güncellenebilir). Fiyat değişikliğinde yeni plan oluşturulur ve eski abonelikler eski planda kalır. Bunu `plans` tablosunda sürümleyerek yönet.
- **Ödeme akışı:** iyzico abonelik **Checkout Form** başlatılır (3D Secure). Form içeriği frontend'de bir modal veya ayrı sayfada gösterilir. Callback URL'e dönen token ile sonuç sorgulanır, abonelik ve müşteri referans kodları kaydedilir. Ödeme formu kullanıcının arayüz dilinde açılır (`locale`).
- **Deneme:** 7 gün, 3 makale. Deneme süresinde iyzico sadece kartı doğrular, ödeme deneme sonunda alınır. Deneme bitiminden 3 gün önce kendi zamanlanmış işimizle hatırlatma e-postası gönderilir: tarih, tutar ve tek tıkla iptal linki. Ödeme ekranında deneme bitiş tarihi ve tutar açıkça yazar.
- **Webhook:** iyzico abonelik bildirimleri (başarılı ve başarısız tahsilat olayları) için bir webhook uç noktası yazılır. İmza doğrulaması iyzico'nun güncel imza yöntemine göre yapılır. Ham gövde (raw body) korunur. `processed_webhook_events` ile idempotency sağlanır. Webhook gelmezse diye günlük bir **uzlaştırma (reconciliation) işi** iyzico'dan abonelik durumlarını sorgulayıp veritabanını senkronize eder.
- **Başarılı tahsilat:** Ödeme kaydedilir, dönem tarihleri güncellenir ve kotalar sıfırlanır.
- **Başarısız tahsilat:** Kullanıcıya kart güncelleme linkiyle e-posta gider. 7 gün ek süre tanınır, sonra yayınlar durdurulur (veri silinmez). iyzico'nun yeniden deneme (retry) metodu kullanılabilir.
- **Kendi müşteri portalımız** (Ayarlar → Faturalandırma), çünkü iyzico'da Stripe Customer Portal benzeri hazır bir sayfa yok:
  - Mevcut paket, sonraki ödeme tarihi ve tutarı, kota kullanımı (ilerleme çubuklarıyla).
  - **Paket değiştirme:** iyzico abonelik yükseltme (upgrade) metodu. Yükseltme hemen, düşürme dönem sonunda geçerli olur.
  - **Kart güncelleme:** iyzico kart güncelleme checkout formu.
  - **İptal:** tek tıkla iyzico iptal metodu. Kısa bir "neden ayrılıyorsunuz?" anketi gösterilir ama iptali engellemez. Erişim ödenmiş dönemin sonuna kadar devam eder (iyzico iptali anında yapıyorsa dönem sonu tarihini kendi veritabanımızda tut ve erişimi o tarihe kadar açık bırak).
  - Ödeme geçmişi ve makbuzlar.
- **İade:** İlk ödemeden sonraki 14 gün içinde koşulsuz tam iade. Panelde "İade talep et" butonu. Talep `refund_requests` tablosuna düşer, config'e göre otomatik veya admin onayıyla iyzico iade API'si üzerinden işlenir. Abonelik ödemelerinin API ile iade edilebilirliğini dokümantasyonda doğrula. Mümkün değilse admin panelinde "iyzico merchant panelinden manuel iade yapıldı" işaretleme akışı kur.
- **Ek makale paketi:** Kota dolarsa "ek 10 makale" tek seferlik ödeme olarak alınabilir (iyzico tek seferlik checkout form, sabit fiyat, kredi değil).
- **Fatura:** Türkiye'de faaliyet gösteren bir şirket olarak her ödeme için e-Arşiv veya e-Fatura kesilmesi gerekir. `InvoiceProvider` adında bir arayüz tanımla ve şimdilik "manuel" implementasyonla bırak (admin panelinde kesilecek faturaların listesi ve CSV dışa aktarma). İleride Paraşüt veya benzeri bir servisle entegre edilecek. Faturalandırma formunda ülke, şirket adı, vergi numarası veya VAT ID ve adres alınır.
- **Kota kontrolü** hem API'de hem worker'da yapılır. Worker kotası dolan veya aboneliği askıda olan organizasyon için iş başlatmaz.
- **Ortam notu:** iyzico abonelik özelliğinin merchant hesabında aktif olması gerekir ve sandbox'ta abonelik desteği sınırlı olabilir. Bunu `README.md`'de belirt. Testlerde iyzico'yu mock'la (MSW). Sandbox anahtarlarıyla manuel test için ayrı bir rehber yaz.
- Her şey `BillingProvider` arayüzünün arkasında olsun. İleride yurt dışı satışlar için Stripe veya Paddle eklenebilmeli.

### 7.16 Admin paneli (`/admin`, sadece `superadmin`)

- Kullanıcılar, organizasyonlar, abonelikler, ödemeler. Destek için "kullanıcının gözünden görüntüleme" (audit log'a yazılır).
- Kiracı başına yapay zekâ maliyeti ve gelir karşılaştırması (marj takibi).
- Kuyruk durumu (Bull Board), başarısız işler, yeniden deneme.
- İade talepleri, kesilecek faturalar listesi.
- Prompt şablonu sürümleri ve özellik bayrakları.
- Sistem sağlığı: Gemini 429 oranı, günlük istek bütçesi kullanımı, ortalama üretim süresi.

### 7.17 Pazarlama sitesi (5 dil, SSR, SEO açısından kusursuz)

- Sayfalar: Ana sayfa, Fiyatlar, Ücretsiz analiz, Entegrasyonlar, Blog (ürünün kendi içerik motoruyla beslenir, kendi sitemizi ilk müşteri olarak bağlarız), Hakkımızda, İletişim, yasal sayfalar (Gizlilik, Kullanım Koşulları, Çerez Politikası, İade Politikası, Mesafeli Satış Sözleşmesi, Ön Bilgilendirme Formu, KVKK Aydınlatma Metni, GDPR DPA).
- Teknik: dinamik OG görselleri, `sitemap.xml`, `robots.txt`, her dil için `hreflang`, JSON-LD (`Organization`, `SoftwareApplication`, `FAQPage`, `Product`/`Offer`). Lighthouse skoru her kategoride 95 ve üzeri.
- GDPR ve KVKK uyumlu çerez onayı. Analitik (Plausible veya PostHog) onay verilmeden yüklenmez.
- Canlı destek widget alanı ve WhatsApp butonu için yer bırak.

---

## 8. ÖNEMLİ SAYFA VE ROTA LİSTESİ

**Halka açık (SSR):** `/{locale}`, `/{locale}/pricing`, `/{locale}/free-analysis`, `/{locale}/free-analysis/r/:token`, `/{locale}/integrations`, `/{locale}/blog`, `/{locale}/blog/:slug`, `/{locale}/about`, `/{locale}/contact`, `/{locale}/legal/*`, `/{locale}/login`, `/{locale}/signup`, `/{locale}/forgot-password`

**Panel (istemci tarafı):** `/app` (Ana Sayfa), `/app/onboarding`, `/app/content`, `/app/content/:id` (inceleme ve editör), `/app/calendar`, `/app/results` (sekmeli), `/app/settings` (Site, Marka, Bağlantılar, Ekip, Faturalandırma, Bildirimler, Hesap)

**Admin:** `/admin`, `/admin/organizations`, `/admin/users`, `/admin/billing`, `/admin/refunds`, `/admin/invoices`, `/admin/queues`, `/admin/ai-costs`, `/admin/flags`

---

## 9. GEMINI ENTEGRASYONU

- Resmî **`@google/genai`** SDK'sını kullan. Güncel paket adını ve sürümünü kontrol et.
- **Model adlarını koda gömme.** Kod yazmadan önce `ai.google.dev/gemini-api/docs/models` adresinden güncel listeyi kontrol et ve `.env.example` dosyasına önerilen değerleri yaz:
  ```
  AI_PROVIDER=gemini
  GEMINI_API_KEY=
  GEMINI_MODEL_FAST=          # Flash-Lite sınıfı: sınıflandırma, meta, alt metin
  GEMINI_MODEL_QUALITY=       # Flash sınıfı: outline, makale, yenileme
  GEMINI_MODEL_REASONING=     # Pro sınıfı (genellikle ücretli katman), isteğe bağlı
  GEMINI_MODEL_IMAGE=         # görsel üretim modeli
  GEMINI_MODEL_EMBEDDING=     # embedding modeli
  AI_MAX_CONCURRENCY=2
  AI_RPM_LIMIT=
  AI_DAILY_REQUEST_BUDGET=
  ```
- **Free tier gerçekleri** (koda ve `CLAUDE.md`'ye yansıt):
  - Rate limitler proje bazında ve düşüktür. Güncel limitler AI Studio'da görünür.
  - **Dağıtık hız sınırlayıcı** yaz (Redis token bucket). RPM ve günlük bütçe `.env`'den okunur. Bütçe dolunca işler ertesi güne ertelenir ve kullanıcıya "Yoğunluk nedeniyle sıraya alındı, tahmini hazır olma: yarın 10:00" mesajı gösterilir.
  - Bir makale yaklaşık 10-20 çağrı gerektirir. Hattı çağrı sayısını en aza indirecek şekilde tasarla ve sonuçları önbelleğe al.
  - Admin panelinde günlük kullanım ve limit göstergesi olsun.
- **Yapılandırılmış çıktı:** `responseSchema` ve JSON modu, ardından Zod doğrulaması. Başarısız olursa bir kez onarım isteği.
- **Grounding:** Araştırma, bilgi doğrulama ve AI görünürlük adımlarında Google Search grounding. Kaynaklar `groundingMetadata` alanından alınır.
- **Güvenlik ayarları:** Engellenen yanıtları yakala ve logla.
- **Gizlilik notu:** Ücretsiz katman koşullarında gönderilen verilerin ürün geliştirme için kullanılabildiğini `CLAUDE.md` dosyasına not düş. Müşterilere satış başladığında ücretli katmana geçilmesi önerilir. Gizlilik politikasında Google alt işlemci olarak belirtilsin.
- **Sağlayıcı değişimi:** `packages/ai/providers/gemini.ts` yaz. `anthropic.ts` ve `openai.ts` için `NotImplemented` hatası fırlatan iskelet dosyalar oluştur. Testler için deterministik `FakeAIProvider`.

---

## 10. GÜVENLİK VE UYUMLULUK

- CMS ve Search Console kimlik bilgileri **AES-256-GCM** ile şifrelenir. Ana anahtar `ENCRYPTION_KEY` ortam değişkeninden gelir. Anahtar rotasyonu için sürüm alanı tutulur.
- **SSRF koruması:** site tarama ve webhook isteklerinde özel IP aralıkları, localhost ve metadata IP'leri engellenir. Yönlendirmelerde de kontrol yapılır.
- Rate limit: login, kayıt, şifre sıfırlama, ücretsiz analiz ve genel API için Redis tabanlı sınırlama.
- `helmet` ile güvenlik başlıkları ve CSP. CORS sadece kendi frontend alan adımıza açık.
- Refresh token çerezleri için CSRF koruması (double-submit token veya `sameSite=strict`).
- Sequelize'da ham SQL kullanılacaksa sadece parametreli sorgular (`replacements`). String birleştirme ile SQL yazılmaz.
- Yapay zekâ çıktısı HTML'i `sanitize-html` ile temizlenir. Frontend'de `dangerouslySetInnerHTML` sadece temizlenmiş içerikle ve DOMPurify'dan geçirilerek kullanılır.
- Webhook imza doğrulaması (iyzico ve giden webhook'larımız).
- Kart bilgisi **hiçbir zaman** bizim sunucumuza gelmez. Ödeme formu tamamen iyzico'nun checkout formudur.
- Audit log: kimlik bilgisi ekleme ve silme, paket değişikliği, impersonation, iade.
- **GDPR ve KVKK:** veri dışa aktarma (JSON), hesap silme (30 gün yumuşak silme, ardından kalıcı silme), çerez onayı, açık rıza kayıtları, alt işlemci listesi (Google, iyzico, e-posta sağlayıcı, Cloudflare, hosting).
- Günlük MySQL yedeği (`mysqldump` veya yönetilen servis yedeği), dokümante edilir.

---

## 11. PERFORMANS VE GÜVENİLİRLİK

- Panel ilk yükleme hedefi: 3G bağlantıda 3 saniyenin altında. Rota bazlı kod bölme (lazy loading).
- TanStack Query ile önbellek ve iyimser güncellemeler (onaylama, tarih değiştirme anında yansır).
- Site tarama: eşzamanlılık limiti, `robots.txt`'ye uyum, kendi User-Agent'ımız, paket başına sayfa limiti.
- Her harici çağrıda zaman aşımı, yeniden deneme ve devre kesici.
- MySQL bağlantı havuzu ayarları `.env`'den gelir. N+1 sorgularından kaçınmak için `include` ve indeksler kullanılır.
- Sağlık uç noktaları: `/api/health` (veritabanı ve Redis kontrolüyle) ve worker heartbeat.

---

## 12. TEST STRATEJİSİ

- **Birim testleri:** SEO skorlama, konu tekrarı tespiti, cosine benzerliği, kota hesaplama, şifreleme, iyzico imza üretimi ve webhook doğrulama, iç link seçimi, slug işlemleri.
- **API testleri (Supertest):** kimlik doğrulama akışları, yetkilendirme (roller), tüm CRUD uç noktaları. Test veritabanı Docker'da ayrı bir MySQL şemasıdır ve her testten önce migration'larla sıfırlanır.
- **Entegrasyon testleri:** her `Publisher` adaptörü ve iyzico için MSW mock sunucuları. `FakeAIProvider` ile gerçek Gemini'ye istek atılmaz.
- **Uçtan uca testler (Playwright):** kayıt, onboarding, ücretsiz analiz, ödeme (mock iyzico ile), makale üretimi, onaylama ve yayınlama (sahte WordPress ile), paket değiştirme, iptal, iade talebi.
- **Erişilebilirlik testleri:** ana ekranlarda `@axe-core/playwright`, ihlal varsa test başarısız.
- **Görsel kontrol:** her ana ekran 375 px ve 1440 px genişlikte, açık ve koyu temada, Almanca dilinde ekran görüntüsüyle kontrol edilir (taşma testi).
- **Kiracı izolasyonu testleri.**
- GitHub Actions: lint, tip kontrolü, testler, i18n anahtar kontrolü ve build.

---

## 13. YAYINA ALMA VE ORTAM

- `docker-compose.yml`: MySQL 8 (`utf8mb4`), Redis, Mailpit ve isteğe bağlı phpMyAdmin. `pnpm dev` API'yi, worker'ı ve web'i birlikte başlatır.
- `.env.example` tüm değişkenleri açıklamalarıyla içermeli: MySQL bağlantısı, Redis, JWT anahtarları, Google OAuth, Gemini, DataForSEO, iyzico (`IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL` sandbox ve production), e-posta, R2, Sentry, şifreleme anahtarı, Turnstile, uygulama URL'leri.
- Script'ler: `pnpm db:migrate`, `pnpm db:seed` (demo organizasyon, site ve makaleler), `pnpm billing:setup` (iyzico ürün ve planlarını oluşturur).
- Production: API, worker ve web için ayrı Dockerfile'lar. Tek VPS'te Docker Compose ve Nginx (ters proxy, SSL için Let's Encrypt) **veya** Railway / Render. Yönetilen MySQL önerilir.
- `README.md`: kurulum, yerel geliştirme, iyzico sandbox testi, Gemini API anahtarı alma, test WordPress sitesi (Docker), yayına alma adımları.

---

## 14. YAPMA LİSTESİ

- Backlink değişim ağı, PBN veya otomatik link satın alma yok.
- Sahte yorum, sahte kullanıcı sayısı veya uydurma başarı istatistiği yok.
- Müşterinin mevcut içeriğini izinsiz değiştirme. Yenileme ve teknik düzeltmeler önce önerilir, otomatik uygulama ayrı bir ayardır ve varsayılan olarak kapalıdır.
- Kredi ve puan sistemi yok.
- Rakip bir ürünün tasarımını, metnini veya marka unsurlarını kopyalama.
- Model adlarını, fiyatları ve API anahtarlarını koda gömme.
- Sequelize `sync({ alter/force })` production'da asla kullanılmaz.
- Bileşenlerde ham renk kodu kullanılmaz, sadece token'lar.
- Kullanıcıya teknik hata kodu veya stack trace gösterilmez.
- Google'da "sıralama garantisi" vaat eden metin yazılmaz.

---

## 15. FAZLAR VE KABUL KRİTERLERİ

Her fazın sonunda dur, özet ver ve onay bekle.

**Faz 0 — Temel ve tasarım sistemi**
- Monorepo, Docker Compose, Express iskeleti (katmanlı yapı, hata yakalayıcı, loglama), Sequelize bağlantısı ve ilk migration'lar.
- Kimlik doğrulama (e-posta ve şifre, Google, JWT ve refresh token), e-posta doğrulama, şifre sıfırlama.
- React uygulaması (React Router v7, SSR halka açık sayfalar), `react-i18next` (5 dil).
- Tasarım token'ları, açık ve koyu tema, `packages/ui` bileşenleri ve `/dev/ui` vitrin sayfası.
- Panel iskeleti (5 menü öğesi, mobilde alt navigasyon), `CLAUDE.md`, CI.
- Kabul: `pnpm dev` çalışıyor. Kayıt, giriş, çıkış ve şifre sıfırlama çalışıyor. Dil ve tema değiştirici çalışıyor. `/dev/ui` tüm bileşenleri gösteriyor ve axe testlerinden geçiyor. CI yeşil.

**Faz 1 — Yapay zekâ katmanı ve site analizi**
- `AIProvider`, Gemini implementasyonu, hız sınırlayıcı, kullanım logu, `FakeAIProvider`.
- Tarayıcı, 25 teknik kontrol, marka profili çıkarımı.
- Halka açık ücretsiz analiz sayfası, ilerleme adımları, paylaşım linki, PDF.
- Kabul: Gerçek bir URL için 90 saniye içinde eksiksiz rapor alınıyor. Gemini anahtarı yoksa uygulama çökmüyor ve anlaşılır bir mesaj gösteriyor.

**Faz 2 — Anahtar kelime, plan ve içerik üretimi**
- `KeywordProvider`, kümeleme, `VectorStore` ve konu tekrarı koruması, takvim.
- Onboarding sihirbazı (ödeme adımı hariç).
- 10 adımlı üretim hattı, bilgi doğrulama, SEO skorlama, görseller, inceleme ekranı, Tiptap editör, indirme.
- Kabul: Onboarding'den sonra 3 makale otomatik üretiliyor. Her biri doğrulama raporu, 75 ve üzeri SEO skoru ve iki görsel içeriyor. İnceleme ekranından onaylanabiliyor.

**Faz 3 — Yayın ve faturalandırma**
- WordPress (tek tıkla bağlantı), Shopify, webhook ve indirme adaptörleri. Planlı yayın, onay akışı, bildirimler.
- iyzico: plan kurulum script'i, checkout form, deneme, webhook, uzlaştırma işi, kendi müşteri portalımız (paket değiştirme, kart güncelleme, iptal), 14 gün iade akışı, deneme hatırlatma e-postası, ek makale paketi, kota kontrolü, manuel fatura listesi.
- Kabul: Test WordPress sitesine görsellerle yayın yapılıyor. Mock iyzico ile kayıt, deneme, ödeme, paket yükseltme, kart güncelleme, iptal ve iade uçtan uca çalışıyor. Kota dolunca üretim duruyor ve kullanıcıya net bir mesaj gösteriliyor.

**Faz 4 — Ölçüm ve ek platformlar**
- Search Console OAuth, günlük metrikler, dizinlenme kontrolü, Sonuçlar sayfası, ana sayfa metrikleri, haftalık e-posta raporu.
- Webflow, Ghost ve Wix adaptörleri. AI görünürlük takibi.
- Kabul: Search Console bağlı test sitesinin verileri panelde görünüyor. Ana sayfa 5 saniye testini geçiyor (Bölüm 6.5 madde 4).

**Faz 5 — Farklılaştırıcılar**
- İçerik yenileme motoru, teknik SEO düzeltmeleri, WordPress yardımcı eklentisi (PHP), geriye dönük iç linkleme.
- Kabul: Düşüş yaşayan bir sayfa için yenileme önerisi önce/sonra karşılaştırmasıyla üretilip uygulanabiliyor. Eksik meta açıklamalar tek tıkla WordPress'e yazılıyor ve geri alınabiliyor.

**Faz 6 — Ajans, admin ve pazarlama sitesi**
- Ekip ve roller, çoklu site, beyaz etiketli raporlar.
- Admin paneli.
- 5 dilde pazarlama sitesi, blog, yasal sayfalar, çerez onayı.
- Kabul: Lighthouse skorları 95 ve üzeri. Tüm sayfalar 5 dilde ve `hreflang` doğru. Almanca dahil hiçbir ekranda metin taşması yok.

**Faz 7 — Sağlamlaştırma ve yayına alma**
- Güvenlik denetimi (SSRF, kiracı izolasyonu, sanitize, rate limit), uçtan uca ve erişilebilirlik test paketi, Sentry, yedekleme dokümantasyonu, production deploy rehberi.
- Kabul: Tüm testler yeşil. `README.md`'deki adımları izleyen biri projeyi sıfırdan yayına alabiliyor.

---

Başla: Önce bu dosyayı özetle. Sonra Faz 0'ın görev listesini çıkar ve uygulamaya geç.
