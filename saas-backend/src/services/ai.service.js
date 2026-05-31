'use strict';
/**
 * AI Service — Cliente HTTP para o ZapFome AI Engine (VPS2)
 * VPS1 usa este serviço para delegar processamento de IA.
 *
 * Todas as requisições incluem:
 *   X-AI-Engine-Key: env.AI_ENGINE_KEY
 *   X-Tenant-Id:     tenantId
 */
const axios   = require('axios');
const env     = require('../config/env');
const db      = require('../config/database');
const n8nSvc  = require('./n8n.service');
const ctxSvc  = require('./context.service');
const { createLogger }      = require('../utils/logger');
const { retryWithBackoff }  = require('../utils/retry');

const logger = createLogger('ai.service');

const aiEngine = axios.create({
  baseURL: env.VPS2_URL || 'http://69.10.43.169:3001',
  headers: {
    'Content-Type': 'application/json',
    'X-AI-Engine-Key': env.AI_ENGINE_KEY || '',
  },
  timeout: 35000, // 35s — margem para GPT-4o + latência VPS2→OpenAI
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

/**
 * OCR síncrono de nota fiscal via Ollama Vision (VPS2).
 * Sobe multipart com a imagem e retorna o JSON estruturado.
 *
 * @param {string} tenantId
 * @param {Buffer} imageBuffer
 * @param {string} contentType  ex: 'image/jpeg'
 * @param {string} filename     ex: 'nota.jpg'
 * @returns {Promise<object>}   { fornecedor, cnpj, data_emissao, total, itens[], confianca, categoria_sugerida }
 */
async function interpretReceipt(tenantId, imageBuffer, contentType = 'image/jpeg', filename = 'receipt.jpg') {
  const imageBase64 = imageBuffer.toString('base64');

  const { data } = await retryWithBackoff(
    () => aiEngine.post('/api/v1/ocr/invoice/sync', { imageBase64 }, {
      headers: headers(tenantId),
      timeout: 90000, // OCR pode demorar — 90s
    }),
    { maxAttempts: 2, baseDelayMs: 2000 }
  );

  // Converte formato VPS2 → formato esperado pelo ingest.service.js
  const r = data.data || {};
  return {
    fornecedor:         r.supplier    || null,
    cnpj:               r.cnpj        || null,
    data_emissao:       r.invoiceDate || null,
    total:              r.totalValue  || 0,
    confianca:          r.confidence  || 0,
    categoria_sugerida: 'food_supplier',
    itens: (r.items || []).map((it) => ({
      descricao:   it.name,
      quantidade:  parseFloat(it.qty  || 1),
      unidade:     it.unit             || 'un',
      valor_unit:  parseFloat(it.unitPrice || 0),
      valor_total: parseFloat(it.total     || 0),
    })),
    erro: r.error || null,
  };
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

// ── AI Center (painel admin) ───────────────────────────────────────

/**
 * Busca contexto operacional do tenant via context.service (fonte única de verdade).
 * A IA NUNCA calcula — apenas interpreta os dados determinísticos daqui.
 */
async function _getTenantContext(tenantId) {
  try {
    return await ctxSvc.buildChatContext(tenantId);
  } catch {
    return {};
  }
}

/**
 * Detecta intenção da mensagem do dono.
 *
 * Intents de EXECUÇÃO (chamam n8n):
 *   campaign_dispatch  — criar E disparar campanha agora
 *   recovery           — recuperar clientes inativos
 *   report_send        — enviar relatório no WhatsApp
 *
 * Intents de ANÁLISE (chamam VPS2):
 *   marketing          — apenas gerar copy
 *   financial          — interpretar lançamento financeiro
 *   manager            — análise gerencial
 *   chat               — resposta livre
 */
function _detectIntent(message) {
  const m = message.toLowerCase();

  // Execução: campanha (disparo real via n8n)
  if (/dispar|envi(ar?|a)\s.*(campanha|mensag|promo|oferta|copy)|lança(r)?\s*(campanha|promo)|cri(ar?|a)\s+e\s+(envi|dispar)/i.test(m)) return 'campaign_dispatch';
  if (/client[eo]s?\s*(inativ|sem\s+compr|sumiram|que\s+n[aã]o\s+compr)|recuper(ar?|a)\s*client|reativac/i.test(m)) return 'recovery';
  if (/envi(ar?|a)\s*(relat|resumo)\s*(pro\s*whatsapp|pra\s*mim|no\s*zap)|relatório\s*no\s*whatsapp|manda\s*(o\s*)?relat/i.test(m)) return 'report_send';

  // Análise: gerar copy
  if (/marketing|promoç|campanha|instagram|post|story|divulg|anuncio|anúncio|copy|texto\s*(de|para)\s*(promo|campanha)/i.test(m)) return 'marketing';

  // Análise: financeiro
  if (/financ|gasto|gaste|despesa|custo|receita|lucro|faturei|entrou|saiu|dinheiro|caixa/i.test(m)) return 'financial';

  // Análise: gerencial
  if (/análise|analise|relatório|relatorio|venda|desempenho|semana|mês|mes|resumo|como foi|como tá|como ta/i.test(m)) return 'manager';

  return 'chat';
}

// ── Intent → prioridade e agente ──────────────────────────────────
const INTENT_PRIORITY = { financial: 3, manager: 4, marketing: 5, campaign_dispatch: 5, recovery: 6, report_send: 5, chat: 8 };
const INTENT_AGENT    = { financial: 'financial', manager: 'manager', marketing: 'marketing', campaign_dispatch: 'marketing', recovery: 'recovery', report_send: 'manager', chat: 'chat' };

/**
 * Chat do AI Center (painel admin).
 *
 * Flow:
 *   Intents de ANÁLISE   → VPS2 AI Engine (gerar texto/análise)
 *   Intents de EXECUÇÃO  → VPS2 gera o copy → n8n executa a ação
 *
 * Cada chamada:
 *   1. Cria ai_tasks record (rastreabilidade)
 *   2. Lê últimas 5 mensagens para memória contextual
 *   3. Executa o fluxo
 *   4. Escreve ai_logs (observabilidade)
 *   5. Persiste no ai_chat_messages
 */
async function centerChat(tenantId, message) {
  const t0      = Date.now();
  const intent  = _detectIntent(message);
  // Manager intent recebe contexto completo; outros recebem contexto mínimo
  const context = intent === 'manager'
    ? await ctxSvc.buildOperationalContext(tenantId).catch(() => ({}))
    : await _getTenantContext(tenantId);
  const agent   = INTENT_AGENT[intent]    || 'chat';
  const prio    = INTENT_PRIORITY[intent] || 5;

  // ── Memória contextual: últimas 5 mensagens ────────────────────
  let history = [];
  try {
    const { rows: hist } = await db.query(
      `SELECT role, content FROM ai_chat_messages
       WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [tenantId]
    );
    history = hist.reverse(); // cronológico
  } catch { /* não bloqueia */ }

  // ── Cria task record ──────────────────────────────────────────
  let taskId = null;
  try {
    const { rows: [task] } = await db.query(
      `INSERT INTO ai_tasks (tenant_id, intent, input, status, priority, agent, started_at)
       VALUES ($1, $2, $3, 'running', $4, $5, NOW()) RETURNING id`,
      [tenantId, intent, JSON.stringify({ message }), prio, agent]
    );
    taskId = task.id;
  } catch { /* não bloqueia o chat se ai_tasks não existir ainda */ }

  let aiResult;
  let n8nResult  = null;
  let n8nCalled  = false;
  let logStatus  = 'success';
  let logError   = null;

  try {
    // ── EXECUÇÃO: Campanha real ─────────────────────────────────────
    if (intent === 'campaign_dispatch') {
      let type = 'whatsapp';
      if (/instagram/i.test(message)) type = 'instagram';
      else if (/promoç|oferta/i.test(message)) type = 'promotion';

      aiResult  = await generateMarketing(tenantId, type, { prompt: message, context, history }).catch(() => null);
      const copy = aiResult?.copy || aiResult?.caption || aiResult?.message || message;
      n8nResult  = await n8nSvc.triggerCampaign(tenantId, { copy, type, context });
      n8nCalled  = true;

    // ── EXECUÇÃO: Recuperação de clientes ──────────────────────────
    } else if (intent === 'recovery') {
      const daysMatch = message.match(/(\d+)\s*dias?/i);
      const days      = daysMatch ? parseInt(daysMatch[1]) : 15;

      const vps2Timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('VPS2 timeout')), 5000)
      );
      aiResult = await Promise.race([
        generateMarketing(tenantId, 'whatsapp', {
          prompt: `Mensagem de reativação para clientes inativos há ${days} dias: "${message}"`,
          context, history,
        }),
        vps2Timeout,
      ]).catch(() => null);

      const copy = aiResult?.copy || aiResult?.message || null;
      n8nResult  = await n8nSvc.triggerRecovery(tenantId, { days, copy, context });
      n8nCalled  = true;

    // ── EXECUÇÃO: Relatório no WhatsApp ────────────────────────────
    } else if (intent === 'report_send') {
      const period = /semana|week/i.test(message) ? 'week' : /mes|mês|month/i.test(message) ? 'month' : 'today';
      aiResult  = null;
      n8nResult = await n8nSvc.triggerReport(tenantId, { period, context });
      n8nCalled = true;

    // ── ANÁLISE: Copy de marketing ─────────────────────────────────
    } else if (intent === 'marketing') {
      let type = 'whatsapp';
      if (/instagram/i.test(message))                  type = 'instagram';
      else if (/promoç|oferta|desconto/i.test(message)) type = 'promotion';
      else if (/campanha/i.test(message))               type = 'campaign';
      aiResult = await generateMarketing(tenantId, type, { prompt: message, context, history });

    // ── ANÁLISE: Financeiro ────────────────────────────────────────
    } else if (intent === 'financial') {
      aiResult = await interpretFinancial(tenantId, message);

    // ── ANÁLISE: Gerencial ─────────────────────────────────────────
    } else if (intent === 'manager') {
      aiResult = await managerAnalyze(tenantId, { period: 'week', type: 'full', prompt: message });

    // ── CHAT: Resposta livre ───────────────────────────────────────
    } else {
      aiResult = await processMessage(tenantId, 'admin', message, {
        ...context, isAdminChat: true, history,
      });
    }

  } catch (err) {
    logger.error('[AI Center] Falha', { intent, err: err.message });
    logStatus = err.message.includes('timeout') ? 'timeout' : 'error';
    logError  = err.message;
    aiResult  = { error: err.message, raw: 'O AI Engine não respondeu. Tente novamente.' };
  }

  const responseText = _formatAiResult(intent, aiResult, context, n8nResult);
  const duration     = Date.now() - t0;

  // ── Atualiza task + grava log (fire-and-forget) ────────────────
  if (taskId) {
    db.query(
      `UPDATE ai_tasks SET status=$1, result=$2, error=$3, finished_at=NOW() WHERE id=$4`,
      [logError ? 'failed' : 'done', JSON.stringify({ response: responseText.slice(0, 500) }), logError, taskId]
    ).catch(() => {});
  }
  db.query(
    `INSERT INTO ai_logs (tenant_id, task_id, intent, agent, input_preview, status, duration_ms, n8n_called, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [tenantId, taskId, intent, agent, message.slice(0, 120), logStatus, duration, n8nCalled, logError]
  ).catch(() => {});

  // ── Persiste chat ──────────────────────────────────────────────
  await db.query(
    `INSERT INTO ai_chat_messages (tenant_id, role, content, intent, metadata)
     VALUES ($1,'user',$2,$3,$4), ($1,'assistant',$5,$3,$6)`,
    [tenantId, message, intent, JSON.stringify({ context }), responseText, JSON.stringify({ raw: aiResult, n8n: n8nResult })]
  );

  return { intent, response: responseText, context, raw: aiResult, n8n: n8nResult, taskId, durationMs: duration };
}

/**
 * Converte resposta bruta do VPS2 + n8n em texto formatado para o chat.
 */
function _formatAiResult(intent, result, context, n8nResult = null) {

  // ── Intents de execução (n8n) ──────────────────────────────────
  if (intent === 'campaign_dispatch') {
    if (n8nResult?.success) {
      const copy = result?.copy || result?.message || '';
      return `✅ **Campanha disparada!**\n\n${n8nResult.message}\n\n${copy ? `**Copy enviado:**\n${copy}` : ''}`.trim();
    }
    if (n8nResult?.notConfigured) {
      const copy = result?.copy || result?.message || '';
      return `✍️ **Copy gerado** (aguardando configuração do n8n para disparo automático):\n\n${copy || 'Não foi possível gerar o copy.'}\n\n⚙️ _${n8nResult.message}_`;
    }
    return `⚠️ Erro ao disparar campanha. ${n8nResult?.message || ''}`;
  }

  if (intent === 'recovery') {
    if (n8nResult?.success) {
      return `✅ **Recuperação iniciada!**\n\n${n8nResult.message}`;
    }
    if (n8nResult?.notConfigured) {
      const list = (n8nResult.customerList || [])
        .map((c) => `• **${c.name}** — ${c.phone} (último pedido: ${c.last_order ? new Date(c.last_order).toLocaleDateString('pt-BR') : 'nunca'})`)
        .join('\n');
      return `📋 **${n8nResult.customers} clientes inativos encontrados**\n\n${list || ''}\n\n⚙️ _${n8nResult.message}_`;
    }
    return `⚠️ Erro ao iniciar recuperação. ${n8nResult?.message || ''}`;
  }

  if (intent === 'report_send') {
    if (n8nResult?.success) {
      return `📊 **Relatório enviado!**\n\n${n8nResult.message}`;
    }
    if (n8nResult?.notConfigured) {
      const s = n8nResult.stats || {};
      return `📊 **Resumo de hoje:**\n\n• Pedidos: **${s.orders_today || 0}**\n• Faturamento: **R$ ${parseFloat(s.revenue_today || 0).toFixed(2)}**\n• Clientes únicos: **${s.unique_customers || 0}**\n\n⚙️ _${n8nResult.message}_`;
    }
    return `⚠️ Erro ao enviar relatório. ${n8nResult?.message || ''}`;
  }
  if (!result || result.error) {
    return result?.raw || '⚠️ Não consegui obter uma resposta do AI Engine. Verifique se o serviço está ativo.';
  }

  // Se a resposta já é uma string (chat genérico)
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  if (typeof result?.message  === 'string') return result.message;
  if (typeof result?.text     === 'string') return result.text;
  if (typeof result?.content  === 'string') return result.content;

  // Manager analyze — formata KPIs
  if (intent === 'manager') {
    const r = result;

    // VPS2 retorna { report: "..." } (texto markdown puro do GPT)
    if (typeof r.report === 'string' && r.report.trim()) {
      return r.report.trim();
    }

    // Formato legado / futuro: { summary, insights, recommendations }
    let txt = '📊 **Análise Gerencial**\n\n';
    if (r.summary)   txt += r.summary + '\n\n';
    if (r.insights?.length) {
      txt += '**Insights:**\n' + r.insights.map((i) => `• ${i}`).join('\n') + '\n\n';
    }
    if (r.recommendations?.length) {
      txt += '**Recomendações:**\n' + r.recommendations.map((rec) => `• ${rec}`).join('\n');
    }

    // Fallback: se VPS2 retornou vazio, usa contexto local
    if (txt.trim() === '📊 **Análise Gerencial**') {
      const c   = context || {};
      const fmt = (n) => `R$ ${parseFloat(n || 0).toFixed(2).replace('.', ',')}`;
      const revToday = parseFloat(c.revenueToday || 0);
      const revWeek  = parseFloat(c.revenueWeek  || 0);
      const revMonth = parseFloat(c.revenueMonth || 0);

      txt = '📊 **Resumo financeiro**\n\n' +
        `**Hoje:**\n` +
        `• Pedidos: **${c.ordersToday || 0}**\n` +
        `• Faturamento: **${fmt(revToday)}**\n` +
        (c.ordersOpen > 0 ? `• Em andamento: **${c.ordersOpen}** pedidos\n` : '') +
        (c.cancelledToday > 0 ? `• Cancelados hoje: **${c.cancelledToday}**\n` : '') +
        (c.ordersToday > 0 ? `• Ticket médio: **${fmt(revToday / c.ordersToday)}**\n` : '') +
        `\n**Últimos 7 dias:**\n` +
        `• Pedidos: **${c.ordersWeek || 0}**\n` +
        `• Faturamento: **${fmt(revWeek)}**\n` +
        `\n**Últimos 30 dias:**\n` +
        `• Faturamento: **${fmt(revMonth)}**`;
    }

    return txt.trim();
  }

  // Marketing — retorna o copy gerado
  if (intent === 'marketing') {
    const r = result;
    if (r.copy)    return `✍️ **Copy gerado:**\n\n${r.copy}`;
    if (r.caption) return `✍️ **Legenda:**\n\n${r.caption}`;
    if (r.message) return `✍️ **Mensagem:**\n\n${r.message}`;
  }

  // Financial interpret
  if (intent === 'financial') {
    const r = result;
    let txt = '💰 **Interpretação financeira**\n\n';
    if (r.type)     txt += `Tipo: ${r.type}\n`;
    if (r.amount)   txt += `Valor: R$ ${parseFloat(r.amount).toFixed(2)}\n`;
    if (r.category) txt += `Categoria: ${r.category}\n`;
    if (r.description) txt += `\n${r.description}`;
    return txt.trim() || JSON.stringify(result, null, 2);
  }

  // Fallback — JSON formatado
  return '```json\n' + JSON.stringify(result, null, 2) + '\n```';
}

/** Retorna histórico de chat do tenant (últimas N mensagens) */
async function getChatHistory(tenantId, limit = 50) {
  const { rows } = await db.query(
    `SELECT id, role, content, intent, created_at
     FROM ai_chat_messages
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [tenantId, limit]
  );
  return rows.reverse(); // mais antigo primeiro
}

/** Apaga histórico de chat do tenant */
async function clearChatHistory(tenantId) {
  await db.query('DELETE FROM ai_chat_messages WHERE tenant_id = $1', [tenantId]);
}

/** Retorna logs de execução do AI Center (observabilidade) */
async function getLogs(tenantId, limit = 50) {
  try {
    const { rows } = await db.query(
      `SELECT id, intent, agent, input_preview, status, duration_ms, n8n_called, error, created_at
       FROM ai_logs
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, limit]
    );
    return rows;
  } catch {
    return [];
  }
}

/** Retorna agentes registrados */
async function getAgents() {
  try {
    const { rows } = await db.query(
      `SELECT slug, name, description, capabilities, priority, active
       FROM ai_agents ORDER BY priority`
    );
    return rows;
  } catch {
    return [];
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
  interpretReceipt,
  getWhatsAppMenu,
  clearWhatsAppMenu,
  getAiUsageSummary,
  isHealthy,
  centerChat,
  getChatHistory,
  clearChatHistory,
  getLogs,
  getAgents,
};
