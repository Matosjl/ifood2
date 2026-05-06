#!/bin/sh
# nginx-watchdog.sh
# Roda dentro do container saas_nginx.
# Se o backend voltou após uma queda, recarrega nginx para re-resolver o DNS.
# Adicione ao docker-compose como command override ou como sidecar cron.

BACKEND_URL="http://backend:3000/health"
STATE_FILE="/tmp/backend_was_down"

while true; do
  if wget -qO- --timeout=3 "$BACKEND_URL" > /dev/null 2>&1; then
    # Backend está UP
    if [ -f "$STATE_FILE" ]; then
      echo "[watchdog] Backend voltou — recarregando nginx"
      nginx -s reload
      rm -f "$STATE_FILE"
    fi
  else
    # Backend está DOWN
    if [ ! -f "$STATE_FILE" ]; then
      echo "[watchdog] Backend caiu — marcando para reload quando voltar"
      touch "$STATE_FILE"
    fi
  fi
  sleep 15
done
