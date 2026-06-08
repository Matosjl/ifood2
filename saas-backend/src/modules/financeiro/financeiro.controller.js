'use strict';
const db        = require('../../config/database');
const asyncHandler = require('../../utils/asyncHandler');
const AppError  = require('../../utils/AppError');
const { TZ, getPeriodDates, getPrevPeriodDates, getMonthDates } = require('../../utils/financeDate');
const financeLog = require('../../utils/financeLog');
const { BILLABLE_SQL } = require('../../utils/orderStatus');

// ── Macro SQL helper ──────────────────────────────────────────────────
// Todas as queries de pedidos usam (created_at AT TIME ZONE TZ)::date
// para garantir que "hoje" sempre significa hoje em Brasília, independente
// do fuso do servidor PostgreSQL.
// ─────────────────────────────────────────────────────────────────────

// ── Summary ────────────────────────────────────────────────────────────

/**
 * GET /api/financeiro/summary?period=today|week|month
 *
 * Retorna métricas do período + comparativo com período anterior.
 */
const summary = asyncHandler(async (req, res) => {
  const period   = ['today', 'week', 'month'].includes(req.query.period)
    ? req.query.period : 'today';
  const tenantId = req.user.tenantId;
  const { startDate, endDate } = getPeriodDates(period);
  const { startDate: pStart, endDate: pEnd } = getPrevPeriodDates(period);

  // ── 1. Métricas do período atual ────────────────────────────────
  const { rows: [metrics] } = await db.query(
    `SELECT
       COALESCE(SUM(o.total), 0)::float                                                           AS revenue,
       -- Receita apenas de produtos (exclui taxa de entrega)
       COALESCE(SUM(o.total - COALESCE(o.delivery_fee, 0)), 0)::float                             AS products_revenue,
       -- Total de taxas de entrega cobradas dos clientes
       COALESCE(SUM(CASE WHEN o.delivery_type = 'delivery'
                         THEN COALESCE(o.delivery_fee, 0) ELSE 0 END), 0)::float                  AS delivery_fees_charged,
       -- Repasse total ao motoboy no período (subquery para evitar fan-out extra)
       (SELECT COALESCE(SUM(d.driver_fee), 0)::float
        FROM deliveries d
        JOIN orders od ON od.id = d.order_id
        WHERE d.tenant_id = $1
          AND d.status = 'delivered'
          AND (od.created_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
       )                                                                                           AS total_driver_fees,
       COUNT(*)::int                                                                               AS order_count,
       COALESCE(AVG(o.total), 0)::float                                                            AS avg_ticket,
       -- CMV via subquery agregada — evita fan-out do JOIN order_items
       (SELECT COALESCE(SUM(oi.total_cost), 0)::float
        FROM order_items oi
        JOIN orders o2 ON o2.id = oi.order_id
        WHERE o2.tenant_id = $1
          AND o2.status IN ${BILLABLE_SQL}
          AND (o2.created_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
       )                                                                                           AS total_cmv
     FROM orders o
     WHERE o.tenant_id = $1
       AND o.status IN ${BILLABLE_SQL}
       AND (o.created_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date`,
    [tenantId, startDate, endDate, TZ]
  );

  // ── 2. Métricas do período anterior (comparativo) ───────────────
  const { rows: [prev] } = await db.query(
    `SELECT
       COALESCE(SUM(o.total), 0)::float   AS revenue,
       COUNT(*)::int                       AS order_count,
       COALESCE(AVG(o.total), 0)::float    AS avg_ticket,
       -- CMV via subquery agregada — evita fan-out do JOIN order_items
       (SELECT COALESCE(SUM(oi.total_cost), 0)::float
        FROM order_items oi
        JOIN orders o2 ON o2.id = oi.order_id
        WHERE o2.tenant_id = $1
          AND o2.status IN ${BILLABLE_SQL}
          AND (o2.created_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
       )                                   AS total_cmv
     FROM orders o
     WHERE o.tenant_id = $1
       AND o.status IN ${BILLABLE_SQL}
       AND (o.created_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date`,
    [tenantId, pStart, pEnd, TZ]
  );

  // ── 3. Por canal ────────────────────────────────────────────────
  const { rows: byChannel } = await db.query(
    `SELECT channel,
            COUNT(*)::int                  AS count,
            COALESCE(SUM(total),0)::float  AS revenue
     FROM orders
     WHERE tenant_id = $1
       AND status IN ('ready','delivered')
       AND (created_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
     GROUP BY channel
     ORDER BY revenue DESC`,
    [tenantId, startDate, endDate, TZ]
  );

  // ── 4. Série temporal ──────────────────────────────────────────
  let timeSeries;
  if (period === 'today') {
    // Por hora em Brasília
    const { rows } = await db.query(
      `SELECT
         EXTRACT(HOUR FROM (created_at AT TIME ZONE $4))::int AS hour,
         COUNT(*)::int                                         AS count,
         COALESCE(SUM(total),0)::float                         AS revenue
       FROM orders
       WHERE tenant_id = $1
         AND status IN ('ready','delivered')
         AND (created_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
       GROUP BY hour
       ORDER BY hour`,
      [tenantId, startDate, endDate, TZ]
    );
    timeSeries = Array.from({ length: 24 }, (_, h) => {
      const f = rows.find((r) => r.hour === h);
      return { hour: h, count: f?.count ?? 0, revenue: f?.revenue ?? 0 };
    });
  } else {
    // Por dia em Brasília
    const { rows } = await db.query(
      `SELECT
         (created_at AT TIME ZONE $4)::date  AS date,
         COUNT(*)::int                        AS count,
         COALESCE(SUM(total),0)::float        AS revenue
       FROM orders
       WHERE tenant_id = $1
         AND status IN ('ready','delivered')
         AND (created_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
       GROUP BY date
       ORDER BY date`,
      [tenantId, startDate, endDate, TZ]
    );

    // Preenche todos os dias do intervalo
    const start = new Date(startDate + 'T12:00:00Z');
    const end   = new Date(endDate   + 'T12:00:00Z');
    const days  = Math.round((end - start) / 86400000) + 1;
    timeSeries  = Array.from({ length: days }, (_, i) => {
      const d   = new Date(start.getTime() + i * 86400000);
      const iso = d.toISOString().slice(0, 10);
      const f   = rows.find((r) => String(r.date).slice(0, 10) === iso);
      return { date: iso, count: f?.count ?? 0, revenue: f?.revenue ?? 0 };
    });
  }

  // ── 5. Top produtos ─────────────────────────────────────────────
  const { rows: topProducts } = await db.query(
    `SELECT oi.product_name,
            COALESCE(SUM(oi.quantity),0)::float AS total_qty,
            COALESCE(SUM(oi.total),0)::float    AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.tenant_id = $1
       AND o.status IN ('ready','delivered')
       AND (o.created_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
     GROUP BY oi.product_name
     ORDER BY revenue DESC
     LIMIT 10`,
    [tenantId, startDate, endDate, TZ]
  );

  // ── Calcula variação % ──────────────────────────────────────────
  const pctChange = (curr, prevVal) =>
    prevVal > 0 ? Math.round(((curr - prevVal) / prevVal) * 100) : null;

  const grossProfit     = metrics.revenue - metrics.total_cmv;
  const grossMarginPct  = metrics.revenue > 0
    ? Math.round((grossProfit / metrics.revenue) * 100)
    : null;

  const logisticsResult = parseFloat(
    (parseFloat(metrics.delivery_fees_charged || 0) - parseFloat(metrics.total_driver_fees || 0)).toFixed(2)
  );

  res.json({
    success: true,
    data: {
      period,
      revenue:          metrics.revenue,       // mantido — compatibilidade com frontend
      order_count:      metrics.order_count,
      avg_ticket:       metrics.avg_ticket,
      total_cmv:        metrics.total_cmv,
      gross_profit:     grossProfit,
      gross_margin_pct: grossMarginPct,
      // Breakdown de logística (campos novos — não alteram campos existentes)
      products_revenue:       parseFloat((metrics.products_revenue    || 0).toFixed(2)),
      delivery_fees_charged:  parseFloat((metrics.delivery_fees_charged || 0).toFixed(2)),
      total_driver_fees:      parseFloat((metrics.total_driver_fees   || 0).toFixed(2)),
      logistics_result:       logisticsResult,
      // Comparativo com período anterior
      prev: {
        revenue:     prev.revenue,
        order_count: prev.order_count,
        avg_ticket:  prev.avg_ticket,
        total_cmv:   prev.total_cmv,
      },
      change: {
        revenue:     pctChange(metrics.revenue,     prev.revenue),
        order_count: pctChange(metrics.order_count, prev.order_count),
        avg_ticket:  pctChange(metrics.avg_ticket,  prev.avg_ticket),
        total_cmv:   pctChange(metrics.total_cmv,   prev.total_cmv),
      },
      byChannel,
      timeSeries,
      topProducts,
    },
  });
});

