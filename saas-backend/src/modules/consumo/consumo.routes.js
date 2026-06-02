const { Router } = require('express');
const { body }   = require('express-validator');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./consumo.controller');

const router = Router();
router.use(authenticate);

const registrarRules = [
  body('quantity').isFloat({ gt: 0 }).withMessage('Quantidade deve ser maior que zero.'),
  body('consumption_type')
    .optional()
    .isIn(['funcionario', 'familia', 'brinde', 'degustacao', 'perda'])
    .withMessage('Tipo de consumo inválido.'),
  body('notes').optional().isLength({ max: 300 }).withMessage('Observação muito longa.'),
];

// Sugestões (cold start + mais usados)
router.get('/sugestoes', ctrl.sugestoes);

// Histórico
router.get('/', ctrl.historico);

// Registrar consumo interno
router.post('/', authorize('owner', 'manager', 'caixa'), registrarRules, ctrl.registrar);

module.exports = router;
