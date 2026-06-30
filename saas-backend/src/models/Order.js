const db       = require('../config/database');
const AppError = require('../utils/AppError');

// Máquina de estados: status → próximos estados válidos
const STATUS_TRANSITIONS = {
  pending:    ['confirmed', 'preparing', 'cancelled'], // aceitar + já iniciar preparo (atalho)
  confirmed:  ['preparing', 'cancelled'],
  preparing:  ['ready',     'cancelled'],
  ready:      ['preparing', 'delivered', 'delivering', 'cancelled'], // delivery: saiu para entrega
  delivering: ['delivered', 'cancelled'],               // motoboy confirma entrega
  delivered:  ['cancelled'],
  cancelled:  [],
};

class Order {
  // ── Queries ────────────────────────────────────────────────

  /**
   * Lista pedidos com filtros opcionais.
   * @param {object} filters - { status, channel, startDate, endDate, page, limit }
   */
  static async findAll(tenantId, filters = {}, dbClient = db) {
    const { status, channel, search, startDate, endDate, page = 1, limit = 50 } = filters;
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
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(o.customer_name ILIKE $${params.length} OR o.customer_phone ILIKE $${params.length})`);
    }
    if (startDate) {
      params.push(startDate);
      conditions.push(`o.created_at >= $${params.length}`);
    }
    if (endDate) {
      // If only a date (YYYY-MM-DD), extend to end of that day
      const endTs = endDate.length === 10 ? `${endDate}T23:59:59.999Z` : endDate;
      params.push(endTs);
      conditions.push(`o.created_at <= $${params.length}`);
    }

    params.push(limit, offset);
    const { rows } = await dbClient.query(
      `SELECT o.*,
              (SELECT name FROM users WHERE id = o.created_by)                AS created_by_name,
              (SELECT name FROM users WHERE id = o.cancelled_by)              AS cancelled_by_name,
              (SELECT u.name FROM order_audit_logs al
               JOIN users u ON u.id = al.user_id
               WHERE al.order_id = o.id AND al.action IN ('items_edited','adjustment_applied')
               ORDER BY al.created_at DESC LIMIT 1)                          AS last_edited_by_name,
              (SELECT al.created_at FROM order_audit_logs al
               WHERE al.order_id = o.id AND al.action IN ('items_edited','adjustment_applied')
               ORDER BY al.created_at DESC LIMIT 1)                          AS last_edited_at,
              json_agg(
                json_build_object(
                  'id',              oi.id,
                  'product_id',      oi.product_id,
                  'product_name',    oi.product_name,
                  'quantity',        oi.quantity,
                  'weight_kg',       oi.weight_kg,
                  'unit_price',      oi.unit_price,
                  'total',           oi.total,
                  'notes',           oi.notes,
                  'variation_label', oi.variation_label,
                  'variation_price', oi.variation_price,
                  'printer_target',  COALESCE(c.printer_target, 'kitchen'),
                  'addons', (
                    SELECT COALESCE(json_agg(json_build_object(
                      'id',            oia.id,
                      'addon_item_id', oia.addon_item_id,
                      'addon_name',    oia.addon_name,
                      'qty',           oia.qty,
                      'unit_price',    oia.unit_price,
                      'total',         oia.total
                    )), '[]'::json)
                    FROM order_item_addons oia WHERE oia.order_item_id = oi.id
                  ),
                  'choices', (
                    SELECT COALESCE(json_agg(json_build_object(
                      'group_id',     oicc.group_id,
                      'product_id',   oicc.product_id,
                      'product_name', cp.name,
                      'extra_price',  oicc.extra_price
                    )), '[]'::json)
                    FROM order_item_combo_choices oicc
                    JOIN products cp ON cp.id = oicc.product_id
                    WHERE oicc.order_item_id = oi.id
                  )
                ) ORDER BY oi.line_no NULLS LAST, oi.id
              ) FILTER (WHERE oi.id IS NOT NULL) AS items
       FROM   orders o
       LEFT   JOIN order_items oi ON oi.order_id = o.id
       LEFT   JOIN products p   ON p.id = oi.product_id
       LEFT   JOIN categories c ON c.id = p.category_id
       WHERE  ${conditions.join(' AND ')}
       GROUP  BY o.id
       ORDER  BY o.created_at DESC
       LIMIT  $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  }

