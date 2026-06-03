-- Migration 008: nome amigável para produtos (separado do nome interno)
-- display_name: aparece no cardápio digital e pedidos do cliente
-- name: nome interno (estoque, financeiro, relatórios)
-- Se display_name for NULL, o sistema usa name como fallback.

ALTER TABLE products ADD COLUMN IF NOT EXISTS display_name VARCHAR(200);

COMMENT ON COLUMN products.display_name IS
  'Nome exibido no cardápio digital. Se NULL, usa o campo name. Permite ter nome interno (ex: "Nata Friolack 280g") diferente do nome do cardápio (ex: "Creme de Leite 280g").';
