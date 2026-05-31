'use strict';
const { Router }       = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl             = require('./dashboard.controller');

const router = Router();
router.use(authenticate);

router.get('/health',  ctrl.getHealth);
router.get('/metrics', ctrl.getMetrics);

module.exports = router;
