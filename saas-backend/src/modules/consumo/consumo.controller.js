const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');
const service      = require('./consumo.service');

/** GET /api/consumo-interno/sugestoes */
const sugestoes = asyncHandler(async (req, res) => {
  const data = await service.getSugestoes(req.user.tenantId);
  res.json({ success: true, data });
});

/** POST /api/consumo-interno */
const registrar = asyncHandler(async (req, res) => {
  const { insumo_id, product_id, quantity, consumption_type, notes } = req.body;
  const registro = await service.registrar(req.user.tenantId, req.user.id, {
    insumo_id, product_id, quantity, consumption_type, notes,
  });
  res.status(201).json({ success: true, data: registro });
});

/** GET /api/consumo-interno */
const historico = asyncHandler(async (req, res) => {
  const { mes, page, limit } = req.query;
  const data = await service.getHistorico(req.user.tenantId, {
    mes,
    page:  parseInt(page)  || 1,
    limit: Math.min(parseInt(limit) || 50, 200),
  });
  res.json({ success: true, data });
});

/** GET /api/vazamentos */
const vazamentos = asyncHandler(async (req, res) => {
  const { mes } = req.query;
  const data = await service.getVazamentos(req.user.tenantId, mes);
  res.json({ success: true, data });
});

module.exports = { sugestoes, registrar, historico, vazamentos };
