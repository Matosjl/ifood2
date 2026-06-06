-- ============================================================
-- SaaS Restaurant — Schema PostgreSQL
-- Execute: psql -d saas_restaurant -f src/database/schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── TENANTS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id                   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                 VARCHAR(200) NOT NULL,
  slug                 VARCHAR(100) NOT NULL UNIQUE,
  plan                 VARCHAR(50)  NOT NULL DEFAULT 'basic',
  -- plan: 'basic' | 'pro' | 'premium'
  active               BOOLEAN      NOT NULL DEFAULT true,

  -- ── Assinatura / SaaS ────────────────────────────────────
  subscription_status  VARCHAR(20)  NOT NULL DEFAULT 'active',
  -- subscription_status: 'active' | 'suspended' | 'cancelled' | 'trialing'
  trial_ends_at        TIMESTAMPTZ,            -- fim do trial total (10 dias)
  premium_trial_ends_at TIMESTAMPTZ,           -- fim do periodo Premium (3 dias)
  next_billing_date    TIMESTAMPTZ,
  stripe_customer_id   VARCHAR(255),           -- para integracao futura com Stripe
  payment_provider     VARCHAR(50),            -- 'stripe' | 'mercadopago'

  -- ── Contador mensal de pedidos ────────────────────────────
  orders_count_monthly  INTEGER      NOT NULL DEFAULT 0,
  billing_period_start  TIMESTAMPTZ  NOT NULL DEFAULT date_trunc('month', NOW()),
  -- reset lazy: plan.middleware verifica e zera quando mes vira

  -- ── Chatbot WhatsApp ──────────────────────────────────────
  chatbot_enabled      BOOLEAN      NOT NULL DEFAULT true,

  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Idempotent migration: add chatbot_enabled if not exists
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS chatbot_enabled BOOLEAN NOT NULL DEFAULT true;

-- ── USERS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(200) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'staff',
  -- Roles: owner | manager | staff
  active        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

-- ── REFRESH TOKENS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CATEGORIES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

-- ── PRODUCTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id     UUID           REFERENCES categories(id) ON DELETE SET NULL,
  name            VARCHAR(200)   NOT NULL,
  description     TEXT,
  sale_type       VARCHAR(10)    NOT NULL DEFAULT 'unit',
  -- sale_type: 'unit' | 'kg'
  cost_price      DECIMAL(10,2)  NOT NULL DEFAULT 0,
  sale_price      DECIMAL(10,2)  NOT NULL DEFAULT 0,
  stock_qty       DECIMAL(10,3)  NOT NULL DEFAULT 0,
  alert_threshold DECIMAL(10,3)  NOT NULL DEFAULT 0,
  active          BOOLEAN        NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ── ORDER COUNTERS (sequential numbering per tenant) ──────────
CREATE TABLE IF NOT EXISTS order_counters (
  tenant_id   UUID    PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  last_number INTEGER NOT NULL DEFAULT 0
);

-- ── ORDERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_number     INTEGER       NOT NULL,
  customer_name    VARCHAR(200),
  customer_phone   VARCHAR(50),
  customer_address TEXT,
  channel          VARCHAR(20)   NOT NULL DEFAULT 'manual',
  -- channel: 'manual' | 'whatsapp'
  status           VARCHAR(20)   NOT NULL DEFAULT 'pending',
  -- status: pending | confirmed | preparing | ready | delivered | cancelled
  total            DECIMAL(10,2) NOT NULL DEFAULT 0,
  notes            TEXT,
  idempotency_key  VARCHAR(255),            -- deduplicacao de pedidos (UNIQUE por tenant — ver idx abaixo)
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, order_number)
);

-- ── ORDER ITEMS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id     UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   UUID          REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(200)  NOT NULL,  -- snapshot no momento do pedido
  quantity     INTEGER       NOT NULL DEFAULT 1,
  weight_kg    DECIMAL(10,3),           -- preenchido se sale_type = 'kg'
  unit_price   DECIMAL(10,2) NOT NULL,
  total        DECIMAL(10,2) NOT NULL,
  notes        TEXT
);

-- ── STOCK MOVEMENTS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id   UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name VARCHAR(200)  NOT NULL,
  quantity     DECIMAL(10,3) NOT NULL,  -- positivo = entrada, negativo = saída
  type         VARCHAR(20)   NOT NULL,
  -- type: 'in' | 'out' | 'replenishment' | 'adjustment'
  reason       VARCHAR(300),
  order_id     UUID          REFERENCES orders(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── ÍNDICES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_tenant      ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);
