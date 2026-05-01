# Deploy ZapFome em Produção

## Recomendação de VPS: Hetzner CX22 (~R$ 25/mês)
- 2 vCPU / 4 GB RAM / 40 GB SSD
- Cria em: https://hetzner.com/cloud → Server → CX22 → Ubuntu 24.04

---

## PASSO A PASSO COMPLETO

### 1. Criar o servidor (Hetzner)
1. Acesse https://console.hetzner.cloud
2. Crie um projeto → Add Server
3. Escolha: **CX22** · **Ubuntu 24.04** · região mais próxima
4. Adicione sua chave SSH (ou crie uma senha root)
5. Clique em **Create & Buy**
6. Anote o **IP do servidor** (ex: `123.456.789.0`)

### 2. Apontar domínio para o servidor
No painel do seu domínio (Registro.br, GoDaddy, etc):
```
Tipo A  |  Nome: @    |  Valor: IP_DO_SERVIDOR
Tipo A  |  Nome: www  |  Valor: IP_DO_SERVIDOR
```
Aguarde 5-30 minutos para propagar.

### 3. Subir o código no GitHub
```bash
# Na sua máquina local (Windows)
cd C:\Users\sealo\Desktop\ifood2
git init
git add .
git commit -m "deploy inicial"
git remote add origin https://github.com/SEU_USUARIO/zapfome.git
git push -u origin main
```

### 4. Conectar no servidor via SSH
```bash
ssh root@IP_DO_SERVIDOR
```

### 5. Rodar o script de deploy
```bash
# No servidor
curl -fsSL https://raw.githubusercontent.com/SEU_USUARIO/zapfome/main/deploy.sh | bash -s -- seudominio.com.br seu@email.com
```

**Ou manualmente:**
```bash
git clone https://github.com/SEU_USUARIO/zapfome.git /opt/zapfome
cd /opt/zapfome
bash deploy.sh seudominio.com.br seu@email.com
```

### 6. Preencher o .env no servidor
O script vai pausar pedindo para editar o `.env`:
```bash
nano /opt/zapfome/backend/.env
```

Campos obrigatórios:
```env
OWNER_API_TOKEN="TOKEN_GERADO"    # python3 -c "import secrets; print(secrets.token_urlsafe(40))"
OPENAI_API_KEY="sk-proj-..."      # sua chave OpenAI
CORS_ORIGINS="https://seudominio.com.br"
APP_URL="https://seudominio.com.br"
```

---

## COMANDOS ÚTEIS NO SERVIDOR

```bash
# Ver status dos containers
docker compose -f /opt/zapfome/docker-compose.prod.yml ps

# Ver logs em tempo real
docker compose -f /opt/zapfome/docker-compose.prod.yml logs -f api

# Atualizar após novo push
cd /opt/zapfome && bash update.sh

# Reiniciar só a API
docker compose -f /opt/zapfome/docker-compose.prod.yml restart api

# Ver uso de recursos
docker stats
```

---

## ESTRUTURA FINAL EM PRODUÇÃO

```
Internet
   │ HTTPS 443
   ▼
 Nginx ──────► /usr/share/nginx/html  (React build estático)
   │
   │ /api/*  proxy_pass
   ▼
 FastAPI :8000  (rede interna Docker)
   │
   ├─► MongoDB :27017  (rede interna)
   └─► Redis   :6379   (rede interna)
```

## CUSTO MENSAL ESTIMADO

| Item | Custo |
|------|-------|
| Hetzner CX22 VPS | ~R$ 25 |
| Domínio .com.br (anual) | ~R$ 40/ano ≈ R$ 3/mês |
| SSL Let's Encrypt | Grátis |
| OpenAI gpt-4o-mini | ~R$ 1-5 (por uso) |
| **Total** | **~R$ 30/mês** |
