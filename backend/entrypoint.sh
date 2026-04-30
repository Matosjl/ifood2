#!/bin/bash
# =============================================================================
# entrypoint.sh — ZapFome API
# Aguarda MongoDB e Redis antes de iniciar o Uvicorn.
# Compatível com python:3.11-slim (Debian).
# =============================================================================
set -e

# -----------------------------------------------------------------------------
# Função de espera TCP
# Uso: wait_for_port <host> <porta> <label>
#
# Estratégia: usa `nc` se disponível; caso contrário, usa /dev/tcp do Bash.
# /dev/tcp é built-in do Bash — não requer nenhum binário externo.
# -----------------------------------------------------------------------------
wait_for_port() {
  local host="$1"
  local port="$2"
  local service="$3"
  local timeout="${4:-60}"   # segundos máximos de espera (padrão: 60)
  local elapsed=0

  echo "⏳ Aguardando $service em $host:$port..."

  while true; do
    # Tenta nc primeiro (netcat-openbsd, instalado no Dockerfile)
    if command -v nc >/dev/null 2>&1; then
      nc -z -w 2 "$host" "$port" >/dev/null 2>&1 && break
    else
      # Fallback puro Bash: abre e fecha conexão TCP sem nenhum binário extra
      (echo > /dev/tcp/"$host"/"$port") 2>/dev/null && break
    fi

    elapsed=$((elapsed + 2))
    if [ "$elapsed" -ge "$timeout" ]; then
      echo "❌ Timeout: $service ($host:$port) não respondeu em ${timeout}s. Abortando."
      exit 1
    fi

    echo "   → $service indisponível (${elapsed}s/${timeout}s), tentando novamente..."
    sleep 2
  done

  echo "✅ $service disponível."
}

# -----------------------------------------------------------------------------
# Aguarda dependências obrigatórias
# Os nomes 'db' e 'redis' são os hostnames dos serviços no docker-compose.yml
# -----------------------------------------------------------------------------
wait_for_port db    27017 "MongoDB"
wait_for_port redis 6379  "Redis"

# -----------------------------------------------------------------------------
# Seed de dados iniciais (executa apenas uma vez por volume)
# Usa /app/.seeded para persistir o flag dentro do próprio código da app.
# Se quiser resetar o seed: delete o arquivo e reinicie o contêiner.
# -----------------------------------------------------------------------------
SEED_FLAG="/app/.seeded"

if [ ! -f "$SEED_FLAG" ]; then
  echo "🌱 Primeira inicialização — executando seed_data.py..."
  python seed_data.py && touch "$SEED_FLAG"
  echo "✅ Seed concluído."
else
  echo "ℹ️  Seed já executado anteriormente — pulando."
fi

# -----------------------------------------------------------------------------
# Transfere controle para o comando definido no CMD do Dockerfile
# (uvicorn server:app ...)
# -----------------------------------------------------------------------------
echo "🚀 Iniciando API..."
exec "$@"
