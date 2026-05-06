const { Router }       = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl             = require('./caixa.controller');

const router = Router();
router.use(authenticate);

router.get('/current',  ctrl.getCurrent);
router.post('/open',    ctrl.openCaixa);
router.post('/close',   ctrl.closeCaixa);
router.get('/history',  ctrl.getHistory);
router.get('/:id',      ctrl.getOne);

module.exports = router;
