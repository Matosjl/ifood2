-- ── Migration 014: Colunas de ajuste de valor no pedido ─────────────
-- Desconto ou acréscimo com motivo, salvo em colunas dedicadas.
-- Anteriormente era apenas concatenado nas observações (frágil).
-- Segura para rodar N vezes (IF NOT EXISTS em tudo).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS adjustment_type   VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS adjustment_value  DECIMAL(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS adjustment_reason VARCHAR(300);
