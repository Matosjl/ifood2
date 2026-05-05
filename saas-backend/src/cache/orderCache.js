const { createRedisClient } = require('../config/redis');
const { createLogger }     = require('../utils/logger');

const logger = createLogger('OrderCache');
const redis  = createRedisClient();

// Orders in these statuses belong on the Kanban board
const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready']);

const CACHE_KEY = (tenantId) => `orders:active:${tenantId}`;
const CACHE_TTL = 300; // seconds — refreshed on every write

// ── Payload (same shape as eventService, avoids raw DB columns) ──

const buildPayload = (order) => ({
  id:           order.id,
  orderNumber:  order.order_number,
  status:       order.status,
  channel:      order.channel,
  total:        parseFloat(order.total),
  notes:        order.notes        || null,
  customerName:  order.customer_name  || null,
  customerPhone: order.customer_phone || null,
  items:        order.items || [],
  createdAt:    order.created_at,
  updatedAt:    order.updated_at,
});

// ── Cache operations ──────────────────────────────────────────

/**
 * Upserts an order in the Redis hash for the tenant's active orders.
 * Automatically removes terminal orders (delivered / cancelled).
 *
 * Using a Redis Hash (HSET orderId → JSON) gives O(1) per-order
 * reads/updates without re-serialising the whole list.
 */
const upsertOrder = async (tenantId, order) => {
  try {
    const key = CACHE_KEY(tenantId);
    if (ACTIVE_STATUSES.has(order.status)) {
      await redis.hset(key, order.id, JSON.stringify(buildPayload(order)));
      await redis.expire(key, CACHE_TTL);
    } else {
      await redis.hdel(key, order.id);
    }
  } catch (err) {
    logger.warn('Falha ao atualizar cache de pedidos', {
      tenantId, orderId: order.id, error: err.message,
    });
  }
};

/**
 * Returns all active orders for the tenant from cache.
 * Returns [] on miss or Redis error — caller falls back to DB if needed.
 */
const getActiveOrders = async (tenantId) => {
  try {
    const data = await redis.hgetall(CACHE_KEY(tenantId));
    if (!data) return [];
    return Object.values(data).map((v) => JSON.parse(v));
  } catch (err) {
    logger.warn('Falha ao ler cache de pedidos', { tenantId, error: err.message });
    return [];
  }
};

/**
 * Explicitly removes an order from the cache (e.g. on hard delete).
 */
const removeOrder = async (tenantId, orderId) => {
  try {
    await redis.hdel(CACHE_KEY(tenantId), orderId);
  } catch (err) {
    logger.warn('Falha ao remover pedido do cache', { tenantId, orderId, error: err.message });
  }
};

module.exports = { upsertOrder, getActiveOrders, removeOrder };
