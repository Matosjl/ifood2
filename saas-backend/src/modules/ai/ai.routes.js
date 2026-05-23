'use strict';
const router = require('express').Router();
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl = require('./ai.controller');

// Todas as rotas de IA exigem JWT
router.use(authenticate);

// Financeiro
router.post('/financial/interpret',   ctrl.interpretFinancial);

// Gerente
router.post('/manager/analyze',       ctrl.managerAnalyze);
router.get('/manager/alerts',         ctrl.getAlerts);

// Marketing
router.post('/marketing/generate',    ctrl.generateMarketing);

// OCR
router.post('/ocr/invoice',           ctrl.submitOcrInvoice);
router.get('/ocr/jobs/:jobId',        ctrl.getOcrJob);
router.post('/ocr/apply',             ctrl.applyOcrResult);

// Cardápio do Dia (WhatsApp)
router.get('/menu',                   ctrl.getWhatsAppMenu);
router.delete('/menu',                ctrl.clearWhatsAppMenu);

// Uso
router.get('/usage',                  ctrl.getUsage);

module.exports = router;
