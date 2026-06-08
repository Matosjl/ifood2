#!/usr/bin/env bash
# =============================================================
# deploy.sh — Zero-downtime production deployment
#
# Usage (from VPS, inside the project dir):
#   ./scripts/deploy.sh
#   ./scripts/deploy.sh --no-cache    # force fresh image build
# =============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_FLAGS=""
START_TIME=$(date +%s)

cd "$ROOT_DIR"

# ── Parse flags ──────────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --no-cache) BUILD_FLAGS="--no-cache" ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ── Pre-flight ────────────────────────────────────────────────
log "▶  Pulling latest code..."
git pull --ff-only

if [[ ! -f ".env" ]]; then
  echo "❌  .env file not found. Run: cp .env.example .env && nano .env"
  exit 1
fi

# ── Build images ──────────────────────────────────────────────
log "▶  Building images..."
# shellcheck disable=SC2086
docker compose build $BUILD_FLAGS

# ── Database migrations ───────────────────────────────────────
log "▶  Running database migrations..."
docker compose run --rm backend node src/database/migrate.js

# ── Rolling restart ───────────────────────────────────────────
log "▶  Starting services..."
docker compose up -d --remove-orphans

# ── Reload nginx to pick up new backend IP ────────────────────
# When backend/worker are rebuilt, Docker assigns a new container IP.
# Nginx caches the resolved IP at startup — without a reload it keeps
# routing to the old (dead) IP, causing 502 on every request.
log "▶  Reloading nginx (flush upstream IP cache)..."
docker compose exec -T nginx nginx -s reload || docker compose restart nginx

# Wait for backend health
log "▶  Waiting for backend to become healthy..."
for i in $(seq 1 30); do
  if docker compose exec -T backend wget -qO- http://localhost:3000/health > /dev/null 2>&1; then
    log "   Backend healthy after ${i}s"
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "❌  Backend did not become healthy after 30s"
    docker compose logs --tail=50 backend
    exit 1
  fi
  sleep 1
done

# ── Clean up old images ───────────────────────────────────────
log "▶  Pruning dangling images..."
docker image prune -f > /dev/null

# ── Summary ───────────────────────────────────────────────────
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅  Deploy complete in ${ELAPSED}s"
echo "║"
echo "║  Services:"
docker compose ps --format "║    {{.Name}} — {{.Status}}"
echo "╚══════════════════════════════════════════╝"
