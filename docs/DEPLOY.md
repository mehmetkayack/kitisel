# Kitisel — Canlıya alma (Docker)

Tek sunucuda Docker Compose: **Caddy** (HTTPS, ters vekil) → **web** (React Router SSR) ve **api** (Express),
arka planda **worker** (BullMQ), **MySQL 8.4** ve **Redis 7.4**. Dışarıya sadece 80/443 açılır.

```
İnternet ──443──▶ Caddy ──/api/*──▶ api:4000 ──┐
                        └─ diğer ──▶ web:3000  ├──▶ mysql:3306, redis:6379
                                     worker ───┘
```

Dosyalar: [docker-compose.prod.yml](../docker-compose.prod.yml), [docker/node.Dockerfile](../docker/node.Dockerfile),
[docker/Caddyfile](../docker/Caddyfile), [.env.production.example](../.env.production.example), [docker/backup.sh](../docker/backup.sh).

## 1. Sunucu

- Ubuntu 24.04 (ya da Docker çalışan herhangi bir Linux), Docker Engine + Compose eklentisi:
  <https://docs.docker.com/engine/install/ubuntu/>
- Güvenlik duvarında sadece 22, 80, 443 (TCP) ve 443 (UDP, HTTP/3) açık.
- **Boyut:** deneme için 1 vCPU / 1 GB RAM / 25 GB disk yeter (yaklaşık kullanım: MySQL 200, worker 250–350,
  API 120, web 100, Caddy 30, Redis 20 MB) ama **2 GB swap şart** ve imaj sunucuda **derlenmez**:
  GitHub Actions derler ([.github/workflows/docker.yml](../.github/workflows/docker.yml)), sunucu indirir.
  Kullanıcı arttıkça ya da `dc logs` içinde "Killed"/"out of memory" görürseniz 2 GB RAM'e geçin.

