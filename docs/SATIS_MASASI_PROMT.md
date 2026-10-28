# Kitisel Satış Masası: Admin paneline entegrasyon (Claude Code promptu)

> Bu prompt **mevcut** Kitisel projesinde çalıştırılır. Admin paneline yeni bir **Satış** bölümü ekler: müşteri adayları, kişisel mesaj taslakları, takip hatırlatmaları ve haftalık Instagram planı. Mevcut hiçbir özellik değişmez. Kullanım için en alttaki "Nasıl kullanılır" bölümüne bak.

---

## 0. GÖREV

Admin paneline **"Satış"** adında yeni bir bölüm ekle. İki sekmesi olacak:

1. **Müşteri adayları:** Potansiyel müşteri işletmeler. Her birinde sitede bulunan somut bir eksik ("tespit"), gönderilmeye hazır bir mesaj taslağı, iletişim bilgileri, durum, notlar ve takip mesajı var.
2. **Instagram planı:** Haftalık gönderiler. Her birinde tarih, saat, format, görsel tarifi, açıklama metni, etiketler ve durum var.

Ayrıca:
- Bu klasördeki `seed-data.json` dosyasındaki mevcut kayıtları içe aktar (11 aday, 3 gönderi).
- (Faz 4, isteğe bağlı) Her iş günü sabahı yeni adayları ve mesaj taslaklarını Gemini ile kendisi hazırlayan bir arka plan işi ekle.

**Mesajları sistem asla kendisi göndermez.** Admin mesajı kopyalar ve kendi e-postasından ya da Instagram hesabından elle gönderir. Otomatik e-posta, DM ya da toplu gönderim özelliği ekleme. Nedenleri: Instagram'ın otomatik mesaj yasağı (hesap kısıtlanır), İYS/KVKK kuralları ve yeni bir ürün için kişisel mesajın çok daha iyi çalışması.

---

## 1. KESİN SINIRLAR

### 1.1 Dokunulmayacaklar
- Mevcut admin ekranları, mevcut API uç noktaları, mevcut modeller ve migration'lar. **Sadece yeni dosya ekle.** Mevcut dosyalarda değişiklik yalnızca şunlar için yapılabilir: yeni rotaları kaydetmek (router), yeni modelleri kaydetmek (model index), admin menüsüne "Satış" bağlantısını eklemek, yeni kuyruk işini kaydetmek (Faz 4), yeni çeviri anahtarları.
- Halka açık site, ödeme (iyzico), abonelik, kimlik doğrulama mantığı, içerik üretim hattı.
- Mevcut bağımlılıklar. Yeni paket eklemeden önce sor; mevcut yığınla (Express, React, Sequelize, MySQL, BullMQ, `@google/genai`) çözülebiliyorsa paket ekleme.
- Veritabanında `sync()` kullanma. Sadece Umzug migration'ı.

### 1.2 Önce keşif
Hiçbir şey yazmadan önce projeyi incele ve bana şunları göster:
1. Admin panelinin klasörü, rota yapısı, menü bileşeni ve yetki kontrolü (admin rolü/izinleri nasıl kontrol ediliyor).
2. Admin tarafındaki mevcut bir liste ekranının yapısı (tablo, filtre, form bileşenleri, veri çekme yöntemi). **Yeni ekranlar bu bileşenleri ve stili birebir kullanacak**, yeni bir tasarım dili getirme.
3. Model, migration, servis ve controller dosyalarının adlandırma kuralları; UUID üretimi; zaman damgası alanları; hata yanıt biçimi; doğrulama kütüphanesi.
4. BullMQ kuyruklarının ve zamanlanmış işlerin nerede tanımlandığı, Gemini istemcisinin ve rate limiter'ın nerede olduğu.
5. Eklenecek ve değiştirilecek dosyaların tam listesi.

**Onaylamadan devam etme.**

---

## 2. VERİ MODELİ (Faz 1)

