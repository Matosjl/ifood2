'use strict';
const asyncHandler = require('../../utils/asyncHandler');
const svc          = require('./operacao.service');

// GET /api/operacao/fechamento-hoje
const fechamentoHoje = asyncHandler(async (req, res) => {
  const data = await svc.getFechamentoHoje(req.user.tenantId);
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data });
});

// GET /api/operacao/confiabilidade?dias=30
const confiabilidade = asyncHandler(async (req, res) => {
  const dias = Math.min(parseInt(req.query.dias || '30', 10), 90);
  const data = await svc.getConfiabilidade(req.user.tenantId, dias);
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data });
});

// GET /api/operacao/fechamento-mensal?month=YYYY-MM
const fechamentoMensal = asyncHandler(async (req, res) => {
  const month = req.query.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ success: false, message: 'Parâmetro month obrigatório (YYYY-MM).' });
  }
  const data = await svc.getFechamentoMensal(req.user.tenantId, month);
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data });
});

module.exports = { fechamentoHoje, confiabilidade, fechamentoMensal };
