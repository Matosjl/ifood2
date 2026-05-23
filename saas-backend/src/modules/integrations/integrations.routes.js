const { Router } = require('express');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./integrations.controller');

const router = Router();
router.use(authenticate);

// iFood
router.get('/ifood/config',    authorize('owner', 'manager'), ctrl.getIfoodConfig);
router.put('/ifood/config',    authorize('owner', 'manager'), ctrl.saveIfoodConfig);
router.delete('/ifood/config', authorize('owner', 'manager'), ctrl.disconnectIfood);
router.post('/ifood/sync',     authorize('owner', 'manager', 'staff'), ctrl.syncIfoodNow);

module.exports = router;
