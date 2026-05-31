'use strict';
const { Router }       = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl             = require('./precificador.controller');

const router = Router();

router.use(authenticate);

router.get ('/overhead',         ctrl.getOverhead);
router.put ('/overhead',         ctrl.saveOverhead);
router.post('/calculate',        ctrl.calculate);
router.get ('/history',          ctrl.listHistory);
router.post('/apply/:productId', ctrl.apply);

module.exports = router;
