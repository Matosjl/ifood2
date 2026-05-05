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

// ═══════════════════════════════════════════════════════════════
// EXPENSES (gastos mensais)
// ═══════════════════════════════════════════════════════════════

const AppError = require('../../utils/AppError');

/**
 * GET /api/financeiro/expenses?month=2026-05
 * Lista todos os gastos do mês (ou mês corrente se não informado).
 */
const listExpenses = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const month    = req.query.month ?? new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const [year, mon] = month.split('-').map(Number);

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
    [tenantId, year, mon]
  );
  res.json({ success: true, data: rows });
});

/**
 * GET /api/financeiro/expenses/reminders
 * Gastos com vencimento amanhã ou já vencidos e ainda não pagos.
 */
const getReminders = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const today    = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const todayStr    = today.toISOString().slice(0, 10);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

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
 * Cria um gasto. Se parcelado, cria todas as parcelas automaticamente.
 */
const createExpense = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const {
    name, supplier, category, amount, paymentMethod,
    isInstallment, installmentTotal, dueDate,
    notes, recurrence,
  } = req.body;

  if (!name?.trim())  throw new AppError('Nome do gasto é obrigatório.', 400);
  if (!amount || isNaN(amount)) throw new AppError('Valor inválido.', 400);
  if (!dueDate)       throw new AppError('Data de vencimento é obrigatória.', 400);

  const cat = category || 'other';
  const pm  = paymentMethod || 'pix';

  if (isInstallment && installmentTotal > 1) {
    // Cria todas as parcelas
    const created = [];
    const base = new Date(dueDate);

    for (let i = 0; i < installmentTotal; i++) {
      const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, base.getUTCDate()));
      const iso = d.toISOString().slice(0, 10);

      const { rows } = await db.query(
        `INSERT INTO expenses
           (tenant_id, name, supplier, category, amount, payment_method,
            is_installment, installment_total, installment_current,
            due_date, status, notes, recurrence)
         VALUES ($1,$2,$3,$4,$5,$6, true,$7,$8, $9,'pending',$10,$11)
         RETURNING *`,
        [tenantId, name.trim(), supplier||null, cat, amount, pm,
         installmentTotal, i + 1, iso, notes||null, recurrence||null]
      );
      created.push(rows[0]);
    }
    return res.status(201).json({ success: true, data: created });
  }

  // Gasto simples
  const { rows } = await db.query(
    `INSERT INTO expenses
       (tenant_id, name, supplier, category, amount, payment_method,
        is_installment, due_date, status, notes, recurrence)
     VALUES ($1,$2,$3,$4,$5,$6, false,$7,'pending',$8,$9)
     RETURNING *`,
    [tenantId, name.trim(), supplier||null, cat, amount, pm,
     dueDate, notes||null, recurrence||null]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

/**
 * PUT /api/financeiro/expenses/:id
 * Atualiza um gasto.
 */
const updateExpense = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const { id }   = req.params;
  const {
    name, supplier, category, amount, paymentMethod,
    dueDate, notes, recurrence,
  } = req.body;

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
 * Marca gasto como pago.
 */
const payExpense = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const { id }   = req.params;

  const { rows } = await db.query(
    `UPDATE expenses
     SET status     = 'paid',
         paid_at    = NOW(),
         updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [id, tenantId]
  );
  if (!rows[0]) throw new AppError('Gasto não encontrado.', 404);
  res.json({ success: true, data: rows[0] });
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
  res.json({ success: true });
});

/**
 * GET /api/financeiro/result?month=2026-05
 * Receita do mês vs gastos → lucro estimado.
 */
const getResult = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const month    = req.query.month ?? new Date().toISOString().slice(0, 7);
  const [year, mon] = month.split('-').map(Number);

  const start = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0));
  const end   = new Date(Date.UTC(year, mon,     0, 23, 59, 59, 999));

  const [{ rows: [rev] }, { rows: exp }] = await Promise.all([
    db.query(
      `SELECT COALESCE(SUM(total),0)::float AS revenue
       FROM   orders
       WHERE  tenant_id=$1 AND status IN('ready','delivered')
         AND  created_at BETWEEN $2 AND $3`,
      [tenantId, start, end]
    ),
    db.query(
      `SELECT COALESCE(SUM(amount),0)::float AS total_expenses,
              COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0)::float AS paid_expenses,
              COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0)::float AS pending_expenses
       FROM   expenses
       WHERE  tenant_id=$1
         AND  EXTRACT(YEAR  FROM due_date)=$2
         AND  EXTRACT(MONTH FROM due_date)=$3`,
      [tenantId, year, mon]
    ),
  ]);

  const revenue  = rev.revenue;
  const expenses = exp[0];
  const profit   = revenue - expenses.total_expenses;

  res.json({
    success: true,
    data: {
      month,
      revenue,
      total_expenses:   expenses.total_expenses,
      paid_expenses:    expenses.paid_expenses,
      pending_expenses: expenses.pending_expenses,
      profit,
    },
  });
});

module.exports = { summary, listExpenses, getReminders, createExpense, updateExpense, payExpense, deleteExpense, getResult };
