const service      = require('./tenant.service');
const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');

/** GET /api/tenant/me */
const getMe = asyncHandler(async (req, res) => {
  const tenant = await service.getMyTenant(req.user.tenantId);
  res.json({ success: true, data: tenant });
});

/** PUT /api/tenant/plan — body: { plan: 'basic' | 'pro' | 'premium' } */
const updatePlan = asyncHandler(async (req, res) => {
  const { plan } = req.body;
  if (!plan) throw new AppError('Campo "plan" e obrigatorio.', 400);
  const tenant = await service.changePlan(req.user.tenantId, plan, req.user.role);
  res.json({ success: true, data: tenant });
});

module.exports = { getMe, updatePlan };