  /** Busca pedido completo por ID (com items + addons). */
  static async findById(id, tenantId, dbClient = db) {
    const { rows } = await dbClient.query(
      `SELECT o.*,
              json_agg(
                json_build_object(
                  'id',              oi.id,
                  'product_id',      oi.product_id,
                  'product_name',    oi.product_name,
                  'quantity',        oi.quantity,
                  'weight_kg',       oi.weight_kg,
                  'unit_price',      oi.unit_price,
                  'total',           oi.total,
                  'notes',           oi.notes,
                  'variation_label', oi.variation_label,
                  'variation_price', oi.variation_price,
                  'printer_target',  COALESCE(c.printer_target, 'kitchen'),
                  'addons', (
                    SELECT COALESCE(json_agg(json_build_object(
                      'id',            oia.id,
                      'addon_item_id', oia.addon_item_id,
                      'addon_name',    oia.addon_name,
                      'qty',           oia.qty,
                      'unit_price',    oia.unit_price,
                      'total',         oia.total
                    )), '[]'::json)
                    FROM order_item_addons oia WHERE oia.order_item_id = oi.id
                  ),
                  'choices', (
                    SELECT COALESCE(json_agg(json_build_object(
                      'group_id',     oicc.group_id,
                      'product_id',   oicc.product_id,
                      'product_name', cp.name,
                      'extra_price',  oicc.extra_price
                    )), '[]'::json)
                    FROM order_item_combo_choices oicc
                    JOIN products cp ON cp.id = oicc.product_id
                    WHERE oicc.order_item_id = oi.id
                  )
                ) ORDER BY oi.line_no NULLS LAST, oi.id
              ) FILTER (WHERE oi.id IS NOT NULL) AS items,
              COALESCE(
                (
                  SELECT json_agg(json_build_object(
                    'id',              op.id,
                    'method',          op.method,
                    'amount',          op.amount,
                    'received_amount', op.received_amount,
                    'change_amount',   op.change_amount,
                    'created_at',      op.created_at
                  ) ORDER BY op.created_at)
                  FROM order_payments op
                  WHERE op.order_id = o.id
                ),
                '[]'::json
              ) AS payments
       FROM   orders o
       LEFT   JOIN order_items oi ON oi.order_id = o.id
       LEFT   JOIN products p   ON p.id = oi.product_id
       LEFT   JOIN categories c ON c.id = p.category_id
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
      deliveryFee = 0, neighborhood = null, initialStatus = 'pending', idempotencyKey = null,
      loyaltyCustomerId = null, cashbackEarned = 0, cashbackUsed = 0, tableNumber = null,
      deliveryLat = null, deliveryLng = null, cashChangeFor = null, createdBy = null },
    dbClient = db
  ) {
    const { rows } = await dbClient.query(
      `INSERT INTO orders
         (tenant_id, order_number, customer_name, customer_phone, customer_address,
          channel, total, notes, delivery_type, payment_method, delivery_fee, neighborhood, status, idempotency_key,
          loyalty_customer_id, cashback_earned, cashback_used, table_number,
          delivery_lat, delivery_lng, cash_change_for, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [tenantId, orderNumber, customerName || null, customerPhone || null,
       customerAddress || null, channel || 'manual', total, notes || null,
       deliveryType, paymentMethod, parseFloat(deliveryFee) || 0,
       neighborhood || null, initialStatus, idempotencyKey,
       loyaltyCustomerId || null,
       parseFloat(cashbackEarned) || 0,
       parseFloat(cashbackUsed)   || 0,
       tableNumber || null,
       deliveryLat  ? parseFloat(deliveryLat)  : null,
       deliveryLng  ? parseFloat(deliveryLng)  : null,
       cashChangeFor ? parseFloat(cashChangeFor) : null,
       createdBy || null]
    );
    return rows[0];
  }

  /** Insere um item no pedido. Chamar dentro de transaction. */
  static async createItem({ orderId, productId, productName, quantity, weightKg, unitPrice, total, notes, unitCost = 0, totalCost = 0, variationLabel = null, variationPrice = null, lineNo = null }, dbClient = db) {
    const { rows } = await dbClient.query(
      `INSERT INTO order_items
         (order_id, product_id, product_name, quantity, weight_kg, unit_price, total, notes, unit_cost, total_cost, variation_label, variation_price, line_no)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [orderId, productId || null, productName, quantity, weightKg || null, unitPrice, total, notes || null,
       parseFloat(unitCost) || 0, parseFloat(totalCost) || 0,
       variationLabel || null, variationPrice != null ? parseFloat(variationPrice) : null,
       lineNo != null ? parseInt(lineNo, 10) : null]
    );
    return rows[0];
  }

  // ── Status ─────────────────────────────────────────────────

  /**
   * Atualiza o status do pedido validando a máquina de estados.
   * Lança AppError 400 se a transição for inválida.
   */
  static async updateStatus(id, tenantId, newStatus, cancelReason = null, dbClient = db) {
    // Busca status atual
    const { rows: current } = await dbClient.query(
      `SELECT status FROM orders WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (!current[0]) throw new AppError('Pedido não encontrado.', 404);

    const currentStatus = current[0].status;

    // Mesmo status → operação idempotente, retorna sem alterar nem lançar erro
    if (currentStatus === newStatus) {
      const { rows: same } = await dbClient.query(
        `SELECT * FROM orders WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );
      return same[0];
    }

    const allowed = STATUS_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(newStatus)) {
      throw new AppError(
        `Transição inválida: ${currentStatus} → ${newStatus}. Permitido: [${allowed.join(', ')}]`,
        400
      );
    }

    // Bloqueia entrega se pagamento ainda não foi confirmado
    if (newStatus === 'delivered' && current[0].payment_method === 'pending' && !current[0].paid_at) {
      throw new AppError(
        'Pagamento ainda não registrado. Use "Receber Pagamento" antes de entregar.',
        400
      );
    }

    const { rows } = await dbClient.query(
      `UPDATE orders
       SET status = $3,
           cancel_reason = CASE WHEN $5 THEN $4 ELSE cancel_reason END,
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId, newStatus, cancelReason ?? null, newStatus === 'cancelled']
    );
    return rows[0];
  }

  /** Retorna as transições de status válidas a partir do estado atual. */
  static getValidTransitions(status) {
    return STATUS_TRANSITIONS[status] || [];
  }

  /**
   * Registra pagamento de um pedido.
   * Define paid_at = NOW() e atualiza payment_method.
   */
  static async markAsPaid(id, tenantId, paymentMethod, dbClient = db) {
    const { rows } = await dbClient.query(
      `UPDATE orders
       SET paid_at = NOW(), payment_method = $3, updated_at = NOW()
       WHERE  id = $1 AND tenant_id = $2
         AND  status NOT IN ('cancelled')
       RETURNING *`,
      [id, tenantId, paymentMethod]
    );
    if (!rows[0]) throw new AppError('Pedido não encontrado ou cancelado.', 404);
    return rows[0];
  }
}

module.exports = Order;
