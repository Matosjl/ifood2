# ZapFome — Documentação Técnica Completa

---

## 1. VISÃO GERAL DO PRODUTO

### O que é

ZapFome é um SaaS multi-tenant para gestão completa de restaurantes, operado via painel web. Atende desde pequenos lanchonetes até redes com múltiplas filiais. O nome deriva da integração com WhatsApp como canal de pedidos e comunicação com clientes.

### Para quem é

Proprietários e gestores de restaurantes brasileiros que precisam de: controle de pedidos em tempo real, gestão financeira (caixa, despesas, banco virtual), controle de estoque (produtos + insumos), fidelização de clientes e automação via IA.

### Proposta de valor

- Kanban de pedidos em tempo real via WebSocket
- Chatbot WhatsApp integrado (Evolution API) com IA (Ollama em VPS2)
- OCR de notas fiscais via Ollama Vision
- CMV (Custo de Mercadoria Vendida) calculado por item, não estimado
- Fiado digital com controle de adiantamentos
- Sistema de cashback e fidelidade por telefone
- Banco virtual que centraliza entradas (fechamento caixa) e saídas (gastos)
- Integração nativa com iFood via API OAuth

### Arquitetura de alto nível (2 VPS)

```
┌──────────────────────────────────────────────────────┐
│  VPS1 (prod principal)                               │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────┐  │
│  │  Express    │  │ BullMQ   │  │  Socket.io     │  │
│  │  (API)      │  │ Worker   │  │  (WS)          │  │
│  └──────┬──────┘  └────┬─────┘  └───────┬────────┘  │
│         │              │                │            │
│  ┌──────▼──────┐  ┌────▼─────┐         │            │
│  │ PostgreSQL  │  │  Redis   │◄─────────┘            │
│  └─────────────┘  └──────────┘                       │
│  Nginx (reverse proxy + rate limit)                  │
└──────────────────────┬───────────────────────────────┘
                       │ HTTP (X-AI-Engine-Key)
┌──────────────────────▼───────────────────────────────┐
│  VPS2 (AI Engine — 69.10.43.169:3001)                │
│  ┌─────────────────────────┐  ┌───────────────┐     │
│  │  AI Engine (Node.js)    │  │  Ollama       │     │
│  │  Agentes: manager,      │  │  Vision OCR   │     │
│  │  financial, marketing,  │  │  Chat LLM     │     │
│  │  recovery, chat         │  │  (8GB RAM)    │     │
│  └─────────────────────────┘  └───────────────┘     │
└──────────────────────────────────────────────────────┘

Externos:
  Evolution API (WhatsApp)     → webhook/mensagens
  n8n (automação)              → campanhas/relatórios WA
  OpenPix                      → cobrança PIX
  iFood API                    → recebimento de pedidos externos
```

### Módulos do sistema

| Módulo | Propósito |
|---|---|
| auth | JWT access/refresh, registro com trial, roles |
| orders | Criação, Kanban de status, BullMQ, estoque |
| products | CRUD, categorias, imagens, variações |
| addons | Complementos/adicionais por produto |
| insumos | Ingredientes, ficha técnica, produção diária, perdas |
| caixa | Abertura/fechamento, sangria, suprimento |
| financeiro | DRE simplificado, despesas, CMV, relatórios |
| banco | Banco virtual (saldo acumulado) |
| fiado | Crédito a clientes, adiantamentos |
| driver | Motoboys, entregas, rastreamento |
| ai | AI Center chat, agentes, OCR NF |
| billing | Planos, trial, bloqueio de conta |
| campaigns | Campanhas marketing |
| coupons | Cupons de desconto |
| tables | Mesas/QR Code |
| reservations | Reservas de mesa |
| locations | Multi-loja/filiais |
| promotions | Promoções automáticas (happy hour, desconto categoria) |
| ratings | Avaliações pós-pedido via link WhatsApp |
| pix | Integração OpenPix |
| nfce | NFC-e (integração fiscal) |
| integrations | iFood/Rappi via OAuth |
| public | Menu digital público (sem auth) |
| admin | Super admin panel |
| internal | Endpoints para VPS2 (X-Internal-Key) |

### Modelo de negócio (SaaS multi-tenant)

Planos (`src/config/plans.js`):
- **Basic** — R$ 67/mês: pedidos ilimitados, caixa, fiado, cardápio digital, máx 2 usuários
- **Pro** — R$ 179,99/mês: + relatórios avançados, WhatsApp, alertas de estoque, máx 5 usuários
- **Premium** — R$ 370/mês: + IA, API pública, usuários ilimitados

Trial: 14 dias total, primeiros 3 dias com Premium liberado (`TRIAL_DAYS = 10`, `PREMIUM_TRIAL_DAYS = 3` — nota: há discrepância entre o schema SQL que menciona 14 dias e a constante que diz 10).

---

## 2. STACK TECNOLÓGICA COMPLETA

### Backend (VPS1)

- **Runtime**: Node.js
- **Framework**: Express.js
- **ORM**: Nenhum — SQL puro via `pg` (node-postgres)
- **Autenticação**: `jsonwebtoken` (JWT), `bcryptjs` (hash de senha)
- **Filas**: `bullmq` com conexão Redis
- **WebSocket**: `socket.io`
- **Validação**: `express-validator`
- **Rate Limiting**: `express-rate-limit`
- **Segurança**: `helmet`, `cors`
- **Logging**: Morgan (dev) + logger estruturado próprio
- **Monitoramento erros**: `@sentry/node` (opcional, via `SENTRY_DSN`)
- **HTTP cliente**: `axios` (chamadas para VPS2 e integrações)
- **Uploads**: `multer` (inferido pelo módulo de produtos)
- **UUID**: `uuid`

### Frontend

