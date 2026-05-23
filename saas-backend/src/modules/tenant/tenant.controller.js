const db           = require('../../config/database');
const service      = require('./tenant.service');
const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');
const env          = require('../../config/env');

/** GET /api/tenant/me */
const getMe = asyncHandler(async (req, res) => {
  const tenant = await service.getMyTenant(req.user.tenantId);
  res.json({ success: true, data: tenant });
});

/** PUT /api/tenant/plan — body: { plan: 'basic' | 'pro' | 'premium' } */
const updatePlan = asyncHandler(async (req, res) => {
  const { plan } = req.body;
  if (!plan) throw new AppError('Campo "plan" e obrigatorio.', 400);
  const tenant = await service.changePlan(req.user.tenantId, plan, req.user.role);
  res.json({ success: true, data: tenant });
});

/**
 * PUT /api/tenant/profile
 * Body: { name }
 * Atualiza o nome do restaurante (owner only).
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { name, whatsappNumber, address } = req.body;
  if (!name?.trim()) throw new AppError('Nome do restaurante é obrigatório.', 400);

  const { rows } = await db.query(
    `UPDATE tenants
     SET name             = $2,
         whatsapp_number  = COALESCE($3, whatsapp_number),
         address          = COALESCE($4, address),
         updated_at       = NOW()
     WHERE id = $1
     RETURNING id, name, slug, whatsapp_number, address`,
    [req.user.tenantId, name.trim(), whatsappNumber || null, address || null]
  );
  if (!rows[0]) throw new AppError('Restaurante não encontrado.', 404);

  res.json({ success: true, data: rows[0] });
});

/**
 * PATCH /api/tenant/chatbot
 * Body: { enabled: boolean }
 * Liga/desliga o chatbot WhatsApp do tenant (owner only).
 */
const setChatbot = asyncHandler(async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') throw new AppError('Campo "enabled" deve ser boolean.', 400);

  const { rows } = await db.query(
    `UPDATE tenants SET chatbot_enabled = $2, updated_at = NOW()
     WHERE id = $1 RETURNING id, chatbot_enabled`,
    [req.user.tenantId, enabled]
  );
  if (!rows[0]) throw new AppError('Restaurante não encontrado.', 404);

  res.json({ success: true, data: rows[0] });
});

/**
 * GET /api/tenant/cashback — retorna configuração de cashback
 */
const getCashbackConfig = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT cashback_enabled, cashback_rate, cashback_min_order FROM tenants WHERE id = $1`,
    [req.user.tenantId]
  );
  if (!rows[0]) throw new AppError('Restaurante não encontrado.', 404);
  res.json({ success: true, data: rows[0] });
});

/**
 * PUT /api/tenant/cashback
 * Body: { cashback_enabled, cashback_rate, cashback_min_order }
 * Atualiza configuração de fidelidade/cashback (owner only).
 */
const setCashbackConfig = asyncHandler(async (req, res) => {
  const { cashback_enabled, cashback_rate, cashback_min_order } = req.body;

  if (typeof cashback_enabled !== 'boolean')
    throw new AppError('cashback_enabled deve ser true ou false.', 400);
  if (cashback_rate !== undefined && (isNaN(cashback_rate) || cashback_rate < 0 || cashback_rate > 100))
    throw new AppError('cashback_rate deve ser entre 0 e 100.', 400);
  if (cashback_min_order !== undefined && (isNaN(cashback_min_order) || cashback_min_order < 0))
    throw new AppError('cashback_min_order deve ser >= 0.', 400);

  const { rows } = await db.query(
    `UPDATE tenants
     SET cashback_enabled   = $2,
         cashback_rate      = COALESCE($3, cashback_rate),
         cashback_min_order = COALESCE($4, cashback_min_order),
         updated_at         = NOW()
     WHERE id = $1
     RETURNING cashback_enabled, cashback_rate, cashback_min_order`,
    [req.user.tenantId, cashback_enabled,
     cashback_rate    != null ? parseFloat(cashback_rate)    : null,
     cashback_min_order != null ? parseFloat(cashback_min_order) : null]
  );
  if (!rows[0]) throw new AppError('Restaurante não encontrado.', 404);
  res.json({ success: true, data: rows[0] });
});

/**
 * GET /api/tenant/loyalty-customers — lista clientes de fidelidade
 */
const getLoyaltyCustomers = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT lc.id, lc.name, lc.phone, lc.cashback_balance,
            lc.total_orders, lc.total_spent, lc.created_at,
            (SELECT AVG(r.stars)
               FROM order_ratings r
               JOIN orders o ON o.id = r.order_id
               WHERE o.loyalty_customer_id = lc.id
            ) AS avg_rating
     FROM loyalty_customers lc
     WHERE lc.tenant_id = $1
     ORDER BY lc.total_spent DESC, lc.total_orders DESC
     LIMIT 200`,
    [req.user.tenantId]
  );
  res.json({ success: true, data: rows });
});

