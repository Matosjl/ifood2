#!/usr/bin/env sh
# bootstrap-nginx.sh — Garante que nginx/conf.d/app.conf existe antes do docker compose up.
# Idempotente: não sobrescreve se o arquivo já existir (preserva config SSL de produção).
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT_DIR/nginx/conf.d/app.conf"
BOOTSTRAP="$ROOT_DIR/nginx/templates/app-http.conf"

if [ ! -f "$TARGET" ]; then
  echo "▶ app.conf ausente — gerando bootstrap HTTP a partir de app-http.conf"
  cp "$BOOTSTRAP" "$TARGET"
else
  echo "▶ app.conf já existe — mantendo (config de produção/SSL preservada)"
fi
