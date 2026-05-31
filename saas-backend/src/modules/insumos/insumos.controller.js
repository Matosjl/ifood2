'use strict';
const { validationResult } = require('express-validator');
const service      = require('./insumos.service');
const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new AppError(errors.array().map((e) => e.msg).join('. '), 422);
};

// ── Insumos CRUD ──────────────────────────────────────────────

const list    = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listInsumos(req.user.tenantId) });
});
const getOne  = asyncHandler(async (req, res) => {
  const d = await service.getInsumo(req.user.tenantId, req.params.id);
  if (!d) throw new AppError('Insumo não encontrado.', 404);
  res.json({ success: true, data: d });
});
const create  = asyncHandler(async (req, res) => {
  handleValidation(req);
  res.status(201).json({ success: true, data: await service.createInsumo(req.user.tenantId, req.body) });
});
const update  = asyncHandler(async (req, res) => {
  handleValidation(req);
  const d = await service.updateInsumo(req.user.tenantId, req.params.id, req.body);
  if (!d) throw new AppError('Insumo não encontrado.', 404);
  res.json({ success: true, data: d });
});
const remove  = asyncHandler(async (req, res) => {
  const ok = await service.deleteInsumo(req.user.tenantId, req.params.id);
  if (!ok) throw new AppError('Insumo não encontrado.', 404);
  res.json({ success: true });
});
const adjust  = asyncHandler(async (req, res) => {
  handleValidation(req);
  const d = await service.adjustStock(
    req.user.tenantId,
    req.params.id,
    parseFloat(req.body.qty),
    req.body.reason,
    req.user.id
  );
  if (!d) throw new AppError('Insumo não encontrado.', 404);
  res.json({ success: true, data: d });
});

// ── Ficha técnica ─────────────────────────────────────────────

const getProductInsumos = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getProductInsumos(req.user.tenantId, req.params.productId) });
});
const setProductInsumos = asyncHandler(async (req, res) => {
  const { insumos = [] } = req.body;
  if (!Array.isArray(insumos)) throw new AppError('insumos deve ser um array.', 400);
  res.json({ success: true, data: await service.setProductInsumos(req.user.tenantId, req.params.productId, insumos) });
});

// ── Produção diária ───────────────────────────────────────────

const listBatches = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listBatches(req.user.tenantId, req.query.date || null) });
});
const createBatch = asyncHandler(async (req, res) => {
  handleValidation(req);
  res.status(201).json({ success: true, data: await service.createBatch(req.user.tenantId, req.user.id, req.body) });
});
const getDayReport = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getDayReport(req.user.tenantId, req.query.date || null) });
});
const getExpiryAlerts = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getExpiryAlerts(req.user.tenantId) });
});

// ── Perdas ────────────────────────────────────────────────────

const logWaste = asyncHandler(async (req, res) => {
  handleValidation(req);
  res.status(201).json({ success: true, data: await service.logWaste(req.user.tenantId, req.user.id, req.body) });
});
const listWasteLogs = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.listWasteLogs(req.user.tenantId, req.query) });
});

// ── Lista de compras ──────────────────────────────────────────

const getShoppingList = asyncHandler(async (req, res) => {
  const { lookback_days: lookbackDays = 7, cover_days: coverDays = 3 } = req.query;
  res.json({ success: true, data: await service.getShoppingList(req.user.tenantId, {
    lookbackDays: parseInt(lookbackDays, 10),
    coverDays:    parseInt(coverDays,    10),
  }) });
});

// ── Simulador de produção ─────────────────────────────────────

const simulateProduction = asyncHandler(async (req, res) => {
  const { product_id, quantity } = req.query;
  if (!product_id) throw new AppError('product_id é obrigatório.', 400);
  if (!quantity || parseFloat(quantity) <= 0) throw new AppError('quantity deve ser maior que zero.', 400);
  res.json({ success: true, data: await service.simulateProduction(req.user.tenantId, product_id, parseFloat(quantity)) });
});

// ── Ranking de lucro ──────────────────────────────────────────

const getProductProfitRanking = asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  res.json({ success: true, data: await service.getProductProfitRanking(req.user.tenantId, { days: parseInt(days, 10) }) });
});

module.exports = {
  list, getOne, create, update, remove, adjust,
  getProductInsumos, setProductInsumos,
  listBatches, createBatch, getDayReport, getExpiryAlerts,
  logWaste, listWasteLogs,
  getShoppingList,
  simulateProduction,
  getProductProfitRanking,
};
