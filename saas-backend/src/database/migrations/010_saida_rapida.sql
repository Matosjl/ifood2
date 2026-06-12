-- ── Migration 010: Costura 3 — Saída rápida com categoria ─────────────────────
-- Idempotente: pode ser reexecutada sem efeito colateral.
-- Esta migration espelha os ALTER TABLE adicionados ao final de schema.sql.

-- ── Nova coluna: categoria da despesa vinculada à saída rápida ────────────────
-- Nullable: sangria/suprimento/fiado_recebido não usam este campo.
-- Obrigatória na aplicação para type='saida_rapida'.
ALTER TABLE caixa_movements
  ADD COLUMN IF NOT EXISTS categoria VARCHAR(80);

-- ── Ampliar CHECK para incluir saida_rapida ───────────────────────────────────
ALTER TABLE caixa_movements
  DROP CONSTRAINT IF EXISTS caixa_movements_type_check;

ALTER TABLE caixa_movements
  ADD CONSTRAINT caixa_movements_type_check
  CHECK (type IN ('sangria', 'suprimento', 'fiado_recebido', 'saida_rapida'));
