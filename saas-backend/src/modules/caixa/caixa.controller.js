const db           = require('../../config/database');
const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');

// ── GET /api/caixa/current ────────────────────────────────────
const getCurrent = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT cr.*,
            u.name AS opened_by_name
     FROM   cash_registers cr
     LEFT   JOIN users u ON u.id = cr.opened_by
     WHERE  cr.tenant_id = $1 AND cr.status = 'open'
     ORDER  BY cr.opened_at DESC
     LIMIT  1`,
    [req.user.tenantId]
  );
  res.json({ success: true, data: rows[0] ?? null });
});

// ── POST /api/caixa/open ──────────────────────────────────────
const openCaixa = asyncHandler(async (req, res) => {
  const { openingBalance = 0, notes } = req.body;

  // Only one open caixa at a time
  const { rows: existing } = await db.query(
    `SELECT id FROM cash_registers WHERE tenant_id = $1 AND status = 'open' LIMIT 1`,
    [req.user.tenantId]
  );
  if (existing[0]) throw new AppError('Já existe um caixa aberto. Feche-o antes de abrir um novo.', 409);

  const { rows } = await db.query(
    `INSERT INTO cash_registers (tenant_id, opened_by, opening_balance, notes)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [req.user.tenantId, req.user.userId, openingBalance, notes ?? null]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

// ── POST /api/caixa/close ─────────────────────────────────────
const closeCaixa = asyncHandler(async (req, res) => {
  const {
    notes,
    cashCounted,  // valor contado em dinheiro (espécie)
    cardCounted,  // valor contado em cartão (crédito + débito + vale)
    pixCounted,   // valor contado em pix
  } = req.body;

  // Validação: pelo menos um valor deve ser informado
  const allBlank = cashCounted === undefined && cardCounted === undefined && pixCounted === undefined;
  if (allBlank) {
    throw new AppError(
      'Informe os valores contados em Dinheiro, Cartão e Pix antes de fechar o caixa.',
      400
    );
  }

  const tenantId = req.user.tenantId;

  // Find open caixa
  const { rows: caixas } = await db.query(
    `SELECT * FROM cash_registers WHERE tenant_id = $1 AND status = 'open' LIMIT 1`,
    [tenantId]
  );
  const caixa = caixas[0];
  if (!caixa) throw new AppError('Nenhum caixa aberto encontrado.', 404);

  // Summarize orders since caixa opened
  const { rows: summary } = await db.query(
    `SELECT
       COUNT(*)::int                                                              AS total_orders,
       COALESCE(SUM(total), 0)::float                                            AS total_revenue,
       COALESCE(SUM(CASE WHEN payment_method='cash'    THEN total ELSE 0 END),0)::float AS cash,
       COALESCE(SUM(CASE WHEN payment_method='pix'     THEN total ELSE 0 END),0)::float AS pix,
       COALESCE(SUM(CASE WHEN payment_method='credit'  THEN total ELSE 0 END),0)::float AS credit,
       COALESCE(SUM(CASE WHEN payment_method='debit'   THEN total ELSE 0 END),0)::float AS debit,
       COALESCE(SUM(CASE WHEN payment_method='voucher' THEN total ELSE 0 END),0)::float AS voucher,
       COALESCE(SUM(CASE WHEN payment_method='other'   THEN total ELSE 0 END),0)::float AS other
     FROM orders
     WHERE tenant_id = $1
       AND status IN ('ready', 'delivered')
       AND created_at >= $2`,
    [tenantId, caixa.opened_at]
  );

  const s = summary[0];

  // Sistema: cartão = crédito + débito + vale
  const cardSystem = s.credit + s.debit + s.voucher;

  // Valores contados pelo operador
  const cashC  = parseFloat(cashCounted ?? 0);
  const cardC  = parseFloat(cardCounted ?? 0);
  const pixC   = parseFloat(pixCounted  ?? 0);
  const totalCounted = cashC + cardC + pixC;

  // Diferença: positivo = sobra, negativo = falta
  const discrepancy = parseFloat((totalCounted - s.total_revenue).toFixed(2));

  const paymentSummary = {
    cash: s.cash, pix: s.pix, credit: s.credit,
    debit: s.debit, voucher: s.voucher, other: s.other,
    // Valores contados pelo operador
    cash_counted: cashC,
    card_counted: cardC,
    pix_counted:  pixC,
    card_system:  cardSystem,
  };

  const closingBalance = parseFloat(caixa.opening_balance) + cashC;

  const { rows } = await db.query(
    `UPDATE cash_registers
     SET status          = 'closed',
         closed_by       = $2,
         closed_at       = NOW(),
         total_revenue   = $3,
         total_orders    = $4,
         payment_summary = $5,
         closing_balance = $6,
         notes           = COALESCE($7, notes),
         cash_counted    = $8,
         card_counted    = $9,
         pix_counted     = $10,
         discrepancy     = $11
     WHERE id = $1
     RETURNING *`,
    [caixa.id, req.user.userId, s.total_revenue, s.total_orders,
     JSON.stringify(paymentSummary), closingBalance, notes ?? null,
     cashC, cardC, pixC, discrepancy]
  );

  // ── Registra no Banco virtual ─────────────────────────────────
  // Entrada = total de receita do dia (o que o sistema registrou)
  if (s.total_revenue > 0) {
    await db.query(
      `INSERT INTO banco_transactions (tenant_id, type, amount, description, source, reference_id)
       VALUES ($1, 'credit', $2, $3, 'caixa', $4)`,
      [
        tenantId,
        s.total_revenue,
        `Fechamento de caixa — ${s.total_orders} pedido(s)`,
        caixa.id,
      ]
    ).catch(() => {}); // non-blocking
  }

  res.json({ success: true, data: rows[0] });
});

// ── GET /api/caixa/history ────────────────────────────────────
const getHistory = asyncHandler(async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 30, 100);
  const offset = (Math.max(parseInt(req.query.page) || 1, 1) - 1) * limit;

  const { rows } = await db.query(
    `SELECT cr.*,
            u1.name AS opened_by_name,
            u2.name AS closed_by_name
     FROM   cash_registers cr
     LEFT   JOIN users u1 ON u1.id = cr.opened_by
     LEFT   JOIN users u2 ON u2.id = cr.closed_by
     WHERE  cr.tenant_id = $1 AND cr.status = 'closed'
     ORDER  BY cr.opened_at DESC
     LIMIT  $2 OFFSET $3`,
    [req.user.tenantId, limit, offset]
  );
  res.json({ success: true, data: rows });
});

// ── GET /api/caixa/:id ────────────────────────────────────────
const getOne = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT cr.*,
            u1.name AS opened_by_name,
            u2.name AS closed_by_name
     FROM   cash_registers cr
     LEFT   JOIN users u1 ON u1.id = cr.opened_by
     LEFT   JOIN users u2 ON u2.id = cr.closed_by
     WHERE  cr.id = $1 AND cr.tenant_id = $2`,
    [req.params.id, req.user.tenantId]
  );
  if (!rows[0]) throw new AppError('Caixa não encontrado.', 404);
  res.json({ success: true, data: rows[0] });
});

module.exports = { getCurrent, openCaixa, closeCaixa, getHistory, getOne };
