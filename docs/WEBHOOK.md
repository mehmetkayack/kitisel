# Webhook ile özel siteye yayın

WordPress, Ghost, Shopify, Webflow veya Wix kullanmayan (kendi yazılımınızla yapılmış) siteler, Kitisel'in hazırladığı yazıları **webhook** ile alır: yazı yayın zamanı geldiğinde, sizin belirlediğiniz adrese imzalı bir JSON isteği gönderilir. Yazıyı veritabanınıza kaydetmek ve sitede göstermek sizin uygulamanızın işidir.

## 1. Kurulum

1. Sitenizde **HTTPS** bir adres açın (örnek: `https://ornek.com/api/kitisel-webhook`). Adres `POST` isteği kabul etmeli ve oturum açma istememeli.
2. Kitisel panelinde **Ayarlar → Site bağlantısı → Webhook (özel site)** seçin, adresi girip **Webhook'u bağla**'ya basın.
3. Ekranda bir kez gösterilen **imza anahtarını** kopyalayıp sunucunuzda gizli bir ortam değişkenine kaydedin (örnek: `KITISEL_WEBHOOK_SECRET`). Bu anahtar bir daha gösterilmez; kaybederseniz bağlantıyı kaldırıp yeniden kurun.
4. Bağlanırken ve **Bağlantıyı test et**'e her basıldığında adresinize bir `ping` isteği gelir. Adresiniz **2xx** dönerse bağlantı kurulmuş olur.

## 2. İstek

Her istek `POST`, gövdesi JSON'dur. Başlıklar:

| Başlık | Değer |
|---|---|
| `Content-Type` | `application/json` |
| `X-Upvine-Timestamp` | Gönderim zamanı, Unix saniye (örnek: `1792609346`) |
| `X-Upvine-Signature` | `sha256=` + HMAC-SHA256 imzası (hex). Ayrıntı: bölüm 3 |

### Bağlantı testi (`ping`)

```json
{ "event": "ping", "sentAt": "2026-10-21T12:00:00.000Z" }
```

Sadece **2xx** dönmeniz yeterli; içerik kaydetmeyin.

### Yazı yayını (`article.publish`)

```json
{
  "event": "article.publish",
  "mode": "publish",
  "article": {
    "title": "Implant tedavisi ne kadar sürer?",
    "slug": "implant-tedavisi-ne-kadar-surer",
    "html": "<nav data-toc>…</nav><h2>…</h2><p>…</p>",
    "metaTitle": "Implant Tedavisi Ne Kadar Sürer? | Örnek Klinik",
    "metaDescription": "Implant tedavisinin aşamaları ve süresi…",
    "language": "tr",
    "schema": [
      { "@context": "https://schema.org", "@type": "Article", "headline": "…" },
      { "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [] },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [] }
    ],
    "cover": {
      "fileName": "implant-tedavisi-ne-kadar-surer.webp",
      "mimeType": "image/webp",
      "alt": "Diş hekimi koltuğunda hasta",
      "base64": "UklGRi…"
    },
    "infographic": null
  }
}
```

| Alan | Açıklama |
|---|---|
| `mode` | Şu an her zaman `publish`: yazıyı yayında gösterin. |
| `title` | Sayfa başlığı (H1). `html`'in içinde yoktur, kendiniz basın. |
| `slug` | Önerilen adres parçası (küçük harf, tire). Yazıyı tanımak için anahtar olarak da kullanın. |
| `html` | Temizlenmiş yazı gövdesi: içindekiler (`<nav data-toc>`), ara başlıklar, tablolar, SSS ve kaynaklar. Betik (`<script>`) içermez. |
| `metaTitle`, `metaDescription` | `<title>` ve `<meta name="description">` için. |
| `language` | Yazının dili (ISO kodu, ör. `tr`, `en`). |
| `schema` | JSON-LD nesneleri. Her birini sayfada `<script type="application/ld+json">` içine yazın. |
| `cover` | Kapak görseli (`base64`, genelde WebP) ya da `null`. Kendi sunucunuza veya depolamanıza kaydedip yazının kapağı yapın. |
| `infographic` | Şu an her zaman `null` (bilgi grafiği üretilmiyor). Alan geriye uyumluluk için duruyor. |

