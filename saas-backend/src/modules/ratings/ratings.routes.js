const { Router }              = require('express');
const { authenticate }        = require('../../middleware/auth.middleware');
const ctrl                    = require('./ratings.controller');

const router = Router();

// ── Public (no auth) ──────────────────────────────────────────
router.get('/public/:token',  ctrl.getPublic);
router.post('/public/:token', ctrl.submitPublic);

// ── Authenticated ─────────────────────────────────────────────
router.use(authenticate);
router.get('/',              ctrl.list);
router.get('/summary',       ctrl.summary);
router.post('/request/:orderId', ctrl.sendRequest);

module.exports = router;
