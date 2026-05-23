'use strict';
/**
 * AI Controller — Rotas para agentes IA (VPS2)
 * Auth: JWT middleware (req.user.tenantId)
 */
const asyncHandler = require('../../utils/asyncHandler');
const aiService    = require('../../services/ai.service');
const AppError     = require('../../utils/AppError');

// ── Agente Financeiro ──────────────────────────────────────────────

/** POST /api/ai/financial/interpret */
const interpretFinancial = asyncHandler(async (req, res) => {
  const { message } = req.body;
  if (!message) throw new AppError('message obrigatório', 400);
  const result = await aiService.interpretFinancial(req.user.tenantId, message);
  res.json({ success: true, data: result });
});

// ── Agente Gerente ─────────────────────────────────────────────────

/** POST /api/ai/manager/analyze */
const managerAnalyze = asyncHandler(async (req, res) => {
  const { period = 'week', type = 'full' } = req.body;
  const result = await aiService.managerAnalyze(req.user.tenantId, { period, type });
  res.json({ success: true, data: result });
});

/** GET /api/ai/manager/alerts */
const getAlerts = asyncHandler(async (req, res) => {
  const result = await aiService.getAlerts(req.user.tenantId);
  res.json({ success: true, data: result });
});

// ── Agente de Marketing ────────────────────────────────────────────

/** POST /api/ai/marketing/generate */
const generateMarketing = asyncHandler(async (req, res) => {
  const { type, context = {} } = req.body;
  if (!type) throw new AppError('type obrigatório (whatsapp | instagram | promotion | campaign)', 400);
  const result = await aiService.generateMarketing(req.user.tenantId, type, context);
  res.json({ success: true, data: result });
});

// ── OCR de Nota Fiscal ─────────────────────────────────────────────

/** POST /api/ai/ocr/invoice */
const submitOcrInvoice = asyncHandler(async (req, res) => {
  const { imageUrl, imageBase64 } = req.body;
  if (!imageUrl && !imageBase64) throw new AppError('imageUrl ou imageBase64 obrigatório', 400);
  const result = await aiService.submitOcrInvoice(req.user.tenantId, imageUrl || imageBase64);
  res.json({ success: true, data: result });
});

/** GET /api/ai/ocr/jobs/:jobId */
const getOcrJob = asyncHandler(async (req, res) => {
  const result = await aiService.getOcrJob(req.user.tenantId, req.params.jobId);
  if (!result) throw new AppError('Job não encontrado', 404);
  res.json({ success: true, data: result });
});

// ── OCR: Aplicar resultado ao estoque ─────────────────────────────

/** POST /api/ai/ocr/apply — aplica itens parseados ao estoque e cria despesa */
const applyOcrResult = asyncHandler(async (req, res) => {
  const { items, totalValue, supplier, invoiceDate } = req.body;
  if (!Array.isArray(items) || !items.length) throw new AppError('items[] obrigatório', 400);

  const db = require('../../config/database');
  const tenantId = req.user.tenantId;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Atualiza estoque de cada item
    const updated = [];
    for (const item of items) {
      const { name, qty } = item;
      if (!name || !qty) continue;
      const { rows } = await client.query(
        `UPDATE products
         SET stock_qty = stock_qty + $1, updated_at = NOW()
         WHERE tenant_id = $2 AND LOWER(name) LIKE LOWER($3)
         RETURNING id, name, stock_qty`,
        [qty, tenantId, `%${name}%`]
      );
      if (rows.length) updated.push(...rows);
    }

    // Cria despesa se houver total
    let expenseId = null;
    if (totalValue && totalValue > 0) {
      const { rows: exp } = await client.query(
        `INSERT INTO expenses (tenant_id, name, category, amount, payment_method, due_date, status)
         VALUES ($1, $2, 'fornecedores', $3, 'pix', $4, 'paid')
         RETURNING id`,
        [tenantId, supplier || 'Nota Fiscal OCR', totalValue, invoiceDate || new Date()]
      );
      expenseId = exp[0]?.id;
    }

    await client.query('COMMIT');
    res.json({ success: true, data: { updatedProducts: updated.length, expenseId } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ── Cardápio do Dia (WhatsApp) ────────────────────────────────────

/** GET /api/ai/menu — retorna o cardápio do dia ativo no WhatsApp */
const getWhatsAppMenu = asyncHandler(async (req, res) => {
  const result = await aiService.getWhatsAppMenu(req.user.tenantId);
  if (!result) return res.status(404).json({ success: false, message: 'Nenhum cardápio ativo no momento.' });
  res.json({ success: true, data: result });
});

/** DELETE /api/ai/menu — remove o cardápio do dia */
const clearWhatsAppMenu = asyncHandler(async (req, res) => {
  await aiService.clearWhatsAppMenu(req.user.tenantId);
  res.json({ success: true, message: 'Cardápio removido com sucesso.' });
});

// ── Uso de IA ──────────────────────────────────────────────────────

/** GET /api/ai/usage */
const getUsage = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  // Resumo por tenant (apenas para o tenant atual, sem parâmetro extra)
  const result = await aiService.getAiUsageSummary(days);
  res.json({ success: true, data: result });
});

module.exports = {
  interpretFinancial,
  managerAnalyze,
  getAlerts,
  generateMarketing,
  submitOcrInvoice,
  getOcrJob,
  applyOcrResult,
  getWhatsAppMenu,
  clearWhatsAppMenu,
  getUsage,
};