Projenin mevcut kurallarıyla (UUID v7, `utf8mb4`, `createdAt/updatedAt`, soft delete kullanılıyorsa o) iki tablo ekle.

### 2.1 `sales_leads`
| Alan | Tür | Not |
|---|---|---|
| id | UUID | PK |
| domain | VARCHAR(255) | **UNIQUE**. `www.` ve protokol olmadan, küçük harf (ör. `dentapoint.com.tr`). Tekrar eklemeyi önler. |
| name | VARCHAR(255) | İşletme adı |
| sector | ENUM | `dental`, `beauty`, `lawyer`, `ecommerce`, `other` (arayüzde Türkçe: Diş kliniği, Güzellik merkezi, Avukat, Butik e-ticaret, Diğer) |
| city | VARCHAR(120) | "Şehir · Semt" |
| website | VARCHAR(500) | Tam URL |
| email, phone, instagram | VARCHAR | Hepsi boş olabilir |
| channel | ENUM | `email`, `instagram_dm`, `in_person`, `phone`, `linkedin` |
| status | ENUM | `new`, `contacted`, `replied`, `meeting`, `trial`, `customer`, `not_interested` (Türkçe: Yeni, Mesaj gönderildi, Cevap verdi, Görüşme, Deneme başladı, Müşteri, İlgilenmiyor) |
| finding | TEXT | Kit'in tespiti |
| message | TEXT | İlk mesaj taslağı |
| followUpMessage | TEXT | Takip mesajı taslağı, boş olabilir |
| note | TEXT | Admin notları |
| source | ENUM | `manual`, `import`, `agent` |
| doNotContact | BOOLEAN | Varsayılan false. "Bir daha yazma" diyenler. |
| contactedAt, lastStatusAt, nextFollowUpAt | DATETIME | Boş olabilir |
| linkedUserId | UUID | Boş olabilir. Aday kayıt olursa uygulamadaki kullanıcıya bağlanır (2.3). |
| addedAt | DATETIME | Kaydın eklendiği an |

İndeksler: `domain` (unique), `status`, `sector`, `nextFollowUpAt`, `addedAt`.

### 2.2 `sales_lead_events` (geçmiş)
`id`, `leadId` (FK, cascade), `type` (`status_change`, `note`, `message_copied`, `created`, `imported`), `fromStatus`, `toStatus`, `text`, `adminUserId`, `createdAt`. Her durum değişikliği ve not burada kayıt olur; aday detayında zaman çizelgesi olarak görünür.

### 2.3 Uygulamayla bağlantı
Mevcut kullanıcı/kayıt akışına **dokunmadan**, ayrı bir servis fonksiyonu yaz: `linkLeadToUser(user)`. Kullanıcının e-postasının alan adı ya da kayıtta girdiği site adresi bir adayın `domain` alanıyla eşleşirse `linkedUserId`'yi doldur, durumu `trial` yap (zaten `customer` değilse) ve olay kaydı ekle. Bu fonksiyonu kayıt akışına eklemek için mevcut bir olay/hook mekanizması varsa onu kullan; yoksa bunun yerine admin ekranına "Kayıtlı kullanıcılarla eşleştir" düğmesi koy. Mevcut kayıt kodunu değiştirmen gerekiyorsa önce sor.

### 2.4 `sales_social_posts`
| Alan | Tür | Not |
|---|---|---|
| id | UUID | PK |
| slug | VARCHAR(120) | UNIQUE, ör. `2026-10-28-tanisma` |
| date | DATE | |
| time | VARCHAR(5) | "19:30" |
| format | VARCHAR(60) | "Tekli görsel", "Carousel (5 slayt)", "Reels (15-30 sn)" |
| pillar | ENUM | `intro`, `education`, `kit_found`, `sector`, `analysis_cta` (Türkçe: Tanışma, Eğitim, Kit buldu, Sektör, Analiz çağrısı) |
| title | VARCHAR(255) | |
| visual | TEXT | Görsel/slayt tarifi |
| caption | TEXT | |
| hashtags | VARCHAR(500) | |
| status | ENUM | `draft`, `approved`, `scheduled`, `published` (Taslak, Onaylandı, Zamanlandı, Paylaşıldı) |
| source | ENUM | `manual`, `import`, `agent` |

