const { Router } = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const { getStatus, getPlans } = require('./billing.controller');

const router = Router();

// All billing routes require authentication
router.use(authenticate);

// GET /api/billing/status  — trial info, plan, subscription state
router.get('/status', getStatus);

// GET /api/billing/plans   — plan list with WhatsApp deep links
router.get('/plans', getPlans);

module.exports = router;
