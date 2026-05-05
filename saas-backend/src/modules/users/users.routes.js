const { Router }              = require('express');
const { body }                = require('express-validator');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl                    = require('./users.controller');

const router = Router();
router.use(authenticate);

// Listar equipe — owner e manager podem ver
router.get('/', authorize('owner', 'manager'), ctrl.list);

// Criar colaborador — owner only
router.post('/',
  authorize('owner'),
  body('name').trim().notEmpty().withMessage('Nome é obrigatório.'),
  body('email').isEmail().normalizeEmail().withMessage('E-mail inválido.'),
  body('password').isLength({ min: 8 }).withMessage('Senha deve ter pelo menos 8 caracteres.'),
  body('role').isIn(['manager', 'staff']).withMessage("Role deve ser 'manager' ou 'staff'."),
  ctrl.create
);

// Alterar role / ativar/desativar — owner only
router.patch('/:id',
  authorize('owner'),
  body('role').optional().isIn(['manager', 'staff']).withMessage("Role inválido."),
  body('active').optional().isBoolean().withMessage('active deve ser boolean.'),
  ctrl.update
);

// Desativar — owner only
router.delete('/:id', authorize('owner'), ctrl.remove);

module.exports = router;
