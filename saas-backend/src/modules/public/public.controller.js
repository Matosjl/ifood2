const { v4: uuidv4 } = require('uuid');
const db             = require('../../config/database');
const { enqueueAndWait } = require('../../queues/order.queue');
const asyncHandler   = require('../../utils/asyncHandler');
const AppError       = require('../../utils/AppError');

// ── Helpers ────────────────────────────────────────────────────

/** Normaliza telefone: mantém apenas dígitos */
const normalizePhone = (phone) => (phone ?? '').replace(/\D/g, '').trim();

/**
 * Busca ou cria um loyalty_customer pelo telefone.
 * Atualiza o nome se o cliente já existir e um nome novo for fornecido.
 */
async function upsertLoyaltyCustomer(tenantId, phone, name) {
  const normPhone = normalizePhone(phone);
  if (!normPhone) return null;

  const { rows } = await db.query(
    `INSERT INTO loyalty_customers (tenant_id, phone, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, phone) DO UPDATE
       SET name       = COALESCE(EXCLUDED.name, loyalty_customers.name),
           updated_at = NOW()
     RETURNING id, name, phone, cashback_balance, total_orders, total_spent`,
    [tenantId, normPhone, name || null]
  );
  return rows[0];
}

// ── GET /api/public/:slug  — menu público ──────────────────────
const getMenu = asyncHandler(async (req, res) => {
  // Colunas de cashback são opcionais (migração pode não ter rodado ainda)
  const { rows: tenants } = await db.query(
    `SELECT id, name, slug, whatsapp_number, address, cover_url, description,
            restaurant_lat, restaurant_lng, delivery_zones, delivery_zone_type
     FROM tenants WHERE slug = $1 AND active = true`,
    [req.params.slug]
  );
  const tenant = tenants[0];
  if (!tenant) throw new AppError('Restaurante não encontrado.', 404);

  // Cashback config: tenta buscar, mas não quebra se colunas não existirem
  try {
    const { rows: cb } = await db.query(
      `SELECT cashback_enabled, cashback_rate, cashback_min_order FROM tenants WHERE id = $1`,
      [tenant.id]
    );
    if (cb[0]) {
      tenant.cashback_enabled   = cb[0].cashback_enabled;
      tenant.cashback_rate      = cb[0].cashback_rate;
      tenant.cashback_min_order = cb[0].cashback_min_order;
    }
  } catch { /* colunas ainda não existem – ignora */ }

  const { rows: products } = await db.query(
    `SELECT p.id, p.name, p.description, p.sale_type, p.sale_price,
            p.stock_qty, p.image_url, p.featured, p.sort_order, c.name AS category_name
     FROM   products p
     LEFT   JOIN categories c ON c.id = p.category_id
     WHERE  p.tenant_id = $1 AND p.active = true AND p.stock_qty > 0
     ORDER  BY p.featured DESC, p.sort_order ASC, c.name NULLS LAST, p.name`,
    [tenant.id]
  );

  // Busca addon groups para todos os produtos de uma vez
  const productIds = products.map(p => p.id);
  let addonGroupsByProduct = {};
  if (productIds.length > 0) {
    const { rows: addonRows } = await db.query(
      `SELECT pag.product_id,
              json_agg(
                json_build_object(
                  'id',          ag.id,
                  'name',        ag.name,
                  'description', ag.description,
                  'min_qty',     ag.min_qty,
                  'max_qty',     ag.max_qty,
                  'items', (
                    SELECT COALESCE(json_agg(
                      json_build_object('id', ai.id, 'name', ai.name, 'price', ai.price)
                      ORDER BY ai.sort_order ASC, ai.name ASC
                    ), '[]'::json)
                    FROM addon_items ai
                    WHERE ai.group_id = ag.id AND ai.active = true
                  )
                ) ORDER BY pag.sort_order ASC
              ) AS addon_groups
       FROM   product_addon_groups pag
       JOIN   addon_groups ag ON ag.id = pag.group_id
       WHERE  pag.product_id = ANY($1::uuid[])
       GROUP  BY pag.product_id`,
      [productIds]
    );
    for (const row of addonRows) {
      addonGroupsByProduct[row.product_id] = row.addon_groups ?? [];
    }
  }

  const productsWithAddons = products.map(p => ({
    ...p,
    addon_groups: addonGroupsByProduct[p.id] ?? [],
  }));

  const featured = productsWithAddons.filter(p => p.featured).slice(0, 8);
  const featuredFinal = featured.length > 0 ? featured : productsWithAddons.slice(0, 6);

  const grouped = {};
  for (const p of productsWithAddons) {
    const cat = p.category_name ?? 'Outros';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(p);
  }
  const categories = Object.entries(grouped).map(([name, items]) => ({ name, items }));

  res.json({ success: true, data: { tenant, categories, featured: featuredFinal } });
});

