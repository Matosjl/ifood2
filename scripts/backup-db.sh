#!/usr/bin/env bash
# =============================================================
# backup-db.sh — PostgreSQL dump to compressed file
#
# Usage:
#   ./scripts/backup-db.sh
#   ./scripts/backup-db.sh /mnt/backups   # custom output dir
#
# Cron (daily at 3 AM):
#   0 3 * * * /opt/saas-restaurant/scripts/backup-db.sh >> /var/log/saas-backup.log 2>&1
# =============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${1:-$ROOT_DIR/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Load env (need DB_* vars)
if [[ -f "$ROOT_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  set -o allexport
  source "$ROOT_DIR/.env"
  set +o allexport
fi

mkdir -p "$BACKUP_DIR"

FILENAME="$BACKUP_DIR/saas_restaurant_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup → $FILENAME"

docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
  pg_dump \
    --username="${DB_USER:-saas_user}" \
    --no-password \
    "${DB_NAME:-saas_restaurant}" \
  | gzip > "$FILENAME"

SIZE=$(du -sh "$FILENAME" | cut -f1)
echo "[$(date)] Backup complete. Size: $SIZE"

# ── Retention: keep last 14 days ─────────────────────────────
find "$BACKUP_DIR" -name "saas_restaurant_*.sql.gz" -mtime +14 -delete
echo "[$(date)] Old backups pruned."
