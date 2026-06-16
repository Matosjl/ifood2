-- 012: posição de inserção do item no pedido — garante ordem estável na comanda.
-- Aditivo e idempotente (IF NOT EXISTS). Pedidos antigos ficam com line_no NULL;
-- ORDER BY oi.line_no NULLS LAST, oi.id os mantém funcionando sem quebrar.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_no INT;
