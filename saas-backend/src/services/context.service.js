'use strict';
/**
 * context.service.js
 *
 * Ponto central de verdade operacional para a camada de IA.
 * REGRA: A IA NUNCA calcula. Ela só interpreta dados que saem daqui.
 *
 * Todos os valores são produzidos por SQL determinístico.
 * O resultado deste módulo é o único input financeiro que a IA deve receber.
 */

const db = require('../config/database');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

async function _salesKpis(tenantId) {
  const { rows } = await db.query(`
    SELECT
      -- Hoje
      COUNT(*) FILTER (
        WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
          AND status <> 'cancelled'
      ) AS orders_today,

      COALESCE(SUM(total) FILTER (
        WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
          AND status <> 'cancelled'
      ), 0) AS revenue_today,

      -- Semana
      COALESCE(SUM(total) FILTER (
        WHERE created_at >= NOW() - INTERVAL '7 days'
          AND status <> 'cancelled'
      ), 0) AS revenue_week,

      -- Mês
      COALESCE(SUM(total) FILTER (
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND status <> 'cancelled'
      ), 0) AS revenue_month,

      -- Mesmo dia da semana passada (para comparação YoY semanal)
      COALESCE(SUM(total) FILTER (
        WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') =
              CURRENT_DATE - INTERVAL '7 days'
          AND status <> 'cancelled'
      ), 0) AS revenue_same_day_last_week,

      -- Em aberto agora
      COUNT(*) FILTER (
        WHERE status IN ('pending','confirmed','preparing','ready','delivering')
      ) AS orders_open,

      -- Cancelados hoje
      COUNT(*) FILTER (
        WHERE status = 'cancelled'
          AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
      ) AS cancelled_today,

      -- Pedidos semana
      COUNT(*) FILTER (
        WHERE created_at >= NOW() - INTERVAL '7 days'
          AND status <> 'cancelled'
      ) AS orders_week,

      -- Ticket médio hoje
      COALESCE(
        SUM(total) FILTER (
          WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
            AND status <> 'cancelled'
        ) / NULLIF(COUNT(*) FILTER (
          WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
            AND status <> 'cancelled'
        ), 0),
        0
      ) AS avg_ticket_today

    FROM orders WHERE tenant_id = $1
  `, [tenantId]);

  const r = rows[0];
  return {
    ordersToday:               parseInt(r.orders_today)                    || 0,
    revenueToday:              parseFloat(r.revenue_today)                 || 0,
    revenueWeek:               parseFloat(r.revenue_week)                  || 0,
    revenueMonth:              parseFloat(r.revenue_month)                 || 0,
    revenueSameDayLastWeek:    parseFloat(r.revenue_same_day_last_week)    || 0,
    ordersOpen:                parseInt(r.orders_open)                     || 0,
    cancelledToday:            parseInt(r.cancelled_today)                 || 0,
    ordersWeek:                parseInt(r.orders_week)                     || 0,
    avgTicketToday:            parseFloat(r.avg_ticket_today)              || 0,
  };
}

async function _stockAlerts(tenantId) {
  const { rows } = await db.query(`
    SELECT id, name, unit,
           ROUND(qty_in_stock::numeric, 3) AS qty_in_stock,
           ROUND(min_qty::numeric, 3)      AS min_qty,
           ROUND(cost_per_unit::numeric, 4) AS cost_per_unit
    FROM insumos
    WHERE tenant_id = $1
      AND min_qty > 0
      AND qty_in_stock <= min_qty
    ORDER BY (qty_in_stock / NULLIF(min_qty, 0)) ASC
    LIMIT 10
  `, [tenantId]);
  return rows;
}

async function _stuckOrders(tenantId, thresholdMinutes = 15) {
  const { rows } = await db.query(`
    SELECT id, order_number, status, total,
           EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 AS minutes_since_update,
           customer_name
    FROM orders
    WHERE tenant_id = $1
      AND status IN ('pending','confirmed','preparing')
      AND updated_at < NOW() - ($2 || ' minutes')::INTERVAL
    ORDER BY updated_at ASC
    LIMIT 5
  `, [tenantId, thresholdMinutes]);
  return rows.map((r) => ({
    ...r,
    minutes_since_update: Math.round(parseFloat(r.minutes_since_update)),
  }));
}

async function _caixa(tenantId) {
  const { rows } = await db.query(`
    SELECT id, status, opening_balance, current_balance,
           opened_at, closed_at
    FROM cash_registers
    WHERE tenant_id = $1
    ORDER BY opened_at DESC
    LIMIT 1
  `, [tenantId]);
  return rows[0] || null;
}

async function _topProducts(tenantId, days = 7, limit = 5) {
  const { rows } = await db.query(`
    SELECT p.name,
           COUNT(oi.id)          AS times_ordered,
           SUM(oi.quantity)      AS total_qty,
           SUM(oi.total_price)   AS total_revenue
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.tenant_id = $1
      AND o.status <> 'cancelled'
      AND o.created_at >= NOW() - ($2 || ' days')::INTERVAL
    GROUP BY p.name
    ORDER BY total_revenue DESC
    LIMIT $3
  `, [tenantId, days, limit]);
  return rows;
}