## 3. İmzayı doğrulama

İsteğin Kitisel'den geldiğinden ve değiştirilmediğinden emin olmak için **her istekte** doğrulayın:

1. `X-Upvine-Timestamp` ile `.` ve **ham gövdeyi** birleştirin: `"{timestamp}.{body}"`. JSON'u ayrıştırıp yeniden yazmayın; gelen bayt dizisini aynen kullanın.
2. Bunu imza anahtarınızla HMAC-SHA256 ile imzalayın, hex yazın, başına `sha256=` ekleyin.
3. Sonucu `X-Upvine-Signature` ile **sabit zamanlı** karşılaştırın.
4. Zaman damgası 5 dakikadan eskiyse isteği reddedin (tekrar gönderme saldırısına karşı).

İmza tutmazsa **401** dönün.

**Node.js (Express)**

```js
import crypto from 'node:crypto';
import express from 'express';

const app = express();
const SECRET = process.env.KITISEL_WEBHOOK_SECRET;

// Ham gövde gerekli: express.json() değil express.raw()
app.post('/api/kitisel-webhook', express.raw({ type: 'application/json', limit: '20mb' }), (req, res) => {
  const ts = req.get('x-upvine-timestamp');
  const sig = req.get('x-upvine-signature') ?? '';
  const body = req.body.toString('utf8');
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(ts)) <= 300;
  const ok = fresh && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) return res.status(401).end();

  const payload = JSON.parse(body);
  if (payload.event === 'ping') return res.status(204).end();
  if (payload.event === 'article.publish') {
    const post = savePost(payload.article); // slug'a göre ekle ya da güncelle
    return res.json({ id: post.id, url: `https://ornek.com/blog/${post.slug}` });
  }
  res.status(204).end();
});
```

**PHP**

```php
$secret = getenv('KITISEL_WEBHOOK_SECRET');
$body = file_get_contents('php://input');
$ts = $_SERVER['HTTP_X_UPVINE_TIMESTAMP'] ?? '';
$sig = $_SERVER['HTTP_X_UPVINE_SIGNATURE'] ?? '';
$expected = 'sha256=' . hash_hmac('sha256', $ts . '.' . $body, $secret);
if (abs(time() - (int) $ts) > 300 || !hash_equals($expected, $sig)) {
    http_response_code(401);
    exit;
}
$payload = json_decode($body, true);
if ($payload['event'] === 'article.publish') {
    $post = save_post($payload['article']); // slug'a göre ekle ya da güncelle
    header('Content-Type: application/json');
    echo json_encode(['id' => $post['id'], 'url' => 'https://ornek.com/blog/' . $post['slug']]);
    exit;
}
http_response_code(204);
```

## 4. Yanıt

- **2xx**: başarılı. Yazı panelde "Yayında" olur.
- İsteğe bağlı olarak `{"id": "…", "url": "https://…"}` döndürün: `url` panelde yazının yayın linki olarak gösterilir, `id` kayıt için saklanır.
- **401 / 403**: imza veya yetki hatası. **404**: adres bulunamadı. Diğer **4xx**: reddedildi. Bunlar tekrar denenmez; panelde hata gösterilir.
- **5xx**, zaman aşımı (30 saniye) veya bağlantı hatası: geçici sayılır, istek **5 kez** tekrar denenir (30 sn'den başlayarak artan aralıklarla).

## 5. Dikkat edilecekler

- **Tekrar gelen istek:** Tekrar denemelerde aynı yazı birden fazla gelebilir. Kaydı `slug`'a göre "varsa güncelle, yoksa ekle" şeklinde yapın; çift yazı oluşmaz.
- **Boyut:** Kapak görseli base64 olarak gövdede gelir; istek birkaç MB olabilir. Sunucunuzun gövde sınırını en az 20 MB yapın.
- **Hız:** 30 saniye içinde yanıt verin. Uzun işlemleri (görsel işleme, önbellek temizleme) yanıttan sonra arka planda yapın.
- **İmza anahtarı:** sadece sunucuda saklayın; tarayıcı koduna veya depoya koymayın.
