'use strict';
const asyncHandler = require('../../utils/asyncHandler');
const AppError      = require('../../utils/AppError');
const svc           = require('./precificador.service');

// GET /api/precificador/overhead
const getOverhead = asyncHandler(async (req, res) => {
  const data = await svc.getOverhead(req.user.tenantId);
  res.json({ success: true, data });
});

// PUT /api/precificador/overhead
const saveOverhead = asyncHandler(async (req, res) => {
  const data = await svc.saveOverhead(req.user.tenantId, req.body);
  res.json({ success: true, data });
});

// POST /api/precificador/calculate
const calculate = asyncHandler(async (req, res) => {
  const { product_id, custo_insumos, overhead, margem_desejada,
          margem_minima, preco_venda_atual, product_name, salvar } = req.body;

  if (!product_id && (custo_insumos === undefined || custo_insumos === null)) {
    throw new AppError('Informe product_id ou custo_insumos para calcular.', 400);
  }

  const data = await svc.calculate(req.user.tenantId, {
    product_id,
    custo_insumos: custo_insumos !== undefined ? parseFloat(custo_insumos) : undefined,
    overhead,
    margem_desejada: margem_desejada !== undefined ? parseFloat(margem_desejada) : undefined,
    margem_minima:   margem_minima   !== undefined ? parseFloat(margem_minima)   : undefined,
    preco_venda_atual: preco_venda_atual !== undefined ? parseFloat(preco_venda_atual) : undefined,
    product_name,
    salvar: Boolean(salvar),
    user_id: req.user.id,
  });

  res.json({ success: true, data });
});

// GET /api/precificador/history
const listHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const data  = await svc.listHistory(req.user.tenantId, limit);
  res.json({ success: true, data });
});

// POST /api/precificador/apply/:productId
const apply = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  if (!productId) throw new AppError('productId é obrigatório.', 400);
  const data = await svc.applyToProduct(req.user.tenantId, productId, req.user.id);
  res.json({ success: true, data });
});

module.exports = { getOverhead, saveOverhead, calculate, listHistory, apply };
