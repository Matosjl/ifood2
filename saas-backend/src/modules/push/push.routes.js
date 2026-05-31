'use strict';
const { Router }       = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl             = require('./push.controller');

const router = Router();

// Chave pública — pública mesmo (sem auth, o frontend precisa antes de fazer login)
router.get('/vapid-key', ctrl.getVapidKey);

// As demais rotas exigem autenticação
router.use(authenticate);
router.get('/status',       ctrl.getStatus);
router.post('/subscribe',   ctrl.subscribePush);
router.delete('/subscribe', ctrl.unsubscribePush);

module.exports = router;