// ── GET /api/public/:slug/customer/:phone ─────────────────────
const getCustomer = asyncHandler(async (req, res) => {
  const { rows: tenants } = await db.query(
    `SELECT id FROM tenants WHERE slug = $1 AND active = true`,
    [req.params.slug]
  );
  const tenant = tenants[0];
  if (!tenant) throw new AppError('Restaurante não encontrado.', 404);

  const normPhone = normalizePhone(req.params.phone);
  if (!normPhone) return res.json({ success: true, data: null, meta: null });

  try {
    // Busca config de cashback (pode não existir se migração não rodou)
    const { rows: cb } = await db.query(
      `SELECT cashback_enabled, cashback_rate, cashback_min_order FROM tenants WHERE id = $1`,
      [tenant.id]
    );
    const cfg = cb[0] ?? {};

    if (!cfg.cashback_enabled) {
      return res.json({ success: true, data: null, meta: null });
    }

    const { rows } = await db.query(
      `SELECT id, name, phone, cashback_balance, total_orders, total_spent
       FROM loyalty_customers
       WHERE tenant_id = $1
         AND REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $2`,
      [tenant.id, normPhone]
    );

    res.json({
      success: true,
      data: rows[0] ?? null,
      meta: {
        cashback_rate:      parseFloat(cfg.cashback_rate ?? 5),
        cashback_min_order: parseFloat(cfg.cashback_min_order ?? 10),
      },
    });
  } catch {
    // Tabelas de cashback não existem ainda
    res.json({ success: true, data: null, meta: null });
  }
});

