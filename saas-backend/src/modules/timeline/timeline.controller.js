'use strict';
const asyncHandler = require('../../utils/asyncHandler');
const svc          = require('./timeline.service');

// GET /api/timeline?hours=24&limit=100
const getTimeline = asyncHandler(async (req, res) => {
  const hours = Math.min(parseInt(req.query.hours ?? 24, 10) || 24, 168); // max 7 days
  const limit = Math.min(parseInt(req.query.limit ?? 100, 10) || 100, 500);
  const events = await svc.getTimeline(req.user.tenantId, { hours, limit });
  res.json({ success: true, data: events });
});

module.exports = { getTimeline };
