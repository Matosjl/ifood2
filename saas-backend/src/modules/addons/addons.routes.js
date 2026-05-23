const { Router } = require('express');
const { body }   = require('express-validator');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./addons.controller');

const router = Router();
router.use(authenticate);

const groupRules = [
  body('name').trim().notEmpty().withMessage('Nome do grupo é obrigatório.').isLength({ max: 100 }),
  body('min_qty').optional().isInt({ min: 0 }).withMessage('min_qty deve ser inteiro >= 0.'),
  body('max_qty').optional({ nullable: true }).isInt({ min: 1 }).withMessage('max_qty deve ser >= 1.'),
];

const itemRules = [
  body('name').trim().notEmpty().withMessage('Nome do item é obrigatório.').isLength({ max: 150 }),
  body('price').optional().isFloat({ min: 0 }).withMessage('Preço deve ser >= 0.'),
];

// ── Grupos ────────────────────────────────────────────────────
router.get('/',           ctrl.listGroups);
router.post('/',          authorize('owner', 'manager'), groupRules, ctrl.createGroup);
router.put('/:id',        authorize('owner', 'manager'), groupRules, ctrl.updateGroup);
router.delete('/:id',     authorize('owner', 'manager'), ctrl.deleteGroup);

// ── Itens dentro de um grupo ──────────────────────────────────
router.post('/:groupId/items',         authorize('owner', 'manager'), itemRules, ctrl.createItem);
router.put('/items/:itemId',           authorize('owner', 'manager'), itemRules, ctrl.updateItem);
router.delete('/items/:itemId',        authorize('owner', 'manager'), ctrl.deleteItem);

// ── Ligação produto <-> grupos ─────────────────────────────────
router.get('/product/:productId',      ctrl.getProductGroups);
router.put('/product/:productId',      authorize('owner', 'manager'), ctrl.setProductGroups);

module.exports = router;
