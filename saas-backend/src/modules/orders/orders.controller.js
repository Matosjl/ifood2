const { v4: uuidv4 }     = require('uuid');
const { validationResult } = require('express-validator');
const service              = require('./orders.service');
const { enqueueAndWait }   = require('../../queues/order.queue');
const Order                = require('../../models/Order');
const asyncHandler         = require('../../utils/asyncHandler');
const AppError             = require('../../utils/AppError');
const db                   = require('../../config/database');
const eventService         = require('../../socket/eventService');
const waNotify             = require('../../services/waNotify.service');

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(errors.array().map(e => e.msg).join('. '), 422);
  }
};

// ── Leitura (direto no DB, sem overhead de fila) ──────────────

/**
 * GET /api/orders
 * Query: status, channel, startDate, endDate, page, limit
 */
const list = asyncHandler(async (req, res) => {
  const { status, channel, startDate, endDate, page, limit } = req.query;
  const orders = await service.listOrders(req.user.tenantId, {
    status, channel, startDate, endDate,
    page:  parseInt(page) || 1,
    limit: Math.min(parseInt(limit) || 50, 200),
  });
  res.json({ success: true, data: orders });
});

/** GET /api/orders/:id */
const getOne = asyncHandler(async (req, res) => {
  const order = await service.getOrder(req.params.id, req.user.tenantId);
  res.json({ success: true, data: order });
});

/** GET /api/orders/transitions/:status */
const transitions = asyncHandler(async (req, res) => {
  const valid = Order.getValidTransitions(req.params.status);
  res.json({ success: true, data: { current: req.params.status, next: valid } });
});

// ── Escrita (via fila BullMQ) ─────────────────────────────────

/**
 * POST /api/orders
 *
 * Idempotencia: o cliente pode enviar X-Idempotency-Key (UUID).
 * Se omitido, geramos um para esta requisicao.
 * O mesmo key e usado como jobId no BullMQ (dedup em fila) e
 * como idempotency_key no DB (dedup permanente).
 *
 * O pedido e criado com status 'confirmed' pelo worker.
 */
const create = asyncHandler(async (req, res) => {
  handleValidation(req);

  // ── Caixa obrigatório ────────────────────────────────────────
  const { rows: caixaRows } = await db.query(
    `SELECT id FROM cash_registers WHERE tenant_id = $1 AND status = 'open' LIMIT 1`,
    [req.user.tenantId]
  );
  if (!caixaRows[0]) {
    throw new AppError('Caixa fechado. Abra o caixa na aba Financeiro antes de lançar pedidos.', 409);
  }

  const idempotencyKey = req.headers['x-idempotency-key'] || uuidv4();
  const order = await enqueueAndWait(
    'create',
    { tenantId: req.user.tenantId, payload: req.body, idempotencyKey },
    { idempotencyKey }
  );
  res.status(201).json({ success: true, data: order });
});

/**
 * PATCH /api/orders/:id/status
 * Body: { status }
 *
 * Mudança de status vai DIRETO ao banco — não passa pela fila BullMQ.
 * Apenas criação e cancelamento precisam da fila (deductStock / addStock).
 * Isso elimina o travamento de 15s quando o worker está ocupado.
 */
const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status) throw new AppError('Status e obrigatorio.', 400);

  const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new AppError(`Status invalido. Use: ${validStatuses.join(', ')}.`, 400);
  }

  // Cancelamento ainda precisa da fila (devolve estoque)
  if (status === 'cancelled') {
    const order = await enqueueAndWait('cancel', {
      orderId:  req.params.id,
      tenantId: req.user.tenantId,
    });
    return res.json({ success: true, data: order });
  }

  // Todos os outros status: direto no banco, sem fila, sem timeout
  const order = await service.updateStatus(req.params.id, req.user.tenantId, status);
  if (!order) throw new AppError('Pedido nao encontrado.', 404);

  // Notifica todos os clientes conectados (evita estado dessincronizado no frontend)
  eventService.orderUpdated(req.user.tenantId, order);

  // Envia notificação WhatsApp ao cliente (fire-and-forget)
  waNotify.notifyCustomer(req.user.tenantId, order).catch(() => {});

  res.json({ success: true, data: order });
});

/** DELETE /api/orders/:id — cancela e devolve estoque */
const cancel = asyncHandler(async (req, res) => {
  const order = await enqueueAndWait('cancel', {
    orderId:  req.params.id,
    tenantId: req.user.tenantId,
  });
  res.json({ success: true, data: order, message: 'Pedido cancelado. Estoque devolvido.' });
});

/**
 * PATCH /api/orders/:id/paid
 * Body: { paymentMethod }
 * Registra pagamento do pedido (paid_at + payment_method).
 */
const setPaid = asyncHandler(async (req, res) => {
  const { paymentMethod } = req.body;
  const validMethods = ['cash', 'pix', 'credit', 'debit', 'voucher', 'fiado', 'other'];
  if (!paymentMethod || !validMethods.includes(paymentMethod)) {
    throw new AppError(`Forma de pagamento inválida. Use: ${validMethods.join(', ')}.`, 400);
  }
  const order = await service.markAsPaid(req.params.id, req.user.tenantId, paymentMethod);
  eventService.orderUpdated(req.user.tenantId, order);
  res.json({ success: true, data: order });
});

