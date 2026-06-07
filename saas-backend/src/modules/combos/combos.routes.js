'use strict';
const { Router }   = require('express');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl         = require('./combos.controller');

const router = Router();
router.use(authenticate);

// GET  /api/combos/:productId
router.get('/:productId',              ctrl.getCombo);

// POST /api/combos/:productId/items
router.post('/:productId/items',       authorize('owner', 'manager'), ctrl.addItem);

// DELETE /api/combos/:productId/items/:itemId
router.delete('/:productId/items/:itemId', authorize('owner', 'manager'), ctrl.removeItem);

// ── Option Groups (Combo V2) ──────────────────────────────────

// GET  /api/combos/:productId/option-groups
router.get('/:productId/option-groups', ctrl.getOptionGroups);

// POST /api/combos/:productId/option-groups
router.post('/:productId/option-groups', authorize('owner', 'manager'), ctrl.createOptionGroup);

// PUT  /api/combos/:productId/option-groups/:groupId
router.put('/:productId/option-groups/:groupId', authorize('owner', 'manager'), ctrl.updateOptionGroup);

// DELETE /api/combos/:productId/option-groups/:groupId
router.delete('/:productId/option-groups/:groupId', authorize('owner', 'manager'), ctrl.deleteOptionGroup);

// POST /api/combos/:productId/option-groups/:groupId/items
router.post('/:productId/option-groups/:groupId/items', authorize('owner', 'manager'), ctrl.addOptionItem);

// DELETE /api/combos/:productId/option-groups/:groupId/items/:itemId
router.delete('/:productId/option-groups/:groupId/items/:itemId', authorize('owner', 'manager'), ctrl.removeOptionItem);

module.exports = router;
