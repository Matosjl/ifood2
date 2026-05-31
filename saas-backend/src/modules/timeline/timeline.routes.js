'use strict';
const { Router }     = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl           = require('./timeline.controller');

const router = Router();
router.use(authenticate);

router.get('/', ctrl.getTimeline);

module.exports = router;