- **Framework**: React (Vite — `import.meta.env`)
- **Linguagem**: JavaScript (não TypeScript)
- **Roteamento**: Manual via `window.location.pathname` + `window.history.pushState` (sem React Router)
- **Estado**: Estado local React (`useState`, `useCallback`, `useRef`) — sem Redux/Zustand
- **HTTP cliente**: Axios (`src/api/axios.js`) com interceptors de refresh token
- **WebSocket**: Socket.io client (hook `useSocket`)
- **Animações**: `framer-motion`
- **CSS**: Tailwind CSS
- **Build**: Vite (`import.meta.env.VITE_API_URL`)

### Banco de dados

- **Engine**: PostgreSQL
- **Extensões**: `uuid-ossp` (UUIDs), `pg_trgm` (fuzzy search em insumos/produtos)
- **Conexão**: Pool via `pg` (sem ORM)
- **Timezone**: `America/Sao_Paulo` — queries financeiras usam `AT TIME ZONE 'America/Sao_Paulo'`

### Infraestrutura

- **Redis**: BullMQ (filas de pedidos) + cache de pedidos ativos (hash por tenant)
- **BullMQ**: Fila `orders`, concorrência 5, 3 tentativas com backoff exponencial, timeout 30s
- **Socket.io**: Rooms por tenant (`tenant:{tenantId}`), rooms de driver (`driver:{driverId}`)
- **Nginx**: Reverse proxy em frente ao Express (`app.set('trust proxy', 1)`)
- **Docker**: Implícito pelo uso de docker network (`172.19.0.1` para n8n)

### Externos