async function _cmvStats(tenantId) {
  // CMV hoje vs média dos últimos 7 dias
  const { rows } = await db.query(`
    SELECT
      -- Custo dos itens vendidos hoje
      COALESCE(SUM(oi.total_price * 0.35), 0) AS cmv_estimated_today,
      -- Receita hoje
      COALESCE(SUM(oi.total_price), 0) AS revenue_items_today
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.tenant_id = $1
      AND o.status <> 'cancelled'
      AND DATE(o.created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
  `, [tenantId]);

  // CMV real via pricing_calculations (se disponível)
  const { rows: pricingRows } = await db.query(`
    SELECT AVG(custo_total / NULLIF(preco_sugerido, 0) * 100) AS avg_cmv_pct
    FROM pricing_calculations
    WHERE tenant_id = $1
      AND preco_sugerido > 0
      AND created_at >= NOW() - INTERVAL '30 days'
  `, [tenantId]);

  return {
    avgCmvPct: parseFloat(pricingRows[0]?.avg_cmv_pct || 0) || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contexto completo para a IA gerencial (AI Center / VPS2 manager agent).
 * Produz um objeto limpo com dados 100% determinísticos do banco.
 */
async function buildOperationalContext(tenantId) {
  const [sales, stockAlerts, stuck, caixa, topProducts, cmv] = await Promise.allSettled([
    _salesKpis(tenantId),
    _stockAlerts(tenantId),
    _stuckOrders(tenantId),
    _caixa(tenantId),
    _topProducts(tenantId),
    _cmvStats(tenantId),
  ]);

  const r = (p) => (p.status === 'fulfilled' ? p.value : null);

  const salesData = r(sales) || {};
  const caixaData = r(caixa);

  // Variação dia a dia (determinística, não estimativa da IA)
  const revToday     = salesData.revenueToday      || 0;
  const revLastWeek  = salesData.revenueSameDayLastWeek || 0;
  const revenueVsLastWeekPct =
    revLastWeek > 0 ? ((revToday - revLastWeek) / revLastWeek) * 100 : null;

  return {
    // Timestamp para a IA saber a "idade" dos dados
    generatedAt: new Date().toISOString(),
    timezone: 'America/Sao_Paulo',

    // ── Vendas ──
    sales: {
      ...salesData,
      revenueVsLastWeekPct: revenueVsLastWeekPct !== null
        ? Math.round(revenueVsLastWeekPct * 10) / 10
        : null,
    },

    // ── Caixa ──
    caixa: caixaData ? {
      status:          caixaData.status,
      openingBalance:  parseFloat(caixaData.opening_balance || 0),
      currentBalance:  parseFloat(caixaData.current_balance || 0),
      openedAt:        caixaData.opened_at,
    } : { status: 'unknown' },

    // ── Estoque ──
    stockAlerts: r(stockAlerts) || [],
    stockAlertCount: (r(stockAlerts) || []).length,

    // ── Pedidos travados ──
    stuckOrders: r(stuck) || [],
    stuckOrderCount: (r(stuck) || []).length,

    // ── Produtos top ──
    topProducts: r(topProducts) || [],

    // ── CMV ──
    cmv: r(cmv) || {},
  };
}

/**
 * Contexto mínimo para o chatbot do WhatsApp (dono).
 * Mais leve, sem top products ou CMV.
 */
async function buildChatContext(tenantId) {
  const [sales, stockAlerts, stuck] = await Promise.allSettled([
    _salesKpis(tenantId),
    _stockAlerts(tenantId),
    _stuckOrders(tenantId),
  ]);
  const r = (p) => (p.status === 'fulfilled' ? p.value : null);
  return {
    generatedAt: new Date().toISOString(),
    sales:       r(sales) || {},
    stockAlerts: r(stockAlerts) || [],
    stuckOrders: r(stuck) || [],
  };
}

/**
 * Dados para o relatório diário (08:00).
 */
async function buildDailyReportContext(tenantId) {
  const [sales, topProducts, stockAlerts, cmv] = await Promise.allSettled([
    _salesKpis(tenantId),
    _topProducts(tenantId, 1, 3),       // top 3 de hoje
    _stockAlerts(tenantId),
    _cmvStats(tenantId),
  ]);
  const r = (p) => (p.status === 'fulfilled' ? p.value : null);

  // Receita ontem
  const { rows: yesterdayRows } = await db.query(`
    SELECT COALESCE(SUM(total), 0) AS revenue_yesterday,
           COUNT(*) AS orders_yesterday
    FROM orders
    WHERE tenant_id = $1
      AND status <> 'cancelled'
      AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE - 1
  `, [tenantId]);
  const yesterday = yesterdayRows[0];

  return {
    generatedAt: new Date().toISOString(),
    yesterday: {
      revenue: parseFloat(yesterday.revenue_yesterday) || 0,
      orders:  parseInt(yesterday.orders_yesterday)    || 0,
    },
    today: {
      stockAlerts: (r(stockAlerts) || []).length,
      stockAlertItems: r(stockAlerts) || [],
    },
    salesWeek:   r(sales) || {},
    topProducts: r(topProducts) || [],
    cmv:         r(cmv) || {},
  };
}

/**
 * Detecção de anomalias para o automation worker.
 * Retorna lista de anomalias com tipo e severidade.
 */
async function detectAnomalies(tenantId) {
  const anomalies = [];

  // 1. Pedidos travados
  const stuck = await _stuckOrders(tenantId, 15);
  if (stuck.length > 0) {
    anomalies.push({
      type:    'STUCK_ORDERS',
      severity: stuck.length >= 3 ? 'high' : 'medium',
      data:    stuck,
      message: `${stuck.length} pedido(s) sem atualização há mais de 15 min`,
    });
  }

  // 2. Estoque crítico
  const lowStock = await _stockAlerts(tenantId);
  if (lowStock.length > 0) {
    anomalies.push({
      type:     'LOW_STOCK',
      severity: 'medium',
      data:     lowStock,
      message:  `${lowStock.length} insumo(s) abaixo do estoque mínimo`,
    });
  }

  // 3. Vendas baixas — compara com média dos últimos 6 dias mesmos horários
  const { rows: salesComp } = await db.query(`
    SELECT
      COALESCE(SUM(total) FILTER (
        WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
          AND status <> 'cancelled'
      ), 0) AS today,
      COALESCE(AVG(daily_total), 0) AS avg_last_6
    FROM (
      SELECT DATE(created_at AT TIME ZONE 'America/Sao_Paulo') AS day,
             SUM(total) AS daily_total
      FROM orders
      WHERE tenant_id = $1
        AND status <> 'cancelled'
        AND created_at >= NOW() - INTERVAL '7 days'
        AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo') < CURRENT_DATE
      GROUP BY 1
    ) sub, orders o2
    WHERE o2.tenant_id = $1
    LIMIT 1
  `, [tenantId]);

  // Fallback simpler query
  const { rows: simpleSales } = await db.query(`
    SELECT
      COALESCE(SUM(total) FILTER (
        WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
          AND status <> 'cancelled'
      ), 0)::float AS today_revenue,
      COALESCE(
        SUM(total) FILTER (
          WHERE created_at >= NOW() - INTERVAL '7 days'
            AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo') < CURRENT_DATE
            AND status <> 'cancelled'
        ) / NULLIF(
          COUNT(DISTINCT DATE(created_at AT TIME ZONE 'America/Sao_Paulo')) FILTER (
            WHERE created_at >= NOW() - INTERVAL '7 days'
              AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo') < CURRENT_DATE
              AND status <> 'cancelled'
          ), 0),
        0
      )::float AS avg_daily_last_7
    FROM orders
    WHERE tenant_id = $1
  `, [tenantId]);

  const todayRev   = parseFloat(simpleSales[0]?.today_revenue   || 0);
  const avgDailyRev = parseFloat(simpleSales[0]?.avg_daily_last_7 || 0);

  // Só alertar após as 13:00 e se média > 0
  const hourBRT = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  ).getHours();

  if (hourBRT >= 13 && avgDailyRev > 0 && todayRev < avgDailyRev * 0.7) {
    anomalies.push({
      type:     'LOW_SALES',
      severity: 'medium',
      data:     { todayRev, avgDailyRev, ratio: todayRev / avgDailyRev },
      message:  `Vendas de hoje (R$ ${todayRev.toFixed(2)}) abaixo de 70% da média diária (R$ ${avgDailyRev.toFixed(2)})`,
    });
  }

  return anomalies;
}

/**
 * Busca clientes inativos há mais de X dias.
 */
async function getInactiveCustomers(tenantId, daysSinceLastOrder = 15, limit = 50) {
  const { rows } = await db.query(`
    SELECT
      c.id, c.name, c.phone, c.email,
      MAX(o.created_at) AS last_order_at,
      COUNT(o.id)       AS total_orders,
      COALESCE(SUM(o.total), 0) AS total_spent,
      EXTRACT(DAYS FROM NOW() - MAX(o.created_at)) AS days_inactive
    FROM customers c
    JOIN orders o ON o.customer_id = c.id
    WHERE c.tenant_id = $1
      AND o.status <> 'cancelled'
    GROUP BY c.id, c.name, c.phone, c.email
    HAVING MAX(o.created_at) < NOW() - ($2 || ' days')::INTERVAL
       AND MAX(o.created_at) >= NOW() - INTERVAL '90 days'  -- não mais de 90 dias
    ORDER BY MAX(o.created_at) ASC
    LIMIT $3
  `, [tenantId, daysSinceLastOrder, limit]);
  return rows;
}

module.exports = {
  buildOperationalContext,
  buildChatContext,
  buildDailyReportContext,
  detectAnomalies,
  getInactiveCustomers,
};