// ── Expenses ────────────────────────────────────────────────────────────

/**
 * GET /api/financeiro/expenses?month=2026-05
 */
const listExpenses = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const { year, month } = getMonthDates(req.query.month);

  const { rows } = await db.query(
    `SELECT id, name, supplier, category, amount, payment_method,
            is_installment, installment_total, installment_current,
            due_date, paid_at, status, notes, recurrence, parent_id,
            reminder_sent, created_at
     FROM   expenses
     WHERE  tenant_id = $1
       AND  EXTRACT(YEAR  FROM due_date) = $2
       AND  EXTRACT(MONTH FROM due_date) = $3
     ORDER  BY due_date ASC, created_at ASC`,
    [tenantId, year, month]
  );
  res.json({ success: true, data: rows });
});

/**
 * GET /api/financeiro/expenses/reminders
 */
const getReminders = asyncHandler(async (req, res) => {
  const tenantId    = req.user.tenantId;
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const { rows } = await db.query(
    `SELECT id, name, supplier, amount, due_date, status
     FROM   expenses
     WHERE  tenant_id = $1
       AND  status    = 'pending'
       AND  due_date  <= $2
     ORDER  BY due_date ASC
     LIMIT  20`,
    [tenantId, tomorrowStr]
  );
  res.json({ success: true, data: rows });
});

