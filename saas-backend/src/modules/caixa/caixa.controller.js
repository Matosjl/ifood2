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
  res.set('Cache-Control', 'no-store');
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

  // Summarize orders since caixa opened.
  // JOIN com deliveries para calcular o valor real esperado no caixa físico:
  // para entregas pagas em dinheiro, o motoboy ficou com driver_fee —
  // o caixa não deve esperar o total completo nesses casos.
  const { rows: summary } = await db.query(
    `SELECT
       COUNT(*)::int                                                              AS total_orders,
       -- Receita contábil total (inclui delivery_fee — para banco_transactions)
       COALESCE(SUM(o.total), 0)::float                                          AS total_revenue,
       -- Valor esperado fisicamente no caixa:
       --   entrega + dinheiro + entregue → desconta driver_fee (ficou com o motoboy)
       --   PIX/cartão → motoboy recebe repasse separado, valor digital chega integral
       --   retirada/mesa → comportamento normal
       COALESCE(SUM(
         CASE
           WHEN o.payment_method = 'cash' AND o.delivery_type = 'delivery'
           THEN o.total - COALESCE(d.driver_fee, 0)
           ELSE o.total
         END
       ), 0)::float                                                               AS expected_cash_in_register,
       -- Total de repasses ao motoboy no período (para transparência no fechamento)
       COALESCE(SUM(COALESCE(d.driver_fee, 0))
         FILTER (WHERE o.delivery_type = 'delivery'), 0)::float                  AS total_driver_fees,
       COALESCE(SUM(CASE WHEN o.payment_method='cash'    THEN o.total ELSE 0 END),0)::float AS cash,
       COALESCE(SUM(CASE WHEN o.payment_method='pix'     THEN o.total ELSE 0 END),0)::float AS pix,
       COALESCE(SUM(CASE WHEN o.payment_method='credit'  THEN o.total ELSE 0 END),0)::float AS credit,
       COALESCE(SUM(CASE WHEN o.payment_method='debit'   THEN o.total ELSE 0 END),0)::float AS debit,
       COALESCE(SUM(CASE WHEN o.payment_method='voucher' THEN o.total ELSE 0 END),0)::float AS voucher,
       COALESCE(SUM(CASE WHEN o.payment_method='other'   THEN o.total ELSE 0 END),0)::float AS other
     FROM orders o
     LEFT JOIN deliveries d ON d.order_id = o.id AND d.status = 'delivered'
     WHERE o.tenant_id = $1
       AND o.status IN ('ready', 'delivered')
       AND o.created_at >= $2`,
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
  // Usa expected_cash_in_register (não total_revenue) para não gerar
  // cash_difference falso por driver_fee retido pelo motoboy em entregas em dinheiro
  const discrepancy = parseFloat((totalCounted - s.expected_cash_in_register).toFixed(2));

  const paymentSummary = {
    cash: s.cash, pix: s.pix, credit: s.credit,
    debit: s.debit, voucher: s.voucher, other: s.other,
    // Valores contados pelo operador
    cash_counted:              cashC,
    card_counted:              cardC,
    pix_counted:               pixC,
    card_system:               cardSystem,
    // Logística: para transparência no fechamento
    total_driver_fees:         s.total_driver_fees,
    expected_cash_in_register: s.expected_cash_in_register,
  };

  const closingBalance = parseFloat(caixa.opening_balance) + cashC;

  // ── TRANSAÇÃO ATÔMICA — caixa + banco_transactions fecham juntos ──
  const dbClient = await db.getClient();
  let closedCaixa;
  try {
    await dbClient.query('BEGIN');

    const { rows } = await dbClient.query(
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
    closedCaixa = rows[0];

    // Registra no Banco virtual dentro da mesma transação
    if (s.total_revenue > 0) {
      await dbClient.query(
        `INSERT INTO banco_transactions (tenant_id, type, amount, description, source, reference_id)
         VALUES ($1, 'credit', $2, $3, 'caixa', $4)`,
        [tenantId, s.total_revenue,
         `Fechamento de caixa — ${s.total_orders} pedido(s)`,
         caixa.id]
      );
    }

    await dbClient.query('COMMIT');
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }

  // ── Auto-incidente: diferença no fechamento ──────────────────
  // Fora da transação — falha aqui não desfaz o fechamento do caixa
  if (closedCaixa && discrepancy !== 0) {
    const incidentSvc = require('../incidents/incidents.service');
    incidentSvc.createIncident(tenantId, {
      type:        'cash_difference',
      orderId:     null,
      cost:        Math.abs(discrepancy),
      description: `Fechamento de caixa: esperado no caixa R$ ${s.expected_cash_in_register.toFixed(2)}${s.total_driver_fees > 0 ? ` (vendas R$ ${s.total_revenue.toFixed(2)} - repasse motoboys R$ ${s.total_driver_fees.toFixed(2)})` : ''}, contado R$ ${totalCounted.toFixed(2)}, diferença R$ ${discrepancy > 0 ? '+' : ''}${discrepancy.toFixed(2)}`,
      source:      'auto',
    }).catch(() => {}); // fire-and-forget — nunca bloqueia resposta
  }

  res.json({ success: true, data: closedCaixa });
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

// ── Helper: caixa aberto do tenant ───────────────────────────
const getOpenCaixa = async (tenantId) => {
  const { rows } = await db.query(
    `SELECT id FROM cash_registers WHERE tenant_id = $1 AND status = 'open' LIMIT 1`,
    [tenantId]
  );
  if (!rows[0]) throw new AppError('Nenhum caixa aberto. Abra o caixa antes de registrar movimentos.', 400);
  return rows[0];
};

// ── POST /api/caixa/sangria ───────────────────────────────────
const sangria = asyncHandler(async (req, res) => {
  const { amount, reason } = req.body;
  if (!amount || parseFloat(amount) <= 0) throw new AppError('Valor da sangria deve ser maior que zero.', 400);

  const caixa = await getOpenCaixa(req.user.tenantId);

  const { rows } = await db.query(
    `INSERT INTO caixa_movements (tenant_id, cash_register_id, type, amount, reason, created_by)
     VALUES ($1, $2, 'sangria', $3, $4, $5) RETURNING *`,
    [req.user.tenantId, caixa.id, parseFloat(amount), reason ?? null, req.user.userId]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

// ── POST /api/caixa/suprimento ────────────────────────────────
const suprimento = asyncHandler(async (req, res) => {
  const { amount, reason } = req.body;
  if (!amount || parseFloat(amount) <= 0) throw new AppError('Valor do suprimento deve ser maior que zero.', 400);

  const caixa = await getOpenCaixa(req.user.tenantId);

  const { rows } = await db.query(
    `INSERT INTO caixa_movements (tenant_id, cash_register_id, type, amount, reason, created_by)
     VALUES ($1, $2, 'suprimento', $3, $4, $5) RETURNING *`,
    [req.user.tenantId, caixa.id, parseFloat(amount), reason ?? null, req.user.userId]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

// ── GET /api/caixa/movements?cash_register_id=... ────────────
const getMovements = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;

  let registerId = req.query.cash_register_id;
  if (!registerId) {
    const { rows } = await db.query(
      `SELECT id FROM cash_registers WHERE tenant_id = $1 AND status = 'open' LIMIT 1`,
      [tenantId]
    );
    registerId = rows[0]?.id;
  }
  if (!registerId) {
    return res.json({ success: true, data: [] });
  }

  const { rows } = await db.query(
    `SELECT cm.*, u.name AS created_by_name
     FROM   caixa_movements cm
     LEFT   JOIN users u ON u.id = cm.created_by
     WHERE  cm.cash_register_id = $1 AND cm.tenant_id = $2
     ORDER  BY cm.created_at ASC`,
    [registerId, tenantId]
  );
  res.json({ success: true, data: rows });
});

module.exports = { getCurrent, openCaixa, closeCaixa, sangria, suprimento, getMovements, getHistory, getOne };
