'use strict';
const asyncHandler = require('../../utils/asyncHandler');
const svc          = require('./dashboard.service');

// GET /api/dashboard/health — cached 60s per tenant
const getHealth = asyncHandler(async (req, res) => {
  const forceRefresh = req.query.refresh === '1';
  const data = await svc.getHealthScoreCached(req.user.tenantId, forceRefresh);
  res.json({ success: true, data });
});

// GET /api/dashboard/metrics
const getMetrics = asyncHandler(async (req, res) => {
  const data = await svc.getOperationalMetrics(req.user.tenantId);
  res.json({ success: true, data });
});

module.exports = { getHealth, getMetrics };
