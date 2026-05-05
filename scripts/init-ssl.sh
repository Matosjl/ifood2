#!/usr/bin/env bash
# =============================================================
# init-ssl.sh — Obtain Let's Encrypt cert and activate HTTPS
#
# Run ONCE after the stack is up with HTTP-only config:
#   ./scripts/init-ssl.sh app.seusite.com admin@seusite.com
#
# What it does:
#   1. Verifies nginx is reachable via HTTP
#   2. Runs certbot webroot challenge (no downtime)
#   3. Generates nginx HTTPS config from template
#   4. Reloads nginx → HTTPS active
# =============================================================
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"

# ── Validate args ────────────────────────────────────────────
if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "❌  Usage: $0 <domain> <email>"
  echo "    Example: $0 app.seusite.com admin@seusite.com"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "▶  Domain : $DOMAIN"
echo "▶  Email  : $EMAIL"
echo ""

# ── 1. Check nginx is serving HTTP ───────────────────────────
echo "1/4  Checking nginx HTTP..."
if ! curl -sf --max-time 10 "http://$DOMAIN/health" > /dev/null 2>&1; then
  echo "⚠️   Could not reach http://$DOMAIN/health"
  echo "    Make sure the stack is running (make up) and DNS is pointing to this server."
  echo "    Continuing anyway — certbot will report the real error if unreachable."
fi

# ── 2. Obtain certificate via certbot webroot ────────────────
echo "2/4  Requesting Let's Encrypt certificate..."
docker compose -f "$ROOT_DIR/docker-compose.yml" run --rm certbot \
  certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --force-renewal \
  -d "$DOMAIN"

echo "✅  Certificate obtained."

# ── 3. Generate HTTPS nginx config from template ─────────────
echo "3/4  Generating HTTPS nginx config..."
TEMPLATE="$ROOT_DIR/nginx/templates/app-ssl.conf"
OUTPUT="$ROOT_DIR/nginx/conf.d/app.conf"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "❌  Template not found: $TEMPLATE"
  exit 1
fi

# envsubst only replaces ${DOMAIN} — leaves $host, $uri etc. intact
export DOMAIN
envsubst '${DOMAIN}' < "$TEMPLATE" > "$OUTPUT"

echo "    Written: $OUTPUT"

# ── 4. Reload nginx ───────────────────────────────────────────
echo "4/4  Reloading nginx..."
docker compose -f "$ROOT_DIR/docker-compose.yml" exec nginx nginx -s reload

echo ""
echo "✅  HTTPS is now active."
echo "    Visit: https://$DOMAIN"
echo ""
echo "    Certificates renew automatically every 12 h (certbot service)."
echo "    To renew manually: docker compose exec certbot certbot renew"
