const { Router } = require('express');
const { body }   = require('express-validator');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const { checkOrderLimit }         = require('../../middleware/plan.middleware');
const ctrl = require('./orders.controller');

const router = Router();

router.use(authenticate);

// ── Validadores ───────────────────────────────────────────────

const VALID_PAYMENT_METHODS = ['cash', 'pix', 'credit', 'debit', 'fiado', 'voucher', 'pending', 'other'];

const itemRules = [
  body('items').isArray({ min: 1 }).withMessage('items deve ser um array com pelo menos 1 item.'),
  body('items.*.productId').isUUID().withMessage('Cada item deve ter um productId UUID válido.'),
  body('items.*.quantity').optional().isInt({ min: 1 }).withMessage('quantity deve ser inteiro >= 1.'),
  body('items.*.weightKg').optional().isFloat({ gt: 0 }).withMessage('weightKg deve ser > 0.'),
  body('customerName').optional().isLength({ max: 200 }).withMessage('Nome do cliente muito longo.'),
  body('customerPhone').optional().isLength({ max: 50 }).withMessage('Telefone muito longo.'),
  // Pagamento dividido (opcional — se omitido, usa paymentMethod simples)
  body('payments').optional().isArray({ min: 1 }).withMessage('payments deve ter ao menos 1 item.'),
  body('payments.*.method')
    .optional()
    .isIn(VALID_PAYMENT_METHODS)
    .withMessage(`Método inválido. Use: ${VALID_PAYMENT_METHODS.join(', ')}.`),
  body('payments.*.amount')
    .optional()
    .isFloat({ gt: 0 })
    .withMessage('payments.*.amount deve ser > 0.'),
];

// ── Rotas ─────────────────────────────────────────────────────
// Rota estática (/transitions/:status) declarada ANTES de /:id para não colidir

router.get('/transitions/:status',   ctrl.transitions);
router.get('/analytics/hourly',      ctrl.hourlyStats);
router.get('/customers/funnel',      ctrl.getCustomerFunnel);
router.get('/customers',             ctrl.searchCustomers);
router.post('/customers',           ctrl.createCustomer);
router.patch('/customers',          ctrl.updateCustomer);
router.get('/',                     ctrl.list);
router.post('/',                    checkOrderLimit, itemRules, ctrl.create);
router.get('/:id',                  ctrl.getOne);
router.patch('/:id/status',         ctrl.updateStatus);
router.patch('/:id/paid',           ctrl.setPaid);
router.patch('/:id/items',          itemRules, ctrl.updateItems);
router.patch('/:id/info',           ctrl.updateInfo);
router.delete('/:id',               authorize('owner', 'manager'), ctrl.cancel);

module.exports = router;
