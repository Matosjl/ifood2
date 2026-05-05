const { Router }   = require('express');
const rateLimit    = require('express-rate-limit');
const ctrl         = require('./public.controller');

const router = Router();

// Rate limit apertado para rotas públicas
const orderLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: 'Muitas requisições. Aguarde 1 minuto.' },
});

router.get('/order/:id',         ctrl.trackOrder);   // rastrear pedido (static antes de :slug)
router.get('/:slug',             ctrl.getMenu);
router.post('/:slug/orders',     orderLimit, ctrl.createOrder);

module.exports = router;
