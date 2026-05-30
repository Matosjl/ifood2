'use strict';
const router     = require('express').Router();
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl       = require('./producao.controller');

router.use(authenticate);

// Resumo do dia (para o Fechamento Operacional)
router.get('/resumo',              ctrl.getResumoDia);

// Lotes
router.post('/lotes',              authorize('owner', 'manager', 'staff'), ...ctrl.criarLote);
router.get('/lotes/:id',           ctrl.getResumo);
router.post('/lotes/:id/items',    authorize('owner', 'manager', 'staff'), ...ctrl.adicionarItem);
router.patch('/lotes/:id/fechar',  authorize('owner', 'manager', 'staff'), ctrl.fecharLote);
router.post('/lotes/:id/perdas',   authorize('owner', 'manager', 'staff'), ...ctrl.registrarPerda);

module.exports = router;
