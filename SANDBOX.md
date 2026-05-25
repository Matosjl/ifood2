# Caixinha Sandbox — Financeiro IA com OCR

Ambiente **100% local e isolado da VPS**. Use isso pra desenvolver e validar o sistema financeiro com IA de notas fiscais sem risco nenhum de afetar produção.

## O que está isolado

| Recurso | Produção (VPS) | Sandbox (sua máquina) |
|---|---|---|
| Postgres | porta 5432 | porta **5433** |
| Redis | porta 6379 | porta **6380** |
| Backend | porta 3000 | porta **3010** |
| Frontend | porta 5173 | porta **5174** |
| Evolution API | VPS | opcional local porta 8081 (ou mockado) |
| Banco de dados | `saas_restaurant` | `zapfome_sandbox` |
| Branch git | `main` | `feature/financeiro-ia-ocr` |

Containers Docker têm nome com sufixo `_sandbox` e network própria (`zapfome_sandbox_network`) — não compartilham nada com o `docker-compose.yml` de produção.

## Pré-requisitos

- Docker Desktop rodando
- Node.js 18+ instalado
- Estar na branch `feature/financeiro-ia-ocr` (`git checkout feature/financeiro-ia-ocr`)

## Setup inicial (primeira vez)

```bash
# 1. Copiar .env.sandbox.example → .env.sandbox em backend e frontend
cp saas-backend/.env.sandbox.example saas-backend/.env.sandbox
cp saas-frontend/.env.sandbox.example saas-frontend/.env.sandbox

# 2. Instalar dependências (se ainda não instalou)
cd saas-backend && npm install
cd ../saas-frontend && npm install
cd ..

# 3. Subir a infra sandbox (postgres + redis)
cd saas-backend
npm run sandbox:up

# 4. Conferir que o schema foi aplicado automaticamente
# (acontece no primeiro boot do container postgres-sandbox)
# Se quiser re-aplicar manualmente:
npm run db:sandbox:migrate
```

## Uso diário

```bash
# Subir infra
cd saas-backend && npm run sandbox:up

# Em um terminal: backend
cd saas-backend && npm run dev:sandbox

# Em outro terminal: frontend
cd saas-frontend && npm run dev:sandbox
```

Abra `http://localhost:5174` no navegador.

## Comandos úteis

| Comando | O que faz |
|---|---|
| `npm run sandbox:up` (em `saas-backend/`) | Sobe postgres + redis sandbox em background |
| `npm run sandbox:down` | Para os containers (preserva dados) |
| `npm run sandbox:wipe` | Para e **apaga tudo** (volumes incluídos) |
| `npm run sandbox:logs` | Stream de logs dos containers |
| `npm run dev:sandbox` | Backend em modo sandbox (porta 3010) |
| `npm run worker:sandbox` | BullMQ worker em modo sandbox |
| `npm run db:sandbox:migrate` | Re-aplica `schema.sql` no DB sandbox (idempotente) |
| `npm run db:sandbox:reset` | Apaga o DB sandbox e recria do zero |

## Acessar o Postgres sandbox direto

```bash
docker exec -it zapfome_postgres_sandbox psql -U zapfome -d zapfome_sandbox
```

Ou via cliente local apontando pra `localhost:5433` com user `zapfome` / pass `sandbox` / db `zapfome_sandbox`.

## Criar um tenant de teste

Depois do backend rodando (`npm run dev:sandbox`):

```bash
curl -X POST http://localhost:3010/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "Restaurante Teste Sandbox",
    "tenantSlug": "teste-sandbox",
    "name": "Admin Teste",
    "email": "admin@sandbox.local",
    "password": "sandbox123"
  }'
```

Salve o token retornado e use em chamadas autenticadas:

```bash
TOKEN="..."  # access_token do response acima
curl http://localhost:3010/api/products -H "Authorization: Bearer $TOKEN"
```

## Testar OCR de nota fiscal SEM WhatsApp

Quando o endpoint `POST /api/financeiro/receipts/upload` estiver implementado (próximo passo do plano), você poderá simular uma foto de nota fiscal sem precisar do WhatsApp:

```bash
curl -X POST http://localhost:3010/api/financeiro/receipts/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@./nota-fiscal-teste.jpg"
```

E pra simular o webhook do Evolution chegando com uma imagem (quando essa parte estiver pronta):

```bash
curl -X POST http://localhost:3010/webhook/evolution/<tenantId> \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "data": {
      "key": { "remoteJid": "5511999999999@s.whatsapp.net", "fromMe": false },
      "message": {
        "imageMessage": { "url": "https://exemplo.com/nota.jpg", "mimetype": "image/jpeg" }
      }
    }
  }'
```

## ⚠️ Antes de algo "sério"

Os secrets em `.env.sandbox.example` são **placeholders fakes**. Antes de qualquer coisa que não seja teste local:

1. Gere segredos reais pro `.env.sandbox`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```
   E troque `JWT_SECRET` + `JWT_REFRESH_SECRET`.

2. Se for usar Evolution sandbox de verdade (com chip de teste), troque `EVOLUTION_API_KEY` pelo valor real.

3. `.env.sandbox` está no `.gitignore` — secrets reais nunca vão pro repo.

## Quando estiver tudo testado e quiser ir pra produção

```bash
git add . && git commit -m "feat: financeiro-ia-ocr"
git push -u origin feature/financeiro-ia-ocr
# Abre PR pra main, revisa, merge, deploy
```

A migration do `schema.sql` é idempotente — vai aplicar só o que faltar no Postgres de produção sem quebrar nada que já existe.
