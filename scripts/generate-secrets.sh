#!/usr/bin/env bash
# =============================================================
# generate-secrets.sh — Print ready-to-paste .env secrets
# Usage: ./scripts/generate-secrets.sh
# =============================================================
set -euo pipefail

gen_hex() { openssl rand -hex "$1"; }

echo ""
echo "# ── Copy these into your .env ──"
echo ""
echo "DB_PASSWORD=$(gen_hex 24)"
echo "REDIS_PASSWORD=$(gen_hex 20)"
echo "JWT_SECRET=$(gen_hex 64)"
echo "JWT_REFRESH_SECRET=$(gen_hex 64)"
echo ""
echo "# ── Done. Keep these values secret! ──"
