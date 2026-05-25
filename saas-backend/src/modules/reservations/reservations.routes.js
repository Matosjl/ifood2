const { Router }              = require('express');
const { authenticate }        = require('../../middleware/auth.middleware');
const ctrl                    = require('./reservations.controller');

const router = Router();
router.use(authenticate);

router.get('/',      ctrl.list);
router.post('/',     ctrl.create);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
