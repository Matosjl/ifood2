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

// ── Option Groups ─────────────────────────────────────────────

// GET /api/combos/:productId/option-groups
const getOptionGroups = asyncHandler(async (req, res) => {
  const data = await svc.getOptionGroups(req.user.tenantId, req.params.productId);
  res.json({ success: true, data });
});

// POST /api/combos/:productId/option-groups
const createOptionGroup = asyncHandler(async (req, res) => {
  const { name, min_select, max_select, sort_order } = req.body;
  const data = await svc.createOptionGroup(req.user.tenantId, req.params.productId,
    { name, min_select, max_select, sort_order });
  res.status(201).json({ success: true, data });
});

// PUT /api/combos/:productId/option-groups/:groupId
const updateOptionGroup = asyncHandler(async (req, res) => {
  const { name, min_select, max_select, sort_order } = req.body;
  const data = await svc.updateOptionGroup(req.user.tenantId, req.params.productId,
    req.params.groupId, { name, min_select, max_select, sort_order });
  res.json({ success: true, data });
});

// DELETE /api/combos/:productId/option-groups/:groupId
const deleteOptionGroup = asyncHandler(async (req, res) => {
  await svc.deleteOptionGroup(req.user.tenantId, req.params.productId, req.params.groupId);
  res.json({ success: true });
});

// POST /api/combos/:productId/option-groups/:groupId/items
const addOptionItem = asyncHandler(async (req, res) => {
  const { product_id, extra_price, sort_order } = req.body;
  const data = await svc.addOptionItem(req.user.tenantId, req.params.productId,
    req.params.groupId, { product_id, extra_price, sort_order });
  res.status(201).json({ success: true, data });
});

// DELETE /api/combos/:productId/option-groups/:groupId/items/:itemId
const removeOptionItem = asyncHandler(async (req, res) => {
  const data = await svc.removeOptionItem(req.user.tenantId, req.params.productId,
    req.params.groupId, req.params.itemId);
  res.json({ success: true, data });
});

module.exports = { getCombo, addItem, removeItem, getOptionGroups, createOptionGroup, updateOptionGroup, deleteOptionGroup, addOptionItem, removeOptionItem };
