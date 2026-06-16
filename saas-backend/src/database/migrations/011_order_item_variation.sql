-- 011: snapshot da variação (tamanho) escolhida no item do pedido.
-- Aditivo e idempotente — sem DROP/RENAME.
-- variation_label: ex. "Média", "Grande"
-- variation_price: preço da opção no momento da venda (snapshot, não o preço atual)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variation_label VARCHAR(120);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variation_price NUMERIC(10,2);
