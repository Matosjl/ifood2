-- Migration 006: Grupos de Escolha para Combos (Combo V2)
-- Compatibilidade total com product_combos (filhos fixos) — apenas adiciona camada acima.

-- Grupos de escolha de um combo (ex: "Refrigerante", "Proteína")
CREATE TABLE IF NOT EXISTS combo_option_groups (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  combo_product_id UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  min_select       INTEGER     NOT NULL DEFAULT 1,
  max_select       INTEGER     NOT NULL DEFAULT 1,
  sort_order       INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cog_min_max CHECK (min_select >= 0 AND max_select >= 1 AND max_select >= min_select)
);
CREATE INDEX IF NOT EXISTS idx_cog_combo   ON combo_option_groups(combo_product_id);
CREATE INDEX IF NOT EXISTS idx_cog_tenant  ON combo_option_groups(tenant_id);

-- Opções disponíveis em cada grupo (ex: "Coca Lata", "Pepsi Lata")
CREATE TABLE IF NOT EXISTS combo_option_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id    UUID        NOT NULL REFERENCES combo_option_groups(id) ON DELETE CASCADE,
  product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  extra_price NUMERIC     NOT NULL DEFAULT 0,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_coi_group  ON combo_option_items(group_id);
CREATE INDEX IF NOT EXISTS idx_coi_tenant ON combo_option_items(tenant_id);

-- Registro das escolhas do cliente por item de pedido
-- Necessário para reverter insumos corretamente no cancelamento
CREATE TABLE IF NOT EXISTS order_item_combo_choices (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID    NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  group_id      UUID    NOT NULL REFERENCES combo_option_groups(id) ON DELETE RESTRICT,
  product_id    UUID    NOT NULL REFERENCES products(id)           ON DELETE RESTRICT,
  extra_price   NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_oicc_order_item ON order_item_combo_choices(order_item_id);
