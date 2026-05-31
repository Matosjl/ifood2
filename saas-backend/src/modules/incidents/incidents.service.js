'use strict';
/**
 * Incident Engine
 * Detecta e registra incidentes operacionais automaticamente.
 *
 * Tipos:
 *   cash_difference    — caixa fechado com diferença entre esperado e contado
 *   cash_change_missing — troco não confirmado 30 min após entrega
 *   order_forgotten    — pedido pending/confirmed > 10 min sem atualização
 *   item_missing       — item faltando relatado manualmente
 *   delivery_late      — entrega com atraso excessivo
 *   cancellation       — cancelamento com prejuízo
 */

const db = require('../../config/database');

// ── Core CRUD ──────────────────────────────────────────────────

const createIncident = async (tenantId, { type, orderId = null, cost = 0, description = null, source = 'auto' }) => {
  const { rows } = await db.query(
    `INSERT INTO operational_incidents (tenant_id, order_id, type, cost, description, source)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [tenantId, orderId || null, type, parseFloat(cost) || 0, description || null, source]
  );
  return rows[0];
};

const listIncidents = async (tenantId, { date, resolved, limit = 50 } = {}) => {
  const params = [tenantId];
  let where = 'WHERE tenant_id = $1';

  if (date) {
    params.push(date);
    where += ` AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = $${params.length}`;
  }
  if (resolved !== undefined) {
    params.push(resolved);
    where += ` AND resolved = $${params.length}`;
  }

  params.push(limit);
  const { rows } = await db.query(
    `SELECT i.*, o.order_number, o.customer_name
     FROM operational_incidents i
     LEFT JOIN orders o ON o.id = i.order_id
     ${where}
     ORDER BY i.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
};

const resolveIncident = async (id, tenantId) => {
  const { rows } = await db.query(
    `UPDATE operational_incidents
     SET resolved = TRUE, resolved_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [id, tenantId]
  );
  return rows[0] || null;
};

const getTodaySummary = async (tenantId) => {
  const { rows } = await db.query(
    `SELECT
       COUNT(*)::int                                           AS total,
       COUNT(*) FILTER (WHERE resolved = FALSE)::int          AS open,
       COALESCE(SUM(cost), 0)::float                         AS total_cost,
       COALESCE(SUM(cost) FILTER (WHERE resolved = FALSE), 0)::float AS open_cost,
       jsonb_object_agg(type, cnt) AS by_type
     FROM (
       SELECT type, cost, resolved,
              COUNT(*) OVER (PARTITION BY type) AS cnt
       FROM operational_incidents
       WHERE tenant_id = $1
         AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo'
     ) t`,
    [tenantId]
  );
  return rows[0];
};

// ── Auto-detector 1: troco não confirmado ─────────────────────
// Chamado pelo worker a cada 15 min.
// Busca pedidos entregues há > 30 min com cash_change_required > 0
// e cash_change_confirmed IS NULL — cria incidente se ainda não existe.

const detectMissingChange = async () => {
  const { rows: tenants } = await db.query(
    `SELECT DISTINCT o.tenant_id
     FROM orders o
     WHERE o.status = 'delivered'
       AND o.cash_change_required > 0
       AND o.cash_change_confirmed IS NULL
       AND o.updated_at <= NOW() - INTERVAL '30 minutes'`,
    []
  );

  let created = 0;
  for (const { tenant_id } of tenants) {
    const { rows: orders } = await db.query(
      `SELECT o.id, o.order_number, o.cash_change_required, o.tenant_id
       FROM orders o
       WHERE o.tenant_id = $1
         AND o.status = 'delivered'
         AND o.cash_change_required > 0
         AND o.cash_change_confirmed IS NULL
         AND o.updated_at <= NOW() - INTERVAL '30 minutes'
         AND NOT EXISTS (
           SELECT 1 FROM operational_incidents i
           WHERE i.order_id = o.id AND i.type = 'cash_change_missing'
         )`,
      [tenant_id]
    );

    for (const order of orders) {
      await createIncident(tenant_id, {
        type:        'cash_change_missing',
        orderId:     order.id,
        cost:        parseFloat(order.cash_change_required),
        description: `Pedido #${order.order_number}: troco de R$ ${parseFloat(order.cash_change_required).toFixed(2)} não confirmado`,
        source:      'auto',
      });
      created++;
    }
  }
  return created;
};

// ── Auto-detector 2: pedidos esquecidos ───────────────────────
// Chamado pelo worker a cada 15 min.

const detectForgottenOrders = async () => {
  const { rows: tenants } = await db.query(
    `SELECT DISTINCT tenant_id FROM orders
     WHERE status IN ('pending','confirmed')
       AND created_at <= NOW() - INTERVAL '10 minutes'`,
    []
  );

  let created = 0;
  for (const { tenant_id } of tenants) {
    const { rows: orders } = await db.query(
      `SELECT id, order_number, total FROM orders
       WHERE tenant_id = $1
         AND status IN ('pending','confirmed')
         AND created_at <= NOW() - INTERVAL '10 minutes'
         AND NOT EXISTS (
           SELECT 1 FROM operational_incidents i
           WHERE i.order_id = orders.id AND i.type = 'order_forgotten'
             AND i.created_at >= NOW() - INTERVAL '1 hour'
         )`,
      [tenant_id]
    );

    for (const order of orders) {
      await createIncident(tenant_id, {
        type:        'order_forgotten',
        orderId:     order.id,
        cost:        0,
        description: `Pedido #${order.order_number} aguarda há mais de 10 minutos`,
        source:      'auto',
      });
      created++;
    }
  }
  return created;
};

// ── Confirmar troco entregue ──────────────────────────────────

const confirmCashChange = async (orderId, tenantId, delivered = true) => {
  const { rows } = await db.query(
    `UPDATE orders SET cash_change_confirmed = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [delivered, orderId, tenantId]
  );
  if (!delivered && rows[0]) {
    // Troco não entregue → cria incidente imediatamente
    await createIncident(tenantId, {
      type:        'cash_change_missing',
      orderId,
      cost:        parseFloat(rows[0].cash_change_required) || 0,
      description: `Pedido #${rows[0].order_number}: motoboy não entregou o troco`,
      source:      'manual',
    });
  }
  return rows[0] || null;
};

module.exports = {
  createIncident,
  listIncidents,
  resolveIncident,
  getTodaySummary,
  detectMissingChange,
  detectForgottenOrders,
  confirmCashChange,
};
