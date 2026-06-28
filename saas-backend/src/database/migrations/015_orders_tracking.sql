-- ── Migration 015: Rastreamento de usuário + audit log de pedidos ──
-- Quem criou, cancelou e o log de edições relevantes.
-- Segura para rodar N vezes (IF NOT EXISTS / IF NOT EXISTS).

-- 1. Colunas de rastreamento de usuário no pedido
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by   UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- 2. Tabela de audit log de alterações de pedido
--    Registra item adicionado/removido, desconto, cancelamento, etc.
CREATE TABLE IF NOT EXISTS order_audit_logs (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id    UUID         NOT NULL REFERENCES orders(id)  ON DELETE CASCADE,
  user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(50)  NOT NULL,
  -- 'items_edited' | 'info_updated' | 'status_changed' | 'cancelled' | 'adjustment_applied'
  changes     JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_audit_order  ON order_audit_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_order_audit_tenant ON order_audit_logs(tenant_id, created_at DESC);
