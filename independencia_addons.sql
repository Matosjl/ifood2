-- Grupos de complementos — Independencia Express
DO $$
DECLARE
  t   UUID := 'e3da3ef9-4d5c-4a67-98c1-701b00bf6961';

  -- grupos
  g_molhos   UUID;
  g_carne    UUID;
  g_queijo   UUID;
  g_extras   UUID;
  g_bebida   UUID;

BEGIN

  -- ── 1. CRIAR ADDON GROUPS ─────────────────────────────────────

  INSERT INTO addon_groups (tenant_id, name, description, min_qty, max_qty)
    VALUES (t, 'Molhos', 'Escolha os molhos (à vontade)', 0, 10)
    RETURNING id INTO g_molhos;

  INSERT INTO addon_groups (tenant_id, name, description, min_qty, max_qty)
    VALUES (t, 'Extra Carne', 'Adicione mais proteína', 0, 3)
    RETURNING id INTO g_carne;

  INSERT INTO addon_groups (tenant_id, name, description, min_qty, max_qty)
    VALUES (t, 'Extra Queijo', 'Adicione queijos', 0, 3)
    RETURNING id INTO g_queijo;

  INSERT INTO addon_groups (tenant_id, name, description, min_qty, max_qty)
    VALUES (t, 'Outros Extras', 'Personalize ainda mais', 0, 5)
    RETURNING id INTO g_extras;

  INSERT INTO addon_groups (tenant_id, name, description, min_qty, max_qty)
    VALUES (t, 'Bebida do Combo', 'Escolha sua bebida (obrigatório)', 1, 1)
    RETURNING id INTO g_bebida;

  -- ── 2. ITENS — MOLHOS (grátis) ───────────────────────────────
  INSERT INTO addon_items (tenant_id, group_id, name, price, sort_order) VALUES
    (t, g_molhos, 'Catchup',         0.00, 1),
    (t, g_molhos, 'Mostarda',        0.00, 2),
    (t, g_molhos, 'Maionese',        0.00, 3),
    (t, g_molhos, 'Vinagrete',       0.00, 4),
    (t, g_molhos, 'Barbecue',        0.00, 5),
    (t, g_molhos, 'Mostarda Dijon',  0.00, 6),
    (t, g_molhos, 'Chipotle',        0.00, 7),
    (t, g_molhos, 'Sem molho',       0.00, 8);

  -- ── 3. ITENS — EXTRA CARNE ───────────────────────────────────
  INSERT INTO addon_items (tenant_id, group_id, name, price, sort_order) VALUES
    (t, g_carne, 'Salsicha extra',       4.00, 1),
    (t, g_carne, 'Hambúrguer extra',     5.00, 2),
    (t, g_carne, 'Bacon',                4.00, 3),
    (t, g_carne, 'Calabresa acebolada',  5.00, 4),
    (t, g_carne, 'Frango desfiado',      5.00, 5),
    (t, g_carne, 'Picanha em tiras',    10.00, 6),
    (t, g_carne, 'Pulled pork',          8.00, 7),
    (t, g_carne, 'Camarões',            12.00, 8);

  -- ── 4. ITENS — EXTRA QUEIJO ──────────────────────────────────
  INSERT INTO addon_items (tenant_id, group_id, name, price, sort_order) VALUES
    (t, g_queijo, 'Queijo padrão',    3.00, 1),
    (t, g_queijo, 'Cheddar cremoso',  4.00, 2),
    (t, g_queijo, 'Catupiry',         4.00, 3),
    (t, g_queijo, 'Provolone',        4.00, 4),
    (t, g_queijo, 'Gorgonzola',       5.00, 5),
    (t, g_queijo, 'Brie',             6.00, 6),
    (t, g_queijo, 'Burrata',          7.00, 7);

  -- ── 5. ITENS — OUTROS EXTRAS ─────────────────────────────────
  INSERT INTO addon_items (tenant_id, group_id, name, price, sort_order) VALUES
    (t, g_extras, 'Ovo frito',              3.00, 1),
    (t, g_extras, 'Champignon',             5.00, 2),
    (t, g_extras, 'Cebola caramelizada',    4.00, 3),
    (t, g_extras, 'Tomate seco',            4.00, 4),
    (t, g_extras, 'Rúcula',                 3.00, 5),
    (t, g_extras, 'Milho + Ervilha',        2.00, 6),
    (t, g_extras, 'Batata palha extra',     2.00, 7),
    (t, g_extras, 'Cream cheese',           4.00, 8);

  -- ── 6. ITENS — BEBIDA DO COMBO ───────────────────────────────
  INSERT INTO addon_items (tenant_id, group_id, name, price, sort_order) VALUES
    (t, g_bebida, 'Coca-Cola 350ml',    0.00, 1),
    (t, g_bebida, 'Guaraná 350ml',      0.00, 2),
    (t, g_bebida, 'Fanta Laranja 350ml',0.00, 3),
    (t, g_bebida, 'Água mineral',       0.00, 4),
    (t, g_bebida, 'Suco de laranja',    0.00, 5),
    (t, g_bebida, 'Suco de uva',        0.00, 6);

  -- ── 7. LINKAR GRUPOS AOS PRODUTOS ────────────────────────────

  -- Hot Dogs Padrão → Molhos + Extra Carne + Extra Queijo + Outros Extras
  INSERT INTO product_addon_groups (product_id, group_id, sort_order)
  SELECT p.id, g.group_id, g.sort_order
  FROM products p
  CROSS JOIN (VALUES
    (g_molhos,  1),
    (g_carne,   2),
    (g_queijo,  3),
    (g_extras,  4)
  ) AS g(group_id, sort_order)
  JOIN categories c ON c.id = p.category_id
  WHERE p.tenant_id = t AND c.name = 'Hot Dogs Padrão';

  -- Hot Dogs Premium → Molhos + Extra Carne + Extra Queijo + Outros Extras
  INSERT INTO product_addon_groups (product_id, group_id, sort_order)
  SELECT p.id, g.group_id, g.sort_order
  FROM products p
  CROSS JOIN (VALUES
    (g_molhos,  1),
    (g_carne,   2),
    (g_queijo,  3),
    (g_extras,  4)
  ) AS g(group_id, sort_order)
  JOIN categories c ON c.id = p.category_id
  WHERE p.tenant_id = t AND c.name = 'Hot Dogs Premium';

  -- Xis Padrão → Molhos + Extra Carne + Extra Queijo + Outros Extras
  INSERT INTO product_addon_groups (product_id, group_id, sort_order)
  SELECT p.id, g.group_id, g.sort_order
  FROM products p
  CROSS JOIN (VALUES
    (g_molhos,  1),
    (g_carne,   2),
    (g_queijo,  3),
    (g_extras,  4)
  ) AS g(group_id, sort_order)
  JOIN categories c ON c.id = p.category_id
  WHERE p.tenant_id = t AND c.name = 'Xis Padrão';

  -- Xis Premium → Molhos + Extra Carne + Extra Queijo + Outros Extras
  INSERT INTO product_addon_groups (product_id, group_id, sort_order)
  SELECT p.id, g.group_id, g.sort_order
  FROM products p
  CROSS JOIN (VALUES
    (g_molhos,  1),
    (g_carne,   2),
    (g_queijo,  3),
    (g_extras,  4)
  ) AS g(group_id, sort_order)
  JOIN categories c ON c.id = p.category_id
  WHERE p.tenant_id = t AND c.name = 'Xis Premium';

  -- Combos → Bebida do Combo
  INSERT INTO product_addon_groups (product_id, group_id, sort_order)
  SELECT p.id, g_bebida, 1
  FROM products p
  JOIN categories c ON c.id = p.category_id
  WHERE p.tenant_id = t AND c.name = 'Combos';

  RAISE NOTICE 'Addon groups criados com sucesso!';
END $$;

-- Verificação
SELECT
  ag.name AS grupo,
  COUNT(DISTINCT ai.id) AS itens,
  COUNT(DISTINCT pag.product_id) AS produtos_vinculados
FROM addon_groups ag
LEFT JOIN addon_items ai ON ai.group_id = ag.id
LEFT JOIN product_addon_groups pag ON pag.group_id = ag.id
WHERE ag.tenant_id = 'e3da3ef9-4d5c-4a67-98c1-701b00bf6961'
GROUP BY ag.name ORDER BY ag.name;
