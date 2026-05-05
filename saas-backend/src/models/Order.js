const db       = require('../config/database');
const AppError = require('../utils/AppError');

// Máquina de estados: status → próximos estados válidos
const STATUS_TRANSITIONS = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready',     'cancelled'],
  ready:     ['delivered'],
  delivered: [],
  cancelled: [],
};

class Order {
  // ── Queries ────────────────────────────────────────────────

  /**
   * Lista pedidos com filtros opcionais.
   * @param {object} filters - { status, channel, startDate, endDate, page, limit }
   */
  static async findAll(tenantId, filters = {}, dbClient = db) {
    const { status, channel, startDate, endDate, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;
    const params = [tenantId];
    const conditions = ['o.tenant_id = $1'];

    if (status) {
      params.push(status);
      conditions.push(`o.status = $${params.length}`);
    }
    if (channel) {
      params.push(channel);
      conditions.push(`o.channel = $${params.length}`);
    }
    if (startDate) {
      params.push(startDate);
      conditions.push(`o.created_at >= $${params.length}`);
    }
    if (endDate) {
      params.push(endDate);
      conditions.push(`o.created_at <= $${params.length}`);
    }

    params.push(limit, offset);
    const { rows } = await dbClient.query(
      `SELECT o.*,
              json_agg(
                json_build_object(
                  'id',           oi.id,
                  'product_id',   oi.product_id,
                  'product_name', oi.product_name,
                  'quantity',     oi.quantity,
                  'weight_kg',    oi.weight_kg,
                  'unit_price',   oi.unit_price,
                  'total',        oi.total,
                  'notes',        oi.notes
                ) ORDER BY oi.id
              ) AS items
       FROM   orders o
       LEFT   JOIN order_items oi ON oi.order_id = o.id
       WHERE  ${conditions.join(' AND ')}
       GROUP  BY o.id
       ORDER  BY o.created_at DESC
       LIMIT  $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  }

  /** Busca pedido completo por ID (com items). */
  static async findById(id, tenantId, dbClient = db) {
    const { rows } = await dbClient.query(
      `SELECT o.*,
              json_agg(
                json_build_object(
                  'id',           oi.id,
                  'product_id',   oi.product_id,
                  'product_name', oi.product_name,
                  'quantity',     oi.quantity,
                  'weight_kg',    oi.weight_kg,
                  'unit_price',   oi.unit_price,
                  'total',        oi.total,
                  'notes',        oi.notes
                ) ORDER BY oi.id
              ) AS items
       FROM   orders o
       LEFT   JOIN order_items oi ON oi.order_id = o.id
       WHERE  o.id = $1 AND o.tenant_id = $2
       GROUP  BY o.id`,
      [id, tenantId]
    );
    return rows[0] || null;
  }

  // ── Criação (com transaction) ──────────────────────────────

  /**
   * Obtém o próximo número de pedido para o tenant.
   * Usa upsert atômico — safe com requisições concorrentes.
   * DEVE ser chamado dentro de uma transaction.
   */
  static async nextOrderNumber(tenantId, dbClient = db) {
    const { rows } = await dbClient.query(
      `INSERT INTO order_counters (tenant_id, last_number) VALUES ($1, 1)
       ON CONFLICT (tenant_id) DO UPDATE
         SET last_number = order_counters.last_number + 1
       RETURNING last_number`,
      [tenantId]
    );
    return rows[0].last_number;
  }

  /**
   * Cria o registro do pedido (sem items). Chamar dentro de transaction.
   * @param {string} [initialStatus='pending'] - status inicial (use 'confirmed' para pedidos manuais)
   * @param {string} [idempotencyKey]          - chave de idempotencia; UNIQUE no DB
   */
  static async createOrder(
    { tenantId, orderNumber, customerName, customerPhone, customerAddress,
      channel, total, notes, deliveryType = 'pickup', paymentMethod = 'cash',
      initialStatus = 'pending', idempotencyKey = null },
    dbClient = db
  ) {
    const { rows } = await dbClient.query(
      `INSERT INTO orders
         (tenant_id, order_number, customer_name, customer_phone, customer_address,
          channel, total, notes, delivery_type, payment_method, status, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [tenantId, orderNumber, customerName || null, customerPhone || null,
       customerAddress || null, channel || 'manual', total, notes || null,
       deliveryType, paymentMethod, initialStatus, idempotencyKey]
    );
    return rows[0];
  }

  /** Insere um item no pedido. Chamar dentro de transaction. */
  static async createItem({ orderId, productId, productName, quantity, weightKg, unitPrice, total, notes }, dbClient = db) {
    const { rows } = await dbClient.query(
      `INSERT INTO order_items
         (order_id, product_id, product_name, quantity, weight_kg, unit_price, total, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [orderId, productId || null, productName, quantity, weightKg || null, unitPrice, total, notes || null]
    );
    return rows[0];
  }

  // ── Status ─────────────────────────────────────────────────

  /**
   * Atualiza o status do pedido validando a máquina de estados.
   * Lança AppError 400 se a transição for inválida.
   */
  static async updateStatus(id, tenantId, newStatus, dbClient = db) {
    // Busca status atual
    const { rows: current } = await dbClient.query(
      `SELECT status FROM orders WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (!current[0]) throw new AppError('Pedido não encontrado.', 404);

    const currentStatus = current[0].status;
    const allowed = STATUS_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(newStatus)) {
      throw new AppError(
        `Transição inválida: ${currentStatus} → ${newStatus}. Permitido: [${allowed.join(', ')}]`,
        400
      );
    }

    const { rows } = await dbClient.query(
      `UPDATE orders
       SET status = $3, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId, newStatus]
    );
    return rows[0];
  }

  /** Retorna as transições de status válidas a partir do estado atual. */
  static getValidTransitions(status) {
    return STATUS_TRANSITIONS[status] || [];
  }
}

module.exports = Order;