/**
 * PATCH /api/orders/:id/items
 * Body: { items }
 * Substitui os itens de um pedido editável (pending/confirmed/preparing).
 * Reconcilia estoque automaticamente.
 */
const updateItems = asyncHandler(async (req, res) => {
  handleValidation(req);
  const order = await service.editOrderItems(req.params.id, req.user.tenantId, req.body.items);
  eventService.orderUpdated(req.user.tenantId, order);
  res.json({ success: true, data: order });
});

/** GET /api/orders/customers?q=...&limit=N — busca clientes (pedidos + cadastro manual) */
const searchCustomers = asyncHandler(async (req, res) => {
  const q     = (req.query.q ?? '').trim();
  const limit = Math.min(parseInt(req.query.limit ?? '200', 10) || 200, 500);
  const db    = require('../../config/database');

  const params = [req.user.tenantId];
  let orderFilter  = '';
  let manualFilter = '';
  if (q) {
    params.push(`%${q}%`);
    orderFilter  = `AND (customer_name ILIKE $2 OR customer_phone ILIKE $2)`;
    manualFilter = `AND (tc.name ILIKE $2 OR tc.phone ILIKE $2)`;
  }
  params.push(limit);
  const limitParam = `$${params.length}`;

  const sql = `
    WITH ranked_orders AS (
      SELECT customer_name, customer_phone, customer_address, neighborhood, delivery_fee, total, created_at,
             -- normaliza telefone: remove não-dígitos para agrupar variações de formato
             regexp_replace(COALESCE(customer_phone,''), '[^0-9]', '', 'g') AS phone_norm,
             ROW_NUMBER() OVER (
               PARTITION BY lower(customer_name), regexp_replace(COALESCE(customer_phone,''), '[^0-9]', '', 'g')
               ORDER BY created_at DESC
             ) AS rn
      FROM   orders
      WHERE  tenant_id = $1
        AND  customer_name IS NOT NULL
        AND  customer_name <> ''
        ${orderFilter}
    ),
    order_agg AS (
      SELECT MIN(customer_name)   AS name,
             NULLIF(phone_norm,'')AS phone,
             MAX(CASE WHEN rn = 1 THEN customer_address END) AS address,
             MAX(CASE WHEN rn = 1 THEN neighborhood END)     AS neighborhood,
             MAX(CASE WHEN rn = 1 THEN delivery_fee END)     AS delivery_fee,
             COUNT(*)::int        AS order_count,
             MAX(created_at)      AS last_order_date,
             SUM(total)::numeric  AS total_spent,
             NULL::uuid           AS client_id
      FROM   ranked_orders
      GROUP  BY lower(customer_name), phone_norm
    ),
    manual_only AS (
      SELECT tc.name, tc.phone, tc.address,
             NULL::text          AS neighborhood,
             NULL::numeric       AS delivery_fee,
             0::int              AS order_count,
             NULL::timestamptz   AS last_order_date,
             0::numeric          AS total_spent,
             tc.id               AS client_id
      FROM   tenant_clients tc
      WHERE  tc.tenant_id = $1
        ${manualFilter}
        AND NOT EXISTS (
          SELECT 1 FROM order_agg oa
          WHERE (tc.phone IS NOT NULL AND tc.phone <> ''
                 AND oa.phone = regexp_replace(tc.phone, '[^0-9]', '', 'g'))
             OR ((tc.phone IS NULL OR tc.phone = '')
                 AND lower(oa.name) = lower(tc.name))
        )
    )
    SELECT ua.*, COALESCE(lc.cashback_balance, 0)::numeric AS cashback_balance
    FROM (
      SELECT * FROM order_agg
      UNION ALL
      SELECT * FROM manual_only
    ) ua
    LEFT JOIN loyalty_customers lc
      ON lc.tenant_id = $1
     AND ua.phone IS NOT NULL AND ua.phone <> ''
     AND lc.phone = ua.phone
    ORDER BY last_order_date DESC NULLS LAST, ua.name ASC
    LIMIT ${limitParam}
  `;

  const { rows } = await db.query(sql, params);
  res.json({ success: true, data: rows });
});

/** POST /api/orders/customers — cadastra cliente manualmente */
const createCustomer = asyncHandler(async (req, res) => {
  const { name, phone, address, coords, notes } = req.body;
  if (!name?.trim()) throw new AppError('Nome é obrigatório.', 400);

  const db = require('../../config/database');

  if (phone?.trim()) {
    const { rows: dup } = await db.query(
      `SELECT id FROM tenant_clients
       WHERE  tenant_id = $1 AND lower(phone) = lower($2) LIMIT 1`,
      [req.user.tenantId, phone.trim()]
    );
    if (dup.length) throw new AppError('Já existe um cliente com esse telefone.', 409);
  }

  const { rows } = await db.query(
    `INSERT INTO tenant_clients (tenant_id, name, phone, address, coords, notes)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING *`,
    [
      req.user.tenantId,
      name.trim(),
      phone?.trim() || null,
      address?.trim() || null,
      coords ? JSON.stringify(coords) : null,
      notes?.trim() || null,
    ]
  );

  res.status(201).json({ success: true, data: rows[0] });
});

