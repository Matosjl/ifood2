const asyncHandler = require('../../utils/asyncHandler');
const service      = require('./ratings.service');

// ── Public ────────────────────────────────────────────────────

// GET /api/ratings/public/:token — fetch rating info to display the form
const getPublic = asyncHandler(async (req, res) => {
  const data = await service.getByToken(req.params.token);
  // Never expose token in response
  const { token: _t, ...safe } = data;
  res.json({ success: true, data: safe });
});

// POST /api/ratings/public/:token — submit rating
const submitPublic = asyncHandler(async (req, res) => {
  const { stars, comment } = req.body;
  const data = await service.submitRating(req.params.token, Number(stars), comment);
  res.json({ success: true, data });
});

// ── Authenticated ─────────────────────────────────────────────

// GET /api/ratings — list ratings (owner/manager dashboard)
const list = asyncHandler(async (req, res) => {
  const limit  = Math.min(Number(req.query.limit  ?? 50),  200);
  const offset = Number(req.query.offset ?? 0);
  const data   = await service.list(req.user.tenantId, { limit, offset });
  res.json({ success: true, data });
});

// GET /api/ratings/summary
const summary = asyncHandler(async (req, res) => {
  const data = await service.summary(req.user.tenantId);
  res.json({ success: true, data });
});

// POST /api/ratings/request/:orderId — manually trigger rating request
const sendRequest = asyncHandler(async (req, res) => {
  const token = await service.createRatingRequest(req.user.tenantId, req.params.orderId);
  const baseUrl = process.env.FRONTEND_URL ?? 'https://zapfome.ddns.net';
  res.json({ success: true, data: { token, url: `${baseUrl}/avaliar/${token}` } });
});

module.exports = { getPublic, submitPublic, list, summary, sendRequest };
