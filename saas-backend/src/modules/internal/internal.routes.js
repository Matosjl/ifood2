'use strict';
const router = require('express').Router();
const ctrl = require('./internal.controller');
const { requireInternalKey } = require('../../middleware/internalKey.middleware');

// Todas as rotas internas exigem X-Internal-Key
router.use(requireInternalKey);

// Tenants
router.get('/tenants/:tenantId',  ctrl.getTenant);
router.get('/super/tenants',       ctrl.getAllTenants);
router.get('/super/stats',         ctrl.getSuperStats);

// Products / Stock
router.get('/products',            ctrl.getProducts);
router.get('/stock',               ctrl.getStock);
router.post('/stock/bulk-update',  ctrl.bulkUpdateStock);

// Orders
router.get('/orders/summary',            ctrl.getOrdersSummary);
router.get('/orders/by-phone',           ctrl.getOrdersByPhone);
router.post('/orders/from-whatsapp',     ctrl.createOrderFromWhatsApp);

// Financial
router.get('/financial/summary',   ctrl.getFinancialSummary);
router.post('/financial/transactions', ctrl.createTransaction);

// WhatsApp
router.post('/whatsapp/send',      ctrl.sendWhatsApp);
router.post('/whatsapp/send-media', ctrl.sendWhatsAppMedia);

// Leads CRM — chamado pelo chatbot VPS2 quando nova conversa inicia
router.post('/leads', ctrl.upsertLead);

// Receipts (OCR de notas fiscais via WhatsApp) — chamado pela VPS2
router.post('/receipts/ingest',            ctrl.ingestReceipt);
router.post('/receipts/ingest-processed',  ctrl.ingestProcessedReceipt);  // VPS2 ocr.worker envia resultado pré-processado
router.post('/receipts/handle-reply',      ctrl.handleReceiptReply);

module.exports = router;
