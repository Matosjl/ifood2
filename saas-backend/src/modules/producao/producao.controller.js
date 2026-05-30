'use strict';
const asyncHandler   = require('express-async-handler');
const { body, validationResult } = require('express-validator');
const AppError       = require('../../utils/AppError');
const svc            = require('./producao.service');
const eventService   = require('../../socket/eventService');

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new AppError(errors.array()[0].msg, 422);
};

// ── POST /api/producao/lotes ──────────────────────────────────
const criarLote = asyncHandler(async (req, res) => {
  handleValidation(req);
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
  handleValidation(req);
  const item = await svc.adicionarItem(
    req.user.tenantId,
    req.user.id,
    req.params.id,
    req.body
  );
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
  handleValidation(req);
  const perda = await svc.registrarPerda(
    req.user.tenantId,
    req.user.id,
    req.params.id,
    req.body
  );
  eventService.emit(req.user.tenantId, 'producao:perda_registrada', perda);
  res.status(201).json({ success: true, data: perda });
});

// ── GET /api/producao/resumo?date=YYYY-MM-DD ─────────────────
const getResumoDia = asyncHandler(async (req, res) => {
  const resumo = await svc.getResumoDia(req.user.tenantId, req.query.date);
  res.json({ success: true, data: resumo });
});

// ── Validation rules ──────────────────────────────────────────
const criarLoteRules = [
  body('date').optional().isISO8601().withMessage('Data inválida (use YYYY-MM-DD).'),
  body('notes').optional().isString(),
];

const adicionarItemRules = [
  body('insumoId').notEmpty().withMessage('insumoId é obrigatório.'),
  body('rawQty').isFloat({ gt: 0 }).withMessage('rawQty deve ser maior que zero.'),
  body('cookedQty').isFloat({ gt: 0 }).withMessage('cookedQty deve ser maior que zero.'),
  body('expiresAt').optional().isISO8601().withMessage('Data de validade inválida.'),
];

const perdaRules = [
  body('insumoId').notEmpty().withMessage('insumoId é obrigatório.'),
  body('qty').isFloat({ gt: 0 }).withMessage('qty deve ser maior que zero.'),
  body('reason').optional().isString(),
];

module.exports = {
  criarLote:       [criarLoteRules,    criarLote],
  adicionarItem:   [adicionarItemRules, adicionarItem],
  fecharLote,
  registrarPerda:  [perdaRules,         registrarPerda],
  getResumo,
  getResumoDia,
};
