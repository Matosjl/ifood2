'use strict';
const { Router }   = require('express');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl         = require('./tables.controller');

const router = Router();
router.use(authenticate);

router.get('/',       ctrl.list);
router.post('/',      authorize('owner', 'manager'), ctrl.create);
router.patch('/:id',  authorize('owner', 'manager'), ctrl.update);
router.delete('/:id', authorize('owner', 'manager'), ctrl.remove);

module.exports = router;
