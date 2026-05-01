#!/bin/bash
# =============================================================================
# update.sh — Atualiza o ZapFome em produção (sem downtime na API)
# Uso: bash update.sh
# =============================================================================
set -e
cd /opt/zapfome

echo "🔄 Puxando atualizações..."
git pull origin main

echo "🔨 Rebuilding e reiniciando serviços..."
docker compose -f docker-compose.prod.yml up -d --build api frontend_builder nginx

echo "🧹 Limpando imagens antigas..."
docker image prune -f

echo "✅ Atualização concluída!"
docker compose -f docker-compose.prod.yml ps
