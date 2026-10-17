# Upvine

Küçük işletmeler, e-ticaret siteleri ve ajanslar için otomatik SEO içerik platformu: siteyi analiz eder, konu planlar, doğrulanmış makaleler üretir, müşterinin sitesinde yayınlar ve sonuçları takip eder.

- Ürün tanımı: [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md)
- Geliştirici rehberi, mimari kararlar ve tasarım kuralları: [CLAUDE.md](CLAUDE.md)
- Faz ilerlemesi: [docs/phases/](docs/phases/)

## Gereksinimler

- **Node.js 24 LTS** (`.nvmrc`) ve **pnpm 11** (`corepack enable`)
- **MySQL 8** (utf8mb4), **Redis 6.2+** (Windows'ta Memurai), **Mailpit** (geliştirme e-postaları)
- Ya da bunların yerine **Docker** (`docker-compose.yml`)

## Hızlı başlangıç

```bash
corepack enable
pnpm install
cp .env.example .env          # sonra gizli değerleri doldurun (aşağıya bakın)
pnpm db:migrate               # veritabanı yoksa oluşturur
pnpm db:seed                  # demo hesaplar (aşağıda)
pnpm dev                      # web: http://localhost:5173  API: http://localhost:4000
```

Demo hesaplar (`pnpm db:seed`, sadece geliştirme):

| Hesap | E-posta | Şifre |
|---|---|---|
| Müşteri | `demo@upvine.local` | `demo-password-123` |
| Superadmin (admin paneli: `/admin`) | `admin@upvine.local` | `admin-password-123` |

Kendi hesabınızı superadmin yapmak için: `pnpm admin:grant siz@ornek.com`

`.env` içinde en az şunlar doldurulmalı:

| Değişken | Nasıl |
|---|---|
| `JWT_ACCESS_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `MYSQL_USER` / `MYSQL_PASSWORD` | Kullanıcının `MYSQL_DATABASE`, `MYSQL_TEST_DATABASE` ve `<MYSQL_DATABASE>_e2e` veritabanlarını oluşturma/silme yetkisi olmalı |
| `MYSQL_TEST_DATABASE` | Asıl veritabanından **farklı** bir ad (testler her çalıştırmada siler) |
| `GEMINI_API_KEY` | [Google AI Studio → API keys](https://aistudio.google.com/apikey). Boşsa uygulama çalışır: site analizi yapay zekâsız tamamlanır, konu önerisi kapalıdır |

### Altyapı seçenekleri

**Docker ile:**

```bash
docker compose up -d                      # MySQL 8, Redis 7, Mailpit
docker compose --profile tools up -d      # + phpMyAdmin (http://localhost:8080)
```

`.env`: `MYSQL_USER=upvine`, `MYSQL_PASSWORD=upvine`.

**Docker olmadan (Windows):** MySQL 8 servisi, [Memurai](https://www.memurai.com/) (Redis uyumlu) ve Mailpit (Laragon'da `bin/mailpit` altında hazır gelir). Mailpit'i başlatmak için:

```powershell
C:\laragon\bin\mailpit\1.22.3\mailpit.exe     # SMTP 1025, arayüz http://localhost:8025
```

> **exFAT disk uyarısı:** Proje exFAT bir diskteyse pnpm sembolik link oluşturamaz. Bu repo bunun için `nodeLinker: hoisted` ve TypeScript `paths` alias'larıyla yapılandırıldı (bkz. CLAUDE.md > Kararlar).

## Geliştirme

| Adres | Ne |
|---|---|
| http://localhost:5173 | Web (dil otomatik algılanır: `/en`, `/de`, `/es`, `/fr`, `/tr`) |
| http://localhost:5173/app | Müşteri paneli (giriş gerekir) |
| http://localhost:5173/admin | Admin paneli (sadece superadmin) |
| http://localhost:5173/dev/ui | Bileşen vitrini (açık + koyu tema, sadece geliştirme) |
| http://localhost:4000/api/docs | Swagger UI (sadece geliştirme) |
| http://localhost:4000/api/health | Sağlık kontrolü (MySQL, Redis, worker heartbeat) |
| http://localhost:8025 | Mailpit: doğrulama ve şifre sıfırlama e-postaları |

## Test

```bash
pnpm lint            # ESLint + ham renk kodu kontrolü
pnpm typecheck       # (pnpm dev kapalıyken çalıştırın)
pnpm i18n:check      # 5 dilde eksik çeviri kontrolü
pnpm test            # birim + API entegrasyon testleri (MYSQL_TEST_DATABASE her seferinde sıfırlanır)
pnpm test:e2e        # Playwright + axe; ilk seferde: pnpm --filter @upvine/web exec playwright install chromium
```

Uçtan uca testler kendi API (4100), web (5174) ve veritabanlarıyla (`<MYSQL_DATABASE>_e2e`, her seferinde sıfırdan) çalışır; `pnpm dev` açıkken de çalıştırılabilir ve geliştirme verinize dokunmaz. Doğrulama e-postaları için Mailpit açık olmalıdır.

## Google ile giriş

1. [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) → OAuth client ID (Web application).
2. Yetkili yönlendirme URI'si: `http://localhost:5173/api/v1/auth/google/callback` (production'da kendi alan adınız).
3. `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

Değişkenler boşsa "Google ile devam et" butonu kullanıcıyı anlaşılır bir mesajla giriş sayfasına döndürür.

## Site ekleme ve analiz

1. `pnpm dev` (API + worker + web birlikte; worker olmadan analiz kuyrukta bekler).
2. http://localhost:5173/app → "Kuruluma başla" → site adresi.
3. Worker siteyi tarar (robots.txt'ye uyar, en fazla `CRAWLER_MAX_PAGES` sayfa), 25 teknik kontrolü yapar ve Gemini ile marka profilini çıkarır. Rapor: **Sonuçlar → Site sağlığı**.
4. Sihirbaz: dil/ülke, ses tonu, ilk konular (Gemini önerir, siz çıkarır/eklersiniz), yayın günleri. Bitince konular **Takvim**'e planlanır.

Gemini ücretsiz katmanında dakika/gün limitleri düşüktür: `AI_RPM_LIMIT` ve `AI_DAILY_REQUEST_BUDGET`'i AI Studio'daki limitlerinize göre ayarlayın. Yerel/özel ağ adresleri (localhost, 192.168.x.x…) güvenlik nedeniyle taranmaz.

## Ücretsiz analiz

http://localhost:5173/tr/free-analysis — kayıt gerektirmez. Rapor paylaşılabilir linkte açılır, "PDF olarak indir" tarayıcının yazdırma penceresini kullanır. Cloudflare Turnstile için `.env`'de `TURNSTILE_SITE_KEY` ve `TURNSTILE_SECRET_KEY` (boşsa doğrulama yapılmaz). IP başına günde 3 analiz (geliştirmede 60).

## Yazı üretimi ve yayın

1. Kurulum bitince ilk 3 konu hemen yazılmaya başlar; diğerleri yayın tarihinden `GENERATE_AHEAD_HOURS` (72) saat önce. **İçerikler** sayfasından "Şimdi yaz" da kullanılabilir.
2. Yazı hazır olunca (onay modunda) e-posta gelir. **İçerikler → yazı**: önizleme, SEO puanı, bilgi doğrulama özeti, kaynaklar; "Onayla ve planla", "Yeniden yaz", "Reddet", HTML/Markdown indir.
3. Yayın: **Ayarlar → Site bağlantısı**.
   - **WordPress:** WordPress'te *Kullanıcılar → Profil → Uygulama Şifreleri* bölümünden bir şifre oluşturup kullanıcı adıyla girin (site HTTPS olmalı). Canlı ortamda (HTTPS) "Tek tıkla bağla" da çalışır.
   - **Webhook:** HTTPS adres; her yazı `x-upvine-signature: sha256=HMAC(secret, "${x-upvine-timestamp}.${body}")` imzalı JSON olarak gönderilir.
   - Bağlantı yoksa onaylı yazılar "Yayına hazır" bekler; indirip kendiniz yayınlayabilirsiniz.

Gemini ücretsiz katmanında görsel üretimi kotası olmayabilir: bu durumda kapak, marka renklerinden otomatik oluşturulur. Geliştirmede aylık 3 yazı sınırını aşmak için `ARTICLE_QUOTA_OVERRIDE`.

## Sonraki fazlarda eklenecek bölümler

- iyzico sandbox testi — not: abonelik özelliğinin merchant hesabında aktif olması gerekir, sandbox'ta abonelik desteği sınırlı olabilir (Faz 3)
- Test WordPress sitesi (Docker) (Faz 3)
- Production yayına alma ve yedekleme (Faz 7)
