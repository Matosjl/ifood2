'use strict';
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
  body('waste_factor').optional().isFloat({ min: 0, max: 100 }).withMessage('Perda deve ser entre 0–100%.'),
];
const adjustRules = [
  body('qty').isFloat().withMessage('qty deve ser número.'),
];
const batchRules = [
  body('insumo_id').notEmpty().withMessage('insumo_id é obrigatório.'),
  body('raw_quantity').isFloat({ gt: 0 }).withMessage('Quantidade bruta deve ser > 0.'),
  body('cooked_quantity').isFloat({ gt: 0 }).withMessage('Quantidade preparada deve ser > 0.'),
];
const wasteRules = [
  body('insumo_id').notEmpty().withMessage('insumo_id é obrigatório.'),
  body('quantity').isFloat({ gt: 0 }).withMessage('Quantidade deve ser > 0.'),
  body('reason_type').optional().isIn(['burned','expired','broken','operational','other']).withMessage('Tipo inválido.'),
];

// ── Insumos ───────────────────────────────────────────────────
router.get('/',              ctrl.list);
router.post('/',             authorize('owner','manager'), insumoRules, ctrl.create);
router.get('/:id',           ctrl.getOne);
router.put('/:id',           authorize('owner','manager'), insumoRules, ctrl.update);
router.delete('/:id',        authorize('owner','manager'), ctrl.remove);
router.post('/:id/adjust',   authorize('owner','manager'), adjustRules, ctrl.adjust);

// ── Ficha técnica ─────────────────────────────────────────────
router.get('/product/:productId',  ctrl.getProductInsumos);
router.put('/product/:productId',  authorize('owner','manager'), ctrl.setProductInsumos);

// ── Produção diária ───────────────────────────────────────────
router.get('/production/batches',    ctrl.listBatches);
router.post('/production/batches',   authorize('owner','manager','staff'), batchRules, ctrl.createBatch);
router.get('/production/report',     ctrl.getDayReport);
router.get('/production/expiry',     ctrl.getExpiryAlerts);

// ── Perdas ────────────────────────────────────────────────────
router.get('/waste',    ctrl.listWasteLogs);
router.post('/waste',   authorize('owner','manager','staff'), wasteRules, ctrl.logWaste);

// ── Inteligência ──────────────────────────────────────────────
router.get('/intelligence/shopping-list', ctrl.getShoppingList);
router.get('/intelligence/simulate',      ctrl.simulateProduction);
router.get('/intelligence/profit-ranking', ctrl.getProductProfitRanking);

module.exports = router;
