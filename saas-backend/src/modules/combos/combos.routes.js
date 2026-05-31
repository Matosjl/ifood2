'use strict';
const { Router }   = require('express');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl         = require('./combos.controller');

const router = Router();
router.use(authenticate);

// GET  /api/combos/:productId          — lê combo com itens, custo e margem estimados
router.get('/:productId',              ctrl.getCombo);

// POST /api/combos/:productId/items    — adiciona produto filho ao combo
router.post('/:productId/items',       authorize('owner', 'manager'), ctrl.addItem);

// DELETE /api/combos/:productId/items/:itemId  — remove item do combo
router.delete('/:productId/items/:itemId', authorize('owner', 'manager'), ctrl.removeItem);

module.exports = router;
