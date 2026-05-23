const { Router }       = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl             = require('./caixa.controller');

const router = Router();
router.use(authenticate);

router.get('/current',     ctrl.getCurrent);
router.post('/open',       ctrl.openCaixa);
router.post('/close',      ctrl.closeCaixa);
router.post('/sangria',    ctrl.sangria);
router.post('/suprimento', ctrl.suprimento);
router.get('/movements',   ctrl.getMovements);
router.get('/history',     ctrl.getHistory);
router.get('/:id',         ctrl.getOne);

module.exports = router;
