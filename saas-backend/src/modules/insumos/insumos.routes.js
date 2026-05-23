const { Router } = require('express');
const { body }   = require('express-validator');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./insumos.controller');

const router = Router();
router.use(authenticate);

const insumoRules = [
  body('name').trim().notEmpty().withMessage('Nome é obrigatório.').isLength({ max: 200 }),
  body('unit').optional().isIn(['g','kg','ml','l','un','cx','pct']).withMessage('Unidade inválida.'),
  body('qty_in_stock').optional().isFloat({ min: 0 }).withMessage('Estoque deve ser >= 0.'),
  body('min_qty').optional().isFloat({ min: 0 }).withMessage('Estoque mínimo deve ser >= 0.'),
  body('cost_per_unit').optional().isFloat({ min: 0 }).withMessage('Custo deve ser >= 0.'),
];

const adjustRules = [
  body('qty').isFloat().withMessage('qty deve ser número (positivo = entrada, negativo = saída).'),
];

// ── Insumos ───────────────────────────────────────────────────
router.get('/',              ctrl.list);
router.post('/',             authorize('owner', 'manager'), insumoRules, ctrl.create);
router.get('/:id',           ctrl.getOne);
router.put('/:id',           authorize('owner', 'manager'), insumoRules, ctrl.update);
router.delete('/:id',        authorize('owner', 'manager'), ctrl.remove);
router.post('/:id/adjust',   authorize('owner', 'manager'), adjustRules, ctrl.adjust);

// ── Ligação produto <-> insumos ───────────────────────────────
router.get('/product/:productId',  ctrl.getProductInsumos);
router.put('/product/:productId',  authorize('owner', 'manager'), ctrl.setProductInsumos);

module.exports = router;
