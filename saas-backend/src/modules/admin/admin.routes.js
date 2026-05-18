const { Router } = require('express');
const env        = require('../../config/env');
const ctrl       = require('./admin.controller');
const AppError   = require('../../utils/AppError');
const aiService  = require('../../services/ai.service');

const router = Router();

// Super-admin key middleware
router.use((req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (!key || key !== env.SUPER_ADMIN_KEY)
    return next(new AppError('Acesso negado. X-Admin-Key inválida.', 403));
  next();
});

router.get   ('/tenants',                    ctrl.listTenants);
router.post  ('/tenants',                    ctrl.createTenant);
router.patch ('/tenants/:id',                ctrl.updateTenant);
router.post  ('/tenants/:id/activate',       ctrl.activateTenant);
router.post  ('/tenants/:id/extend-trial',   ctrl.extendTrial);
router.delete('/tenants/:id',                ctrl.deactivateTenant);
router.delete('/tenants/:id/destroy',        ctrl.destroyTenant);

// ── AI Engine (Super Admin) ──────────────────────────────────────
router.get('/ai/health', async (_req, res, next) => {
  try {
    const healthy = await aiService.isHealthy();
    res.json({ success: true, data: { healthy, timestamp: new Date().toISOString() } });
  } catch (err) { next(err); }
});

router.get('/ai/usage', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await aiService.getAiUsageSummary(days);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
