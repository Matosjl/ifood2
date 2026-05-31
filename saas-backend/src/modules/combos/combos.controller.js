'use strict';
const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');
const svc          = require('./combos.service');

// GET /api/combos/:productId
const getCombo = asyncHandler(async (req, res) => {
  const data = await svc.getCombo(req.user.tenantId, req.params.productId);
  res.json({ success: true, data });
});

// POST /api/combos/:productId/items
const addItem = asyncHandler(async (req, res) => {
  const { child_product_id, qty } = req.body;
  if (!child_product_id) throw new AppError('child_product_id é obrigatório.', 400);
  if (!qty || parseFloat(qty) <= 0) throw new AppError('qty deve ser maior que zero.', 400);

  const data = await svc.addItem(req.user.tenantId, req.params.productId, {
    child_product_id,
    qty: parseFloat(qty),
  });
  res.status(201).json({ success: true, data });
});

// DELETE /api/combos/:productId/items/:itemId
const removeItem = asyncHandler(async (req, res) => {
  const data = await svc.removeItem(
    req.user.tenantId,
    req.params.productId,
    req.params.itemId
  );
  res.json({ success: true, data });
});

module.exports = { getCombo, addItem, removeItem };
