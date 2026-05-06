const db           = require('../../config/database');
const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');

// ── GET /api/banco/balance ────────────────────────────────────
const getBalance = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0)::float AS total_in,
       COALESCE(SUM(CASE WHEN type = 'debit'  THEN amount ELSE 0 END), 0)::float AS total_out,
       COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END), 0)::float AS balance
     FROM banco_transactions
     WHERE tenant_id = $1`,
    [req.user.tenantId]
  );
  res.json({ success: true, data: rows[0] });
});

// ── GET /api/banco/transactions ───────────────────────────────
const getTransactions = asyncHandler(async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = (Math.max(parseInt(req.query.page) || 1, 1) - 1) * limit;

  const { rows } = await db.query(
    `SELECT * FROM banco_transactions
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user.tenantId, limit, offset]
  );
  res.json({ success: true, data: rows });
});

// ── POST /api/banco/transactions ──────────────────────────────
// Lançamento manual (entrada ou saída)
const addTransaction = asyncHandler(async (req, res) => {
  const { type, amount, description } = req.body;

  if (!['credit', 'debit'].includes(type))
    throw new AppError("type deve ser 'credit' ou 'debit'.", 400);
  if (!amount || parseFloat(amount) <= 0)
    throw new AppError('Valor deve ser maior que zero.', 400);
  if (!description?.trim())
    throw new AppError('Descrição é obrigatória.', 400);

  const { rows } = await db.query(
    `INSERT INTO banco_transactions (tenant_id, type, amount, description, source)
     VALUES ($1, $2, $3, $4, 'manual')
     RETURNING *`,
    [req.user.tenantId, type, parseFloat(amount), description.trim()]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

// ── DELETE /api/banco/transactions/:id ───────────────────────
const deleteTransaction = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `DELETE FROM banco_transactions
     WHERE id = $1 AND tenant_id = $2 AND source = 'manual'
     RETURNING id`,
    [req.params.id, req.user.tenantId]
  );
  if (!rows[0]) throw new AppError('Transação não encontrada ou não pode ser removida.', 404);
  res.json({ success: true, message: 'Transação removida.' });
});

module.exports = { getBalance, getTransactions, addTransaction, deleteTransaction };
