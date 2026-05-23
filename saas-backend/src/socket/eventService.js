const { getEmitter }   = require('./emitter');
const { createLogger } = require('../utils/logger');
const db               = require('../config/database');

const logger = createLogger('EventService');

// ── Payload builder ───────────────────────────────────────────

/**
 * Normalises a DB row into the payload sent to all clients.
 * Sensitive internals (tenant_id, raw DB columns) are excluded.
 */
const buildOrderPayload = (order) => ({
  id:              order.id,
  orderNumber:     order.order_number,
  status:          order.status,
  channel:         order.channel,
  total:           parseFloat(order.total),
  notes:           order.notes           || null,
  deliveryType:    order.delivery_type   || 'pickup',
  paymentMethod:   order.payment_method  || 'cash',
  deliveryFee:     parseFloat(order.delivery_fee) || 0,
  neighborhood:    order.neighborhood    || null,
  paidAt:          order.paid_at         || null,
  customerName:    order.customer_name   || null,
  customerPhone:   order.customer_phone  || null,
  customerAddress: order.customer_address || null,
  items: (order.items || []).map((i) => ({
    id:          i.id,
    productId:   i.product_id,
    productName: i.product_name,
    quantity:    i.quantity,
    weightKg:    i.weight_kg  || null,
    unitPrice:   parseFloat(i.unit_price),
    total:       parseFloat(i.total),
    notes:       i.notes || null,
  })),
  createdAt:  order.created_at,
  updatedAt:  order.updated_at,
  timestamp:  new Date().toISOString(),
});

// ── Internal emit ─────────────────────────────────────────────

const emit = (tenantId, event, payload) => {
  try {
    getEmitter()
      .to(`tenant:${tenantId}`)
      .emit(event, payload);
    logger.debug(`${event} emitido`, { tenantId, orderId: payload?.id });
  } catch (err) {
    // Never propagate — event emission failure must not fail a job or request
    logger.error('Falha ao emitir evento WebSocket', {
      event, tenantId, error: err.message,
    });
  }
};

// ── Public API ────────────────────────────────────────────────

/**
 * Emitted by the worker after a manual order is created + confirmed.
 * Frontend: add new card to the Kanban "Confirmado" column.
 */
const orderCreated = (tenantId, order) =>
  emit(tenantId, 'order:created', buildOrderPayload(order));

/**
 * Emitted after any status transition (confirm, prepare, ready, deliver, cancel).
 * Frontend: move card to the correct Kanban column.
 */
const orderUpdated = (tenantId, order) =>
  emit(tenantId, 'order:updated', buildOrderPayload(order));

/**
 * Emitted when an order record is hard-deleted (rare; cancel is preferred).
 * Frontend: remove card from board entirely.
 */
const orderDeleted = (tenantId, orderId) =>
  emit(tenantId, 'order:deleted', {
    id:        orderId,
    timestamp: new Date().toISOString(),
  });

/**
 * Notify all drivers connected to a tenant that a new delivery is available.
 * Emits 'delivery:new' to each driver's personal room (driver:{driverId}).
 */
const newDeliveryAvailable = async (tenantId, order) => {
  try {
    const { rows } = await db.query(
      'SELECT driver_id FROM driver_tenant_connections WHERE tenant_id = $1',
      [tenantId]
    );
    const emitter = getEmitter();
    const payload = buildOrderPayload(order);
    for (const { driver_id } of rows) {
      emitter.to(`driver:${driver_id}`).emit('delivery:new', payload);
    }
    logger.debug('delivery:new emitido', { tenantId, driverCount: rows.length, orderId: order.id });
  } catch (err) {
    logger.error('Falha ao emitir delivery:new', { tenantId, error: err.message });
  }
};

/**
 * Notify restaurant about a driver location update.
 */
const driverLocationUpdated = (tenantId, driverData) =>
  emit(tenantId, 'driver:location', { ...driverData, timestamp: new Date().toISOString() });

module.exports = { orderCreated, orderUpdated, orderDeleted, newDeliveryAvailable, driverLocationUpdated, emit };
