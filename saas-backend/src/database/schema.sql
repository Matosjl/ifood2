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

  -- ── Assinatura / SaaS ─────────────────��───────────────────
  subscription_status  VARCHAR(20)  NOT NULL DEFAULT 'active',
  -- subscription_status: 'active' | 'suspended' | 'cancelled' | 'trialing'
  next_billing_date    TIMESTAMPTZ,
  stripe_customer_id   VARCHAR(255),           -- para integracao futura com Stripe
  payment_provider     VARCHAR(50),            -- 'stripe' | 'mercadopago'

  -- ── Contador mensal de pedidos ────────────────────────────
  orders_count_monthly  INTEGER      NOT NULL DEFAULT 0,
  billing_period_start  TIMESTAMPTZ  NOT NULL DEFAULT date_trunc('month', NOW()),
  -- reset lazy: plan.middleware verifica e zera quando mes vira

  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

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
  idempotency_key  VARCHAR(255)  UNIQUE,   -- deduplicacao de pedidos
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
CREATE INDEX IF NOT EXISTS idx_orders_idem       ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ── MIGRACOES INCREMENTAIS (safe para DBs existentes) ─────────
ALTER TABLE orders  ADD COLUMN IF NOT EXISTS idempotency_key    VARCHAR(255) UNIQUE;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status  VARCHAR(20)  NOT NULL DEFAULT 'active';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS next_billing_date    TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id   VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_provider     VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS orders_count_monthly INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_period_start TIMESTAMPTZ  NOT NULL DEFAULT date_trunc('month', NOW());

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_type    VARCHAR(20)  NOT NULL DEFAULT 'pickup';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method  VARCHAR(30)  NOT NULL DEFAULT 'cash';

ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(30);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address         TEXT;

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
