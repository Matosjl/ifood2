#!/bin/bash
# =============================================================================
# deploy.sh — ZapFome
# Roda no servidor VPS. Faz pull, build e sobe tudo.
# Uso: bash deploy.sh [dominio] [email_ssl]
# Exemplo: bash deploy.sh meusite.com.br admin@meusite.com.br
# =============================================================================
set -e

DOMINIO="${1:-}"
EMAIL_SSL="${2:-}"
APP_DIR="/opt/zapfome"
REPO_URL="https://github.com/SEU_USUARIO/SEU_REPO.git"   # ← troque pelo seu repo

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[AVISO]${NC} $1"; }
error()   { echo -e "${RED}[ERRO]${NC} $1"; exit 1; }

# ── 1. Verifica root ──────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Execute como root: sudo bash deploy.sh"

# ── 2. Instala Docker se não existir ─────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  info "Instalando Docker..."
  curl -fsSL https://get.docker.com | bash
  systemctl enable --now docker
  success "Docker instalado"
fi

if ! docker compose version &>/dev/null; then
  info "Instalando Docker Compose plugin..."
  apt-get install -y docker-compose-plugin
fi

# ── 3. Clona ou atualiza o repositório ───────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  info "Atualizando código..."
  cd "$APP_DIR" && git pull origin main
else
  info "Clonando repositório..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# ── 4. Configura .env se não existir ─────────────────────────────────────────
if [ ! -f "$APP_DIR/backend/.env" ]; then
  warn ".env não encontrado. Criando template..."
  cp "$APP_DIR/backend/.env.example" "$APP_DIR/backend/.env"
  echo ""
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW} AÇÃO NECESSÁRIA: edite o arquivo antes de continuar${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo "  nano $APP_DIR/backend/.env"
  echo ""
  echo "  Campos obrigatórios:"
  echo "    OWNER_API_TOKEN  → gere com: python3 -c \"import secrets; print(secrets.token_urlsafe(40))\""
  echo "    OPENAI_API_KEY   → sua chave da OpenAI"
  echo "    CORS_ORIGINS     → https://$DOMINIO"
  echo ""
  read -p "Pressione ENTER após editar o .env..."
fi

# ── 5. Substitui DOMINIO_AQUI no nginx ───────────────────────────────────────
if [ -n "$DOMINIO" ]; then
  info "Configurando domínio: $DOMINIO"
  sed -i "s/DOMINIO_AQUI/$DOMINIO/g" "$APP_DIR/nginx/conf.d/zapfome.conf"
  # Configura APP_URL no .env
  if ! grep -q "^APP_URL=" "$APP_DIR/backend/.env"; then
    echo "APP_URL=https://$DOMINIO" >> "$APP_DIR/backend/.env"
  fi
fi

# ── 6. Obtém SSL (primeira vez) ───────────────────────────────────────────────
if [ -n "$DOMINIO" ] && [ -n "$EMAIL_SSL" ]; then
  if [ ! -d "/etc/letsencrypt/live/$DOMINIO" ]; then
    info "Obtendo certificado SSL para $DOMINIO..."

    # Nginx temporário só para validação HTTP
    docker run --rm -d --name nginx_tmp \
      -p 80:80 \
      -v "$APP_DIR/nginx/conf.d/acme.conf:/etc/nginx/conf.d/default.conf:ro" \
      -v "zapfome_certbot_www:/var/www/certbot" \
      nginx:1.25-alpine 2>/dev/null || true

    docker run --rm \
      -v "zapfome_certbot_www:/var/www/certbot" \
      -v "zapfome_certbot_certs:/etc/letsencrypt" \
      certbot/certbot certonly \
        --webroot -w /var/www/certbot \
        -d "$DOMINIO" -d "www.$DOMINIO" \
        --email "$EMAIL_SSL" \
        --agree-tos --non-interactive

    docker stop nginx_tmp 2>/dev/null || true
    success "Certificado SSL obtido"
  else
    info "Certificado SSL já existe — pulando"
  fi
fi

# ── 7. Build e sobe os containers ────────────────────────────────────────────
info "Fazendo build e subindo serviços..."
cd "$APP_DIR"
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

# ── 8. Aguarda API ficar saudável ─────────────────────────────────────────────
info "Aguardando API iniciar..."
for i in {1..30}; do
  if docker compose -f docker-compose.prod.yml exec -T api python -c \
    "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" &>/dev/null; then
    success "API saudável!"
    break
  fi
  echo -n "."
  sleep 3
done

# ── 9. Limpeza de imagens antigas ─────────────────────────────────────────────
docker image prune -f &>/dev/null || true

# ── 10. Resumo ────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN} ✅ ZapFome deployado com sucesso!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
[ -n "$DOMINIO" ] && echo -e "  🌐 URL:  https://$DOMINIO"
echo -e "  📋 Logs: docker compose -f docker-compose.prod.yml logs -f"
echo -e "  📊 Status: docker compose -f docker-compose.prod.yml ps"
echo ""
