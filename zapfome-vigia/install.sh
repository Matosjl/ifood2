#!/bin/bash
# ZapFome Vigia — Script de instalação na VPS
# Execute como root: bash install.sh
set -e

DEST=/opt/zapfome-vigia
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${GREEN}=== ZapFome Vigia — Instalação ===${NC}"

# ── 1. Verifica Node.js ───────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo -e "${YELLOW}Instalando Node.js 20...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "Node: $(node -v)"

# ── 2. Cria diretório e copia arquivos ────────────────────────
echo -e "${YELLOW}Copiando arquivos para ${DEST}...${NC}"
mkdir -p "$DEST"
cp monitor.js    "$DEST/"
cp commander.js  "$DEST/"

# ── 3. Cria .env se não existir ───────────────────────────────
if [ ! -f "$DEST/.env" ]; then
  cp .env.example "$DEST/.env"
  echo -e "${YELLOW}ATENÇÃO: Edite ${DEST}/.env com seus dados reais antes de continuar!${NC}"
  echo "  - OWNER_PHONE: seu número com DDI (ex: 5511999999999)"
  echo "  - MCP_TOKEN: gere com: openssl rand -hex 32"
  read -p "Pressione ENTER após editar o .env..."
fi

# ── 4. Instala serviços systemd ───────────────────────────────
echo -e "${YELLOW}Instalando serviços systemd...${NC}"
cp zapfome-monitor.service   /etc/systemd/system/
cp zapfome-commander.service /etc/systemd/system/
systemctl daemon-reload

# ── 5. Habilita e inicia serviços ─────────────────────────────
systemctl enable zapfome-monitor zapfome-commander
systemctl restart zapfome-monitor zapfome-commander
sleep 2

# ── 6. Status ─────────────────────────────────────────────────
echo ""
echo -e "${GREEN}=== Status dos serviços ===${NC}"
systemctl status zapfome-monitor  --no-pager -l | head -8
systemctl status zapfome-commander --no-pager -l | head -8

# ── 7. Patch nginx ─────────────────────────────────────────────
echo ""
echo -e "${YELLOW}=== Configurando nginx (MCP proxy) ===${NC}"
NGINX_CONF=/opt/saas-restaurant/nginx/conf.d/app.conf

# Verifica se o bloco /mcp já existe
if grep -q "location /mcp" "$NGINX_CONF" 2>/dev/null; then
  echo "nginx /mcp já configurado — pulando."
else
  # Insere os blocos antes do "location / {"
  MCP_BLOCK='
    # ZapFome Vigia MCP
    location /mcp {
        proxy_pass         http://host.docker.internal:3002/mcp;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   Authorization $http_authorization;
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 300s;
        chunked_transfer_encoding on;
    }
    location /vigia/webhook {
        proxy_pass       http://host.docker.internal:3002/webhook;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }'

  # Faz backup e insere antes do "location / {"
  cp "$NGINX_CONF" "${NGINX_CONF}.bak"
  sed -i "s|location / {|${MCP_BLOCK}\n\n    location / {|" "$NGINX_CONF"
  docker exec saas_nginx nginx -t && docker exec saas_nginx nginx -s reload
  echo -e "${GREEN}Nginx recarregado com suporte a /mcp e /vigia/webhook${NC}"
fi

# ── 8. Instruções finais ───────────────────────────────────────
echo ""
echo -e "${GREEN}=== Instalação concluída! ===${NC}"
echo ""
echo "📱 Para conectar Claude.ai no celular via MCP:"
echo "   1. Abra Claude.ai → Settings → Integrations → Add MCP Server"
echo "   2. URL:   https://zapfome.ddns.net/mcp"
echo "   3. Token: $(grep MCP_TOKEN ${DEST}/.env | cut -d= -f2)"
echo ""
echo "📲 Para configurar webhook WhatsApp (Evolution API):"
echo "   URL do webhook: https://zapfome.ddns.net/vigia/webhook"
echo "   Habilite os eventos: MESSAGES_UPSERT"
echo ""
echo "📋 Logs em tempo real:"
echo "   journalctl -fu zapfome-monitor"
echo "   journalctl -fu zapfome-commander"
echo ""
