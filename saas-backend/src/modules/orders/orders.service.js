const db       = require('../../config/database');
const Order    = require('../../models/Order');
const Product  = require('../../models/Product');
const Tenant   = require('../../models/Tenant');
const AppError = require('../../utils/AppError');

// ── Leitura ───────────────────────────────────────────────────

const listOrders = (tenantId, query) => Order.findAll(tenantId, query);

const getOrder = async (id, tenantId) => {
  const order = await Order.findById(id, tenantId);
  if (!order) throw new AppError('Pedido nao encontrado.', 404);
  return order;
};

// ── Criacao ───────────────────────────────────────────────────

/**
 * Cria pedido com desconto atomico de estoque.
 *
 * @param {string} [initialStatus='pending']  - 'confirmed' para pedidos manuais
 * @param {string} [idempotencyKey]           - previne processamento duplo
 *
 * Idempotencia em duas camadas:
 *  1. Verificacao pre-transacao (fast path — evita trabalho redundante)
 *  2. Restricao UNIQUE no DB (captura requisicoes concorrentes com mesmo key)
 */
const createOrder = async (tenantId, {
  customerName, customerPhone, customerAddress,
  channel = 'manual', notes, items,
  initialStatus = 'pending', idempotencyKey,
}) => {
  if (!items?.length) throw new AppError('O pedido deve ter pelo menos 1 item.', 400);

  // Camada 1: fast path — evita abrir transacao desnecessaria
  if (idempotencyKey) {
    const { rows: existing } = await db.query(
      `SELECT id FROM orders WHERE idempotency_key = $1 AND tenant_id = $2`,
      [idempotencyKey, tenantId]
    );
    if (existing[0]) return Order.findById(existing[0].id, tenantId);
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Pre-carrega todos os produtos solicitados
    const productIds = [...new Set(items.map(i => i.productId))];
    const { rows: products } = await client.query(
      `SELECT id, name, sale_type, sale_price, stock_qty, active
       FROM products
       WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
      [productIds, tenantId]
    );
    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    // Valida e calcula totais
    let orderTotal = 0;
    const resolvedItems = [];

    for (const item of items) {
      const product = productMap[item.productId];
      if (!product) throw new AppError(`Produto ${item.productId} nao encontrado.`, 404);
      if (!product.active) throw new AppError(`Produto "${product.name}" esta inativo.`, 400);

      let qty, lineTotal;
      if (product.sale_type === 'kg') {
        if (!item.weightKg || item.weightKg <= 0)
          throw new AppError(`Produto "${product.name}" e vendido por kg. Informe weightKg.`, 400);
        qty       = item.weightKg;
        lineTotal = parseFloat(product.sale_price) * item.weightKg;
      } else {
        if (!item.quantity || item.quantity <= 0)
          throw new AppError(`Produto "${product.name}": quantity invalido.`, 400);
        qty       = item.quantity;
        lineTotal = parseFloat(product.sale_price) * item.quantity;
      }

      orderTotal += lineTotal;
      resolvedItems.push({ ...item, product, qty, lineTotal });
    }

    // Desconto atomico de estoque — UPDATE ... WHERE stock_qty >= qty
    for (const item of resolvedItems) {
      await Product.deductStock(item.product.id, tenantId, item.qty, client);
    }

    const orderNumber = await Order.nextOrderNumber(tenantId, client);

    const order = await Order.createOrder({
      tenantId, orderNumber,
      customerName, customerPhone, customerAddress,
      channel, total: parseFloat(orderTotal.toFixed(2)), notes,
      initialStatus, idempotencyKey,
    }, client);

    for (const item of resolvedItems) {
      await Order.createItem({
        orderId:     order.id,
        productId:   item.product.id,
        productName: item.product.name,
        quantity:    item.product.sale_type === 'unit' ? item.quantity : 1,
        weightKg:    item.product.sale_type === 'kg'   ? item.weightKg : null,
        unitPrice:   parseFloat(item.product.sale_price),
        total:       parseFloat(item.lineTotal.toFixed(2)),
        notes:       item.notes,
      }, client);

      await Product.createMovement({
        tenantId,
        productId:   item.product.id,
        productName: item.product.name,
        quantity:    -item.qty,
        type:        'out',
        reason:      `Pedido #${orderNumber}`,
        orderId:     order.id,
      }, client);
    }

    await client.query('COMMIT');

    // Incrementa contador mensal de pedidos (fire-and-forget)
    Tenant.incrementOrderCount(tenantId).catch(() => {});

    return Order.findById(order.id, tenantId);

  } catch (err) {
    await client.query('ROLLBACK');

    // Camada 2: requisicao concorrente com mesmo idempotencyKey chegou primeiro
    if (err.code === '23505' && idempotencyKey) {
      const { rows } = await db.query(
        `SELECT id FROM orders WHERE idempotency_key = $1 AND tenant_id = $2`,
        [idempotencyKey, tenantId]
      );
      if (rows[0]) return Order.findById(rows[0].id, tenantId);
    }

    throw err;
  } finally {
    client.release();
  }
};

// ── Status ────────────────────────────────────────────────────

const updateStatus = async (id, tenantId, status) => Order.updateStatus(id, tenantId, status);

/**
 * Cancela o pedido e devolve estoque se ja estava em producao.
 */
const cancelOrder = async (id, tenantId) => {
  const order = await Order.findById(id, tenantId);
  if (!order) throw new AppError('Pedido nao encontrado.', 404);

  const updated = await Order.updateStatus(id, tenantId, 'cancelled');

  if (['confirmed', 'preparing', 'ready'].includes(order.status)) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      for (const item of (order.items || [])) {
        if (!item.product_id) continue;
        const qty = item.weight_kg || item.quantity;
        await Product.addStock(item.product_id, tenantId, qty, client);
        await Product.createMovement({
          tenantId,
          productId:   item.product_id,
          productName: item.product_name,
          quantity:    qty,
          type:        'in',
          reason:      `Cancelamento do pedido #${order.order_number}`,
          orderId:     id,
        }, client);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return updated;
};

module.exports = { listOrders, getOrder, createOrder, updateStatus, cancelOrder };
