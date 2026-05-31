const { Router } = require('express');
const { body }   = require('express-validator');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./products.controller');
const upload = require('../../middleware/upload.middleware');

const router = Router();

// Todas as rotas de produtos requerem autenticação
router.use(authenticate);

// ── Validadores ───────────────────────────────────────────────

const productRules = [
  body('name').trim().notEmpty().withMessage('Nome do produto é obrigatório.')
    .isLength({ max: 200 }).withMessage('Nome muito longo.'),
  body('sale_type').optional().isIn(['unit', 'kg'])
    .withMessage("sale_type deve ser 'unit' ou 'kg'."),
  body('cost_price').optional().isFloat({ min: 0 })
    .withMessage('Preço de custo inválido.'),
  body('sale_price').optional().isFloat({ min: 0 })
    .withMessage('Preço de venda inválido.'),
  body('stock_qty').optional().isFloat({ min: 0 })
    .withMessage('Estoque inválido.'),
  body('isCombo').optional().isBoolean()
    .withMessage('isCombo deve ser true ou false.'),
];

const replenishRules = [
  body('quantity').isFloat({ gt: 0 }).withMessage('Quantidade deve ser maior que zero.'),
  body('reason').optional().isLength({ max: 300 }).withMessage('Motivo muito longo.'),
];

// ── Produtos ──────────────────────────────────────────────────

router.get('/',              ctrl.list);
router.post('/',             authorize('owner', 'manager'), productRules, ctrl.create);
router.get('/:id',           ctrl.getOne);
router.put('/:id',           authorize('owner', 'manager'), productRules, ctrl.update);
router.delete('/:id',        authorize('owner', 'manager'), ctrl.remove);

// ── Estoque ───────────────────────────────────────────────────

router.post('/:id/replenish',   authorize('owner', 'manager'), replenishRules, ctrl.replenish);
router.get('/:id/movements',    ctrl.movements);

// ── Imagem ────────────────────────────────────────────────────

router.post('/:id/image', authenticate, upload.single('image'), ctrl.uploadImage);

// ── Variações ─────────────────────────────────────────────────
// Grupos
router.post('/variations/groups/:gid/options', authorize('owner','manager'), ctrl.createOption);
router.put('/variations/options/:oid',         authorize('owner','manager'), ctrl.updateOption);
router.delete('/variations/options/:oid',      authorize('owner','manager'), ctrl.deleteOption);
router.put('/variations/groups/:gid',          authorize('owner','manager'), ctrl.updateGroup);
router.delete('/variations/groups/:gid',       authorize('owner','manager'), ctrl.deleteGroup);
router.post('/:id/variations/groups',          authorize('owner','manager'), ctrl.createGroup);

module.exports = router;
