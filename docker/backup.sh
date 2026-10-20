#!/bin/sh
# MySQL yedeği (blog kapakları ve makale görselleri de veritabanında). Sunucuda proje klasöründen çalıştırın:
#   sh docker/backup.sh
# Günlük için crontab örneği (03:30):
#   30 3 * * * cd /opt/kitisel && sh docker/backup.sh >> backups/backup.log 2>&1
set -eu
mkdir -p backups
stamp=$(date +%Y-%m-%d_%H%M)
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T mysql \
  sh -c 'exec mysqldump --single-transaction --quick --routines --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  | gzip > "backups/kitisel_$stamp.sql.gz"
# 14 günden eski yedekleri sil
find backups -name 'kitisel_*.sql.gz' -mtime +14 -delete
echo "✓ backups/kitisel_$stamp.sql.gz"
