'use strict';
const { Router }   = require('express');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./campaigns.controller');

const router = Router();
router.use(authenticate);

router.get('/',             ctrl.list);
router.get('/preview',      ctrl.preview);
router.post('/',            authorize('owner', 'manager'), ctrl.create);
router.post('/:id/send',    authorize('owner', 'manager'), ctrl.send);

module.exports = router;