**Kabul:** migration'lar ileri ve geri çalışıyor, modeller ilişkileriyle tanımlı.

---

## 3. API (Faz 1)

Hepsi mevcut admin kimlik doğrulaması ve admin yetkisinin arkasında, mevcut admin API önekinin altında (ör. `/api/admin/sales/...`). Doğrulama ve hata biçimi mevcut koddakiyle aynı.

**Adaylar**
- `GET /sales/leads`: filtreler `status`, `sector`, `channel`, `q` (ad/alan adı arama), `due=1` (takip zamanı gelenler), sayfalama, sıralama (varsayılan `addedAt desc`).
- `GET /sales/leads/summary`: her durumun sayısı, takip zamanı gelenlerin sayısı, bu hafta gönderilen mesaj sayısı, dönüşüm oranları (gönderilen → cevap → görüşme → deneme → müşteri).
- `GET /sales/leads/:id`: olay geçmişiyle birlikte.
- `POST /sales/leads`: elle ekleme. `website` girilince `domain` otomatik çıkarılır. Aynı `domain` varsa 409 ve mevcut kaydın id'si.
- `PATCH /sales/leads/:id`: alan güncelleme. Durum değişirse:
  - Olay kaydı ekle, `lastStatusAt` güncelle.
  - `contacted`'a geçişte `contactedAt` boşsa doldur, `nextFollowUpAt = contactedAt + 4 gün`.
  - `replied`, `meeting`, `trial`, `customer`, `not_interested`'a geçişte `nextFollowUpAt = null`.
  - `not_interested` seçilirken "Bir daha yazma" işaretlenirse `doNotContact = true`.
- `POST /sales/leads/:id/events`: not ekle ya da `message_copied` kaydı (arayüz kopyalama düğmesinde çağırır).
- `DELETE /sales/leads/:id`.
- `POST /sales/import`: `seed-data.json` biçimindeki JSON'u içe aktarır (4. bölüm). `dryRun=1` ile önce ne ekleneceğini/atlanacağını gösterir.
- `GET /sales/export.csv`: filtrelenmiş adayları CSV olarak indirir (UTF-8 BOM'lu, Excel'de Türkçe karakterler bozulmasın).

**Gönderiler**
- `GET /sales/posts?from=&to=`, `POST /sales/posts`, `PATCH /sales/posts/:id`, `DELETE /sales/posts/:id`.

**Kabul:** her uç nokta için entegrasyon testi (yetkisiz istek 401/403, tekrar eden domain 409, durum geçişlerinin tarih alanlarını doğru doldurması, `due` filtresi).

---

## 4. İÇE AKTARMA (Faz 1)