/**
 * POST /api/financeiro/expenses
 * Cria gasto. Se parcelado, cria todas as parcelas automaticamente.
 */
const createExpense = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const {
    name, supplier, category, amount, paymentMethod,
    isInstallment, installmentTotal, dueDate, notes, recurrence,
  } = req.body;

  if (!name?.trim())            throw new AppError('Nome do gasto é obrigatório.', 400);
  if (!amount || isNaN(amount)) throw new AppError('Valor inválido.', 400);
  if (!dueDate)                 throw new AppError('Data de vencimento é obrigatória.', 400);

  const cat = category    || 'other';
  const pm  = paymentMethod || 'pix';

  if (isInstallment && installmentTotal > 1) {
    const created = [];
    const base    = new Date(dueDate + 'T12:00:00Z');

    for (let i = 0; i < installmentTotal; i++) {
      const d   = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, base.getUTCDate()));
      const iso = d.toISOString().slice(0, 10);
      const { rows } = await db.query(
        `INSERT INTO expenses
           (tenant_id,name,supplier,category,amount,payment_method,
            is_installment,installment_total,installment_current,
            due_date,status,notes,recurrence)
         VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,$9,'pending',$10,$11)
         RETURNING *`,
        [tenantId, name.trim(), supplier||null, cat, amount, pm,
         installmentTotal, i + 1, iso, notes||null, recurrence||null]
      );
      created.push(rows[0]);
    }
    return res.status(201).json({ success: true, data: created });
  }

  const { rows } = await db.query(
    `INSERT INTO expenses
       (tenant_id,name,supplier,category,amount,payment_method,
        is_installment,due_date,status,notes,recurrence)
     VALUES ($1,$2,$3,$4,$5,$6,false,$7,'pending',$8,$9)
     RETURNING *`,
    [tenantId, name.trim(), supplier||null, cat, amount, pm,
     dueDate, notes||null, recurrence||null]
  );
  financeLog({
    tenantId, userId: req.user?.id, action: 'expense_created',
    tableName: 'expenses', recordId: rows[0]?.id,
    afterData: { name: name.trim(), amount, category: cat, due_date: dueDate },
    amount, ip: req.ip,
  });
  res.status(201).json({ success: true, data: rows[0] });
});

/**
 * PUT /api/financeiro/expenses/:id
 */