// ── POST /api/public/:slug/orders  — criar pedido ─────────────
const createOrder = asyncHandler(async (req, res) => {
  const { rows: tenants } = await db.query(
    `SELECT id, cashback_enabled, cashback_rate, cashback_min_order, delivery_zones
     FROM tenants WHERE slug = $1 AND active = true`,
    [req.params.slug]
  );
  const tenant = tenants[0];
  if (!tenant) throw new AppError('Restaurante não encontrado.', 404);

  const {
    customerName, customerPhone, customerAddress,
    deliveryType, notes, items, paymentMethod,
    deliveryFee,  // D1: taxa enviada pelo cardápio digital
    useCashback, tableNumber,
    deliveryLat, deliveryLng,
  } = req.body;

  if (!items?.length) throw new AppError('Adicione pelo menos 1 item.', 400);
  if (!customerName)  throw new AppError('Informe seu nome.', 400);
  if (deliveryType === 'delivery' && !customerAddress)
    throw new AppError('Informe o endereço de entrega.', 400);

  // ── Validação de zona/taxa de entrega (canal público) ──────────
  // Fecha o bypass via API: nunca confiar cegamente na deliveryFee do frontend.
  // Só vale para delivery — pickup/local não dependem de zona.
  if (deliveryType === 'delivery') {
    // delivery_zones é JSONB (normalmente já vem como array); parse defensivo se vier string.
    let zones = tenant.delivery_zones;
    if (typeof zones === 'string') {
      try { zones = JSON.parse(zones); } catch { zones = null; }
    }
    if (!Array.isArray(zones) || zones.length === 0) {
      console.warn(`[public] delivery bloqueado: tenant sem zonas configuradas (slug=${req.params.slug})`);
      throw new AppError('Entrega indisponível: o restaurante ainda não configurou as zonas de entrega.', 400);
    }

    const fee = parseFloat(deliveryFee);
    if (deliveryFee === null || deliveryFee === undefined || Number.isNaN(fee) || fee < 0) {
      throw new AppError('Taxa de entrega inválida.', 400);
    }

    // Frete grátis (fee = 0) só é aceito se existir zona configurada com fee 0.
    if (fee === 0 && !zones.some((z) => parseFloat(z?.fee) === 0)) {
      console.warn(`[public] delivery bloqueado: fee=0 sem zona gratuita (slug=${req.params.slug})`);
      throw new AppError('Taxa de entrega não calculada. Selecione o endereço para calcular o frete.', 400);
    }
  }

  // ── Fidelidade: busca/cria cliente pelo telefone ──────────
  let loyaltyCustomer = null;
  let cashbackUsed    = 0;
  let cashbackConfig  = null;

  try {
    const { rows: cbRows } = await db.query(
      `SELECT cashback_enabled, cashback_rate, cashback_min_order FROM tenants WHERE id = $1`,
      [tenant.id]
    );
    cashbackConfig = cbRows[0] ?? null;
  } catch { /* colunas de cashback não existem ainda */ }

  // Sempre registra o cliente como loyalty_customer (independente de cashback)
  if (customerPhone) {
    try {
      loyaltyCustomer = await upsertLoyaltyCustomer(tenant.id, customerPhone, customerName);
      if (useCashback && cashbackConfig?.cashback_enabled && loyaltyCustomer?.cashback_balance > 0) {
        cashbackUsed = parseFloat(loyaltyCustomer.cashback_balance);
      }
    } catch { /* tabela loyalty_customers não existe ainda */ }
  }

  const idempotencyKey = uuidv4();
  const order = await enqueueAndWait(
    'create',
    {
      tenantId: tenant.id,
      payload: {
        customerName, customerPhone, customerAddress,
        deliveryType:  deliveryType  || 'pickup',
        paymentMethod: paymentMethod || 'cash',
        channel: 'online',
        notes,
        items,
        // D1: repassa taxa recebida do frontend; 0 se não for delivery
        deliveryFee: deliveryType === 'delivery' ? (parseFloat(deliveryFee) || 0) : 0,
        loyaltyCustomerId: loyaltyCustomer?.id ?? null,
        cashbackUsed,
        tableNumber: tableNumber || null,
        deliveryLat:  deliveryLat  ? parseFloat(deliveryLat)  : null,
        deliveryLng:  deliveryLng  ? parseFloat(deliveryLng)  : null,
      },
      idempotencyKey,
      isOnline: true,
    },
    { idempotencyKey }
  );

  // ── Calcula cashback ganho neste pedido (fire-and-forget se tabelas não existem)
  let cashbackEarned = 0;
  try {
    if (cashbackConfig?.cashback_enabled && loyaltyCustomer) {
      const orderTotal = parseFloat(order.total ?? 0);
      const minOrder   = parseFloat(cashbackConfig.cashback_min_order ?? 10);
      if (orderTotal >= minOrder) {
        cashbackEarned = Math.round((orderTotal * parseFloat(cashbackConfig.cashback_rate) / 100) * 100) / 100;
      }

      await db.query(
        `UPDATE loyalty_customers
         SET cashback_balance = cashback_balance + $2 - $3,
             total_orders     = total_orders + 1,
             total_spent      = total_spent + $4,
             updated_at       = NOW()
         WHERE id = $1`,
        [loyaltyCustomer.id, cashbackEarned, cashbackUsed, orderTotal]
      );

      if (cashbackEarned > 0) {
        await db.query(
          `INSERT INTO cashback_transactions (tenant_id, customer_id, order_id, type, amount, description)
           VALUES ($1, $2, $3, 'earn', $4, $5)`,
          [tenant.id, loyaltyCustomer.id, order.id, cashbackEarned,
            `Pedido #${order.order_number} — cashback ${cashbackConfig.cashback_rate}%`]
        );
      }
      if (cashbackUsed > 0) {
        await db.query(
          `INSERT INTO cashback_transactions (tenant_id, customer_id, order_id, type, amount, description)
           VALUES ($1, $2, $3, 'use', $4, $5)`,
          [tenant.id, loyaltyCustomer.id, order.id, cashbackUsed,
            `Cashback usado no Pedido #${order.order_number}`]
        );
      }

      await db.query(
        `UPDATE orders
         SET loyalty_customer_id = $2,
             cashback_earned     = $3,
             cashback_used       = $4
         WHERE id = $1`,
        [order.id, loyaltyCustomer.id, cashbackEarned, cashbackUsed]
      );
    }
  } catch { /* cashback não crítico — pedido foi criado com sucesso */ }

  res.status(201).json({
    success: true,
    data: {
      ...order,
      cashback_earned: cashbackEarned,
      cashback_used:   cashbackUsed,
    },
  });
});

