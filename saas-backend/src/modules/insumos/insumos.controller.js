const { validationResult } = require('express-validator');
const service      = require('./insumos.service');
const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new AppError(errors.array().map((e) => e.msg).join('. '), 422);
};

const list = asyncHandler(async (req, res) => {
  const insumos = await service.listInsumos(req.user.tenantId);
  res.json({ success: true, data: insumos });
});

const getOne = asyncHandler(async (req, res) => {
  const insumo = await service.getInsumo(req.user.tenantId, req.params.id);
  if (!insumo) throw new AppError('Insumo não encontrado.', 404);
  res.json({ success: true, data: insumo });
});

const create = asyncHandler(async (req, res) => {
  handleValidation(req);
  const insumo = await service.createInsumo(req.user.tenantId, req.body);
  res.status(201).json({ success: true, data: insumo });
});

const update = asyncHandler(async (req, res) => {
  handleValidation(req);
  const insumo = await service.updateInsumo(req.user.tenantId, req.params.id, req.body);
  if (!insumo) throw new AppError('Insumo não encontrado.', 404);
  res.json({ success: true, data: insumo });
});

const remove = asyncHandler(async (req, res) => {
  const ok = await service.deleteInsumo(req.user.tenantId, req.params.id);
  if (!ok) throw new AppError('Insumo não encontrado.', 404);
  res.json({ success: true });
});

const adjust = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { qty, reason } = req.body;
  const insumo = await service.adjustStock(req.user.tenantId, req.params.id, parseFloat(qty), reason);
  if (!insumo) throw new AppError('Insumo não encontrado.', 404);
  res.json({ success: true, data: insumo });
});

// ── Ligação produto <-> insumos ───────────────────────────────

const getProductInsumos = asyncHandler(async (req, res) => {
  const rows = await service.getProductInsumos(req.user.tenantId, req.params.productId);
  res.json({ success: true, data: rows });
});

const setProductInsumos = asyncHandler(async (req, res) => {
  const { insumos = [] } = req.body;
  if (!Array.isArray(insumos)) throw new AppError('insumos deve ser um array.', 400);
  const rows = await service.setProductInsumos(req.user.tenantId, req.params.productId, insumos);
  res.json({ success: true, data: rows });
});

module.exports = { list, getOne, create, update, remove, adjust, getProductInsumos, setProductInsumos };