const updateExpense = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const { id }   = req.params;
  const { name, supplier, category, amount, paymentMethod, dueDate, notes, recurrence } = req.body;

  const { rows } = await db.query(
    `UPDATE expenses
     SET name           = COALESCE($3, name),
         supplier       = COALESCE($4, supplier),
         category       = COALESCE($5, category),
         amount         = COALESCE($6, amount),
         payment_method = COALESCE($7, payment_method),
         due_date       = COALESCE($8, due_date),
         notes          = COALESCE($9, notes),
         recurrence     = COALESCE($10, recurrence),
         updated_at     = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [id, tenantId, name||null, supplier||null, category||null,
     amount||null, paymentMethod||null, dueDate||null, notes||null, recurrence||null]
  );
  if (!rows[0]) throw new AppError('Gasto não encontrado.', 404);
  res.json({ success: true, data: rows[0] });
});

/**
 * PATCH /api/financeiro/expenses/:id/pay
 *
 * Marca gasto como pago E registra débito no Banco Virtual.
 * Usa transação para garantir consistência.
 */
const payExpense = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const { id }   = req.params;
  const client   = await db.getClient();

  try {
    await client.query('BEGIN');

    // 1. Marca como pago (só se ainda pendente — evita duplo débito)
    const { rows } = await client.query(
      `UPDATE expenses
       SET status = 'paid', paid_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
       RETURNING *`,
      [id, tenantId]
    );
    if (!rows[0]) throw new AppError('Gasto não encontrado ou já pago.', 404);

    const expense = rows[0];

    // 2. Debita do Banco Virtual (source = 'expense' — não pode ser deletado manualmente)
    await client.query(
      `INSERT INTO banco_transactions (tenant_id, type, amount, description, source)
       VALUES ($1, 'debit', $2, $3, 'expense')`,
      [
        tenantId,
        expense.amount,
        `Pgto: ${expense.name}${expense.supplier ? ` — ${expense.supplier}` : ''}`,
      ]
    );

    await client.query('COMMIT');

    // Auditoria (fire-and-forget)
    financeLog({
      tenantId, userId: req.user?.id, action: 'expense_paid',
      tableName: 'expenses', recordId: expense.id,
      beforeData: { status: 'pending', amount: expense.amount },
      afterData:  { status: 'paid' },
      amount: expense.amount,
      ip: req.ip,
    });

    res.json({ success: true, data: expense });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/financeiro/expenses/:id
 */
const deleteExpense = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const { id }   = req.params;

  const { rowCount } = await db.query(
    `DELETE FROM expenses WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (!rowCount) throw new AppError('Gasto não encontrado.', 404);
  financeLog({
    tenantId, userId: req.user?.id, action: 'expense_deleted',
    tableName: 'expenses', recordId: id, ip: req.ip,
  });
  res.json({ success: true });
});

// ── Result (DRE simplificado) ──────────────────────────────────────────

/**
 * GET /api/financeiro/result?month=2026-05
 *
 * Receita do mês vs gastos → lucro estimado.
 */
