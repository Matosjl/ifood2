'use strict';
const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');
const svc          = require('./producao.service');
const eventService = require('../../socket/eventService');

const validate = (rules) => (req) => {
  for (const [field, check] of Object.entries(rules)) {
    const val = req.body[field];
    if (check.required && (val === undefined || val === null || val === '')) {
      throw new AppError(`${field} é obrigatório.`, 422);
    }
    if (check.float && val !== undefined && (isNaN(parseFloat(val)) || parseFloat(val) <= 0)) {
      throw new AppError(`${field} deve ser maior que zero.`, 422);
    }
  }
};

// ── POST /api/producao/lotes ──────────────────────────────────
const criarLote = asyncHandler(async (req, res) => {
  const lote = await svc.criarLote(req.user.tenantId, req.user.id, req.body);
  eventService.emit(req.user.tenantId, 'producao:lote_criado', lote);
  res.status(201).json({ success: true, data: lote });
});

// ── GET /api/producao/lotes/:id ───────────────────────────────
const getResumo = asyncHandler(async (req, res) => {
  const resumo = await svc.getResumo(req.user.tenantId, req.params.id);
  res.json({ success: true, data: resumo });
});

// ── POST /api/producao/lotes/:id/items ────────────────────────
const adicionarItem = asyncHandler(async (req, res) => {
  validate({ insumoId: { required: true }, rawQty: { float: true }, cookedQty: { float: true } })(req);
  const item = await svc.adicionarItem(req.user.tenantId, req.user.id, req.params.id, req.body);
  eventService.emit(req.user.tenantId, 'producao:item_adicionado', item);
  res.status(201).json({ success: true, data: item });
});

// ── PATCH /api/producao/lotes/:id/fechar ─────────────────────
const fecharLote = asyncHandler(async (req, res) => {
  const resumo = await svc.fecharLote(req.user.tenantId, req.params.id);
  eventService.emit(req.user.tenantId, 'producao:lote_fechado', { id: req.params.id, totais: resumo.totais });
  res.json({ success: true, data: resumo });
});

// ── POST /api/producao/lotes/:id/perdas ──────────────────────
const registrarPerda = asyncHandler(async (req, res) => {
  validate({ insumoId: { required: true }, qty: { float: true } })(req);
  const perda = await svc.registrarPerda(req.user.tenantId, req.user.id, req.params.id, req.body);
  eventService.emit(req.user.tenantId, 'producao:perda_registrada', perda);
  res.status(201).json({ success: true, data: perda });
});

// ── GET /api/producao/resumo?date=YYYY-MM-DD ─────────────────
const getResumoDia = asyncHandler(async (req, res) => {
  const resumo = await svc.getResumoDia(req.user.tenantId, req.query.date);
  res.json({ success: true, data: resumo });
});

module.exports = { criarLote, adicionarItem, fecharLote, registrarPerda, getResumo, getResumoDia };
