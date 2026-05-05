const { Router } = require('express');
const env        = require('../../config/env');
const ctrl       = require('./admin.controller');
const AppError   = require('../../utils/AppError');

const router = Router();

// Super-admin key middleware
router.use((req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (!key || key !== env.SUPER_ADMIN_KEY)
    return next(new AppError('Acesso negado. X-Admin-Key inválida.', 403));
  next();
});

router.get   ('/tenants',     ctrl.listTenants);
router.post  ('/tenants',     ctrl.createTenant);
router.patch ('/tenants/:id', ctrl.updateTenant);
router.delete('/tenants/:id', ctrl.deactivateTenant);

module.exports = router;