/**
 * PATCH /api/orders/:id/info
 * Atualiza entrega, endereço, taxa e aplica desconto/acréscimo.
 */
const updateInfo = asyncHandler(async (req, res) => {
  const { deliveryType, neighborhood, customerAddress, deliveryFee,
          notes, adjustmentType, adjustmentValue, adjustmentReason } = req.body;

  if (adjustmentType && !['discount', 'surcharge'].includes(adjustmentType)) {
    throw new AppError('adjustmentType deve ser "discount" ou "surcharge".', 400);
  }

  const order = await service.updateOrderInfo(req.params.id, req.user.tenantId, {
    deliveryType, neighborhood, customerAddress, deliveryFee,
    notes, adjustmentType, adjustmentValue, adjustmentReason,
  });

  eventService.orderUpdated(req.user.tenantId, order);
  res.json({ success: true, data: order });
});

/** GET /api/orders/customers/funnel — segmentação CRM de todos os clientes */
const getCustomerFunnel = asyncHandler(async (req, res) => {
  const db = require('../../config/database');

  const sql = `
    WITH base AS (
      SELECT
        COALESCE(lc.name, oa.name)              AS name,
        COALESCE(lc.phone, oa.phone)            AS phone,
        COALESCE(lc.address, oa.address)        AS address,
        COALESCE(lc.cashback_balance, 0)        AS cashback_balance,
        COALESCE(oa.order_count, 0)::int        AS order_count,
        COALESCE(oa.total_spent, 0)::numeric    AS total_spent,
        oa.last_order_date
      FROM loyalty_customers lc
      FULL OUTER JOIN (
        SELECT
          customer_name  AS name,
          customer_phone AS phone,
          MAX(customer_address) AS address,
          COUNT(*)::int         AS order_count,
          SUM(total)::numeric   AS total_spent,
          MAX(created_at)       AS last_order_date
        FROM orders
        WHERE tenant_id = $1 AND status NOT IN ('cancelled','pending') AND customer_name IS NOT NULL
        GROUP BY customer_name, customer_phone
      ) oa ON lower(lc.phone) = lower(oa.phone)
      WHERE lc.tenant_id = $1 OR oa.name IS NOT NULL
    ),
    segmented AS (
      SELECT *,
        CASE
          WHEN order_count = 0 OR last_order_date IS NULL                                          THEN 'lead'
          WHEN order_count >= 6 AND last_order_date > NOW() - INTERVAL '30 days'                   THEN 'vip'
          WHEN order_count >= 2 AND last_order_date > NOW() - INTERVAL '30 days'                   THEN 'recorrente'
          WHEN order_count = 1  AND last_order_date > NOW() - INTERVAL '30 days'                   THEN 'novo'
          WHEN last_order_date  > NOW() - INTERVAL '60 days'                                       THEN 'em_risco'
          ELSE 'perdido'
        END AS segment
      FROM base
    )
    SELECT * FROM segmented ORDER BY last_order_date DESC NULLS LAST, name ASC
  `;

  const { rows } = await db.query(sql, [req.user.tenantId]);
  res.json({ success: true, data: rows });
});

/** GET /api/orders/analytics/hourly?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD */
const hourlyStats = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const data = await service.getHourlyStats(req.user.tenantId, { startDate, endDate });
  res.json({ success: true, data });
});

/** PATCH /api/orders/customers — edita nome e/ou telefone de um cliente */
const updateCustomer = asyncHandler(async (req, res) => {
  const { clientId, oldPhone, name, phone } = req.body;
  const tenantId = req.user.tenantId;
  const db = require('../../config/database');

  if (!name?.trim() && !phone?.trim()) throw new AppError('Informe ao menos nome ou telefone.', 400);

  if (clientId) {
    // Cliente manual: atualiza tenant_clients
    const { rows } = await db.query(
      `UPDATE tenant_clients SET name = COALESCE($2, name), phone = COALESCE($3, phone), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $4 RETURNING *`,
      [clientId, name?.trim() || null, phone?.trim() || null, tenantId]
    );
    if (!rows[0]) throw new AppError('Cliente não encontrado.', 404);
  }

  // Atualiza loyalty_customers pelo telefone antigo (se existir)
  const normOld = (oldPhone ?? '').replace(/\D/g, '');
  if (normOld) {
    const normNew = (phone ?? '').replace(/\D/g, '') || normOld;
    await db.query(
      `UPDATE loyalty_customers SET name = COALESCE($2, name), phone = COALESCE($3, phone), updated_at = NOW()
       WHERE tenant_id = $1 AND phone = $4`,
      [tenantId, name?.trim() || null, normNew || null, normOld]
    );
  }

  res.json({ success: true });
});

module.exports = { list, getOne, create, updateStatus, cancel, transitions, searchCustomers, createCustomer, updateCustomer, setPaid, updateItems, updateInfo, getCustomerFunnel, hourlyStats };