// ── GET /api/public/order/:id  — rastrear pedido ──────────────
const trackOrder = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT o.id, o.order_number, o.status, o.total, o.created_at,
            o.customer_name, o.delivery_type, o.customer_address,
            o.cashback_earned, o.cashback_used,
            (SELECT EXISTS(SELECT 1 FROM order_ratings WHERE order_id = o.id)) AS has_rating,
            json_agg(
              json_build_object(
                'product_name', oi.product_name,
                'quantity',     oi.quantity,
                'weight_kg',    oi.weight_kg,
                'total',        oi.total
              ) ORDER BY oi.id
            ) AS items
     FROM   orders o
     JOIN   order_items oi ON oi.order_id = o.id
     WHERE  o.id = $1
     GROUP  BY o.id`,
    [req.params.id]
  );
  if (!rows[0]) throw new AppError('Pedido não encontrado.', 404);
  res.json({ success: true, data: rows[0] });
});

// ── POST /api/public/:slug/ratings  — avaliar pedido ─────────
const submitRating = asyncHandler(async (req, res) => {
  const { rows: tenants } = await db.query(
    `SELECT id FROM tenants WHERE slug = $1 AND active = true`,
    [req.params.slug]
  );
  const tenant = tenants[0];
  if (!tenant) throw new AppError('Restaurante não encontrado.', 404);

  const { orderId, stars, comment } = req.body;
  if (!orderId) throw new AppError('Informe o pedido.', 400);
  if (!stars || stars < 1 || stars > 5)
    throw new AppError('Avaliação deve ser de 1 a 5 estrelas.', 400);

  // Verifica se o pedido pertence a este tenant e foi entregue
  const { rows: orderRows } = await db.query(
    `SELECT id, loyalty_customer_id FROM orders
     WHERE id = $1 AND tenant_id = $2 AND status = 'delivered'`,
    [orderId, tenant.id]
  );
  if (!orderRows[0]) throw new AppError('Pedido não encontrado ou ainda não entregue.', 404);

  // Idempotente: ignora se já existe avaliação
  const { rows } = await db.query(
    `INSERT INTO order_ratings (tenant_id, order_id, customer_id, stars, comment)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (order_id) DO UPDATE
       SET stars = EXCLUDED.stars, comment = EXCLUDED.comment
     RETURNING id, stars, comment, created_at`,
    [tenant.id, orderId, orderRows[0].loyalty_customer_id || null,
     parseInt(stars), comment?.trim() || null]
  );

  res.status(201).json({ success: true, data: rows[0] });
});

// ── GET /api/public/:slug/history/:phone  — histórico do cliente ──
const getOrderHistory = asyncHandler(async (req, res) => {
  const { rows: tenants } = await db.query(
    `SELECT id FROM tenants WHERE slug = $1 AND active = true`,
    [req.params.slug]
  );
  const tenant = tenants[0];
  if (!tenant) throw new AppError('Restaurante não encontrado.', 404);

  const normPhone = normalizePhone(req.params.phone);
  if (!normPhone) return res.json({ success: true, data: [] });

  const { rows } = await db.query(
    `SELECT o.id, o.order_number, o.status, o.total, o.created_at,
            o.delivery_type, o.payment_method,
            json_agg(
              json_build_object(
                'product_name', oi.product_name,
                'quantity',     oi.quantity,
                'weight_kg',    oi.weight_kg,
                'total',        oi.total
              ) ORDER BY oi.id
            ) AS items
     FROM   orders o
     JOIN   order_items oi ON oi.order_id = o.id
     WHERE  o.tenant_id = $1
       AND  REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g') = $2
     GROUP  BY o.id
     ORDER  BY o.created_at DESC
     LIMIT  15`,
    [tenant.id, normPhone]
  );

  res.json({ success: true, data: rows });
});

// ── GET /api/public/:slug/loyalty-config ─────────────────────
const getLoyaltyConfig = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT cashback_enabled, cashback_rate, cashback_min_order
     FROM tenants WHERE slug = $1 AND active = true`,
    [req.params.slug]
  );
  if (!rows[0]) throw new AppError('Restaurante não encontrado.', 404);
  res.json({ success: true, data: rows[0] });
});

// ── GET /api/public/:slug/tables — mesas ativas do restaurante ─
const getTables = asyncHandler(async (req, res) => {
  const { rows: tenants } = await db.query(
    `SELECT id FROM tenants WHERE slug = $1 AND active = true`,
    [req.params.slug]
  );
  if (!tenants[0]) throw new AppError('Restaurante não encontrado.', 404);
  const { rows } = await db.query(
    `SELECT id, number, name FROM restaurant_tables
     WHERE tenant_id = $1 AND active = true ORDER BY number ASC`,
    [tenants[0].id]
  );
  res.json({ success: true, data: rows });
});

module.exports = { getMenu, getCustomer, createOrder, trackOrder, submitRating, getLoyaltyConfig, getOrderHistory, getTables };
