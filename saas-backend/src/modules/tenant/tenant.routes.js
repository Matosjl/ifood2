const { Router }         = require('express');
const { body }           = require('express-validator');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const { VALID_PLAN_IDS } = require('../../config/plans');
const ctrl               = require('./tenant.controller');

const router = Router();

router.use(authenticate);

// GET /api/tenant/me — dados + plano + uso atual
router.get('/me', ctrl.getMe);

// PUT /api/tenant/profile — atualizar nome do restaurante (owner)
router.put('/profile',
  authorize('owner'),
  body('name').trim().notEmpty().withMessage('Nome do restaurante é obrigatório.'),
  ctrl.updateProfile
);

// PUT /api/tenant/plan — alterar plano (owner only)
router.put('/plan',
  authorize('owner'),
  body('plan')
    .notEmpty().withMessage('Plan e obrigatorio.')
    .isIn(VALID_PLAN_IDS).withMessage(`Plano invalido. Opcoes: ${VALID_PLAN_IDS.join(', ')}.`),
  ctrl.updatePlan
);

module.exports = router;
