# Admin paneli (Faz 6'dan öne alındı, 2026-10-09)

Kullanıcı isteğiyle spec Bölüm 7.16'nın verisi mevcut olan kısmı Faz 0 üzerine kuruldu.

## Tamamlanan

- [x] Superadmin yetkisi: `requireSuperadmin` (her istekte veritabanından), `pnpm admin:grant <e-posta>`, seed'de `admin@upvine.local`
- [x] API `/api/v1/admin`: istatistikler + sistem sağlığı, kullanıcı listesi/arama/detay, superadmin ver/kaldır, e-postayı doğrulanmış say, tüm oturumları kapat, organizasyon listesi/detay, denetim kaydı (cursor sayfalama)
- [x] Kullanıcının gözünden görüntüleme: 30 dk, salt okunur token, denetim kaydına yazılır, panelde uyarı şeridi ve "Görüntülemeden çık"
- [x] Web `/admin`: Genel Bakış (metrikler, 14 günlük kayıt grafiği, sistem sağlığı, abonelik durumları), Kullanıcılar, Kullanıcı detayı, Organizasyonlar, Organizasyon detayı, Denetim kaydı; mobilde açılır menü
- [x] Panel kullanıcı menüsünde superadmin'lere "Yönetim paneli" bağlantısı
- [x] 5 dilde metinler (`locales/*/admin.json`)
- [x] Testler: 9 API testi (yetki, görüntüleme salt okunurluğu, kendi yetkisini kaldıramama, denetim kaydı), 3 e2e (axe dahil, 375 px Almanca)

## Verisi gelince doldurulacak bölümler (menüde "Sonraki fazlarda gelecek")

| Bölüm | Faz |
|---|---|
| İade talepleri, kesilecek faturalar | Faz 3 (PayTR). **Ödemeler** (kart + havale siparişleri, havale onayı) 2026-10-21'de eklendi: `/admin/billing` |
| İş kuyrukları (Bull Board), YZ maliyetleri, Gemini 429 oranı ve günlük bütçe | Faz 1 |
| Prompt şablonu sürümleri ve özellik bayrakları | Faz 6 |
