# Faz 0 — Temel ve tasarım sistemi

Durum: **tamamlandı, yerelde doğrulandı (2026-10-09)** — onay bekliyor

## Görevler

- [x] Doküman ve sürüm kontrolleri (React Router v8, Tailwind v4, Vite 8, Umzug, React Email, Google OIDC, pnpm 11)
- [x] Monorepo iskeleti (pnpm workspaces, TS 6 strict, ESLint 10, Prettier)
- [x] `.env.example`, `packages/config` (Zod env doğrulama, 5 arayüz dili, 28 içerik dili, paketler/kotalar)
- [x] `docker-compose.yml` (MySQL 8.4, Redis 7.4, Mailpit, phpMyAdmin) ve Dockerfile iskeleti
- [x] `packages/db`: Sequelize, 3 Umzug migration'ı (7 tablo), tipli modeller, repository'ler, kiracı koruması, seed
- [x] `apps/api`: Express 5, katmanlı yapı, merkezî hata yakalayıcı, Pino, health, Redis rate limit, OpenAPI + Swagger
- [x] Kimlik doğrulama: kayıt, giriş, çıkış, refresh rotasyonu + yeniden kullanım tespiti, CSRF, e-posta doğrulama, şifre sıfırlama, Google OAuth (PKCE)
- [x] `packages/email`: React Email şablonları (5 dil), SMTP + bellek mailer
- [x] i18n: `locales/` (5 dil × 8 namespace), `pnpm i18n:check`
- [x] `packages/ui`: token'lar (açık/koyu), Tailwind tema, 17 bileşen
- [x] `apps/web`: React Router SSR, `/{locale}` + hreflang, auth sayfaları, panel iskeleti, `/dev/ui`
- [x] `apps/worker`: heartbeat iskeleti
- [x] Testler: Vitest (49), Playwright + axe (19, yalıtılmış e2e veritabanı)
- [x] CI (GitHub Actions)
- [x] `CLAUDE.md`, `README.md`
- [x] Yerel doğrulama: MySQL 8.0 + Memurai + Mailpit ile tüm akışlar

## Kabul kriterleri

| Kriter | Durum |
|---|---|
| `pnpm dev` çalışıyor | ✓ API, worker, web; health: database/redis/worker ok |
| Kayıt, giriş, çıkış, şifre sıfırlama | ✓ API testleri + e2e (Mailpit üzerinden gerçek e-posta) |
| Dil ve tema değiştirici | ✓ e2e |
| `/dev/ui` tüm bileşenler + axe | ✓ e2e, açık ve koyu sistem teması |
| CI yeşil | Yerelde tüm adımlar ✓; GitHub'da çalıştırılmadı (remote yok) |

## Faz dışı eklenenler

- Admin panelinin bir kısmı Faz 6'dan öne alındı: [ADMIN.md](ADMIN.md)
- Faz 1 çekirdeği ve Faz 2 sihirbazı: [PHASE_1.md](PHASE_1.md)
- Ücretsiz analiz, içerik üretimi ve yayın (ödeme hariç): [PHASE_2.md](PHASE_2.md)
