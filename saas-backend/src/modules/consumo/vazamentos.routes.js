const { Router } = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl = require('./consumo.controller');

const router = Router();
router.use(authenticate);

// GET /api/vazamentos?mes=YYYY-MM
router.get('/', ctrl.vazamentos);

module.exports = router;
