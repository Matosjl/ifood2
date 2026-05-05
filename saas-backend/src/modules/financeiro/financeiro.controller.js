const db           = require('../../config/database');
const asyncHandler = require('../../utils/asyncHandler');

// ── Period helpers ────────────────────────────────────────────

/**
 * Returns UTC date bounds for the requested period.
 * All timestamps stored in the DB are UTC.
 */
const getPeriodBounds = (period) => {
  const now = new Date();

  if (period === 'today') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    return { start, end };
  }

  if (period === 'week') {
    const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    start.setUTCHours(0, 0, 0, 0);
    return { start, end };
  }

  if (period === 'month') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    return { start, end };
  }

  // fallback — today
  return getPeriodBounds('today');
};

// ── Summary endpoint ──────────────────────────────────────────

/**
 * GET /api/financeiro/summary?period=today|week|month
 *
 * Returns:
 *   revenue, order_count, avg_ticket,
 *   byChannel[], timeSeries[], topProducts[]
 */
const summary = asyncHandler(async (req, res) => {
  const period    = ['today', 'week', 'month'].includes(req.query.period)
    ? req.query.period
    : 'today';
  const tenantId  = req.user.tenantId;
  const { start, end } = getPeriodBounds(period);

  // ── 1. Overall metrics ──────────────────────────────────────
  const { rows: [metrics] } = await db.query(
    `SELECT
       COALESCE(SUM(total), 0)::float    AS revenue,
       COUNT(*)::int                     AS order_count,
       COALESCE(AVG(total), 0)::float    AS avg_ticket
     FROM orders
     WHERE tenant_id = $1
       AND status IN ('ready', 'delivered')
       AND created_at BETWEEN $2 AND $3`,
    [tenantId, start, end]
  );

  // ── 2. By channel ───────────────────────────────────────────
  const { rows: byChannel } = await db.query(
    `SELECT channel,
            COUNT(*)::int                    AS count,
            COALESCE(SUM(total), 0)::float   AS revenue
     FROM orders
     WHERE tenant_id = $1
       AND status IN ('ready', 'delivered')
       AND created_at BETWEEN $2 AND $3
     GROUP BY channel
     ORDER BY revenue DESC`,
    [tenantId, start, end]
  );

  // ── 3. Time series ──────────────────────────────────────────
  let timeSeries;
  if (period === 'today') {
    // By hour (0–23)
    const { rows } = await db.query(
      `SELECT EXTRACT(HOUR FROM created_at)::int   AS hour,
              COUNT(*)::int                         AS count,
              COALESCE(SUM(total), 0)::float        AS revenue
       FROM orders
       WHERE tenant_id = $1
         AND status IN ('ready', 'delivered')
         AND created_at BETWEEN $2 AND $3
       GROUP BY hour
       ORDER BY hour`,
      [tenantId, start, end]
    );
    // Fill all 24 hours so the chart always has a full x-axis
    timeSeries = Array.from({ length: 24 }, (_, h) => {
      const found = rows.find((r) => r.hour === h);
      return { hour: h, count: found?.count ?? 0, revenue: found?.revenue ?? 0 };
    });
  } else {
    // By day
    const { rows } = await db.query(
      `SELECT DATE(created_at)                      AS date,
              COUNT(*)::int                         AS count,
              COALESCE(SUM(total), 0)::float        AS revenue
       FROM orders
       WHERE tenant_id = $1
         AND status IN ('ready', 'delivered')
         AND created_at BETWEEN $2 AND $3
       GROUP BY date
       ORDER BY date`,
      [tenantId, start, end]
    );

    // Fill every day in the range
    const days = Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1;
    timeSeries = Array.from({ length: days }, (_, i) => {
      const d    = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const iso  = d.toISOString().slice(0, 10);
      const found = rows.find((r) => String(r.date).slice(0, 10) === iso);
      return { date: iso, count: found?.count ?? 0, revenue: found?.revenue ?? 0 };
    });
  }

  // ── 4. Top products ─────────────────────────────────────────
  const { rows: topProducts } = await db.query(
    `SELECT oi.product_name,
            COALESCE(SUM(oi.quantity), 0)::float   AS total_qty,
            COALESCE(SUM(oi.total), 0)::float       AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.tenant_id = $1
       AND o.status IN ('ready', 'delivered')
       AND o.created_at BETWEEN $2 AND $3
     GROUP BY oi.product_name
     ORDER BY revenue DESC
     LIMIT 10`,
    [tenantId, start, end]
  );

  res.json({
    success: true,
    data: {
      period,
      revenue:      metrics.revenue,
      order_count:  metrics.order_count,
      avg_ticket:   metrics.avg_ticket,
      byChannel,
      timeSeries,
      topProducts,
    },
  });
});

module.exports = { summary };
