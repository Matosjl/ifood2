const { Router }     = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl           = require('./financeiro.controller');

const router = Router();
router.use(authenticate);

router.get('/summary', ctrl.summary);

module.exports = router;
