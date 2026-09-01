#!/bin/sh
# nginx-watchdog.sh
# Roda dentro do container saas_nginx.
# Se o backend voltou após uma queda, recarrega nginx para re-resolver o DNS.
#
# LIVENESS, não readiness: só prova que o processo Nest está respondendo
# HTTP, não que dependências (banco etc.) estão OK — suficiente pra decidir
# "vale a pena recarregar nginx pra re-resolver DNS", que é o único
# objetivo deste script (ver Fase incidente 2026-09-01).
#
# GET / (AppController, @Public(), sem auth, sem DB) é o endpoint mais
# leve que já existe no backend — não existe /health dedicado, e não foi
# criado um só pra isto (não inventar endpoint sem necessidade real).

BACKEND_URL="http://zapfome_v2_backend:3000/"
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
