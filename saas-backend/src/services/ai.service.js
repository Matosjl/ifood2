'use strict';
/**
 * AI Service — Cliente HTTP para o ZapFome AI Engine (VPS2)
 * VPS1 usa este serviço para delegar processamento de IA.
 *
 * Todas as requisições incluem:
 *   X-AI-Engine-Key: env.AI_ENGINE_KEY
 *   X-Tenant-Id:     tenantId
 */
const axios = require('axios');
const env = require('../config/env');
const { createLogger }      = require('../utils/logger');
const { retryWithBackoff }  = require('../utils/retry');

const logger = createLogger('ai.service');

const aiEngine = axios.create({
  baseURL: env.VPS2_URL || 'http://69.10.43.169:3001',
  headers: {
    'Content-Type': 'application/json',
    'X-AI-Engine-Key': env.AI_ENGINE_KEY || '',
  },
  timeout: 20000,
});

aiEngine.interceptors.response.use(
  (r) => r,
  (err) => {
    logger.error('[AI Engine] Chamada falhou', {
      url:    err.config?.url,
      status: err.response?.status,
    });
    throw err;
  }
);

function headers(tenantId) {
  return { 'X-Tenant-Id': tenantId };
}

// ── Chat (WhatsApp) ────────────────────────────────────────────────

/** Enfileira mensagem WhatsApp — retry 3× com backoff (1s, 2s) */
async function enqueueWhatsAppMessage(tenantId, phone, message, tenantInfo = {}) {
  const { data } = await retryWithBackoff(
    () => aiEngine.post('/api/v1/chat/message/async',
      { phone, message, tenantInfo },
      { headers: headers(tenantId) }
    ),
    { maxAttempts: 3, baseDelayMs: 1000 }
  );
  return data.data;
}

/** Processa mensagem WhatsApp sincronamente — retry 2× */
async function processMessage(tenantId, phone, message, tenantInfo = {}) {
  const { data } = await retryWithBackoff(
    () => aiEngine.post('/api/v1/chat/message',
      { phone, message, tenantInfo },
      { headers: headers(tenantId) }
    ),
    { maxAttempts: 2, baseDelayMs: 1000 }
  );
  return data.data;
}

// ── Agente Financeiro ──────────────────────────────────────────────

/** Interpreta mensagem financeira: "gastei 120 no gás" → JSON estruturado */
async function interpretFinancial(tenantId, message) {
  const { data } = await aiEngine.post('/api/v1/financial/interpret',
    { message },
    { headers: headers(tenantId) }
  );
  return data.data;
}

// ── Agente Gerente ─────────────────────────────────────────────────

/** Análise gerencial (KPIs, insights, alertas) */
async function managerAnalyze(tenantId, options = {}) {
  const { data } = await aiEngine.post('/api/v1/manager/analyze',
    options,
    { headers: headers(tenantId) }
  );
  return data.data;
}

/** Verifica alertas automáticos (queda de vendas, etc.) */
async function getAlerts(tenantId) {
  const { data } = await aiEngine.get('/api/v1/manager/alerts',
    { headers: headers(tenantId) }
  );
  return data.data;
}

// ── Agente de Marketing ────────────────────────────────────────────

/** Gera copy de marketing: type = 'whatsapp' | 'instagram' | 'promotion' | 'campaign' */
async function generateMarketing(tenantId, type, context = {}) {
  const { data } = await aiEngine.post('/api/v1/marketing/generate',
    { type, context },
    { headers: headers(tenantId) }
  );
  return data.data;
}

// ── OCR de Nota Fiscal ─────────────────────────────────────────────

/** Envia imagem de nota fiscal para OCR assíncrono — retorna jobId */
async function submitOcrInvoice(tenantId, imageUrl) {
  const { data } = await aiEngine.post('/api/v1/ocr/invoice',
    { imageUrl },
    { headers: headers(tenantId) }
  );
  return data.data;
}

/** Busca resultado de um job OCR */
async function getOcrJob(tenantId, jobId) {
  const { data } = await aiEngine.get(`/api/v1/ocr/jobs/${jobId}`,
    { headers: headers(tenantId) }
  );
  return data.data;
}

// ── Cardápio do Dia (WhatsApp) ────────────────────────────────────

/** Retorna o cardápio do dia ativo no WhatsApp (imagem base64 + legenda) */
async function getWhatsAppMenu(tenantId) {
  try {
    const { data } = await aiEngine.get('/api/v1/menu/image',
      { headers: headers(tenantId) }
    );
    return data.data ?? null;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

/** Remove o cardápio do dia ativo */
async function clearWhatsAppMenu(tenantId) {
  const { data } = await aiEngine.delete('/api/v1/menu',
    { headers: headers(tenantId) }
  );
  return data;
}

// ── Super Admin ────────────────────────────────────────────────────

/** Resumo de uso de IA para o Super Admin Panel */
async function getAiUsageSummary(days = 30) {
  const { data } = await aiEngine.get('/api/v1/usage/summary', { params: { days } });
  return data.data;
}

/** Verifica se o AI Engine está saudável */
async function isHealthy() {
  try {
    const { data } = await aiEngine.get('/health', { timeout: 5000 });
    return data.status === 'ok';
  } catch {
    return false;
  }
}

module.exports = {
  enqueueWhatsAppMessage,
  processMessage,
  interpretFinancial,
  managerAnalyze,
  getAlerts,
  generateMarketing,
  submitOcrInvoice,
  getOcrJob,
  getWhatsAppMenu,
  clearWhatsAppMenu,
  getAiUsageSummary,
  isHealthy,
};
