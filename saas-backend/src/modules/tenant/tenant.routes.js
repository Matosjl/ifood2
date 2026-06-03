const { Router }         = require('express');
const { body }           = require('express-validator');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const { VALID_PLAN_IDS } = require('../../config/plans');
const ctrl               = require('./tenant.controller');

const router = Router();

router.use(authenticate);

// GET /api/tenant/me — dados + plano + uso atual
router.get('/me', ctrl.getMe);

// PUT /api/tenant/profile — atualizar nome do restaurante (owner)
router.put('/profile',
  authorize('owner'),
  body('name').trim().notEmpty().withMessage('Nome do restaurante é obrigatório.'),
  ctrl.updateProfile
);

// PUT /api/tenant/plan — alterar plano (owner only)
router.put('/plan',
  authorize('owner'),
  body('plan')
    .notEmpty().withMessage('Plan e obrigatorio.')
    .isIn(VALID_PLAN_IDS).withMessage(`Plano invalido. Opcoes: ${VALID_PLAN_IDS.join(', ')}.`),
  ctrl.updatePlan
);

// PATCH /api/tenant/chatbot — liga/desliga o chatbot WhatsApp (owner only)
router.patch('/chatbot',
  authorize('owner'),
  body('enabled').isBoolean().withMessage('"enabled" deve ser true ou false.'),
  ctrl.setChatbot
);

// GET  /api/tenant/cashback — retorna configuração de cashback
router.get('/cashback', ctrl.getCashbackConfig);

// PUT  /api/tenant/cashback — atualiza configuração (owner only)
router.put('/cashback',
  authorize('owner'),
  ctrl.setCashbackConfig
);

// GET /api/tenant/loyalty-customers — lista clientes fidelidade
router.get('/loyalty-customers', ctrl.getLoyaltyCustomers);

// GET /api/tenant/ratings — avaliações dos pedidos
router.get('/ratings', ctrl.getRatings);

// GET  /api/tenant/full-settings — settings para uso no modal de pedido
router.get('/full-settings', ctrl.getFullSettings);

// PATCH /api/tenant/settings — zonas, formas de pagamento, coords
router.patch('/settings', authorize('owner'), ctrl.updateSettings);

// PATCH /api/tenant/sangria-limit — define ou limpa o limite diário de sangria
router.patch('/sangria-limit', authorize('owner', 'manager'), ctrl.setSangriaLimit);

// POST /api/tenant/leads — criar/upsert lead manual
router.post('/leads', authorize('owner', 'manager'), ctrl.createLead);

// POST /api/tenant/leads/import — importar lista de leads (CSV/JSON)
router.post('/leads/import', authorize('owner', 'manager'), ctrl.importLeads);

// ── CRM ───────────────────────────────────────────────────────
router.get('/crm',     ctrl.listCRMCustomers);
router.get('/crm/:id', ctrl.getCRMCustomer);
router.patch('/crm/:id', authorize('owner', 'manager'), ctrl.updateCRMCustomer);

// GET    /api/tenant/whatsapp/status  — estado da conexão + QR code
router.get('/whatsapp/status', ctrl.getWhatsappStatus);

// POST   /api/tenant/whatsapp/connect — cria instância e retorna QR
router.post('/whatsapp/connect', authorize('owner'), ctrl.connectWhatsapp);

// DELETE /api/tenant/whatsapp/disconnect — logout WhatsApp
router.delete('/whatsapp/disconnect', authorize('owner'), ctrl.disconnectWhatsapp);

module.exports = router;
