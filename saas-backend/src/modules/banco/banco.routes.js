const { Router }       = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl             = require('./banco.controller');

const router = Router();
router.use(authenticate);

router.get   ('/',                  ctrl.getBalance);
router.get   ('/balance',           ctrl.getBalance);
router.get   ('/transactions',      ctrl.getTransactions);
router.post  ('/transactions',      ctrl.addTransaction);
router.delete('/transactions/:id',  ctrl.deleteTransaction);

module.exports = router;