`seed-data.json` biçimi:
```json
{ "leads": [ { "id": "dentapoint.com.tr", "name": "...", "sector": "Diş kliniği", "city": "...", "website": "...",
               "email": "...", "phone": "...", "instagram": "...", "channel": "E-posta", "status": "Yeni",
               "addedAt": "2026-10-27T17:16:00+03:00", "finding": "...", "message": "...", "note": "...",
               "contactedAt": "...", "followUp": "..." } ],
  "posts": [ { "id": "2026-10-28-tanisma", "date": "2026-10-28", "time": "19:30", "format": "...", "pillar": "Tanışma",
               "title": "...", "status": "Taslak", "visual": "...", "caption": "...", "hashtags": "..." } ] }
```
Eşleme kuralları:
- Lead `id` → `domain`. Post `id` → `slug`. Eksik alanlar boş kalır.
- Türkçe değerleri enum'a çevir. `sector`: "Diş kliniği" → dental, "Güzellik merkezi" → beauty, "Avukat" → lawyer, "Butik e-ticaret" → ecommerce, diğer her şey → other. `channel`: "E-posta" → email, "Instagram DM" → instagram_dm, "Yüz yüze" → in_person. `status`: Yeni → new, "Mesaj gönderildi" → contacted, "Cevap verdi" → replied, Görüşme → meeting, "Deneme başladı" → trial, Müşteri → customer, İlgilenmiyor → not_interested. Post `status`: Taslak → draft, Onaylandı → approved, Zamanlandı → scheduled, Paylaşıldı → published. `pillar`: Tanışma → intro, Eğitim → education, "Kit buldu" → kit_found, Sektör → sector, "Analiz çağrısı" → analysis_cta.
- `followUp` → `followUpMessage`.
- Var olan `domain`/`slug` için: varsayılan olarak **atla**, `mode=update` verilirse admin'in değiştirdiği alanlara (`status`, `note`, `contactedAt`) dokunmadan sadece boş alanları doldur.
- Her içe aktarılan aday için `imported` olay kaydı.
- Ayrıca bir CLI komutu: `npm run sales:import -- ./_kitisel-satis/seed-data.json` (projede komut çalıştırma yapısı nasılsa öyle).

