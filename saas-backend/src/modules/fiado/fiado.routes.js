const router  = require('express').Router();
const ctrl    = require('./fiado.controller');
const { authenticate } = require('../../middleware/auth.middleware');

router.use(authenticate);

// Clientes
router.get   ('/clientes',          ctrl.listClientes);
router.post  ('/clientes',          ctrl.createCliente);
router.put   ('/clientes/:id',      ctrl.updateCliente);
router.delete('/clientes/:id',      ctrl.deleteCliente);
router.patch ('/clientes/:id/bloquear', ctrl.toggleBloqueio);

// Compras
router.get   ('/clientes/:clienteId/compras', ctrl.listCompras);
router.post  ('/compras',                     ctrl.createCompra);
router.patch ('/compras/:id/pagar',           ctrl.pagarCompra);
router.patch ('/compras/:id/cancelar',        ctrl.cancelarCompra);

// Resumo geral (dashboard)
router.get('/resumo', ctrl.resumo);

module.exports = router;
