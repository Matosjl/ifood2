const { Router }   = require('express');
const rateLimit    = require('express-rate-limit');
const ctrl         = require('./public.controller');

const router = Router();

const orderLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: 'Muitas requisições. Aguarde 1 minuto.' },
});

const ratingLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: 'Muitas requisições. Aguarde 1 minuto.' },
});

// Rotas estáticas devem vir ANTES de :slug para não serem capturadas
router.get('/order/:id',                ctrl.trackOrder);

// Rotas por slug
router.get('/:slug',                    ctrl.getMenu);
router.post('/:slug/orders',            orderLimit, ctrl.createOrder);
router.get('/:slug/customer/:phone',    ctrl.getCustomer);
router.get('/:slug/history/:phone',     ctrl.getOrderHistory);
router.post('/:slug/ratings',           ratingLimit, ctrl.submitRating);
router.get('/:slug/loyalty-config',     ctrl.getLoyaltyConfig);
router.get('/:slug/tables',             ctrl.getTables);

module.exports = router;
