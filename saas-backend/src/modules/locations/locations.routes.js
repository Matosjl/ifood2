const { Router } = require('express');
const { body }   = require('express-validator');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./locations.controller');

const router = Router();
router.use(authenticate);

const rules = [
  body('name').trim().notEmpty().withMessage('Nome da filial é obrigatório.').isLength({ max: 200 }),
  body('phone').optional({ nullable: true }).isLength({ max: 50 }),
];

router.get('/',     ctrl.list);
router.post('/',    authorize('owner', 'manager'), rules, ctrl.create);
router.get('/:id',  ctrl.getOne);
router.patch('/:id', authorize('owner', 'manager'), rules, ctrl.update);
router.delete('/:id', authorize('owner'), ctrl.remove);

module.exports = router;
