const { v4: uuidv4 }     = require('uuid');
const { validationResult } = require('express-validator');
const service              = require('./orders.service');
const { enqueueAndWait }   = require('../../queues/order.queue');
const Order                = require('../../models/Order');
const asyncHandler         = require('../../utils/asyncHandler');
const AppError             = require('../../utils/AppError');
const db                   = require('../../config/database');

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
 */
const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status) throw new AppError('Status e obrigatorio.', 400);

  const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new AppError(`Status invalido. Use: ${validStatuses.join(', ')}.`, 400);
  }

  const order = await enqueueAndWait('updateStatus', {
    orderId:  req.params.id,
    tenantId: req.user.tenantId,
    status,
  });
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

/** GET /api/orders/customers?q=... — busca clientes pelo histórico */
const searchCustomers = asyncHandler(async (req, res) => {
  const q = (req.query.q ?? '').trim();
  if (!q) return res.json({ success: true, data: [] });

  const { rows } = await require('../../config/database').query(
    `SELECT DISTINCT ON (lower(customer_name), customer_phone)
            customer_name, customer_phone, customer_address
     FROM   orders
     WHERE  tenant_id = $1
       AND  (customer_name ILIKE $2 OR customer_phone ILIKE $2)
       AND  customer_name IS NOT NULL
     ORDER  BY lower(customer_name), customer_phone, created_at DESC
     LIMIT  8`,
    [req.user.tenantId, `%${q}%`]
  );
  res.json({ success: true, data: rows });
});

module.exports = { list, getOne, create, updateStatus, cancel, transitions, searchCustomers };
