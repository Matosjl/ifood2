'use strict';
const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');
const svc          = require('./incidents.service');

/** GET /api/incidents?date=2026-05-30&resolved=false */
const listIncidents = asyncHandler(async (req, res) => {
  const { date, resolved, limit } = req.query;
  const data = await svc.listIncidents(req.user.tenantId, {
    date:     date || null,
    resolved: resolved === undefined ? undefined : resolved === 'true',
    limit:    parseInt(limit) || 50,
  });
  res.json({ success: true, data });
});

/** GET /api/incidents/summary */
const getSummary = asyncHandler(async (req, res) => {
  const data = await svc.getTodaySummary(req.user.tenantId);
  res.json({ success: true, data });
});

/** POST /api/incidents — criação manual */
const createIncident = asyncHandler(async (req, res) => {
  const { type, orderId, cost, description } = req.body;
  if (!type) throw new AppError('Tipo do incidente é obrigatório.', 400);
  const data = await svc.createIncident(req.user.tenantId, {
    type, orderId, cost, description, source: 'manual',
  });
  res.status(201).json({ success: true, data });
});

/** PATCH /api/incidents/:id/resolve */
const resolveIncident = asyncHandler(async (req, res) => {
  const data = await svc.resolveIncident(req.params.id, req.user.tenantId);
  if (!data) throw new AppError('Incidente não encontrado.', 404);
  res.json({ success: true, data });
});

/** PATCH /api/incidents/confirm-change/:orderId */
const confirmChange = asyncHandler(async (req, res) => {
  const { delivered } = req.body; // true = troco entregue, false = não entregue
  const data = await svc.confirmCashChange(
    req.params.orderId,
    req.user.tenantId,
    delivered !== false
  );
  if (!data) throw new AppError('Pedido não encontrado.', 404);
  res.json({ success: true, data });
});

module.exports = { listIncidents, getSummary, createIncident, resolveIncident, confirmChange };
