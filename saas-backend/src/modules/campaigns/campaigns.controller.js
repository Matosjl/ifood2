'use strict';
const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');
const service      = require('./campaigns.service');

const list = asyncHandler(async (req, res) => {
  const data = await service.list(req.user.tenantId);
  res.json({ success: true, data });
});

const create = asyncHandler(async (req, res) => {
  const { name, segment, message } = req.body;
  try {
    const data = await service.create(req.user.tenantId, { name, segment, message });
    res.status(201).json({ success: true, data });
  } catch (e) {
    throw new AppError(e.message, e.status || 400);
  }
});

const send = asyncHandler(async (req, res) => {
  try {
    const data = await service.send(req.user.tenantId, req.params.id);
    res.json({ success: true, data });
  } catch (e) {
    throw new AppError(e.message, e.status || 400);
  }
});

const preview = asyncHandler(async (req, res) => {
  const { segment } = req.query;
  if (!segment) throw new AppError('Segmento é obrigatório.', 400);
  const data = await service.preview(req.user.tenantId, segment);
  res.json({ success: true, data });
});

module.exports = { list, create, send, preview };
