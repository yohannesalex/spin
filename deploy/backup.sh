#!/bin/sh
# Daily database backup (REQ-SEC-07). Keeps 30 days in deploy/backups/.
# Schedule with: crontab -e  →  0 3 * * * /home/ubuntu/spin/deploy/backup.sh
# Copy backups off the server too (they are lost if the server is deleted).
set -e
cd "$(dirname "$0")"
mkdir -p backups
docker compose exec -T postgres pg_dump -U spin spin | gzip > "backups/spin-$(date +%F).sql.gz"
find backups -name 'spin-*.sql.gz' -mtime +30 -delete
