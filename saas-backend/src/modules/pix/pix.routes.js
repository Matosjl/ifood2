const { Router }              = require('express');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl                    = require('./pix.controller');

const router = Router();

// ── Webhook (no auth — OpenPix calls this) ────────────────────
router.post('/webhook', ctrl.webhook);

// ── Autenticado ───────────────────────────────────────────────
router.use(authenticate);

// Config (owner/manager only)
router.get('/config',  authorize('owner', 'manager'), ctrl.getConfig);
router.put('/config',  authorize('owner', 'manager'), ctrl.saveConfig);

// Per-order (any staff)
router.post('/orders/:id/charge', ctrl.generateCharge);
router.get('/orders/:id/status',  ctrl.chargeStatus);

module.exports = router;