/**
 * GET /api/tenant/ratings — avaliações recentes
 */
const getRatings = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT r.id, r.stars, r.comment, r.created_at,
            o.order_number, o.customer_name,
            lc.phone AS customer_phone
     FROM   order_ratings r
     JOIN   orders o ON o.id = r.order_id
     LEFT   JOIN loyalty_customers lc ON lc.id = r.customer_id
     WHERE  r.tenant_id = $1
     ORDER  BY r.created_at DESC
     LIMIT  100`,
    [req.user.tenantId]
  );

  // Média geral
  const { rows: stats } = await db.query(
    `SELECT
       COUNT(*)::int                                   AS total,
       ROUND(AVG(stars)::numeric, 2)                  AS avg_stars,
       COUNT(*) FILTER (WHERE stars = 5)::int         AS five,
       COUNT(*) FILTER (WHERE stars = 4)::int         AS four,
       COUNT(*) FILTER (WHERE stars = 3)::int         AS three,
       COUNT(*) FILTER (WHERE stars <= 2)::int        AS low
     FROM order_ratings WHERE tenant_id = $1`,
    [req.user.tenantId]
  );

  res.json({ success: true, data: { ratings: rows, stats: stats[0] } });
});

/** GET /api/tenant/whatsapp/status */
const getWhatsappStatus = asyncHandler(async (req, res) => {
  if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY) {
    return res.json({ success: true, data: { connected: false, status: 'not_configured', instance: null, qrcode: null } });
  }
  const waSvc  = require('../../services/whatsapp.service');
  const status = await waSvc.getStatus(req.user.tenantId);
  res.json({ success: true, data: status });
});

/** POST /api/tenant/whatsapp/connect */
const connectWhatsapp = asyncHandler(async (req, res) => {
  if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY) {
    throw new AppError('Evolution API não configurada neste servidor.', 503);
  }
  const waSvc  = require('../../services/whatsapp.service');
  const result = await waSvc.connectInstance(req.user.tenantId);
  res.json({ success: true, data: result });
});

/** DELETE /api/tenant/whatsapp/disconnect */
const disconnectWhatsapp = asyncHandler(async (req, res) => {
  const waSvc = require('../../services/whatsapp.service');
  await waSvc.disconnectInstance(req.user.tenantId);
  res.json({ success: true, data: { message: 'WhatsApp desconectado.' } });
});

/** PATCH /api/tenant/settings — payment methods, delivery zones, restaurant coords, business hours */
const updateSettings = asyncHandler(async (req, res) => {
  const {
    acceptedPaymentMethods, deliveryZones, deliveryZoneType,
    restaurantLat, restaurantLng, businessHours,
  } = req.body;

  const { rows } = await db.query(
    `UPDATE tenants
     SET accepted_payment_methods = COALESCE($2::jsonb, accepted_payment_methods),
         delivery_zones           = COALESCE($3::jsonb, delivery_zones),
         delivery_zone_type       = COALESCE($4, delivery_zone_type),
         restaurant_lat           = COALESCE($5::numeric, restaurant_lat),
         restaurant_lng           = COALESCE($6::numeric, restaurant_lng),
         business_hours           = COALESCE($7::jsonb, business_hours),
         updated_at               = NOW()
     WHERE id = $1
     RETURNING accepted_payment_methods, delivery_zones, delivery_zone_type,
               restaurant_lat, restaurant_lng, business_hours`,
    [
      req.user.tenantId,
      acceptedPaymentMethods != null ? JSON.stringify(acceptedPaymentMethods) : null,
      deliveryZones          != null ? JSON.stringify(deliveryZones)          : null,
      deliveryZoneType       || null,
      restaurantLat          != null ? String(restaurantLat)                  : null,
      restaurantLng          != null ? String(restaurantLng)                  : null,
      businessHours          != null ? JSON.stringify(businessHours)          : null,
    ]
  );
  if (!rows[0]) throw new AppError('Restaurante não encontrado.', 404);
  res.json({ success: true, data: rows[0] });
});

/** GET /api/tenant/full-settings — retorna tudo necessário para o modal de pedido */
const getFullSettings = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT accepted_payment_methods, delivery_zones, delivery_zone_type,
            restaurant_lat, restaurant_lng, whatsapp_instance, business_hours
     FROM tenants WHERE id = $1`,
    [req.user.tenantId]
  );
  if (!rows[0]) throw new AppError('Restaurante não encontrado.', 404);
  res.json({ success: true, data: rows[0] });
});

