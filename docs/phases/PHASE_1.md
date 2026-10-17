# Faz 1 — Yapay zekâ katmanı ve site analizi (+ Faz 2 sihirbazı)

Durum: **çekirdek tamamlandı, yerelde doğrulandı (2026-10-09)** — kullanıcı isteğiyle ("site eklenebilmeli, analiz edilebilmeli") Faz 2'nin onboarding sihirbazı da öne alındı.

## Tamamlanan

- [x] Doküman kontrolleri: `@google/genai` 2.28, güncel kararlı Gemini modelleri, structured output (`responseJsonSchema`), Google Search grounding, BullMQ 6.3
- [x] `packages/ai`: `AIProvider` arayüzü, `GeminiProvider` (yapılandırılmış çıktı + Zod doğrulama + bir kez onarım, grounding kaynakları, embedding, engellenen yanıt yakalama, 503'te yeniden deneme ve `fast` modele düşme), `FakeAIProvider`, `UnconfiguredAIProvider`, `anthropic`/`openai` iskeleti
- [x] Dağıtık hız sınırlayıcı (Redis): dakikalık istek + günlük bütçe + süreç içi eşzamanlılık
- [x] `ai_usage_logs` (organizasyon, işlem, model, token, maliyet, gecikme, hata kodu)
- [x] Sürümlü prompt'lar: `brand-profile.v1`, `topics.v1`
- [x] `packages/seo`: SSRF korumalı HTTP istemcisi (özel/loopback/link-local/metadata IP'leri her bağlantıda ve yönlendirmede engellenir), robots.txt (RFC 9309), sitemap/sitemap index, sayfa ayrıştırma, kırık link kontrolü
- [x] 25 teknik kontrol + ağırlıklı skor (https, http→https, title, title uzunluğu, meta açıklama, açıklama uzunluğu, H1, alt başlıklar, canonical, robots.txt, sitemap, noindex, viewport, html lang, hreflang, Open Graph, yapılandırılmış veri, görsel alt metni, kırık linkler, yinelenen başlık/açıklama, kısa sayfalar, TTFB, sayfa boyutu, favicon); her biri 5 dilde sade açıklama + düzeltme yolu
- [x] Marka profili çıkarımı (Gemini) ve yapay zekâsız yedek (sezgisel)
- [x] Veritabanı: `sites`, `brand_profiles`, `site_audits`, `existing_pages`, `keywords`, `content_items`, `ai_usage_logs` (migration 0004, kiracı koruması)
- [x] Worker: BullMQ `site-analysis` kuyruğu (`analyze`, `topics`), yeniden deneme politikası, kuyruk öneki
- [x] API `/api/v1/sites`: ekle, listele, güncelle, sil, yeniden analiz, rapor, marka profili, konu öner/ekle/çıkar, kurulumu bitir; `/api/v1/content`
- [x] Sihirbaz `/app/onboarding` (7 adım, ilerleme sunucuda): adres → analiz animasyonu + marka profili → dil ve ülke → ses tonu (+ örnek yazı) → ilk konular (tahmini hacim, çıkar/ekle, geri al) → CMS (şimdilik atla) → yayın modu, günler, saat → takvime planlama
- [x] Ana sayfa: gerçek kurulum listesi, site sağlığı kartı, sıradaki yazılar; İçerikler ve Takvim listeleri; Sonuçlar → Site Sağlığı raporu
- [x] Yeni UI bileşenleri: `Textarea`, `RadioCards` (`/dev/ui`'de)
- [x] Testler: seo (10), ai (7), api (+12: siteler, kiracı izolasyonu, takvim), worker (9), e2e (+2: sihirbaz uçtan uca, hata + 375 px Almanca)

## Kabul kriteri

| Kriter | Durum |
|---|---|
| Gerçek bir URL için 90 saniye içinde eksiksiz rapor | ✓ python.org: tarama ~4 sn, marka profili ~10 sn, toplam ~16 sn (kuyruk + worker üzerinden) |
| Gemini anahtarı yoksa uygulama çökmüyor, anlaşılır mesaj | ✓ analiz sezgisel marka özetiyle tamamlanır; konu adımında "otomatik öneri kapalı, kendi konunuzu ekleyin" (API + worker testleri) |

## Kalanlar (sonraki adımlar)

| İş | Not |
|---|---|
| Halka açık ücretsiz analiz sayfası `/{locale}/free-analysis` (SSR), paylaşım linki, PDF, e-posta, Turnstile, IP başına günde 3, 24 saat önbellek | Analiz motoru hazır; sayfa + `free_analyses` tablosu eklenecek |
| İlk 10 anahtar kelime için gerçek arama hacmi ve 3 organik rakip | DataForSEO (`KeywordProvider`); şimdilik Gemini tahmini, arayüzde "Tahmini" etiketi |
| Embedding tabanlı konu tekrarı koruması (`VectorStore`, cosine 0,85) | Şimdilik kelime benzerliği |
| Admin: YZ maliyetleri, günlük bütçe göstergesi, kuyruk durumu | Veri artık var (`ai_usage_logs`, BullMQ) |
| JavaScript ile render edilen siteler için isteğe bağlı Playwright taraması | |
