'use strict';
const db         = require('../../config/database');
const { withCache } = require('../../config/redis');
const { BILLABLE_SQL } = require('../../utils/orderStatus');

/**
 * Operational Health Engine
 * Scores 0-100 based on real operational data.
 * Each metric deducts or adds points from a 100-base.
 *
 * Scoring model:
 *  Base: 100
 *  - Forgotten orders (pending/confirmed > 10min): -8 per order (max -32)
 *  - Cancellation rate > 10%: -10
 *  - No caixa open during business hours: -15
 *  - Critical stock (qty <= min_stock): -5 per item (max -20)
 *  - CMV spike (avg CMV > 45% today): -10
 *  + Perfect run today (no issues): +5 bonus
 */
const getHealthScore = async (tenantId) => {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const deductions = [];
  let score = 100;

  // 1. Forgotten orders (pending/confirmed older than 10 min)
  const { rows: forgottenRows } = await db.query(
    `SELECT COUNT(*) AS cnt
     FROM orders
     WHERE tenant_id = $1
       AND status IN ('pending', 'confirmed')
       AND created_at <= NOW() - INTERVAL '10 minutes'`,
    [tenantId]
  );
  const forgottenCount = parseInt(forgottenRows[0]?.cnt ?? 0, 10);
  if (forgottenCount > 0) {
    const penalty = Math.min(forgottenCount * 8, 32);
    score -= penalty;
    deductions.push({
      key:     'forgotten_orders',
      label:   `${forgottenCount} pedido${forgottenCount > 1 ? 's' : ''} esquecido${forgottenCount > 1 ? 's' : ''}`,
      icon:    '🚨',
      penalty,
      action:  'Vá para Pedidos e processe imediatamente',
      urgent:  true,
    });
  }

  // 2. Cancellation rate today
  const { rows: orderStats } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
       COUNT(*) AS total
     FROM orders
     WHERE tenant_id = $1 AND created_at >= $2`,
    [tenantId, todayStart.toISOString()]
  );
  const cancelledCount = parseInt(orderStats[0]?.cancelled ?? 0, 10);
  const totalToday     = parseInt(orderStats[0]?.total ?? 0, 10);
  const cancelRate     = totalToday > 0 ? (cancelledCount / totalToday) * 100 : 0;
  if (cancelRate > 10) {
    score -= 10;
    deductions.push({
      key:     'high_cancellation',
      label:   `Taxa de cancelamento: ${cancelRate.toFixed(0)}%`,
      icon:    '❌',
      penalty: 10,
      action:  'Verifique motivos — aceite pedidos mais rápido',
      urgent:  cancelRate > 25,
    });
  }

  // 3. Caixa status (check if caixa should be open)
  const hour = now.getHours();
  const likelyBusinessHours = hour >= 10 && hour <= 23;
  if (likelyBusinessHours) {
    const { rows: caixaRows } = await db.query(
      `SELECT id FROM cash_registers
       WHERE tenant_id = $1 AND status = 'open'
       LIMIT 1`,
      [tenantId]
    );
    if (caixaRows.length === 0) {
      score -= 15;
      deductions.push({
        key:     'caixa_closed',
        label:   'Caixa está fechado',
        icon:    '🔒',
        penalty: 15,
        action:  'Abra o caixa no Financeiro antes de começar a atender',
        urgent:  true,
      });
    }
  }

  // 4. Critical stock
  const { rows: criticalStock } = await db.query(
    `SELECT COUNT(*) AS cnt
     FROM insumos
     WHERE tenant_id = $1
       AND qty_in_stock <= COALESCE(min_qty, 0)
       AND min_qty > 0`,
    [tenantId]
  );
  const criticalCount = parseInt(criticalStock[0]?.cnt ?? 0, 10);
  if (criticalCount > 0) {
    const penalty = Math.min(criticalCount * 5, 20);
    score -= penalty;
    deductions.push({
      key:     'low_stock',
      label:   `${criticalCount} insumo${criticalCount > 1 ? 's' : ''} em estoque crítico`,
      icon:    '📦',
      penalty,
      action:  'Repor estoque em Produtos → Insumos',
      urgent:  criticalCount > 2,
    });
  }

  // 5. CMV spike today
  const { rows: cmvRows } = await db.query(
    `SELECT
       ROUND(
         CASE WHEN SUM(oi.total) > 0
              THEN SUM(oi.total_cost) / SUM(oi.total) * 100
              ELSE 0 END
       , 1) AS cmv_pct
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.tenant_id = $1
       AND o.created_at >= $2
       AND o.status IN ${BILLABLE_SQL}
       AND oi.total_cost > 0`,
    [tenantId, todayStart.toISOString()]
  );
  const cmvPct = parseFloat(cmvRows[0]?.cmv_pct ?? 0);
  if (cmvPct > 45) {
    score -= 10;
    deductions.push({
      key:     'high_cmv',
      label:   `CMV hoje: ${cmvPct.toFixed(1)}% (meta: <45%)`,
      icon:    '📉',
      penalty: 10,
      action:  'Revise precificação dos produtos vendidos hoje',
      urgent:  false,
    });
  }

  // Ensure score stays in 0-100
  score = Math.max(0, Math.min(100, score));

  // Bonus for perfect run
  if (deductions.length === 0) score = Math.min(100, score + 5);

  // Health label
  const label = score >= 90 ? 'Excelente'
              : score >= 75 ? 'Bom'
              : score >= 55 ? 'Atenção'
              : score >= 35 ? 'Crítico'
              : 'Crise';

  const color = score >= 90 ? 'green'
              : score >= 75 ? 'blue'
              : score >= 55 ? 'yellow'
              : 'red';

  return {
    score,
    label,
    color,
    deductions,
    stats: {
      totalOrdersToday: totalToday,
      cancelledToday:   cancelledCount,
      forgottenOrders:  forgottenCount,
      criticalStock:    criticalCount,
      cmvPct:           cmvPct > 0 ? cmvPct : null,
    },
    generatedAt: new Date().toISOString(),
  };
};

/**
 * Cached health score — TTL 60s por tenant.
 * Invalida automaticamente após expirar; aceita forceRefresh=true para limpeza manual.
 */
const getHealthScoreCached = async (tenantId, forceRefresh = false) => {
  const key = `health:${tenantId}`;
  if (forceRefresh) {
    const { getCacheClient } = require('../../config/redis');
    try { await getCacheClient().del(key); } catch { /* non-fatal */ }
  }
  return withCache(key, 60, () => getHealthScore(tenantId));
};

/**
 * Operational metrics for the last 7 days.
 * Feeds the "métricas de adoção" view.
 */
const getOperationalMetrics = async (tenantId) => {
  const { rows } = await db.query(
    `SELECT
       DATE(o.created_at)                                    AS day,
       COUNT(*)                                              AS total_orders,
       COUNT(*) FILTER (WHERE o.status = 'cancelled')       AS cancelled,
       ROUND(AVG(
         EXTRACT(EPOCH FROM (o.updated_at - o.created_at)) / 60
       )::numeric, 1)                                       AS avg_processing_min,
       ROUND(SUM(o.total) FILTER (WHERE o.status IN ${BILLABLE_SQL})::numeric, 2) AS revenue
     FROM orders o
     WHERE o.tenant_id = $1
       AND o.created_at >= NOW() - INTERVAL '7 days'
     GROUP BY DATE(o.created_at)
     ORDER BY day DESC`,
    [tenantId]
  );
  return rows;
};

module.exports = { getHealthScore, getHealthScoreCached, getOperationalMetrics };
