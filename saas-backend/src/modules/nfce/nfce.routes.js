const { Router } = require('express');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./nfce.controller');

const router = Router();
router.use(authenticate);

router.get('/config',             authorize('owner', 'manager'), ctrl.getConfig);
router.put('/config',             authorize('owner', 'manager'), ctrl.saveConfig);
router.post('/orders/:id/issue',  authorize('owner', 'manager', 'staff'), ctrl.issue);
router.get('/orders/:id/status',  ctrl.status);

module.exports = router;