/** POST /api/tenant/leads — cria ou atualiza um lead manualmente */
const createLead = asyncHandler(async (req, res) => {
  const { name, phone, notes } = req.body;
  if (!name?.trim() && !phone?.trim())
    throw new AppError('Informe ao menos nome ou telefone.', 400);

  const normPhone = (phone ?? '').replace(/\D/g, '').trim() || null;

  const { rows } = await db.query(
    `INSERT INTO loyalty_customers (tenant_id, name, phone, notes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, phone) DO UPDATE
       SET name       = COALESCE(EXCLUDED.name, loyalty_customers.name),
           notes      = COALESCE(EXCLUDED.notes, loyalty_customers.notes),
           updated_at = NOW()
     RETURNING *`,
    [req.user.tenantId, name?.trim() || null, normPhone, notes?.trim() || null]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

/** POST /api/tenant/leads/import — importa lista de leads (array de {name, phone}) */
const importLeads = asyncHandler(async (req, res) => {
  const { leads } = req.body;
  if (!Array.isArray(leads) || !leads.length)
    throw new AppError('Envie um array "leads" com {name, phone}.', 400);

  const client = await db.getClient();
  let inserted = 0, skipped = 0;

  try {
    await client.query('BEGIN');
    for (const lead of leads.slice(0, 500)) { // limite de segurança
      const normPhone = (lead.phone ?? '').replace(/\D/g, '').trim();
      if (!normPhone && !lead.name?.trim()) { skipped++; continue; }

      await client.query(
        `INSERT INTO loyalty_customers (tenant_id, name, phone)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, phone) DO UPDATE
           SET name = COALESCE(EXCLUDED.name, loyalty_customers.name),
               updated_at = NOW()`,
        [req.user.tenantId, lead.name?.trim() || null, normPhone || null]
      );
      inserted++;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json({ success: true, data: { inserted, skipped } });
});

// ── CRM ────────────────────────────────────────────────────────

const SEGMENT_SQL = `
  CASE
    WHEN COALESCE(order_count,0) = 0 OR last_order_date IS NULL THEN 'lead'
    WHEN COALESCE(order_count,0) >= 6 AND last_order_date > NOW() - INTERVAL '30 days' THEN 'vip'
    WHEN COALESCE(order_count,0) >= 2 AND last_order_date > NOW() - INTERVAL '30 days' THEN 'recorrente'
    WHEN COALESCE(order_count,0) = 1  AND last_order_date > NOW() - INTERVAL '30 days' THEN 'novo'
    WHEN last_order_date > NOW() - INTERVAL '60 days' THEN 'em_risco'
    ELSE 'perdido'
  END
`;

/** GET /api/tenant/crm — lista paginada com busca e filtro de segmento */
const listCRMCustomers = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const search   = req.query.search?.trim() || null;
  const segment  = req.query.segment || null;
  const page     = Math.max(1, parseInt(req.query.page)  || 1);
  const limit    = Math.min(50, parseInt(req.query.limit) || 30);
  const offset   = (page - 1) * limit;

  const params = [tenantId];
  let whereExtra = '';

  if (search) {
    params.push(`%${search}%`);
    whereExtra += ` AND (lc.name ILIKE $${params.length} OR lc.phone LIKE $${params.length})`;
  }

  if (segment && segment !== 'todos') {
    params.push(segment);
    whereExtra += ` AND (${SEGMENT_SQL}) = $${params.length}`;
  }

  params.push(limit, offset);
  const limitIdx  = params.length - 1;
  const offsetIdx = params.length;

  const { rows } = await db.query(`
    SELECT
      lc.id, lc.name, lc.phone, lc.address, lc.notes, lc.tags,
      lc.cashback_balance, lc.created_at, lc.updated_at,
      COALESCE(agg.order_count,  lc.total_orders) AS order_count,
      COALESCE(agg.total_spent,  lc.total_spent)  AS total_spent,
      agg.last_order_date,
      agg.first_order_date,
      (${SEGMENT_SQL}) AS segment,
      COUNT(*) OVER() AS total_count
    FROM loyalty_customers lc
    LEFT JOIN (
      SELECT customer_phone AS phone,
             COUNT(*)       AS order_count,
             SUM(total)     AS total_spent,
             MAX(created_at) AS last_order_date,
             MIN(created_at) AS first_order_date
      FROM orders
      WHERE tenant_id = $1 AND status NOT IN ('cancelled')
      GROUP BY customer_phone
    ) agg ON lower(lc.phone) = lower(agg.phone)
    WHERE lc.tenant_id = $1 ${whereExtra}
    ORDER BY agg.last_order_date DESC NULLS LAST, lc.name ASC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `, params);

  const total = rows[0] ? parseInt(rows[0].total_count) : 0;
  res.json({
    success: true,
    data: rows,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
});

/** GET /api/tenant/crm/:id — perfil completo + histórico de pedidos */
const getCRMCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenantId;

  const { rows: cRows } = await db.query(`
    SELECT lc.*,
      COALESCE(agg.order_count,  lc.total_orders) AS order_count,
      COALESCE(agg.total_spent,  lc.total_spent)  AS total_spent,
      agg.last_order_date, agg.first_order_date,
      (${SEGMENT_SQL}) AS segment
    FROM loyalty_customers lc
    LEFT JOIN (
      SELECT customer_phone AS phone,
             COUNT(*)        AS order_count,
             SUM(total)      AS total_spent,
             MAX(created_at) AS last_order_date,
             MIN(created_at) AS first_order_date
      FROM orders WHERE tenant_id = $2 AND status NOT IN ('cancelled') GROUP BY customer_phone
    ) agg ON lower(lc.phone) = lower(agg.phone)
    WHERE lc.id = $1 AND lc.tenant_id = $2
  `, [id, tenantId]);

  if (!cRows[0]) throw new AppError('Cliente não encontrado.', 404);
  const customer = cRows[0];

  // Últimos 20 pedidos
  const { rows: orders } = await db.query(`
    SELECT id, order_number, status, total, delivery_type,
           payment_method, items_summary, created_at
    FROM orders
    WHERE tenant_id = $1
      AND (customer_phone = $2 OR customer_phone = $3)
    ORDER BY created_at DESC
    LIMIT 20
  `, [tenantId, customer.phone, customer.phone?.replace(/\D/g,'')]);

  res.json({ success: true, data: { ...customer, orders } });
});

/** PATCH /api/tenant/crm/:id — atualiza notas e tags */
const updateCRMCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { notes, tags, name, address } = req.body;

  const { rows } = await db.query(`
    UPDATE loyalty_customers
    SET notes      = COALESCE($2, notes),
        tags       = COALESCE($3::text[], tags),
        name       = COALESCE($4, name),
        address    = COALESCE($5, address),
        updated_at = NOW()
    WHERE id = $1 AND tenant_id = $6
    RETURNING *
  `, [id, notes ?? null, tags ? JSON.stringify(tags) : null, name ?? null, address ?? null, req.user.tenantId]);

  if (!rows[0]) throw new AppError('Cliente não encontrado.', 404);
  res.json({ success: true, data: rows[0] });
});

module.exports = { getMe, updatePlan, updateProfile, setChatbot, getCashbackConfig, setCashbackConfig, getLoyaltyCustomers, getRatings, getWhatsappStatus, connectWhatsapp, disconnectWhatsapp, updateSettings, getFullSettings, createLead, importLeads, listCRMCustomers, getCRMCustomer, updateCRMCustomer };
