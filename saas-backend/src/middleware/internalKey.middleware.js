'use strict';
const AppError = require('../utils/AppError');
const env = require('../config/env');

/**
 * Middleware para rotas /api/internal/*
 * Valida o header X-Internal-Key enviado pela VPS2 (AI Engine).
 */
function requireInternalKey(req, _res, next) {
  const key = req.headers['x-internal-key'];
  if (!key || key !== env.INTERNAL_KEY) {
    return next(new AppError('Acesso não autorizado', 401, 'INVALID_INTERNAL_KEY'));
  }

  // Extrai tenant_id do header (opcional — algumas rotas são globais)
  req.tenantId = req.headers['x-tenant-id'] || null;
  next();
}

module.exports = { requireInternalKey };