Swap (1–2 GB RAM'li sunucuda bir kez):

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf && sudo sysctl --system
```

İmajın derlenmesi (bir kez ayarlanır): kodu GitHub'da `design/kitisel` (ya da `main`) dalına push'layın; **Actions → Docker imajı**
iş akışı imajı `ghcr.io/mehmetkayack/kitisel:latest` olarak yayınlar. Turnstile/reCAPTCHA **site**
anahtarlarını (gizli olmayanlar) depoda **Settings → Secrets and variables → Actions → Variables**
altına `TURNSTILE_SITE_KEY` ve `RECAPTCHA_SITE_KEY` adıyla ekleyin; değiştirince iş akışını yeniden
çalıştırın.

## 2. DNS

Alan adı sağlayıcınızda iki kayıt (sunucunun IP'si):

| Tür | Ad | Değer |
|---|---|---|
| A | `@` (kitisel.com) | sunucu IP |
| A | `www` | sunucu IP |

Cloudflare kullanıyorsanız ilk kurulumda **DNS only** (gri bulut) seçin; Caddy sertifikayı kendisi alır.

## 3. Kodu sunucuya alın

```bash
sudo mkdir -p /opt/kitisel && sudo chown $USER /opt/kitisel
git clone https://github.com/mehmetkayack/kitisel.git /opt/kitisel
cd /opt/kitisel
```

Sunucuda sadece compose dosyası, Caddyfile ve yedekleme betiği kullanılır; uygulama imajdan gelir.
Depo ya da paket **özelse** sunucuda bir kez GitHub'a giriş yapın (GitHub → Settings → Developer settings →
Personal access tokens, yetki: `read:packages`; özel depoyu klonlamak için `repo`):

```bash
echo <TOKEN> | docker login ghcr.io -u mehmetkayack --password-stdin
```

## 4. Ortam değişkenleri

```bash
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

Rastgele değerler için:

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY (bir kez belirlenir, değiştirmeyin, ayrıca yedekleyin)
openssl rand -base64 24   # MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD
```

Mutlaka doldurulacaklar: `DOMAIN`, `ACME_EMAIL`, `WEB_URL`, `API_URL`, `MYSQL_*`, `JWT_ACCESS_SECRET`,
`ENCRYPTION_KEY`, `SMTP_*`, `EMAIL_FROM`, `RECAPTCHA_*` (yoksa iletişim formu çalışmaz), `LEGAL_*`.

Dış servis panellerinde canlı alan adını ekleyin:

- **Google Cloud Console** → OAuth istemcisi → Authorized redirect URIs:
  `https://<alan-adı>/api/v1/auth/google/callback` ve `https://<alan-adı>/api/v1/connections/search-console/callback`;
  Authorized JavaScript origins: `https://<alan-adı>`. İzin ekranını "In production"a alın.
- **reCAPTCHA** ve **Turnstile**: alan adı listesine `<alan-adı>`.

## 5. Başlatma

`.env.production`'da `APP_IMAGE=ghcr.io/mehmetkayack/kitisel:latest` olduğundan emin olun.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-build
```

(4 GB+ RAM'li bir sunucuda `APP_IMAGE`'i boş bırakıp `up -d --build` ile sunucuda derleyebilirsiniz.) Sıra: MySQL hazır → `migrate` tabloları kurar ve çıkar → api ve worker →
web → Caddy sertifikayı alır.

Kontrol:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps
curl https://<alan-adı>/api/health     # {"status":"ok","database":"ok","redis":"ok","worker":"ok"}
```

> Komutları kısaltmak için: `alias dc='docker compose -f docker-compose.prod.yml --env-file .env.production'`

## 6. İlk yönetici

Sitede normal kayıt olun, sonra o hesabı superadmin yapın:

```bash
dc run --rm migrate node packages/db/dist/cli.js grant-admin siz@ornek.com
```

Admin paneli: `https://<alan-adı>/admin`. Demo verisi (`db:seed`) production'da çalışmaz.

## 7. Güncelleme

Kodu `design/kitisel` dalına push'layın, **Actions → Docker imajı** bitince (yaklaşık 5–10 dk) sunucuda:

```bash
cd /opt/kitisel
sh docker/backup.sh   # önce yedek
git pull              # compose/Caddyfile değişmiş olabilir
dc pull && dc up -d --no-build      # yeni migration'lar otomatik çalışır
docker image prune -f
```

Belirli bir sürüme dönmek için `APP_IMAGE=ghcr.io/mehmetkayack/kitisel:<commit-sha>` yazıp `dc up -d --no-build`.

## 8. Yedekleme ve geri yükleme

Blog kapakları ve makale görselleri de veritabanında; veritabanı yedeği yeterli.

```bash
sh docker/backup.sh                     # backups/kitisel_YYYY-MM-DD_HHMM.sql.gz, 14 günden eskiler silinir
crontab -e                              # her gece 03:30:
# 30 3 * * * cd /opt/kitisel && sh docker/backup.sh >> backups/backup.log 2>&1
```

Yedekleri sunucu dışına da kopyalayın (ör. `rclone` ile bir bulut depolamaya). `.env.production` dosyasını
(özellikle `ENCRYPTION_KEY`) ayrıca güvenli bir yerde saklayın.

Geri yükleme:

```bash
gunzip -c backups/kitisel_2026-10-20_0330.sql.gz | dc exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'
```

## 9. Loglar ve sorun giderme

```bash
dc logs -f api worker          # uygulama
dc logs -f caddy               # sertifika / yönlendirme
dc restart worker
```

| Belirti | Neden / çözüm |
|---|---|
| Konteyner yeniden başlıyor, logda `Killed` / `heap out of memory` | Bellek yetmiyor: swap açık mı (`free -h`)? Kalıcıysa 2 GB RAM'e geçin ya da `WORKER_HEAP_MB`'ı artırın |
| `pull` → `denied` / `unauthorized` | Paket özel: `docker login ghcr.io` (adım 3) |
| Sertifika alınamıyor | DNS henüz sunucuyu göstermiyor ya da 80/443 kapalı. `dc logs caddy` |
| `migrate` hata verip çıkıyor | `MYSQL_*` değerleri; `dc logs migrate` |
| `/api/health` → `worker: stale` | Worker durmuş: `dc logs worker` |
| Google girişinde `redirect_uri_mismatch` | Console'daki adres `GOOGLE_REDIRECT_URI` ile birebir aynı olmalı |
| İletişim formu "robot" hatası | `RECAPTCHA_*` boş ya da alan adı reCAPTCHA panelinde yok |