| Serviço | Variável | Propósito |
|---|---|---|
| Evolution API | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` | WhatsApp — mensagens clientes e dono |
| Ollama (VPS2) | `VPS2_URL`, `AI_ENGINE_KEY` | LLM chat + Vision OCR notas fiscais |
| n8n | `N8N_URL`, `N8N_API_KEY` | Automação: campanhas, recuperação clientes, relatórios WA |
| OpenPix | `pix_openpix_app_id` (por tenant) | Cobrança PIX com QR Code |
| iFood | `ifood_client_id`, `ifood_client_secret`, `ifood_merchant_id` (por tenant) | Pedidos externos |
| Sentry | `SENTRY_DSN` | Rastreamento de erros (opcional) |

### Autenticação

- **Access token**: JWT, payload `{ sub: userId, tenantId, role }`, expira em `JWT_EXPIRES_IN` (padrão: `8h`)
- **Refresh token**: JWT separado, payload `{ sub: userId, type: 'refresh' }`, expira em `JWT_REFRESH_EXPIRES_IN` (padrão: `7d`), hash gravado em `refresh_tokens`
- **Rotação de refresh**: ao usar refresh, o token antigo é deletado e um novo par é emitido
- **Logout**: DELETE do refresh token no banco

### Variáveis de ambiente críticas

```
JWT_SECRET            # obrigatória
JWT_REFRESH_SECRET    # obrigatória
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
REDIS_URL
VPS2_URL, AI_ENGINE_KEY, INTERNAL_KEY
EVOLUTION_API_URL, EVOLUTION_API_KEY
N8N_URL, N8N_API_KEY
SUPER_ADMIN_KEY
CORS_ORIGINS
SENTRY_DSN            # opcional
VITE_API_URL          # frontend
```

---

## 3. ESTRUTURA DO BANCO DE DADOS

### Tabelas principais

**tenants** — Restaurante/empresa (root do multi-tenant)
- `id UUID PK`, `name`, `slug UNIQUE`, `plan` (basic/pro/premium), `active`, `subscription_status` (active/suspended/cancelled/trialing), `trial_ends_at`, `premium_trial_ends_at`, `orders_count_monthly`, `cashback_enabled`, `cashback_rate` (%), `cashback_min_order`, `restaurant_lat/lng`, `delivery_zones JSONB`, `delivery_zone_type` (named/polygon), `accepted_payment_methods JSONB`, `whatsapp_number`, `whatsapp_instance`, `owner_whatsapp`, `driver_token`, `nfce_config JSONB`, `ifood_client_id/secret/merchant_id`, `pix_openpix_app_id`

**users** — Funcionários do tenant
- `id UUID PK`, `tenant_id FK(tenants)`, `name`, `email`, `password_hash`, `role` (owner/manager/staff), `active`
- UNIQUE: `(tenant_id, email)`

**refresh_tokens** — Tokens de refresh ativos
- `id UUID PK`, `user_id FK(users)`, `token_hash`, `expires_at`

**order_counters** — Numeração sequencial por tenant
- `tenant_id UUID PK FK(tenants)`, `last_number INTEGER`
- Uso: `INSERT ... ON CONFLICT DO UPDATE SET last_number = last_number + 1 RETURNING last_number`

**orders** — Pedidos
- `id UUID PK`, `tenant_id FK`, `order_number INTEGER`, `customer_name`, `customer_phone`, `customer_address`, `channel` (manual/whatsapp/online/ifood/etc.), `status` (pending/confirmed/preparing/ready/delivering/delivered/cancelled), `total DECIMAL`, `notes`, `idempotency_key UNIQUE`, `delivery_type` (pickup/delivery), `payment_method`, `delivery_fee`, `neighborhood`, `paid_at`, `loyalty_customer_id FK`, `cashback_earned`, `cashback_used`, `table_number`, `delivery_lat/lng`, `coupon_code`, `coupon_discount`, `external_id`, `location_id FK`, `nfce_*`, `pix_*`
- UNIQUE: `(tenant_id, order_number)`, `(tenant_id, external_id)`, `idempotency_key`

**order_items** — Itens do pedido
- `id UUID PK`, `order_id FK(orders)`, `product_id FK(products)` (nullable — snapshot), `product_name` (snapshot), `quantity`, `weight_kg`, `unit_price`, `total`, `notes`, `unit_cost`, `total_cost` (snapshot para CMV)

**order_item_addons** — Complementos selecionados no item
- `id UUID PK`, `order_item_id FK`, `addon_item_id FK` (nullable), `addon_name`, `qty`, `unit_price`, `total`

**products** — Produtos do cardápio
- `id UUID PK`, `tenant_id FK`, `category_id FK`, `name`, `description`, `sale_type` (unit/kg), `cost_price`, `sale_price`, `stock_qty DECIMAL(10,3)`, `alert_threshold`, `active`, `image_url`, `featured`

**categories** — Categorias de produto
- `id UUID PK`, `tenant_id FK`, `name`, `printer_target` (kitchen/bar/both/none)
- UNIQUE: `(tenant_id, name)`

**stock_movements** — Histórico de movimentação de estoque
- `id UUID PK`, `tenant_id FK`, `product_id FK`, `product_name` (snapshot), `quantity DECIMAL` (+entrada/-saída), `type` (in/out/replenishment/adjustment), `reason`, `order_id FK`

**cash_registers** — Registros de caixa
- `id UUID PK`, `tenant_id FK`, `opened_by/closed_by FK(users)`, `opening_balance`, `closing_balance`, `total_revenue`, `total_orders`, `payment_summary JSONB`, `status` (open/closed), `opened_at`, `closed_at`, `cash_counted`, `card_counted`, `pix_counted`, `discrepancy`, `notes`

**caixa_movements** — Sangria e suprimento durante caixa aberto
- `id UUID PK`, `tenant_id FK`, `cash_register_id FK`, `type` (sangria/suprimento), `amount`, `reason`, `created_by FK(users)`

**banco_transactions** — Banco virtual (extrato acumulado)
- `id UUID PK`, `tenant_id FK`, `type` (credit/debit), `amount CHECK > 0`, `description`, `source` (caixa/expense/manual), `reference_id UUID`

**expenses** — Gastos/despesas do negócio
- `id UUID PK`, `tenant_id FK`, `name`, `supplier`, `category` (rent/utilities/food_supplier/staff/marketing/tax/maintenance/other), `amount`, `payment_method`, `is_installment`, `installment_total`, `installment_current`, `due_date DATE`, `paid_at`, `status` (pending/paid/overdue), `notes`, `recurrence` (monthly/yearly), `parent_id FK(self)`, `reminder_sent`

**fiado_clientes** — Clientes que compram fiado
- `id UUID PK`, `tenant_id FK`, `name`, `phone`, `address`, `dia_acerto INT`, `acerto_type`, `acerto_weekday`, `bloqueado BOOLEAN`, `notes`

**fiado_compras** — Transações de fiado (débito/adiantamento)
- `id UUID PK`, `tenant_id FK`, `cliente_id FK(fiado_clientes)`, `order_id FK(orders)`, `descricao`, `valor DECIMAL`, `tipo` (compra/adiantamento), `status` (pendente/pago/cancelado), `paid_at`

**loyalty_customers** — Clientes do programa de fidelidade
- `id UUID PK`, `tenant_id FK`, `name`, `phone`, `cashback_balance DECIMAL`, `total_orders INT`, `total_spent DECIMAL`
- UNIQUE: `(tenant_id, phone)`

**cashback_transactions** — Histórico cashback por cliente
- `id UUID PK`, `tenant_id FK`, `customer_id FK(loyalty_customers)`, `order_id FK`, `type` (earn/use/expire/manual), `amount`, `description`

**order_ratings** — Avaliações de pedido (1-5 estrelas)
- `id UUID PK`, `tenant_id FK`, `order_id FK UNIQUE`, `customer_id FK(loyalty_customers)`, `stars SMALLINT CHECK 1-5`, `comment`, `token VARCHAR(64) UNIQUE`, `rating_url`

**delivery_fees** — Taxa de entrega por bairro (tabela global, não por tenant — bug de arquitetura)
- `id SERIAL PK`, `neighborhood UNIQUE`, `fee DECIMAL`, `active`

**drivers** — Motoboys (independentes de tenant)
- `id UUID PK`, `name`, `phone`, `email UNIQUE`, `password_hash`, `status` (offline/available/busy), `current_lat/lng`

**driver_tenant_connections** — Relação motorista ↔ restaurante (N:N)
- `id UUID PK`, `driver_id FK(drivers)`, `tenant_id FK(tenants)`
- UNIQUE: `(driver_id, tenant_id)`

**deliveries** — Entregas atribuídas a motoristas
- `id UUID PK`, `order_id FK`, `driver_id FK`, `tenant_id FK`, `status`, `driver_fee`, `accepted_at`, `picked_up_at`, `delivered_at`
- Índice parcial UNIQUE em `order_id` WHERE `status != 'cancelled'`

**tenant_clients** — Cadastro manual de clientes
- `id UUID PK`, `tenant_id FK`, `name`, `phone`, `address`, `coords JSONB`, `notes`

**addon_groups** / **addon_items** / **product_addon_groups** — Sistema de complementos
- Grupo (ex: "Extras proteína") → itens (ex: "Bacon +R$3") → vinculação N:N com produtos

**insumos** — Ingredientes/matérias-primas
- `id UUID PK`, `tenant_id FK`, `name`, `unit` (g/kg/ml/l/un/cx/pct), `qty_in_stock DECIMAL(12,3)`, `min_qty`, `cost_per_unit DECIMAL(10,4)`, `waste_factor DECIMAL(5,2)`

**product_insumos** — Ficha técnica: insumos por produto
- `id UUID PK`, `product_id FK`, `insumo_id FK`, `tenant_id FK`, `qty_per_unit DECIMAL(12,3)`
- UNIQUE: `(product_id, insumo_id)`

**production_batches** — Lotes de produção diária
- `id UUID PK`, `tenant_id FK`, `insumo_id FK`, `raw_quantity`, `cooked_quantity`, `remaining_qty`, `produced_at DATE`, `notes`, `created_by`, `expires_at DATE`

**waste_logs** — Registro de perdas operacionais
- `id UUID PK`, `tenant_id FK`, `insumo_id FK`, `insumo_name` (snapshot), `unit`, `quantity`, `reason_type` (burned/expired/broken/operational/other), `notes`, `cost`, `created_by`

**product_variation_groups** / **product_variation_options** — Variações de produto (tamanho, sabor, borda)

**coupons** — Cupons de desconto
- `code UNIQUE por tenant`, `discount_type` (percent/fixed), `discount_value`, `min_order`, `max_uses`, `uses_count`, `expires_at`

**restaurant_tables** — Mesas do restaurante
- `number UNIQUE por tenant`, `name`, `active`

**promotions** — Promoções automáticas
- `type` (happy_hour/product_discount/category_discount), `conditions JSONB`, `active`

**reservations** — Reservas de mesa
- `status` (pending/confirmed/seated/cancelled/no_show)

**locations** — Filiais/pontos de venda
- `is_default BOOLEAN`, índice parcial garante 1 default por tenant

**pending_receipts** — Notas fiscais aguardando confirmação
- OCR pipeline: foto → IA extrai → `raw_extraction JSONB` → `matched_items JSONB` → usuário confirma → vira expense + stock_movements

**ai_chat_messages**, **ai_tasks**, **ai_logs**, **ai_agents** — Infraestrutura do AI Center

**finance_logs** — Auditoria de operações financeiras

### ERD textual (relacionamentos principais)

```
tenants (1) ────────── (N) users
tenants (1) ────────── (N) orders
tenants (1) ────────── (N) products ────── (N) categories
tenants (1) ────────── (1) order_counters
tenants (1) ────────── (N) cash_registers
tenants (1) ────────── (N) banco_transactions
tenants (1) ────────── (N) expenses
tenants (1) ────────── (N) fiado_clientes ─── (N) fiado_compras
tenants (1) ────────── (N) loyalty_customers ─ (N) cashback_transactions
tenants (1) ────────── (N) insumos
tenants (1) ────────── (N) locations

