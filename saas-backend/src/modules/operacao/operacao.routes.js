'use strict';
const { Router }   = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl         = require('./operacao.controller');

const router = Router();
router.use(authenticate);

router.get('/fechamento-hoje', ctrl.fechamentoHoje);
router.get('/confiabilidade',  ctrl.confiabilidade);

module.exports = router;
