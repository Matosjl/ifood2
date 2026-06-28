-- ── Migration 013: Pagamento dividido por pedido ────────────────
-- Permite múltiplos métodos de pagamento por pedido no PDV.
-- Segura para rodar N vezes (IF NOT EXISTS em tudo).

-- 1. Tabela de pagamentos parciais
--    Um registro por método de pagamento por pedido.
--    Pedidos simples terão 1 linha; pagamentos divididos terão N linhas.
--    O fechamento usa fallback em orders.payment_method para pedidos sem linhas aqui.
CREATE TABLE IF NOT EXISTS order_payments (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id          UUID          NOT NULL REFERENCES orders(id)  ON DELETE CASCADE,
  cash_register_id  UUID          REFERENCES cash_registers(id)   ON DELETE SET NULL,
  method            VARCHAR(30)   NOT NULL,
  amount            DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  received_amount   DECIMAL(10,2),
  change_amount     DECIMAL(10,2),
  created_by        UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_payments_order    ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_tenant   ON order_payments(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_payments_register ON order_payments(cash_register_id);

-- 2. Remove coluna status se existir (foi incluída em versão anterior da migration,
--    mas nunca foi usada em nenhuma query — schema desnecessário).
ALTER TABLE order_payments DROP COLUMN IF EXISTS status;

-- 3. Coluna na orders para indicar pagamento dividido (uso informativo / UI)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS has_split_payment BOOLEAN NOT NULL DEFAULT false;