orders  (1) ────────── (N) order_items ─── (N) order_item_addons
orders  (1) ────────── (N) stock_movements
orders  (0..1) ──────── (1) deliveries
orders  (0..1) ──────── (1) order_ratings

products (N) ─────── (M) addon_groups  (via product_addon_groups)
products (N) ─────── (M) insumos       (via product_insumos)

drivers  (N) ─────── (M) tenants       (via driver_tenant_connections)
```

---

## 4. ARQUITETURA DE MÓDULOS BACKEND

### auth (`/api/auth`)
- `POST /api/auth/register` — cria tenant + usuário owner em 1 transação; trial opcional
- `POST /api/auth/login` — retorna access + refresh token
- `POST /api/auth/refresh` — rotaciona refresh token
- `POST /api/auth/logout` — invalida refresh token

### orders (`/api/orders`)
- `GET /api/orders` — lista com filtros (status, channel, datas, paginação)
- `POST /api/orders` — cria via BullMQ (requer caixa aberto)
- `GET /api/orders/:id` — busca com itens + addons
- `PATCH /api/orders/:id/status` — muda status (cancelamento via fila, demais direto)
- `DELETE /api/orders/:id` — cancela e devolve estoque
- `PATCH /api/orders/:id/paid` — registra pagamento
- `PATCH /api/orders/:id/items` — substitui itens (reconcilia estoque)
- `PATCH /api/orders/:id/info` — atualiza entrega, taxa, desconto/acréscimo
- `GET /api/orders/customers` — busca clientes
- `POST /api/orders/customers` — cadastro manual
- `GET /api/orders/customers/funnel` — segmentação CRM
- `GET /api/orders/analytics/hourly` — heatmap por hora
- Emite: `order:created`, `order:updated`, `order:deleted`

### financeiro (`/api/financeiro`)
- `GET /api/financeiro/summary?period=today|week|month` — métricas + CMV + comparativo
- `GET /api/financeiro/result?month=YYYY-MM` — DRE simplificado (receita vs despesas)
- `GET /api/financeiro/expenses` — lista despesas por mês
- `POST /api/financeiro/expenses` — cria despesa (suporta parcelamento automático)
- `PUT /api/financeiro/expenses/:id` — edita
- `PATCH /api/financeiro/expenses/:id/pay` — marca pago + debita banco virtual (transação)
- `DELETE /api/financeiro/expenses/:id` — remove

### caixa (`/api/caixa`)
- `GET /api/caixa/current` — caixa aberto atual
- `POST /api/caixa/open` — abre caixa (1 por vez)
- `POST /api/caixa/close` — fecha caixa (exige contagem física) + credita banco virtual
- `GET /api/caixa/history` — histórico de caixas fechados
- `POST /api/caixa/sangria` — retirada durante o caixa
- `POST /api/caixa/suprimento` — entrada durante o caixa
- `GET /api/caixa/movements` — movimentos do caixa atual

### banco (`/api/banco`)
- `GET /api/banco/balance` — saldo (total_in, total_out, balance)
- `GET /api/banco/transactions` — extrato paginado
- `POST /api/banco/transactions` — lançamento manual
- `DELETE /api/banco/transactions/:id` — remove apenas source='manual'

### fiado (`/api/fiado`)
- CRUD de clientes, compras, pagamento de compras, resumo dashboard
- Suporte a adiantamentos (crédito a favor do cliente)

### insumos (`/api/insumos`)
- CRUD de insumos, ficha técnica (product_insumos)
- Lotes de produção, alertas de validade, relatório diário
- Perdas (waste_logs), lista de compras automática, simulador de produção
- Ranking de lucro por produto

### ai (`/api/ai`)
- `POST /api/ai/center/chat` — AI Center com detecção de intent + roteamento
- `GET /api/ai/center/history` — histórico de chat
- `GET /api/ai/center/status` — status n8n + VPS2
- `GET /api/ai/center/logs` — observabilidade
- `POST /api/ai/financial/interpret` — interpreta lançamento financeiro
- `POST /api/ai/manager/analyze` — análise gerencial
- `POST /api/ai/marketing/generate` — gera copy
- `POST /api/ai/ocr/invoice` — envia NF para OCR
- `POST /api/ai/ocr/apply` — aplica resultado OCR ao estoque/despesas

### public (`/api/public`)
- `GET /api/public/:slug` — cardápio público (sem auth)
- `POST /api/public/:slug/orders` — pedido online (rate limit 20/min/IP)
- `GET /api/public/:slug/customer/:phone` — consulta cashback do cliente
- `GET /api/public/:slug/history/:phone` — histórico de pedidos
- `POST /api/public/:slug/ratings` — submete avaliação por token

---

## 5. FLUXOS CRÍTICOS — DETALHE MÁXIMO

### 5.1 Criação de Pedido (fluxo completo)

```
1. Frontend → POST /api/orders
   Header: Authorization: Bearer <token>
   Header: X-Idempotency-Key: <uuid> (opcional — gerado internamente se omitido)
   Body: { items, customerName, deliveryType, paymentMethod, ... }

