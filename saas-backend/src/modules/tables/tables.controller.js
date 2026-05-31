'use strict';
const db           = require('../../config/database');
const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');

const list = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM restaurant_tables WHERE tenant_id = $1 AND active = true ORDER BY table_number ASC`,
    [req.user.tenantId]
  );
  res.json({ success: true, data: rows });
});

const create = asyncHandler(async (req, res) => {
  const { number, name } = req.body;
  if (!number?.trim()) throw new AppError('Número da mesa é obrigatório.', 400);
  const { rows } = await db.query(
    `INSERT INTO restaurant_tables (tenant_id, table_number, description)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, table_number) DO UPDATE SET active = true, description = EXCLUDED.description
     RETURNING *`,
    [req.user.tenantId, number.trim(), name?.trim() || null]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

const update = asyncHandler(async (req, res) => {
  const { name, active } = req.body;
  const { rows } = await db.query(
    `UPDATE restaurant_tables
     SET description = COALESCE($3, description), active = COALESCE($4, active)
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [req.params.id, req.user.tenantId, name ?? null, active ?? null]
  );
  if (!rows[0]) throw new AppError('Mesa não encontrada.', 404);
  res.json({ success: true, data: rows[0] });
});

const remove = asyncHandler(async (req, res) => {
  await db.query(
    `UPDATE restaurant_tables SET active = false WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.user.tenantId]
  );
  res.json({ success: true, data: { message: 'Mesa removida.' } });
});

module.exports = { list, create, update, remove };