const getResult = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const { startDate, endDate, year, month } = getMonthDates(req.query.month);

  const [{ rows: [rev] }, { rows: [exp] }, { rows: [logist] }, { rows: [cmvTeo] }, { rows: [consumo] }] = await Promise.all([
    db.query(
      `SELECT
         COALESCE(SUM(o.total),0)::float                                                      AS revenue,
         COALESCE(SUM(o.total - COALESCE(o.delivery_fee, 0)), 0)::float                       AS products_revenue,
         COALESCE(SUM(CASE WHEN o.delivery_type = 'delivery'
                           THEN COALESCE(o.delivery_fee, 0) ELSE 0 END), 0)::float            AS delivery_fees_charged,
         (SELECT COALESCE(SUM(oi.total_cost),0)::float
          FROM order_items oi
          JOIN orders o2 ON o2.id = oi.order_id
          WHERE o2.tenant_id = $1
            AND o2.status IN ${BILLABLE_SQL}
            AND (o2.created_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
         )                                                                                    AS total_cmv
       FROM orders o
       WHERE  o.tenant_id = $1
         AND  o.status IN ${BILLABLE_SQL}
         AND  (o.created_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date`,
      [tenantId, startDate, endDate, TZ]
    ),
    db.query(
      `SELECT
         COALESCE(SUM(amount),0)::float                                          AS total_expenses,
         COALESCE(SUM(CASE WHEN status='paid'    THEN amount ELSE 0 END),0)::float AS paid_expenses,
         COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0)::float AS pending_expenses
       FROM expenses
       WHERE tenant_id = $1
         AND EXTRACT(YEAR  FROM due_date) = $2
         AND EXTRACT(MONTH FROM due_date) = $3`,
      [tenantId, year, month]
    ),
    // Repasse total ao motoboy no mês
    db.query(
      `SELECT COALESCE(SUM(d.driver_fee), 0)::float AS total_driver_fees
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       WHERE d.tenant_id = $1
         AND d.status = 'delivered'
         AND (o.created_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date`,
      [tenantId, startDate, endDate, TZ]
    ),
    // CMV Teórico: o que deveria ter sido consumido (ficha técnica × qtd vendida)
    db.query(
      `SELECT COALESCE(SUM(
         CASE WHEN oi.weight_kg IS NOT NULL
              THEN oi.weight_kg * pi.qty_per_unit * i.cost_per_unit
              ELSE oi.quantity  * pi.qty_per_unit * i.cost_per_unit
         END
       ), 0)::float AS cmv_teorico
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN product_insumos pi
         ON pi.product_id = oi.product_id AND pi.tenant_id = o.tenant_id
       JOIN insumos i ON i.id = pi.insumo_id
       WHERE o.tenant_id = $1
         AND o.status IN ('ready','delivered')
         AND (o.created_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date`,
      [tenantId, startDate, endDate, TZ]
    ),
    // Consumo interno do mês (funcionários, família, brindes, degustação, perdas)
    db.query(
      `SELECT
         COALESCE(SUM(total_cost), 0)::float                                           AS total,
         COALESCE(SUM(total_cost) FILTER (WHERE consumption_type='funcionario'),0)::float AS funcionario,
         COALESCE(SUM(total_cost) FILTER (WHERE consumption_type='familia'),0)::float     AS familia,
         COALESCE(SUM(total_cost) FILTER (WHERE consumption_type='brinde'),0)::float      AS brinde,
         COALESCE(SUM(total_cost) FILTER (WHERE consumption_type='degustacao'),0)::float  AS degustacao,
         COALESCE(SUM(total_cost) FILTER (WHERE consumption_type='perda'),0)::float       AS perda,
         COUNT(*)::int                                                                    AS registros
       FROM internal_consumptions
       WHERE tenant_id = $1
         AND created_at >= $2::date
         AND created_at < ($3::date + INTERVAL '1 day')`,
      [tenantId, startDate, endDate]
    ),
  ]);

  const monthStr        = req.query.month || new Date().toISOString().slice(0, 7);
  const grossProfit     = rev.revenue - rev.total_cmv;
  const netProfit       = grossProfit - exp.total_expenses;
  const marginPct       = rev.revenue > 0 ? Math.round((grossProfit / rev.revenue) * 100) : null;
  const driverFees      = parseFloat(logist.total_driver_fees || 0);
  const deliveryFees    = parseFloat(rev.delivery_fees_charged || 0);
  const logisticsResult = parseFloat((deliveryFees - driverFees).toFixed(2));

  // CMV Teórico: baseado em fichas técnicas. Só considera produtos com ficha cadastrada.
  const cmvTeorico      = parseFloat((cmvTeo?.cmv_teorico || 0).toFixed(2));
  const cmvReal         = parseFloat((rev.total_cmv || 0).toFixed(2));
  // Desvio positivo = consumiu mais que o esperado (perdas não capturadas, desvio, desperdício)
  // Desvio negativo = fichas técnicas desatualizadas ou produtos sem ficha não computados
  const desvio_cmv      = parseFloat((cmvReal - cmvTeorico).toFixed(2));

  res.json({
    success: true,
    data: {
      month:              monthStr,
      revenue:            rev.revenue,
      total_cmv:          cmvReal,
      gross_profit:       grossProfit,
      gross_margin_pct:   marginPct,
      total_expenses:     exp.total_expenses,
      paid_expenses:      exp.paid_expenses,
      pending_expenses:   exp.pending_expenses,
      profit:             netProfit,
      profit_after_paid:  grossProfit - exp.paid_expenses,
      products_revenue:      parseFloat((rev.products_revenue      || 0).toFixed(2)),
      delivery_fees_charged: parseFloat((rev.delivery_fees_charged || 0).toFixed(2)),
      total_driver_fees:     driverFees,
      logistics_result:      logisticsResult,
      // ── CMV Teórico vs Real ─────────────────────────────
      // cmv_teorico: o que deveria ter sido consumido (ficha técnica × vendas)
      // total_cmv:   o que foi realmente registrado nos pedidos
      // desvio_cmv:  diferença — positivo = desperdício/desvio não capturado
      cmv_teorico:  cmvTeorico,
      desvio_cmv:   desvio_cmv,
      gross_margin_teorico_pct: cmvTeorico > 0 && rev.revenue > 0
        ? Math.round(((rev.revenue - cmvTeorico) / rev.revenue) * 100)
        : null,
      // ── Consumo interno do mês ───────────────────────────
      // Custo real dos itens consumidos internamente (fora das vendas)
      // Deve ser considerado no lucro real do período
      consumo_interno: {
        total:       parseFloat((consumo?.total      || 0).toFixed(2)),
        registros:   parseInt (consumo?.registros    || 0),
        funcionario: parseFloat((consumo?.funcionario || 0).toFixed(2)),
        familia:     parseFloat((consumo?.familia     || 0).toFixed(2)),
        brinde:      parseFloat((consumo?.brinde      || 0).toFixed(2)),
        degustacao:  parseFloat((consumo?.degustacao  || 0).toFixed(2)),
        perda:       parseFloat((consumo?.perda       || 0).toFixed(2)),
      },
      // Lucro real = lucro operacional - consumo interno (custo não refletido no CMV de vendas)
      profit_real: parseFloat((netProfit - parseFloat(consumo?.total || 0)).toFixed(2)),
    },
  });
});