2. orders.controller.js: create()
   a. Verifica caixa aberto:
      SELECT id FROM cash_registers WHERE tenant_id = $1 AND status = 'open'
      → Se não existe: 409 "Caixa fechado"
   b. Obtém idempotencyKey (header ou uuidv4())
   c. enqueueAndWait('create', { tenantId, payload, idempotencyKey }, { idempotencyKey })
      → jobId = idempotencyKey (BullMQ deduplication em voo)
      → Aguarda até 30 segundos (JOB_TIMEOUT_MS)

3. order.queue.js: enqueueAndWait()
   → Queue.add('create', data, { jobId: idempotencyKey })
   → job.waitUntilFinished(queueEvents, 30000)
   → Se result.ok === false → lança AppError com statusCode do worker

4. order.worker.js: processors.create()
   → service.createOrder(tenantId, { ...payload, initialStatus: 'confirmed', idempotencyKey })

5. orders.service.js: createOrder()
   Camada 1 (fast path idempotência):
     SELECT id FROM orders WHERE idempotency_key = $1 AND tenant_id = $2
     → Se existe: retorna o pedido existente imediatamente

   BEGIN TRANSACTION
   a. Carrega produtos em batch:
      SELECT id,name,sale_type,sale_price,stock_qty,active,cost_price
      FROM products WHERE id = ANY($1) AND tenant_id = $2
   b. Para cada item: valida ativo, calcula lineTotal (+ addons)
   c. Desconta estoque (atômico):
      Product.deductStock() →
        UPDATE products SET stock_qty = GREATEST(0, stock_qty - $qty)
        WHERE id = $1 AND tenant_id = $2 AND stock_qty >= $qty
        → Se stock_qty < qty: AppError "Estoque insuficiente"
   d. Order.nextOrderNumber():
      INSERT INTO order_counters ... ON CONFLICT DO UPDATE SET last_number = last_number + 1
      RETURNING last_number
   e. Order.createOrder(): INSERT INTO orders (20 colunas)
   f. Para cada item: Order.createItem() → INSERT INTO order_items (unit_cost + total_cost snapshots)
   g. Para cada addon: INSERT INTO order_item_addons
   h. Para cada item: Product.createMovement() → INSERT INTO stock_movements (type='out', qty=-N)
   COMMIT

   Fire-and-forget (sem propagar erros):
   - Tenant.incrementOrderCount() — contador mensal
   - insumosSvc.deductForOrder() — deduz ingredientes (ficha técnica)
   - applyManualOrderCashback() — calcula e credita cashback
   - Verificação de estoque baixo + waNotify.sendStockAlert()

   Camada 2 (race condition idempotência):
   Se COMMIT falha com código 23505 (UNIQUE violation em idempotency_key):
     → Busca o pedido criado pela requisição concorrente e retorna

6. order.worker.js: applySideEffects()
   → orderCache.upsertOrder(tenantId, order) — atualiza hash Redis
   → eventService.orderCreated(tenantId, order)
     → socket.io emite 'order:created' para room 'tenant:{tenantId}'

