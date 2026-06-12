-- ── Migration 009: Costura 2 — Baixa de fiado com método de pagamento ─────────
-- Idempotente: pode ser reexecutada sem efeito colateral.
-- Runner: schema.sql (migrate.js executa schema.sql inteiro).
-- Esta migration espelha os ALTER TABLE adicionados ao final de schema.sql.

-- ── Fix drift: fiado_clientes ─────────────────────────────────────────────────
-- acerto_type e acerto_weekday existem em produção mas estavam ausentes do schema.
ALTER TABLE fiado_clientes
  ADD COLUMN IF NOT EXISTS acerto_type VARCHAR(20);

UPDATE fiado_clientes
  SET acerto_type = 'day_of_month'
  WHERE acerto_type IS NULL;

ALTER TABLE fiado_clientes
  ALTER COLUMN acerto_type SET DEFAULT 'day_of_month';

ALTER TABLE fiado_clientes
  ALTER COLUMN acerto_type SET NOT NULL;

ALTER TABLE fiado_clientes
  ADD COLUMN IF NOT EXISTS acerto_weekday INT;

-- ── Fix drift: fiado_compras.tipo ─────────────────────────────────────────────
-- tipo existe em produção mas estava ausente do schema.
ALTER TABLE fiado_compras
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(20);

UPDATE fiado_compras
  SET tipo = 'compra'
  WHERE tipo IS NULL;

ALTER TABLE fiado_compras
  ALTER COLUMN tipo SET DEFAULT 'compra';

ALTER TABLE fiado_compras
  ALTER COLUMN tipo SET NOT NULL;

-- ── Colunas Costura 2: fiado_compras ─────────────────────────────────────────
ALTER TABLE fiado_compras
  ADD COLUMN IF NOT EXISTS payment_method   VARCHAR(20);

ALTER TABLE fiado_compras
  ADD COLUMN IF NOT EXISTS paid_by          UUID REFERENCES users(id);

ALTER TABLE fiado_compras
  ADD COLUMN IF NOT EXISTS cash_register_id UUID REFERENCES cash_registers(id);

-- ── caixa_movements: reference_id para auditoria ─────────────────────────────
ALTER TABLE caixa_movements
  ADD COLUMN IF NOT EXISTS reference_id UUID;

-- ── caixa_movements: ampliar CHECK (nome determinístico do PostgreSQL) ────────
ALTER TABLE caixa_movements
  DROP CONSTRAINT IF EXISTS caixa_movements_type_check;

ALTER TABLE caixa_movements
  ADD CONSTRAINT caixa_movements_type_check
  CHECK (type IN ('sangria', 'suprimento', 'fiado_recebido'));

-- ── banco_transactions: índice único para fiado ───────────────────────────────
-- Sem CONCURRENTLY: runner executa schema em bloco único de query.
-- source='fiado' é permitido: source é VARCHAR sem CHECK constraint.
CREATE UNIQUE INDEX IF NOT EXISTS uq_banco_fiado_reference
  ON banco_transactions(reference_id)
  WHERE source = 'fiado' AND reference_id IS NOT NULL;

-- caixa_movements: indice unico para evitar duplicata de baixa de fiado em dinheiro
CREATE UNIQUE INDEX IF NOT EXISTS uq_caixa_fiado_recebido_reference
  ON caixa_movements(reference_id)
  WHERE type = 'fiado_recebido' AND reference_id IS NOT NULL;