// ── CMV por produto ────────────────────────────────────────────────────────

/**
 * GET /api/financeiro/cmv?month=2026-05&limit=50
 *
 * Ranking de produtos por CMV, margem, receita e lucro bruto.
 * Usa dados reais de order_items.total_cost.
 */
const getCmvByProduct = asyncHandler(async (req, res) => {
  const tenantId  = req.user.tenantId;
  const { startDate, endDate } = getMonthDates(req.query.month);
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);

  const { rows } = await db.query(
    `SELECT
       oi.product_name                                                  AS name,
       COUNT(DISTINCT o.id)::int                                        AS orders_count,
       SUM(oi.quantity)::float                                          AS qty_sold,
       ROUND(SUM(oi.total)::numeric, 2)::float                         AS revenue,
       ROUND(SUM(oi.total_cost)::numeric, 2)::float                    AS total_cost,
       ROUND((SUM(oi.total) - SUM(oi.total_cost))::numeric, 2)::float  AS gross_profit,
       CASE WHEN SUM(oi.total) > 0
            THEN ROUND((SUM(oi.total_cost) / SUM(oi.total) * 100)::numeric, 1)::float
            ELSE NULL END                                               AS cmv_pct,
       CASE WHEN SUM(oi.total) > 0
            THEN ROUND(((SUM(oi.total) - SUM(oi.total_cost)) / SUM(oi.total) * 100)::numeric, 1)::float
            ELSE NULL END                                               AS margin_pct,
       ROUND(AVG(oi.unit_price)::numeric, 2)::float                    AS avg_price,
       ROUND(AVG(oi.unit_cost)::numeric, 2)::float                     AS avg_cost
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.tenant_id = $1
       AND o.status IN ('ready', 'delivered')
       AND (o.created_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
     GROUP BY oi.product_name
     HAVING SUM(oi.total) > 0
     ORDER BY revenue DESC
     LIMIT $5`,
    [tenantId, startDate, endDate, TZ, limit]
  );

  // Totais consolidados do período
  const totals = rows.reduce((acc, r) => ({
    revenue:     acc.revenue     + r.revenue,
    total_cost:  acc.total_cost  + r.total_cost,
    gross_profit: acc.gross_profit + r.gross_profit,
  }), { revenue: 0, total_cost: 0, gross_profit: 0 });

  const avg_cmv_pct = totals.revenue > 0
    ? parseFloat((totals.total_cost / totals.revenue * 100).toFixed(1))
    : null;

  res.json({
    success: true,
    data: {
      products: rows,
      totals: {
        ...totals,
        avg_cmv_pct,
        avg_margin_pct: avg_cmv_pct != null ? parseFloat((100 - avg_cmv_pct).toFixed(1)) : null,
      },
      month:    req.query.month || new Date().toISOString().slice(0, 7),
      products_without_cost: rows.filter(r => r.total_cost === 0).length,
    },
  });
});


// ── GET /api/financeiro/audit-log ─────────────────────────────
// Fix 3: expõe o finance_logs que antes era gravado mas nunca lido
const getAuditLog = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const { rows } = await db.query(
    `SELECT fl.id, fl.action, fl.table_name, fl.record_id,
            fl.before_data, fl.after_data, fl.amount, fl.created_at,
            u.name AS user_name
     FROM finance_logs fl
     LEFT JOIN users u ON u.id = fl.user_id
     WHERE fl.tenant_id = $1
     ORDER BY fl.created_at DESC
     LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset]
  );
  res.json({ success: true, data: rows });
});

module.exports = {
  summary,
  listExpenses,
  getReminders,
  createExpense,
  updateExpense,
  payExpense,
  deleteExpense,
  getResult,
  getCmvByProduct,
  getAuditLog,
};