7. Resposta: 201 { success: true, data: order }
```

### 5.2 Máquina de estados de pedidos

Definida em `src/models/Order.js`:

```
STATUS_TRANSITIONS = {
  pending:    → ['confirmed', 'preparing', 'cancelled']
  confirmed:  → ['preparing', 'cancelled']
  preparing:  → ['ready', 'cancelled']
  ready:      → ['preparing', 'delivered', 'delivering', 'cancelled']
  delivering: → ['delivered', 'cancelled']
  delivered:  → []  (terminal)
  cancelled:  → []  (terminal)
}
```

**Validação**: `Order.updateStatus()` verifica o status atual no banco ANTES de aplicar. Mesmo status → idempotente (retorna sem alterar). Transição inválida → AppError 400.

**Bloqueio especial**: transição para `delivered` é bloqueada se `payment_method = 'pending'` e `paid_at IS NULL`.

**O que acontece em cada transição**:

| Transição | Efeito colateral |
|---|---|
| `pending → confirmed` (via BullMQ) | `insumosSvc.deductForOrder()` fire-and-forget |
| `ready` (delivery) | `eventService.newDeliveryAvailable()` — notifica motoristas |
| `→ delivered` | `ratingSvc.createRatingRequest()` → link enviado via WhatsApp |
| `→ cancelled` | Via BullMQ: devolve estoque (addStock + movimento 'in') |

### 5.3 Fluxo Financeiro

**Receitas**:
1. Pedido chega com status `ready` ou `delivered`
2. `/api/financeiro/summary` calcula `SUM(total)` WHERE `status IN ('ready','delivered')`
3. No fechamento de caixa: `SUM(total)` de pedidos desde `opened_at` → grava em `cash_registers.total_revenue`
4. Ao fechar caixa: `INSERT INTO banco_transactions (type='credit', source='caixa')` com o total de receita

**Despesas**:
1. CRUD em `expenses` com due_date e status `pending`/`paid`/`overdue`
2. `PATCH /expenses/:id/pay`: transação que marca `status='paid'` E insere `banco_transactions (type='debit', source='expense')`
3. Suporte a parcelamento: loop de N parcelas com `due_date + N meses`
4. Recorrência: campo `recurrence` ('monthly'/'yearly')

**Banco Virtual** (`banco_transactions`):
- Saldo = SUM(credits) - SUM(debits)
- Entradas automáticas: fechamento de caixa (`source='caixa'`)
- Saídas automáticas: pagamento de despesa (`source='expense'`)
- Lançamentos manuais (`source='manual'`): únicos que podem ser deletados pelo usuário
- Transações de `source='caixa'` ou `source='expense'` são protegidas contra deleção manual

**Fechamento de caixa**:
1. Busca pedidos `status IN ('ready', 'delivered')` desde `opened_at`
2. Calcula totais por forma de pagamento (cash, pix, credit, debit, voucher, other)
3. Operador informa contagem física: `cashCounted`, `cardCounted`, `pixCounted`
4. `discrepancy = totalCounted - total_revenue` (positivo = sobra, negativo = falta)
5. `closing_balance = opening_balance + cashCounted` (apenas dinheiro em caixa)
6. UPDATE cash_registers com tudo + credita banco virtual

**CMV**:
- Calculado no momento da criação do item: `unit_cost = product.cost_price` (snapshot)
- `total_cost = unit_cost * qty` (snapshot por item)
- Queries financeiras somam `order_items.total_cost` — imune a mudanças futuras de preço de custo
- `gross_profit = revenue - total_cmv`, `gross_margin_pct = gross_profit / revenue * 100`

**Timezone**: Constante `TZ = 'America/Sao_Paulo'` em `src/utils/financeDate.js`. Todas as queries usam `(created_at AT TIME ZONE $TZ)::date` para garantir "hoje" em horário de Brasília independente do fuso do servidor.

### 5.4 Delivery e Geocoding

**Tipos de entrega suportados**:
- `pickup` — retirada no local
- `delivery` — entrega em domicílio

**Zonas de entrega** (`delivery_zones JSONB` + `delivery_zone_type` no tenant):
- `delivery_zone_type = 'named'`: tabela `delivery_fees` com bairros e taxa fixa
- `delivery_zone_type = 'polygon'`: zonas geométricas armazenadas em JSONB (polígonos de coordenadas)

**Geocoding**: Coordenadas do endereço de entrega gravadas em `orders.delivery_lat/delivery_lng DECIMAL(10,7)`. Provider primário: Photon (komoot); fallback: Nominatim (OpenStreetMap). Adresos rurais/genéricos são detectados via flag `isGeneric`. Fallback de centro de mapa: Porto Alegre, RS (`[-51.2177, -30.0346]`).

**Motoristas**:
- `drivers` são entidades globais (não por tenant) com login próprio
- Vinculados por `driver_tenant_connections` (token de 6 chars no tenant)
- Tracking: `drivers.current_lat/lng` atualizados em tempo real; socket emite `driver:location` para room `tenant:{tenantId}`
- Notificação quando pedido fica `ready + delivery_type='delivery'`: `eventService.newDeliveryAvailable()` emite `delivery:new` para cada motorista conectado ao tenant

### 5.5 Cashback e Fidelidade

**Configuração por tenant**: `cashback_enabled BOOLEAN`, `cashback_rate DECIMAL(5,2)` (%), `cashback_min_order DECIMAL(10,2)`

**Cálculo**:
```
total = parseFloat(orderTotal)
minOrder = parseFloat(config.cashback_min_order ?? 10)
earned = total >= minOrder
  ? Math.round((total * cashback_rate / 100) * 100) / 100
  : 0
