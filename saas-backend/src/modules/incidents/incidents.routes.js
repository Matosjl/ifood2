'use strict';
const { Router }       = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl             = require('./incidents.controller');

const router = Router();
router.use(authenticate);

router.get('/',                           ctrl.listIncidents);
router.get('/summary',                    ctrl.getSummary);
router.post('/',                          ctrl.createIncident);
router.patch('/:id/resolve',              ctrl.resolveIncident);
router.patch('/confirm-change/:orderId',  ctrl.confirmChange);

module.exports = router;