Bu içe aktarma iki işe yarar: ilk kayıtları taşımak ve dışarıda hazırlanan yeni aday listelerini (ör. Claude'un hazırladığı JSON) panele almak. Admin ekranında "JSON içe aktar" düğmesi de olsun (dosya seç → önizleme → onayla).

---

## 5. ADMIN EKRANLARI (Faz 2)

Mevcut admin bileşenlerini ve stilini kullan. Admin menüsüne "Satış" ekle (ikon: mevcut ikon setinden uygun olan). Arayüz metinleri Türkçe; admin paneli çok dilliyse anahtarları diğer dillere de ekle (İngilizce karşılıklarıyla).

### 5.1 Satış → Müşteri adayları
- **Üstte durum şeridi:** her durumun sayısı tıklanabilir filtre olarak (Tümü, Yeni, Mesaj gönderildi, Cevap verdi, Görüşme, Deneme başladı, Müşteri, İlgilenmiyor) + turuncu **"Takip zamanı (N)"** filtresi. Yanında bu haftanın küçük özeti: gönderilen mesaj, cevap oranı, müşteri sayısı.
- **Filtre satırı:** sektör, kanal, arama. Sağda "Yeni aday", "JSON içe aktar", "CSV indir".
- **Liste:** her satırda ad, sektör etiketi, şehir, site linki (yeni sekmede), kanal, eklenme tarihi, durum rozeti, takip zamanı gelmişse "Takip zamanı" rozeti. `doNotContact` olanlar gri ve üstü çizili, varsayılan filtrede gizli.
- **Satıra tıklayınca detay paneli (sağdan açılan çekmece ya da ayrı sayfa, mevcut admin'de hangisi kullanılıyorsa):**
  - "Kit'in tespiti" kutusu (açık turuncu zemin).
  - "Mesaj taslağı": düzenlenebilir metin alanı + **"Mesajı kopyala"** düğmesi. Kopyalanınca `message_copied` olayı kaydedilir ve küçük bir "Kopyalandı" bildirimi çıkar. Mesajda `[Adın]` geçiyorsa, admin kullanıcısının adıyla otomatik değiştirilmiş hâli kopyalanır.
  - Takip mesajı varsa aynı şekilde "Takip mesajını kopyala".
  - **Hızlı işlem düğmesi:** durum `new` ise "Gönderdim" (tek tıkla `contacted` yapar). `contacted` ise "Cevap verdi" ve "Takip gönderdim" (takip gönderildiğinde `nextFollowUpAt` +7 gün ertelenir, ikinci takipten sonra boşaltılır).
  - Durum açılır listesi, "Bir daha yazma" onay kutusu.
  - İletişim bilgileri seçilebilir metin olarak, her birinin yanında kopyala ikonu. E-posta için `mailto:` linki de olsun (konu satırı mesajın "Konu:" satırından, gövde geri kalanından).
  - Not ekleme alanı ve olay geçmişi (zaman çizelgesi).
  - Uygulamaya kayıt olduysa "Kullanıcıyı aç" linki (`linkedUserId`).

### 5.2 Satış → Instagram planı
- Hafta görünümü (Pazartesi-Pazar), önceki/sonraki hafta okları. Her gönderi bir kart: tarih ve saat, format etiketi, sütun (pillar), başlık, durum rozeti.
- Karta tıklayınca: görsel tarifi, açıklama ve etiketler düzenlenebilir; **"Metni kopyala"** (açıklama + boş satır + etiketler); durum açılır listesi. "Meta Business Suite'i aç" linki: `https://business.facebook.com/latest/posts/` (yeni sekmede).
- "Yeni gönderi" düğmesi.

### 5.3 Kontrol paneli kartı (isteğe bağlı)
Admin ana sayfasında mevcut kart yapısı varsa, küçük bir "Satış" kartı: bugün eklenen aday, takip zamanı gelen, bu hafta paylaşılacak gönderi. Mevcut kartları değiştirme, sadece ekle.

**Kabul:** ekranlar mevcut admin ile aynı görünümde, 390 px'te kullanılabilir, kopyalama düğmeleri çalışıyor, ekran görüntülerini göster.

---

## 6. GÜNLÜK ADAY BULUCU (Faz 4, isteğe bağlı, varsayılan KAPALI)

Mevcut BullMQ altyapısıyla bir tekrarlayan iş ekle: `sales:find-leads`, hafta içi 08:40 Europe/Istanbul. `.env` ile açılır: `SALES_AGENT_ENABLED=false`, `SALES_AGENT_DAILY_COUNT=10`. Mevcut Gemini istemcisini ve rate limiter'ı kullan, model adını mevcut env yapısından al.

Akış:
1. Bugünün sektörünü ve şehrini sırayla seç (diş kliniği, güzellik merkezi, avukat, butik e-ticaret × İstanbul, Ankara, İzmir, Bursa, Antalya ve semtleri). Bir `sales_agent_state` kaydında (ya da mevcut ayar tablosunda) kaldığı yeri tut.
2. Gemini'ye **Google Search grounding** (`tools: [{ googleSearch: {} }]`) ile o sektör ve şehirde kendi web sitesi olan küçük işletmeleri buldur. Rehber siteleri (doktortakvimi, armut, firmasec, yandex, trendyol vb.), zincirler, hastaneler, üniversiteler ve ajanslar hariç. Çıktı: ad ve site adresi listesi.
3. Veritabanında olan (`domain`) ve `doNotContact` olan alan adlarını ele.
4. Her site için ana sayfayı sunucudan çek (zaman aşımı 10 sn, `robots.txt` engelliyorsa atla, kendi User-Agent'ını kullan: `KitiselBot/1.0 (+https://kitisel.com)`). HTML'den şunları **kodla** çıkar: title, meta description, og etiketleri, H1 sayısı, blog/yazılar linki var mı, "lorem ipsum" ya da şablon metni var mı, `href="#"` linkleri, alt metni olmayan ya da çok uzun alt metinli görseller, e-posta, telefon, Instagram linki, platform (Shopify, WooCommerce, Ticimax, IdeaSoft, Wix).
5. Bu **ölçülmüş bulguları** Gemini'ye ver ve şunları JSON olarak yazdır: `finding` (1-3 cümle), `message` (Türkçe, 70-110 kelime: somut tespit + Google'daki etkisi + "Kitisel, sitenize düzenli, kontrol edilmiş blog yazıları yazıp yayınlayan bir araç" + "Sitenizin kısa ücretsiz analizini hazırladım, isterseniz göndereyim." + "Tekrar yazmamı istemezseniz kısaca belirtmeniz yeterli."). E-posta kanalı ise "Konu:" satırı ve `[Adın]\nKitisel · kitisel.com` imzası; Instagram DM ise daha kısa, imzasız. Avukatlar için "müvekkil kazanın" gibi reklam ifadesi yok, "meslek kurallarına uygun, bilgilendirici makaleler" ifadesi. Gemini'ye **sadece verilen bulguları kullanmasını, bulgu uydurmamasını** söyle. Sonucu şema ile doğrula; geçersizse at.
6. `source = agent`, `status = new` ile kaydet.
7. Aynı iş, `contacted` durumunda olup `nextFollowUpAt` geçmiş ve `followUpMessage` boş olan adaylar için kısa takip mesajı (40-60 kelime) üretir.
8. İş bitince admin bildirim mekanizması varsa ("X yeni aday, Y takip") bildirim düşer; yoksa sadece log.

**Kesin kural:** Bu iş hiçbir işletmeye e-posta, DM ya da form gönderimi yapmaz. Kodda gönderim fonksiyonu olmayacak.

**Kabul:** iş elle tetiklenebiliyor (admin ekranında "Şimdi çalıştır" düğmesi, sadece `SALES_AGENT_ENABLED=true` iken görünür); aynı alan adı ikinci kez eklenmiyor; Gemini hata ya da kota dolduğunda iş sessizce değil, logla ve kısmi sonuçla bitiyor; testlerde Gemini ve HTTP çağrıları mock'lanıyor.

---

## 7. YASAL VE GÜVENLİK NOTLARI (koda yansıyacaklar)

- `doNotContact = true` olan bir aday hiçbir listede "gönderilecek" olarak görünmez, takip mesajı üretilmez, içe aktarmada tekrar `false` yapılmaz.
- Aday verileri yalnızca işletmelerin sitelerinde herkese açık yayınladığı **kurumsal** iletişim bilgileridir. Kişisel (bireysel) e-posta/telefon toplama mantığı ekleme.
- Bütün satış uç noktaları sadece admin yetkisiyle erişilebilir; loglarda mesaj gövdesi yazma.
- 12 aydan eski ve `not_interested` olan adayları silmek için admin ekranına "Eski kayıtları temizle" düğmesi (onaylı).

---

## 8. FAZLAR

**Faz 0: Keşif** (Bölüm 1.2). Kabul: listeleri onaylıyorum.
**Faz 1: Veri, API, içe aktarma** (Bölüm 2, 3, 4). Kabul: migration'lar çalışıyor, testler geçiyor, `seed-data.json` içe aktarıldı (11 aday, 3 gönderi).
**Faz 2: Admin ekranları** (Bölüm 5). Kabul: ekran görüntülerini onaylıyorum.
**Faz 3: Doğrulama.** Mevcut testler, tip kontrolü, lint ve build geçiyor. `git diff --stat` çıktısında mevcut dosyalardan sadece Bölüm 1.1'de izin verilenler var. Mevcut admin ekranları eskisi gibi çalışıyor.
**Faz 4: Günlük aday bulucu** (Bölüm 6), ayrı bir dalda ve sadece onayımla.

---

Başla: Faz 0'daki keşif listelerini çıkar ve onayımı bekle.

---

## Nasıl kullanılır

1. Bu klasörü (`kitisel-satis-masasi`) projenin kök klasörüne **`_kitisel-satis`** adıyla kopyala.
2. Yeni bir git dalı aç: `git checkout -b feature/sales-desk`.
3. Proje klasöründe Claude Code'u başlat ve şunu yaz:
   ```
   _kitisel-kit/docs/SATIS_MASASI_PROMPT.md dosyasını baştan sona oku ve uygula. Bölüm 1'deki sınırların dışına çıkma. Faz 0'dan başla, her fazın sonunda dur ve onayımı bekle.
   ```
4. İş bitince `_kitisel-satis` klasörünü projeden sil ya da `.gitignore`'a ekle. `seed-data.json` müşteri adayı bilgisi içerdiği için repoya commit'leme.