used = Math.min(cashbackUsed, loyalty.cashback_balance)
```

**⚠️ Quando é creditado**: Imediatamente após criação do pedido (fire-and-forget). Não aguarda entrega. Se o pedido for cancelado, o cashback NÃO é revertido automaticamente (bug conhecido — ver Seção 8).

**CRM**: `GET /api/orders/customers/funnel` segmenta clientes em: lead, vip (≥6 pedidos, últimos 30d), recorrente (≥2 pedidos, 30d), novo (1 pedido, 30d), em_risco (último pedido 31-60d), perdido (+60d)

### 5.6 AI Center

**Detecção de intent** (regex puro, sem LLM):
```
campaign_dispatch → /dispar|envi.*campanha|lança.*campanha/
recovery          → /clientes?.*inativ|recuper.*client/
report_send       → /envi.*relat.*whatsapp|manda.*relat/
marketing         → /marketing|promoç|instagram|copy/
financial         → /financ|gasto|despesa|lucro|caixa/
manager           → /análise|relatório|venda|semana|mês/
chat              → fallback
```

**Roteamento**:
- Intents de ANÁLISE (marketing, financial, manager, chat) → VPS2 AI Engine (Ollama/LLM)
- Intents de EXECUÇÃO (campaign_dispatch, recovery, report_send) → VPS2 gera copy → n8n executa

**OCR de notas fiscais**:
1. Imagem enviada como base64 para `/api/v1/ocr/invoice/sync` (VPS2)
2. Ollama Vision extrai: fornecedor, CNPJ, data, total, itens (nome, qty, unidade, preço)
3. Resultado gravado em `pending_receipts` com status `awaiting_confirmation`
4. Usuário confirma no painel → vira expense + atualiza estoque

### 5.7 Multi-tenancy

**Implementação**: `tenant_id` em todas as tabelas de dados. Extraído do JWT no middleware `authenticate` → `req.user.tenantId`.

**Isolamento**: Toda query inclui `WHERE tenant_id = $1`. Não há RLS (Row-Level Security) no PostgreSQL — a segurança é inteiramente na camada de aplicação.

**Pontos críticos de vazamento**:
- `delivery_fees`: tabela GLOBAL sem `tenant_id` — todos os tenants compartilham a mesma tabela de taxas
- `ai_agents`: tabela global (seed de 5 agentes compartilhados)
- `drivers`: entidade global — motoristas podem estar conectados a múltiplos tenants

---

## 6. AUTENTICAÇÃO E AUTORIZAÇÃO

### Mecanismo JWT

**Access token**: payload `{ sub: userId, tenantId, role }`, expira em 8h

**Refresh token**: hash armazenado em `refresh_tokens`; rotação a cada uso; expira em 7d

**Auto-refresh no frontend** (`axios.js`): interceptor de resposta para 401 com fila de requests bloqueadas durante refresh; falha no refresh → logout + evento `auth:logout`

### Roles e permissões

| Role | Acesso |
|---|---|
| owner | Tudo |
| manager | Tudo exceto admin/billing exclusivos de owner |
| staff | Operação (pedidos, estoque, produtos), clientes |
| caixa | Financeiro, clientes, fiado |
| garcom | Operação, reservas |
| cozinha | KDS |

**⚠️ Nota**: `caixa`, `garcom` e `cozinha` aparecem no frontend mas não estão nos roles definidos no schema do banco. Potencial inconsistência.

---

## 7. REAL-TIME (Socket.io)

### Rooms por tenant
- `tenant:{tenantId}` — todos os usuários autenticados do tenant
- `driver:{driverId}` — motorista específico (para `delivery:new`)

### Eventos emitidos

| Evento | Quem emite | Payload |
|---|---|---|
| `order:created` | Worker após criar pedido | `buildOrderPayload(order)` |
| `order:updated` | Controller/worker após mudança de status | `buildOrderPayload(order)` |
| `order:deleted` | Hard delete (raro) | `{ id, timestamp }` |
| `delivery:new` | `updateStatus` quando `status='ready'` + delivery | `buildOrderPayload(order)` para cada driver |
| `driver:location` | App Driver ao atualizar posição | `{ driverId, lat, lng, timestamp }` |
| `insumo:low_stock` | `adjustStock` e `deductForOrder` | dados do insumo |

### useOrders hook (`src/hooks/useOrders.js`)
- Estado: array `orders[]` em memória
- Carga inicial: `fetchToday()` — GET pedidos do dia (limit 500)
- Polling de fallback: a cada 15s quando socket desconectado
- Atualização otimista: mudança de status aplicada localmente antes da confirmação API; rollback em caso de erro
- Guard duplo-clique: `pendingStatusRef` impede requests simultâneos para o mesmo pedido

---

## 8. PROBLEMAS E RISCOS IDENTIFICADOS

### 🔴 ALTO — Race condition: Cashback duplo
- **Arquivo**: `orders.service.js` + `public.controller.js`
- **Descrição**: Cashback calculado em dois lugares diferentes. Se ambos executarem para o mesmo pedido, saldo pode ser creditado duas vezes.
- **Solução**: Usar UPDATE com verificação de `cashback_earned > 0` antes de creditar.

### 🔴 ALTO — Cashback creditado antes da entrega
- **Arquivo**: `orders.service.js`
- **Descrição**: Cashback é creditado no momento da criação, não da entrega. Se o pedido for cancelado, o cashback já foi creditado e não há rollback automático.
- **Solução**: Mover o crédito para o evento `delivered`, ou implementar rollback no cancelamento.

### 🔴 ALTO — `delivery_fees` sem tenant_id
- **Arquivo**: `schema.sql`
- **Descrição**: Tabela global — bairros são UNIQUE globalmente. Tenants de cidades diferentes sobrescreverão as taxas uns dos outros.
- **Solução**: Adicionar `tenant_id` à tabela e mudar UNIQUE para `(tenant_id, neighborhood)`.

### 🔴 ALTO — Redis sem redundância
- **Arquivo**: `order.queue.js`
- **Descrição**: Conexão Redis simples. Em caso de falha do Redis, toda a fila de criação de pedidos cai.
- **Solução**: Redis Sentinel ou Cluster.

### 🟡 MÉDIO — Inconsistência no Trial (10 vs 14 dias)
- **Arquivo**: `plans.js` vs `schema.sql`
- **Solução**: Alinhar a constante para 14 dias e padronizar.

### 🟡 MÉDIO — Roles indefinidos no schema
- **Arquivo**: `schema.sql` vs `Sidebar.jsx`
- **Descrição**: Banco define `owner | manager | staff` mas frontend usa `caixa`, `garcom`, `cozinha`.
- **Solução**: Definir formalmente os roles no schema e no middleware.

### 🟡 MÉDIO — Insumos com saldo negativo silencioso
- **Arquivo**: `insumos.service.js` — `deductForOrder` usa `GREATEST(0, qty_in_stock - N)` sem verificar disponibilidade.
- **Solução**: Verificar disponibilidade antes de deduzir, alertar quando negativo.

### 🟡 MÉDIO — Timeout de 30s na criação de pedido
- **Arquivo**: `order.queue.js` — `JOB_TIMEOUT_MS = 30_000`
- **Descrição**: Em pico de movimento, o worker pode demorar mais que 30s, resultando em 504 ao cliente.
- **Solução**: Aumentar timeout ou implementar polling de status do job.

### 🟢 BAIXO — `VITE_API_URL` hardcoded default
- **Arquivo**: `axios.js`
- **Descrição**: Fallback para `http://localhost:3000` em produção causa erros silenciosos.