CREATE INDEX IF NOT EXISTS idx_products_tenant   ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_name     ON products(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements   ON stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens    ON refresh_tokens(user_id, expires_at);
-- B3: idempotency_key única por TENANT (não global) — permite mesmo key em tenants diferentes
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_idem_per_tenant
  ON orders(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── MIGRACOES INCREMENTAIS (safe para DBs existentes) ─────────
-- B3: Sprint 0B — idempotency_key por tenant (não global)
-- Detecção de conflitos antes de aplicar (deve retornar 0 linhas):
--   SELECT idempotency_key, COUNT(DISTINCT tenant_id) FROM orders
--   WHERE idempotency_key IS NOT NULL GROUP BY idempotency_key
--   HAVING COUNT(DISTINCT tenant_id) > 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
-- Remove constraint global se existir (seguro: IF EXISTS)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_idempotency_key_key;
-- Índice único por tenant substitui a constraint global
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_idem_per_tenant
  ON orders(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status  VARCHAR(20)  NOT NULL DEFAULT 'active';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS next_billing_date    TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id   VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_provider     VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS orders_count_monthly INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_period_start TIMESTAMPTZ  NOT NULL DEFAULT date_trunc('month', NOW());

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_type    VARCHAR(20)  NOT NULL DEFAULT 'pickup';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method  VARCHAR(30)  NOT NULL DEFAULT 'cash';

ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS featured  BOOLEAN NOT NULL DEFAULT false;

-- Rastreabilidade da origem do cost_price
-- manual:       dono digitou diretamente
-- precificador: calculado via ficha técnica + overhead (SET pelo /precificador/apply)
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price_source VARCHAR(30) NOT NULL DEFAULT 'manual';

-- ── COMBOS ─────────────────────────────────────────────────────
-- Produto do tipo combo agrupa produtos filhos e os vende como um item único.
-- O estoque e o CMV são calculados pelos filhos, não pelo combo em si.
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_combo  BOOLEAN     NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode   VARCHAR(60)          DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode ON products(tenant_id, barcode) WHERE barcode IS NOT NULL;

-- Itens que compõem cada combo
CREATE TABLE IF NOT EXISTS product_combos (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  combo_product_id UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  child_product_id UUID          NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty              DECIMAL(10,3) NOT NULL DEFAULT 1
    CONSTRAINT product_combos_qty_positive CHECK (qty > 0),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- Um produto filho só pode aparecer uma vez por combo
  UNIQUE(combo_product_id, child_product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_combos_combo ON product_combos(combo_product_id);
CREATE INDEX IF NOT EXISTS idx_product_combos_child ON product_combos(child_product_id);
CREATE INDEX IF NOT EXISTS idx_product_combos_tenant ON product_combos(tenant_id);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_number   VARCHAR(30);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_instance VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address           TEXT;

-- ── EXPENSES (gastos mensais) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                VARCHAR(200)  NOT NULL,
  supplier            VARCHAR(200),
  category            VARCHAR(50)   NOT NULL DEFAULT 'other',
  -- category: 'rent'|'utilities'|'food_supplier'|'staff'|'marketing'|'tax'|'maintenance'|'other'
  amount              DECIMAL(10,2) NOT NULL,
  payment_method      VARCHAR(30)   NOT NULL DEFAULT 'pix',
  -- payment_method: 'cash'|'pix'|'credit'|'debit'|'boleto'|'transfer'
  is_installment      BOOLEAN       NOT NULL DEFAULT false,
  installment_total   INTEGER,        -- total de parcelas
  installment_current INTEGER,        -- parcela atual (1..N)
  due_date            DATE          NOT NULL,
  paid_at             TIMESTAMPTZ,
  status              VARCHAR(20)   NOT NULL DEFAULT 'pending',
  -- status: 'pending'|'paid'|'overdue'
  notes               TEXT,
  recurrence          VARCHAR(20),    -- null | 'monthly' | 'yearly'
  parent_id           UUID          REFERENCES expenses(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant   ON expenses(tenant_id, due_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_status   ON expenses(tenant_id, status);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT false;

-- ── CASH REGISTERS (caixa) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_registers (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opened_by       UUID          REFERENCES users(id) ON DELETE SET NULL,
  closed_by       UUID          REFERENCES users(id) ON DELETE SET NULL,
  opening_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  closing_balance DECIMAL(10,2),
  total_revenue   DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_orders    INTEGER       NOT NULL DEFAULT 0,
  payment_summary JSONB,        -- { cash: X, pix: Y, credit: Z, ... }
  status          VARCHAR(20)   NOT NULL DEFAULT 'open',
  -- 'open' | 'closed'
  opened_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_cash_registers_tenant ON cash_registers(tenant_id, opened_at DESC);

-- ── BANCO VIRTUAL (caixa financeiro) ──────────────────────────
-- Controla saldo acumulado de entradas (fechamentos de caixa)
-- e saídas (gastos pagos, retiradas manuais)
CREATE TABLE IF NOT EXISTS banco_transactions (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type         VARCHAR(10)   NOT NULL CHECK (type IN ('credit', 'debit')),
  amount       DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  description  VARCHAR(300),
  source       VARCHAR(30)   NOT NULL DEFAULT 'manual',
  -- source: 'caixa' | 'expense' | 'manual'
  reference_id UUID,         -- caixa_id ou expense_id
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_banco_tenant ON banco_transactions(tenant_id, created_at DESC);

-- Colunas extras no fechamento de caixa (contagem física)
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS cash_counted  DECIMAL(10,2);
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS card_counted  DECIMAL(10,2);
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS pix_counted   DECIMAL(10,2);
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS discrepancy   DECIMAL(10,2);

-- Sprint 0A — C2: só 1 caixa aberto por tenant (elimina race condition)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_registers_open_tenant
  ON cash_registers(tenant_id)
  WHERE status = 'open';

-- Sprint 0A — M2: só 1 banco_transaction por fechamento de caixa
CREATE UNIQUE INDEX IF NOT EXISTS uq_banco_caixa_reference
  ON banco_transactions(reference_id)
  WHERE source = 'caixa' AND reference_id IS NOT NULL;

-- Trial de 14 dias no tenant
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
-- Preenche trial para tenants existentes que ainda estão ativos (retroativo)
UPDATE tenants
SET trial_ends_at = created_at + INTERVAL '14 days'
WHERE trial_ends_at IS NULL
  AND subscription_status IN ('active', 'trialing');

-- ── FIADO ─────────────────────────────────────────────────────
-- Clientes que compram fiado
CREATE TABLE IF NOT EXISTS fiado_clientes (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(200) NOT NULL,
  phone        VARCHAR(30),
  address      TEXT,
  dia_acerto   INTEGER,          -- dia do mês combinado para pagamento
  bloqueado    BOOLEAN      NOT NULL DEFAULT false,
  notes        TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fiado_clientes_tenant ON fiado_clientes(tenant_id, name);

-- Compras fiadas (vinculadas a pedidos)
CREATE TABLE IF NOT EXISTS fiado_compras (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id    UUID          NOT NULL REFERENCES fiado_clientes(id) ON DELETE CASCADE,
  order_id      UUID          REFERENCES orders(id) ON DELETE SET NULL,
  descricao     VARCHAR(300)  NOT NULL DEFAULT 'Compra fiada',
  valor         DECIMAL(10,2) NOT NULL,
  status        VARCHAR(20)   NOT NULL DEFAULT 'pendente',
  -- status: 'pendente' | 'pago' | 'cancelado'
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fiado_compras_cliente ON fiado_compras(tenant_id, cliente_id, status);
CREATE INDEX IF NOT EXISTS idx_fiado_compras_order   ON fiado_compras(order_id);

-- Adiciona payment_method 'fiado' aos pedidos (já existe a coluna, só documenta)
-- payment_method aceita: 'cash'|'pix'|'credit'|'debit'|'fiado'|'pending'

-- ── Pagamento ─────────────────────────────────────────────────
-- paid_at: NULL = não pago ainda; preenchido = data/hora em que o pagamento foi registrado
-- Obrigatório ter paid_at preenchido para transição → delivered quando payment_method='pending'
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- ── Taxa de entrega e bairro ─────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee  DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS neighborhood  VARCHAR(100);

-- ── Tabela de taxas por bairro ────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_fees (
  id           SERIAL       PRIMARY KEY,
  neighborhood VARCHAR(100) NOT NULL UNIQUE,
  fee          DECIMAL(10,2) NOT NULL,
  active       BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Insere/atualiza taxas
INSERT INTO delivery_fees (neighborhood, fee) VALUES
  ('Itapeva',             6.00),
  ('Itapeva Norte',       6.00),
  ('Tupinambá',           8.00),
  ('Praia Gaúcha',        8.00),
  ('Praia Yara',          8.00),
  ('Praia Recreio',      10.00),
  ('Praia Santa Helena', 10.00),
  ('Praia Estrela',      10.00),
  ('Praia Real',         10.00),
  ('Praia Paraíso',      15.00),
  ('São Brás',           15.00),
  ('Campo Bonito',       17.00),
  ('Torres',             20.00)
ON CONFLICT (neighborhood) DO UPDATE SET fee = EXCLUDED.fee, updated_at = NOW();

-- ── Migração: colunas de contagem física no fechamento de caixa ──
-- (idempotente — ADD COLUMN IF NOT EXISTS é seguro re-executar)
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS cash_counted  DECIMAL(10,2);
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS card_counted  DECIMAL(10,2);
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS pix_counted   DECIMAL(10,2);
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS discrepancy   DECIMAL(10,2);

-- ── Migração: tabelas de fiado ───────────────────────────────────
CREATE TABLE IF NOT EXISTS fiado_clientes (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(200)  NOT NULL,
  phone       VARCHAR(30),
  address     TEXT,
  dia_acerto  INT,
  bloqueado   BOOLEAN       NOT NULL DEFAULT FALSE,
  notes       TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS fiado_compras (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id  UUID          NOT NULL REFERENCES fiado_clientes(id) ON DELETE CASCADE,
  order_id    UUID          REFERENCES orders(id) ON DELETE SET NULL,
  descricao   VARCHAR(300)  NOT NULL DEFAULT 'Compra fiada',
  valor       DECIMAL(10,2) NOT NULL,
  status      VARCHAR(20)   NOT NULL DEFAULT 'pendente',
  paid_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fiado_clientes_tenant2 ON fiado_clientes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fiado_compras_cliente2 ON fiado_compras(cliente_id);
CREATE INDEX IF NOT EXISTS idx_fiado_compras_tenant2  ON fiado_compras(tenant_id);

-- ── Motoboy / Driver ─────────────────────────────────────────────

-- Token de conexão por restaurante (6 chars maiúsculo, ex: "AB12CD")
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS driver_token VARCHAR(10) DEFAULT upper(substr(md5(random()::text), 1, 6));

CREATE TABLE IF NOT EXISTS drivers (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(200)  NOT NULL,
  phone         VARCHAR(30),
  email         VARCHAR(200)  UNIQUE NOT NULL,
  password_hash VARCHAR(200)  NOT NULL,
  status        VARCHAR(20)   NOT NULL DEFAULT 'offline',
  current_lat   DECIMAL(10,8),
  current_lng   DECIMAL(11,8),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_tenant_connections (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id    UUID        NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(driver_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS deliveries (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id     UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id    UUID          REFERENCES drivers(id),
  tenant_id    UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status       VARCHAR(20)   NOT NULL DEFAULT 'pending',
  driver_fee   DECIMAL(10,2) DEFAULT 0,
  accepted_at  TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  -- sem UNIQUE(order_id) aqui — usamos índice parcial abaixo para permitir
  -- re-atribuição após cancelamento
);

CREATE INDEX IF NOT EXISTS idx_drivers_email          ON drivers(email);
CREATE INDEX IF NOT EXISTS idx_dtc_driver             ON driver_tenant_connections(driver_id);
CREATE INDEX IF NOT EXISTS idx_dtc_tenant             ON driver_tenant_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver      ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_order       ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_tenant      ON deliveries(tenant_id);
-- Garante 1 entrega ativa por pedido, mas permite recriar após cancelamento
CREATE UNIQUE INDEX IF NOT EXISTS idx_deliveries_order_active
  ON deliveries(order_id) WHERE status != 'cancelled';

-- ── Clientes manuais (cadastro independente de pedidos) ──────────
CREATE TABLE IF NOT EXISTS tenant_clients (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  phone      TEXT,
  address    TEXT,
  coords     JSONB,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_clients_phone
  ON tenant_clients(tenant_id, lower(phone))
  WHERE phone IS NOT NULL AND phone <> '';
CREATE INDEX IF NOT EXISTS idx_tenant_clients_tenant
  ON tenant_clients(tenant_id);

-- ── COMPLEMENTOS / ADICIONAIS ─────────────────────────────────

-- Grupo de complementos (ex: "Extras de proteína", "Ingredientes do hotdog")
CREATE TABLE IF NOT EXISTS addon_groups (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  min_qty     INTEGER      NOT NULL DEFAULT 0,  -- mínimo a selecionar (0 = opcional)
  max_qty     INTEGER,                           -- máximo (NULL = sem limite)
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Itens dentro de um grupo de complementos
CREATE TABLE IF NOT EXISTS addon_items (
  id         UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id   UUID          NOT NULL REFERENCES addon_groups(id) ON DELETE CASCADE,
  tenant_id  UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       VARCHAR(150)  NOT NULL,
  price      DECIMAL(10,2) NOT NULL DEFAULT 0,
  active     BOOLEAN       NOT NULL DEFAULT true,
  sort_order INTEGER       NOT NULL DEFAULT 0
);

-- Ligação produtos <-> grupos de complementos (N:N)
CREATE TABLE IF NOT EXISTS product_addon_groups (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES addon_groups(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, group_id)
);

-- Snapshot dos complementos selecionados em um item de pedido
CREATE TABLE IF NOT EXISTS order_item_addons (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_item_id UUID          NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  addon_item_id UUID          REFERENCES addon_items(id) ON DELETE SET NULL,
  addon_name    VARCHAR(150)  NOT NULL,
  qty           INTEGER       NOT NULL DEFAULT 1,
  unit_price    DECIMAL(10,2) NOT NULL DEFAULT 0,
  total         DECIMAL(10,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_addon_groups_tenant   ON addon_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_addon_items_group     ON addon_items(group_id);
CREATE INDEX IF NOT EXISTS idx_product_addon_groups  ON product_addon_groups(product_id);
CREATE INDEX IF NOT EXISTS idx_order_item_addons     ON order_item_addons(order_item_id);

-- ── INSUMOS (controle de estoque de ingredientes) ────────────

CREATE TABLE IF NOT EXISTS insumos (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(200)  NOT NULL,
  unit          VARCHAR(20)   NOT NULL DEFAULT 'un',
  -- unit: 'g' | 'kg' | 'ml' | 'l' | 'un' | 'cx' | 'pct'
  qty_in_stock  DECIMAL(12,3) NOT NULL DEFAULT 0,
  min_qty       DECIMAL(12,3) NOT NULL DEFAULT 0,   -- alerta quando abaixo
  cost_per_unit DECIMAL(10,4) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Receita: quais insumos cada produto consome por unidade vendida
CREATE TABLE IF NOT EXISTS product_insumos (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id   UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  insumo_id    UUID          NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  tenant_id    UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  qty_per_unit DECIMAL(12,3) NOT NULL DEFAULT 1,
  UNIQUE(product_id, insumo_id)
);

CREATE INDEX IF NOT EXISTS idx_insumos_tenant       ON insumos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_insumos_prod ON product_insumos(product_id);
CREATE INDEX IF NOT EXISTS idx_product_insumos_ins  ON product_insumos(insumo_id);

-- ── FIDELIDADE / CASHBACK ────────────────────────────────────────

-- Configuração de cashback por tenant
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cashback_enabled   BOOLEAN      NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cashback_rate      DECIMAL(5,2) NOT NULL DEFAULT 5.00;
-- cashback_rate: % do total do pedido que vira crédito (ex: 5 = 5%)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cashback_min_order DECIMAL(10,2) NOT NULL DEFAULT 10.00;
-- cashback_min_order: valor mínimo do pedido para ganhar cashback

-- Clientes identificados por telefone (para fidelidade)
CREATE TABLE IF NOT EXISTS loyalty_customers (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             VARCHAR(200),
  phone            VARCHAR(50)   NOT NULL,
  cashback_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_orders     INTEGER       NOT NULL DEFAULT 0,
  total_spent      DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, phone)
);

-- Histórico de movimentações de cashback
CREATE TABLE IF NOT EXISTS cashback_transactions (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID          NOT NULL REFERENCES loyalty_customers(id) ON DELETE CASCADE,
  order_id    UUID          REFERENCES orders(id) ON DELETE SET NULL,
  type        VARCHAR(10)   NOT NULL CHECK (type IN ('earn', 'use', 'expire', 'manual')),
  amount      DECIMAL(10,2) NOT NULL,
  description VARCHAR(300),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Avaliações de pedidos (estrelas + comentário)
CREATE TABLE IF NOT EXISTS order_ratings (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id    UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id UUID        REFERENCES loyalty_customers(id) ON DELETE SET NULL,
  stars       SMALLINT    NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id)
);

-- Colunas nas orders: vínculo com cliente fidelidade + cashback
ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_customer_id UUID          REFERENCES loyalty_customers(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashback_earned     DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashback_used       DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_loyalty_customers_tenant ON loyalty_customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_customers_phone  ON loyalty_customers(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_cashback_tx_customer     ON cashback_transactions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cashback_tx_tenant       ON cashback_transactions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_ratings_tenant     ON order_ratings(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_loyalty_customer  ON orders(loyalty_customer_id) WHERE loyalty_customer_id IS NOT NULL;

-- ── TENANT SETTINGS (v2) ──────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS restaurant_lat      NUMERIC(10,7);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS restaurant_lng      NUMERIC(10,7);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS accepted_payment_methods JSONB DEFAULT '["cash","pix","credit","debit","voucher","fiado","pending","other"]'::jsonb;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS delivery_zones      JSONB DEFAULT '[]'::jsonb;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS delivery_zone_type  VARCHAR(10) DEFAULT 'named';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_hours      JSONB DEFAULT NULL;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS printer_target   VARCHAR(20) DEFAULT 'kitchen';
-- printer_target: 'kitchen' | 'bar' | 'both' | 'none'

-- ── NFC-e ─────────────────────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS nfce_config        JSONB DEFAULT NULL;
-- {apiKey, companyId, environment, defaultNcm, cfop}

ALTER TABLE orders  ADD COLUMN IF NOT EXISTS nfce_id            VARCHAR(100) DEFAULT NULL;
ALTER TABLE orders  ADD COLUMN IF NOT EXISTS nfce_status        VARCHAR(30)  DEFAULT NULL;
ALTER TABLE orders  ADD COLUMN IF NOT EXISTS nfce_key           VARCHAR(100) DEFAULT NULL;
ALTER TABLE orders  ADD COLUMN IF NOT EXISTS nfce_number        VARCHAR(20)  DEFAULT NULL;
ALTER TABLE orders  ADD COLUMN IF NOT EXISTS nfce_url           TEXT         DEFAULT NULL;
ALTER TABLE orders  ADD COLUMN IF NOT EXISTS nfce_issued_at     TIMESTAMPTZ  DEFAULT NULL;
ALTER TABLE orders  ADD COLUMN IF NOT EXISTS external_id        VARCHAR(100) DEFAULT NULL;

-- ── Integrações externas (iFood, Rappi) ───────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ifood_client_id     VARCHAR(200) DEFAULT NULL;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ifood_client_secret VARCHAR(200) DEFAULT NULL;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ifood_merchant_id   VARCHAR(100) DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_external_id ON orders(tenant_id, external_id) WHERE external_id IS NOT NULL;

-- ── VARIAÇÕES DE PRODUTO ──────────────────────────────────────
-- Grupo: ex. "Tamanho", "Sabor", "Borda"
CREATE TABLE IF NOT EXISTS product_variation_groups (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  product_id  UUID        NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  required    BOOLEAN     NOT NULL DEFAULT true,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_var_groups_product ON product_variation_groups(product_id);

-- Opção: ex. "Pequena R$20", "Média R$25", "Grande R$30"
CREATE TABLE IF NOT EXISTS product_variation_options (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    UUID         NOT NULL REFERENCES product_variation_groups(id) ON DELETE CASCADE,
  tenant_id   UUID         NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  available   BOOLEAN      NOT NULL DEFAULT true,
  sort_order  INT          NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_var_options_group ON product_variation_options(group_id);

-- ── COUPONS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code           VARCHAR(50) NOT NULL,
  description    TEXT,
  discount_type  VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(10,2) NOT NULL,
  min_order      NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_uses       INT,
  uses_count     INT         NOT NULL DEFAULT 0,
  active         BOOLEAN     NOT NULL DEFAULT true,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_coupons_tenant ON coupons(tenant_id);

-- ── RESTAURANT TABLES (mesas) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurant_tables (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number     VARCHAR(20) NOT NULL,
  name       VARCHAR(100),
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, number)
);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_tenant ON restaurant_tables(tenant_id);

-- ── ORDERS: coupon + table tracking ───────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code     VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_discount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_number    VARCHAR(20);

-- ── CAIXA MOVEMENTS (sangria / suprimento) ────────────────────
CREATE TABLE IF NOT EXISTS caixa_movements (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cash_register_id UUID        NOT NULL REFERENCES cash_registers(id) ON DELETE CASCADE,
  type             VARCHAR(20) NOT NULL CHECK (type IN ('sangria','suprimento')),
  amount           NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  reason           TEXT,
  created_by       UUID        REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_caixa_movements_register ON caixa_movements(cash_register_id);
CREATE INDEX IF NOT EXISTS idx_caixa_movements_tenant   ON caixa_movements(tenant_id);

-- ── PIX / OPENPIX ─────────────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pix_openpix_app_id VARCHAR(200) DEFAULT NULL;
ALTER TABLE orders  ADD COLUMN IF NOT EXISTS pix_charge_id      VARCHAR(200) DEFAULT NULL;
ALTER TABLE orders  ADD COLUMN IF NOT EXISTS pix_qr_code        TEXT         DEFAULT NULL;
-- pix_qr_code: base64 PNG data URI or URL from OpenPix
ALTER TABLE orders  ADD COLUMN IF NOT EXISTS pix_br_code        TEXT         DEFAULT NULL;
-- pix_br_code: copy-paste PIX code (Pix Copia e Cola)
ALTER TABLE orders  ADD COLUMN IF NOT EXISTS pix_link           TEXT         DEFAULT NULL;
ALTER TABLE orders  ADD COLUMN IF NOT EXISTS pix_paid_at        TIMESTAMPTZ  DEFAULT NULL;
-- pix_paid_at: set when OpenPix webhook confirms payment

-- ── PROMOÇÕES AUTOMÁTICAS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotions (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           VARCHAR(200) NOT NULL,
  type           VARCHAR(30)  NOT NULL,
  -- type: 'happy_hour' | 'product_discount' | 'category_discount'
  discount_type  VARCHAR(10)  NOT NULL DEFAULT 'percent',
  -- discount_type: 'percent' | 'fixed'
  discount_value NUMERIC(5,2) NOT NULL DEFAULT 10,
  conditions     JSONB        NOT NULL DEFAULT '{}',
  -- happy_hour: { days: [0-6], start_time: 'HH:MM', end_time: 'HH:MM' }
  -- product_discount: { product_ids: [...] }
  -- category_discount: { category_ids: [...] }
  active         BOOLEAN      NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promotions_tenant ON promotions(tenant_id, active);

-- ── RESERVAS DE MESA ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservations (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_name VARCHAR(200) NOT NULL,
  phone        VARCHAR(50),
  reserved_at  TIMESTAMPTZ NOT NULL,
  -- date + time of the reservation
  party_size   SMALLINT    NOT NULL DEFAULT 2,
  table_id     UUID        REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  notes        TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- status: 'pending' | 'confirmed' | 'seated' | 'cancelled' | 'no_show'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reservations_tenant ON reservations(tenant_id, reserved_at);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(tenant_id, status);

-- ── AVALIAÇÕES PÓS-PEDIDO (token de acesso público) ──────────
ALTER TABLE order_ratings ADD COLUMN IF NOT EXISTS token      VARCHAR(64)  UNIQUE;
ALTER TABLE order_ratings ADD COLUMN IF NOT EXISTS rating_url TEXT;
-- token: UUID gerado para o link público /avaliar/:token
-- rating_url: link enviado ao cliente via WhatsApp

-- ── MULTI-LOJA (filiais / pontos de venda) ────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(200) NOT NULL,
  address      TEXT,
  phone        VARCHAR(50),
  active       BOOLEAN      NOT NULL DEFAULT true,
  is_default   BOOLEAN      NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_locations_tenant ON locations(tenant_id);
-- Garante apenas 1 default por tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_default
  ON locations(tenant_id) WHERE is_default = true;

-- Permite vincular pedido a uma filial (opcional)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;

-- ── PENDING RECEIPTS (notas fiscais aguardando confirmação humana) ──
-- Pipeline: foto via WhatsApp/upload → IA extrai → grava aqui → usuário
-- confirma no WA ou na UI → vira expense + stock_movements.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS pending_receipts (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender_phone    VARCHAR(50),                          -- número que enviou (NULL se upload web)
  source          VARCHAR(20)  NOT NULL DEFAULT 'whatsapp',
  -- source: 'whatsapp' | 'upload' | 'email'
  image_url       TEXT,                                 -- URL da mídia no Evolution (se aplicável)
  image_bytes     BYTEA,                                -- backup local da imagem
  raw_extraction  JSONB        NOT NULL DEFAULT '{}',   -- saída crua da IA
  -- raw_extraction shape:
  -- { fornecedor, cnpj, data_emissao, total, itens: [{descricao, quantidade, unidade, valor_unit, valor_total}], confianca, categoria_sugerida }
  matched_items   JSONB        NOT NULL DEFAULT '[]',   -- itens casados com insumos/products
  -- matched_items shape:
  -- [{raw, match_type: 'insumo'|'product'|'none', match_id, match_name, score, action: 'auto'|'ask'|'create_new'}]
  status          VARCHAR(30)  NOT NULL DEFAULT 'awaiting_confirmation',
  -- status: 'awaiting_confirmation' | 'confirmed' | 'rejected' | 'expired' | 'extraction_failed'
  expense_id      UUID         REFERENCES expenses(id) ON DELETE SET NULL,
  short_code      VARCHAR(6),                           -- código curto pro usuário responder no WA (ex: "47B")
  expires_at      TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  confirmed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_receipts_tenant
  ON pending_receipts(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_receipts_phone
  ON pending_receipts(tenant_id, sender_phone, created_at DESC)
  WHERE sender_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pending_receipts_shortcode
  ON pending_receipts(tenant_id, short_code)
  WHERE short_code IS NOT NULL AND status = 'awaiting_confirmation';

-- Índices GIN trgm pra matcher fuzzy (similarity entre nome da nota e nome do insumo/produto)
CREATE INDEX IF NOT EXISTS idx_insumos_name_trgm
  ON insumos USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON products USING gin (name gin_trgm_ops);

-- ── OWNER WHATSAPP — número pessoal do empresário ─────────────────
-- Recebe: alertas de estoque baixo, sugestão de produto novo, pode consultar relatórios via WA.
-- Separado do whatsapp_number (número do restaurante que atende clientes).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_whatsapp VARCHAR(20);

-- ── AI CENTER CHAT — histórico de conversas do painel admin ───────
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role        VARCHAR(20)  NOT NULL DEFAULT 'user',   -- 'user' | 'assistant'
  content     TEXT         NOT NULL,
  intent      VARCHAR(50),                            -- 'manager' | 'marketing' | 'financial' | 'chat'
  metadata    JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_chat_tenant_date
  ON ai_chat_messages(tenant_id, created_at DESC);


-- ── AI TASKS (sistema de tarefas) ─────────────────────────────────
-- Cada interação no AI Center cria uma task — rastreável, auditável.
CREATE TABLE IF NOT EXISTS ai_tasks (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intent      VARCHAR(50) NOT NULL,
  input       JSONB       NOT NULL DEFAULT '{}',
  status      VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending|running|done|failed
  priority    SMALLINT    NOT NULL DEFAULT 5,           -- 1=urgent 3=high 5=normal 8=low
  agent       VARCHAR(50),
  result      JSONB,
  error       TEXT,
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_tenant ON ai_tasks(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_status  ON ai_tasks(status);

-- ── AI LOGS (observabilidade) ─────────────────────────────────────
-- Log completo de cada execução: intent detectada, agente, duração, erro.
CREATE TABLE IF NOT EXISTS ai_logs (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id       UUID        REFERENCES ai_tasks(id) ON DELETE SET NULL,
  intent        VARCHAR(50),
  agent         VARCHAR(50),
  input_preview TEXT,
  status        VARCHAR(20), -- success|error|timeout|fallback
  duration_ms   INTEGER,
  n8n_called    BOOLEAN     NOT NULL DEFAULT false,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_logs_tenant ON ai_logs(tenant_id, created_at DESC);

-- ── AI AGENTS (registro de agentes) ───────────────────────────────
CREATE TABLE IF NOT EXISTS ai_agents (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug         VARCHAR(50)  NOT NULL UNIQUE,
  name         VARCHAR(100) NOT NULL,
  description  TEXT,
  endpoint     VARCHAR(200),
  capabilities TEXT[],
  priority     SMALLINT     DEFAULT 5,
  active       BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed: 5 agentes base (idempotente)
INSERT INTO ai_agents (slug, name, description, endpoint, capabilities, priority) VALUES
  ('marketing', 'Agente Marketing',   'Gera copy, posts e campanhas WhatsApp/Instagram', '/api/v1/marketing/generate',  ARRAY['copy','instagram','whatsapp','campaign'], 5),
  ('recovery',  'Agente Recuperação', 'Identifica e reativa clientes inativos via WA',   '/api/v1/recovery',            ARRAY['inactive_customers','reactivation'],     6),
  ('manager',   'Agente Gerencial',   'Analisa KPIs, vendas e performance',              '/api/v1/manager/analyze',     ARRAY['kpis','sales','performance','report'],   4),
  ('financial', 'Agente Financeiro',  'Interpreta lançamentos, despesas e caixa',        '/api/v1/financial/interpret', ARRAY['expenses','revenue','cashflow'],          3),
  ('chat',      'Agente Chat',        'Resposta livre para perguntas do dono',           '/api/v1/chat/message',        ARRAY['general','faq','help'],                  8)
ON CONFLICT (slug) DO NOTHING;

-- ── CMV (Custo de Mercadoria Vendida) ─────────────────────────────
-- Snapshot do custo no momento da venda — permite cálculo histórico preciso
-- mesmo que cost_price do produto mude depois.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_cost  DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS total_cost DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill: atualiza itens existentes com o custo atual do produto
UPDATE order_items oi
SET unit_cost  = p.cost_price,
    total_cost = p.cost_price * COALESCE(oi.quantity, 1)
FROM products p
WHERE oi.product_id = p.id
  AND oi.unit_cost = 0
  AND p.cost_price > 0;

-- ── FINANCE LOGS (auditoria financeira) ───────────────────────────
-- Rastreia quem alterou o quê, quando, de onde.
CREATE TABLE IF NOT EXISTS finance_logs (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(50)  NOT NULL,
  -- 'expense_created' | 'expense_paid' | 'expense_deleted' | 'expense_updated'
  -- 'caixa_opened' | 'caixa_closed' | 'banco_debit' | 'banco_credit'
  table_name  VARCHAR(50)  NOT NULL,
  record_id   UUID,
  before_data JSONB,
  after_data  JSONB,
  amount      DECIMAL(10,2),
  ip          VARCHAR(45),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finance_logs_tenant ON finance_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_logs_user   ON finance_logs(user_id);

-- ── GEOCOORDENADAS DE ENTREGA ──────────────────────────────────
-- Salva lat/lng exato do pin do mapa no momento do pedido
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat DECIMAL(10,7);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng DECIMAL(10,7);

-- Percentual da taxa de entrega repassado ao motoboy (default 70%)
-- Configura por tenant em Configurações → Entrega
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS driver_fee_pct  DECIMAL(5,2) NOT NULL DEFAULT 70;
-- D3: piso mínimo de repasse ao motoboy (evita R$ 0 quando delivery_fee = 0)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS driver_min_fee  DECIMAL(10,2) NOT NULL DEFAULT 0;

-- ── IDEMPOTÊNCIA DE DEDUÇÃO DE INSUMOS ────────────────────────
-- Garante que deductForOrder nunca execute duas vezes no mesmo pedido.
-- insumos_deducted = true → dedução já realizada, ignorar nova chamada.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS insumos_deducted    BOOLEAN     NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS insumos_deducted_at TIMESTAMPTZ;

-- ── PRODUÇÃO DIÁRIA (insumos) ──────────────────────────────────
-- Fator de perda operacional por insumo (ex: 5 = 5% de descarte)
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS waste_factor DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Lote de produção: cozinheiro registra quanto preparou por turno
CREATE TABLE IF NOT EXISTS production_batches (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  insumo_id       UUID          NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  raw_quantity    DECIMAL(12,3) NOT NULL,    -- quantidade de insumo bruto consumida
  cooked_quantity DECIMAL(12,3) NOT NULL,    -- quanto rendeu preparado (ex: 10kg cru → 25kg cozido)
  remaining_qty   DECIMAL(12,3) NOT NULL,    -- saldo disponível (decrementado pelas vendas)
  produced_at     DATE          NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prod_batches_tenant_date ON production_batches(tenant_id, produced_at DESC);
CREATE INDEX IF NOT EXISTS idx_prod_batches_insumo      ON production_batches(insumo_id);

-- Validade do lote preparado (ex: molho = 3 dias, arroz cozido = 24h)
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS expires_at DATE;

-- ── PERDAS OPERACIONAIS ────────────────────────────────────────
-- Registro manual de descarte: queimado, vencido, quebrado, operacional
CREATE TABLE IF NOT EXISTS waste_logs (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  insumo_id   UUID          REFERENCES insumos(id) ON DELETE SET NULL,
  insumo_name VARCHAR(200)  NOT NULL,       -- snapshot do nome
  unit        VARCHAR(20)   NOT NULL,
  quantity    DECIMAL(12,3) NOT NULL,
  reason_type VARCHAR(30)   NOT NULL DEFAULT 'operational',
  -- reason_type: 'burned' | 'expired' | 'broken' | 'operational' | 'other'
  notes       TEXT,
  cost        DECIMAL(10,2) NOT NULL DEFAULT 0,  -- custo calculado no momento
  created_by  UUID,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_waste_logs_tenant ON waste_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waste_logs_insumo ON waste_logs(insumo_id);

-- ── MÓDULO PRODUÇÃO — LOTES MULTI-INSUMO ─────────────────────
-- Agrupa múltiplos production_batches em uma sessão de produção do dia.
-- Um lote = "a produção da manhã" (arroz + feijão + frango juntos).

CREATE TABLE IF NOT EXISTS production_lots (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date        DATE          NOT NULL DEFAULT CURRENT_DATE,
  status      VARCHAR(20)   NOT NULL DEFAULT 'open', -- open | closed
  notes       TEXT,
  total_cost  NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_by  UUID,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  closed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_production_lots_tenant_date ON production_lots(tenant_id, date DESC);

-- Vincula cada batch ao lote que o originou
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES production_lots(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_prod_batches_lot ON production_batches(lot_id);

-- ── PRECIFICADOR ──────────────────────────────────────────────
-- Overhead operacional padrão por tenant (usados como defaults no precificador)
CREATE TABLE IF NOT EXISTS pricing_overhead (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  embalagem        DECIMAL(10,4) NOT NULL DEFAULT 0,    -- R$ por unidade
  gas              DECIMAL(10,4) NOT NULL DEFAULT 0,    -- R$ por unidade
  energia          DECIMAL(10,4) NOT NULL DEFAULT 0,    -- R$ por unidade
  taxa_app         DECIMAL(5,2)  NOT NULL DEFAULT 0,    -- % sobre preço de venda
  taxa_pagamento   DECIMAL(5,2)  NOT NULL DEFAULT 0,    -- % sobre preço de venda
  mao_obra         DECIMAL(10,4) NOT NULL DEFAULT 0,    -- R$ por unidade
  margem_minima    DECIMAL(5,2)  NOT NULL DEFAULT 30,   -- % mínima de lucro
  margem_desejada  DECIMAL(5,2)  NOT NULL DEFAULT 40,   -- % ideal de lucro
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Histórico de cálculos de precificação (auditoria)
CREATE TABLE IF NOT EXISTS pricing_calculations (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id       UUID          REFERENCES products(id) ON DELETE SET NULL,
  product_name     VARCHAR(200)  NOT NULL,
  custo_insumos    DECIMAL(10,4) NOT NULL DEFAULT 0,
  custo_overhead   DECIMAL(10,4) NOT NULL DEFAULT 0,
  custo_total      DECIMAL(10,4) NOT NULL DEFAULT 0,
  preco_minimo     DECIMAL(10,2) NOT NULL DEFAULT 0,
  preco_ideal      DECIMAL(10,2) NOT NULL DEFAULT 0,
  preco_sugerido   DECIMAL(10,2) NOT NULL DEFAULT 0,
  margem_real      DECIMAL(5,2),     -- se o produto já tem preço de venda
  overhead_snapshot JSONB,           -- snapshot dos overheads usados
  created_by       UUID,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pricing_calc_tenant ON pricing_calculations(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pricing_calc_product ON pricing_calculations(product_id);

-- ── MOVIMENTAÇÕES DE INSUMOS ────────────────────────────────────
-- Audit trail de toda entrada e saída de estoque bruto.
-- Substitui o UPDATE silencioso: todo ajuste agora tem origem rastreável.
CREATE TABLE IF NOT EXISTS insumo_movements (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  insumo_id      UUID          NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  type           VARCHAR(30)   NOT NULL,
  -- type: 'adjustment' | 'purchase' | 'production' | 'sale' | 'waste' | 'inventory_count' | 'initial'
  qty            DECIMAL(12,3) NOT NULL,   -- delta real (positivo = entrada, negativo = saída)
  qty_before     DECIMAL(12,3) NOT NULL,   -- estoque antes da operação
  qty_after      DECIMAL(12,3) NOT NULL,   -- estoque depois (para reconciliação)
  reason         VARCHAR(300),             -- motivo do ajuste
  reference_id   UUID,                     -- order_id | batch_id | waste_log_id | null
  reference_type VARCHAR(50),              -- 'order' | 'batch' | 'waste_log' | 'manual'
  created_by     UUID,                     -- user_id do responsável
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insumo_mvt_tenant ON insumo_movements(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insumo_mvt_insumo ON insumo_movements(insumo_id, created_at DESC);

-- ── SPRINT ANTI-ERRO A (004) — motivo de cancelamento ──────────
ALTER TABLE orders      ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- ── SPRINT ANTI-ERRO A (005) — limite diário de sangria ────────
ALTER TABLE tenants     ADD COLUMN IF NOT EXISTS sangria_daily_limit NUMERIC DEFAULT NULL;

-- ── COMBO V2 (006) — Grupos de Escolha ─────────────────────────
CREATE TABLE IF NOT EXISTS combo_option_groups (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  combo_product_id UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  min_select       INTEGER     NOT NULL DEFAULT 1,
  max_select       INTEGER     NOT NULL DEFAULT 1,
  sort_order       INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cog_min_max CHECK (min_select >= 0 AND max_select >= 1 AND max_select >= min_select)
);
CREATE INDEX IF NOT EXISTS idx_cog_combo  ON combo_option_groups(combo_product_id);
CREATE INDEX IF NOT EXISTS idx_cog_tenant ON combo_option_groups(tenant_id);

CREATE TABLE IF NOT EXISTS combo_option_items (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id)             ON DELETE CASCADE,
  group_id    UUID        NOT NULL REFERENCES combo_option_groups(id) ON DELETE CASCADE,
  product_id  UUID        NOT NULL REFERENCES products(id)            ON DELETE RESTRICT,
  extra_price NUMERIC     NOT NULL DEFAULT 0,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_coi_group  ON combo_option_items(group_id);
CREATE INDEX IF NOT EXISTS idx_coi_tenant ON combo_option_items(tenant_id);

CREATE TABLE IF NOT EXISTS order_item_combo_choices (
  id            UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_item_id UUID    NOT NULL REFERENCES order_items(id)          ON DELETE CASCADE,
  group_id      UUID    NOT NULL REFERENCES combo_option_groups(id)  ON DELETE RESTRICT,
  product_id    UUID    NOT NULL REFERENCES products(id)             ON DELETE RESTRICT,
  extra_price   NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_oicc_order_item ON order_item_combo_choices(order_item_id);

-- ── SPRINT ANTI-ERRO B (007) — deduplicação OCR ────────────────
ALTER TABLE pending_receipts ADD COLUMN IF NOT EXISTS image_hash VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_receipts_hash
  ON pending_receipts(tenant_id, image_hash)
  WHERE image_hash IS NOT NULL;

-- ── SPRINT CONSUMO INTERNO + VAZAMENTOS (008) ──────────────────

-- Tabela unificada de consumos internos (funcionário, família, brinde, degustação, perda)
-- Aceita insumo_id OU product_id (obrigatoriamente um dos dois)
CREATE TABLE IF NOT EXISTS internal_consumptions (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID          NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
  insumo_id        UUID          REFERENCES insumos(id)              ON DELETE SET NULL,
  product_id       UUID          REFERENCES products(id)             ON DELETE SET NULL,
  item_name        VARCHAR(200)  NOT NULL,    -- snapshot do nome no momento
  unit             VARCHAR(20)   NOT NULL DEFAULT 'un',
  quantity         DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
  unit_cost        DECIMAL(10,4) NOT NULL DEFAULT 0,
  total_cost       DECIMAL(10,2) NOT NULL DEFAULT 0,
  consumption_type VARCHAR(30)   NOT NULL DEFAULT 'funcionario',
  -- 'funcionario' | 'familia' | 'brinde' | 'degustacao' | 'perda'
  notes            TEXT,
  created_by       UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ic_source CHECK (insumo_id IS NOT NULL OR product_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_internal_cons_tenant ON internal_consumptions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_internal_cons_insumo ON internal_consumptions(insumo_id);
CREATE INDEX IF NOT EXISTS idx_internal_cons_product ON internal_consumptions(product_id);

-- display_name: nome exibido no cardápio digital (NULL = usa name como fallback)
ALTER TABLE products ADD COLUMN IF NOT EXISTS display_name  VARCHAR(200) DEFAULT NULL;

-- ── OCR ALIASES ───────────────────────────────────────────────
-- Memória de matches manuais aprovados pelo usuário.
-- "Requeijão Elegê 200g" → insumo_id X  (salvo após aprovação)
-- ocr_raw = normalize(descricao_da_nota) via matcher.service.js
CREATE TABLE IF NOT EXISTS ocr_aliases (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ocr_raw     TEXT         NOT NULL,
  match_type  VARCHAR(20)  NOT NULL CHECK (match_type IN ('insumo','product')),
  match_id    UUID         NOT NULL,
  match_name  TEXT         NOT NULL,
  used_count  INTEGER      NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, ocr_raw)
);
CREATE INDEX IF NOT EXISTS idx_ocr_aliases_lookup ON ocr_aliases(tenant_id, ocr_raw);
