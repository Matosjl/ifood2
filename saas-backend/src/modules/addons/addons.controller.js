const { validationResult } = require('express-validator');
const service    = require('./addons.service');
const asyncHandler = require('../../utils/asyncHandler');
const AppError   = require('../../utils/AppError');

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new AppError(errors.array().map((e) => e.msg).join('. '), 422);
};

// ── Grupos ────────────────────────────────────────────────────

const listGroups = asyncHandler(async (req, res) => {
  const groups = await service.listGroups(req.user.tenantId);
  res.json({ success: true, data: groups });
});

const createGroup = asyncHandler(async (req, res) => {
  handleValidation(req);
  const group = await service.createGroup(req.user.tenantId, req.body);
  res.status(201).json({ success: true, data: group });
});

const updateGroup = asyncHandler(async (req, res) => {
  handleValidation(req);
  const group = await service.updateGroup(req.user.tenantId, req.params.id, req.body);
  if (!group) throw new AppError('Grupo não encontrado.', 404);
  res.json({ success: true, data: group });
});

const deleteGroup = asyncHandler(async (req, res) => {
  const ok = await service.deleteGroup(req.user.tenantId, req.params.id);
  if (!ok) throw new AppError('Grupo não encontrado.', 404);
  res.json({ success: true });
});

// ── Itens ─────────────────────────────────────────────────────

const createItem = asyncHandler(async (req, res) => {
  handleValidation(req);
  const item = await service.createItem(req.user.tenantId, req.params.groupId, req.body);
  res.status(201).json({ success: true, data: item });
});

const updateItem = asyncHandler(async (req, res) => {
  handleValidation(req);
  const item = await service.updateItem(req.user.tenantId, req.params.itemId, req.body);
  if (!item) throw new AppError('Item não encontrado.', 404);
  res.json({ success: true, data: item });
});

const deleteItem = asyncHandler(async (req, res) => {
  const ok = await service.deleteItem(req.user.tenantId, req.params.itemId);
  if (!ok) throw new AppError('Item não encontrado.', 404);
  res.json({ success: true });
});

// ── Ligação produto <-> grupos ─────────────────────────────────

const getProductGroups = asyncHandler(async (req, res) => {
  const groups = await service.getProductGroups(req.user.tenantId, req.params.productId);
  res.json({ success: true, data: groups });
});

const setProductGroups = asyncHandler(async (req, res) => {
  const { groupIds = [] } = req.body;
  if (!Array.isArray(groupIds)) throw new AppError('groupIds deve ser um array.', 400);
  const groups = await service.setProductGroups(req.user.tenantId, req.params.productId, groupIds);
  res.json({ success: true, data: groups });
});

module.exports = {
  listGroups, createGroup, updateGroup, deleteGroup,
  createItem, updateItem, deleteItem,
  getProductGroups, setProductGroups,
};