---

## 9. PITCH PARA INVESTIDORES

### TAM do mercado

O Brasil tem ~1,3 milhão de estabelecimentos de alimentação fora do lar (ABRASEL, 2023). Com ticket médio de R$ 200/mês, o mercado endereçável supera R$ 3 bilhões anuais apenas no segmento de gestão operacional.

### Diferenciais técnicos

1. **Stack integrado end-to-end**: pedido → estoque → insumos → caixa → banco virtual → DRE, em uma única plataforma
2. **CMV por item com snapshot**: custo real no momento da venda — raramente oferecido neste segmento
3. **AI operacional**: OCR de NF, detecção de clientes inativos, geração de campanhas, análise gerencial
4. **WhatsApp nativo**: canal mais usado pelo consumidor brasileiro — não é add-on, é arquitetura central
5. **Produção diária com lotes**: funcionalidade de ERP gastronômico em SaaS acessível

### Moat competitivo

- **Dados financeiros históricos**: quanto mais tempo o restaurante usa, mais difícil é migrar
- **Network de motoristas**: marketplace emergente via `driver_tenant_connections`
- **Integração WhatsApp**: custo de troca alto para clientes que migraram o atendimento para o chatbot
- **AI que aprende o restaurante**: histórico de chat + contexto operacional enriquecido por padrões de venda

### Métricas já coletadas pelo sistema

- `orders_count_monthly` por tenant — base para billing por uso
- CMV por produto (snapshot) — margem real por SKU
- Heatmap de vendas por hora
- Segmentação CRM: lead/novo/recorrente/vip/em_risco/perdido
- `waste_logs` com custo: perda operacional monetizada

---

## 10. ROADMAP TÉCNICO

### Curto prazo (0-3 meses) — Estabilização

1. **Corrigir cashback duplo e rollback no cancelamento**
2. **Adicionar `tenant_id` à `delivery_fees`**: migração com backfill
3. **Alinhar roles** (`caixa`, `garcom`, `cozinha`) no schema e middleware
4. **Resolver discrepância do trial** (10 vs 14 dias)
5. **Redis Sentinel**: eliminar single point of failure da fila
6. **Precificador de produtos**: calculadora de preço de venda baseado em CMV + margem desejada

### Médio prazo (3-9 meses) — Crescimento

1. **Cardápio digital v2**: variações de produto, promoções automáticas ativas no menu
2. **Receitas compostas**: insumo que é resultado de outro preparo (ex: "molho especial" usado em marmitas)
3. **Relatórios exportáveis**: PDF/Excel do DRE, extrato do banco virtual, relatório de CMV
4. **PIX automático**: webhook OpenPix → marcar pedido como pago automaticamente
5. **NFC-e em produção**: completar integração fiscal
6. **Marketplace de motoristas**: ampliar `driver_tenant_connections`

### Longo prazo (9-24 meses) — Escala

1. **PostgreSQL RLS**: Row-Level Security para reforçar isolamento multi-tenant
2. **AI anomaly detection**: detecção de spikes anormais de consumo de insumos
3. **Multi-região**: suporte a franquias com múltiplas filiais em cidades diferentes
4. **BI embarcado**: dashboard analítico com dados históricos
5. **API pública documentada**: SDK, webhooks e portal de developer (plano Premium)
6. **Marketplace financeiro**: antecipação de recebíveis ou crédito PJ com base nos dados de CMV e faturamento

---

## 11. SETUP LOCAL

### Pré-requisitos
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- (Opcional) Ollama rodando em VPS2

### 1. Clonar e instalar

```bash
git clone <repo>
cd saas-backend && npm install
cd ../saas-frontend && npm install
```

### 2. Banco de dados

```bash
createdb saas_restaurant
psql -d saas_restaurant -f src/database/schema.sql
```

### 3. Variáveis de ambiente

```bash
# saas-backend/.env
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=saas_restaurant
DB_USER=postgres
DB_PASSWORD=sua_senha
REDIS_URL=redis://localhost:6379
JWT_SECRET=seu_jwt_secret_muito_seguro
JWT_REFRESH_SECRET=seu_refresh_secret_muito_seguro
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGINS=http://localhost:5173
VPS2_URL=http://localhost:3001
AI_ENGINE_KEY=chave_ai_engine
INTERNAL_KEY=chave_interna_vps2
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=sua_chave_evolution
N8N_URL=http://localhost:5678
N8N_API_KEY=sua_chave_n8n

# saas-frontend/.env
VITE_API_URL=http://localhost:3000
```

### 4. Iniciar

```bash
# Backend (dentro de Docker no VPS)
cd saas-backend && npm start

# Frontend
cd saas-frontend && npm run dev
```

### Deploy para VPS (Docker)

```bash
# Build frontend
cd saas-frontend && npm run build

# Copiar arquivos para VPS e injetar no container
scp -r dist/ user@servidor:/tmp/
ssh user@servidor "docker cp /tmp/dist/ container_name:/app/saas-frontend/dist"
ssh user@servidor "docker restart container_name"
```

---

*Documentação gerada via engenharia reversa em 2026-05-28. Reflete o estado atual do código-fonte.*
