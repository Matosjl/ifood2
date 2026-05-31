'use strict';
/**
 * n8n Service — Dispara webhooks no n8n para automações
 *
 * Webhooks configurados no n8n (importar templates de src/n8n/):
 *   /webhook/zapfome/campaign        — dispara campanha de marketing via Evolution
 *   /webhook/zapfome/recovery        — recuperação de clientes inativos
 *   /webhook/zapfome/report          — gera e envia relatório via WhatsApp
 *   /webhook/zapfome/ocr-confirm     — confirma NF e atualiza estoque + financeiro
 *
 * Qualquer webhook não configurado retorna 404 — o caller trata graciosamente.
 */
const axios  = require('axios');
const env    = require('../config/env');
const db     = require('../config/database');
const { createLogger } = require('../utils/logger');

const logger = createLogger('n8n.service');

const n8n = axios.create({
  baseURL: env.N8N_URL || 'http://172.19.0.1:5678',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ── helpers ───────────────────────────────────────────────────────

async function _getTenantInfo(tenantId) {
  try {
    const { rows } = await db.query(
      `SELECT t.name, t.whatsapp_number, t.slug,
              u.name AS owner_name,
              COALESCE(t.owner_whatsapp, u.phone) AS owner_phone
       FROM tenants t
       LEFT JOIN users u ON u.tenant_id = t.id AND u.role = 'owner'
       WHERE t.id = $1
       LIMIT 1`,
      [tenantId]
    );
    return rows[0] || {};
  } catch { return {}; }
}

async function _getInactiveCustomers(tenantId, days = 15, limit = 100) {
  try {
    const { rows } = await db.query(
      `SELECT
         customer_name                    AS name,
         customer_phone                   AS phone,
         MAX(created_at)                  AS last_order,
         COUNT(*)                         AS total_orders,
         COALESCE(SUM(total), 0)          AS total_spent
       FROM orders
       WHERE tenant_id = $1
         AND customer_phone IS NOT NULL
         AND customer_phone <> ''
         AND status = 'delivered'
       GROUP BY customer_name, customer_phone
       HAVING MAX(created_at) < NOW() - INTERVAL '1 day' * $2
       ORDER BY last_order DESC
       LIMIT $3`,
      [tenantId, days, limit]
    );
    return rows;
  } catch { return []; }
}

async function _getTodayStats(tenantId) {
  try {
    const { rows } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE) AS orders_today,
         COALESCE(SUM(total) FILTER (WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE AND status = 'delivered'), 0) AS revenue_today,
         COUNT(DISTINCT customer_id) FILTER (WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE) AS unique_customers
       FROM orders WHERE tenant_id = $1`,
      [tenantId]
    );
    return rows[0] || {};
  } catch { return {}; }
}

// ── webhook calls ──────────────────────────────────────────────────

/**
 * Dispara campanha de marketing via n8n
 * n8n workflow: recebe copy + lista → envia via Evolution API
 */
async function triggerCampaign(tenantId, { copy, type = 'whatsapp', targetGroup = 'all', context = {} }) {
  const tenant = await _getTenantInfo(tenantId);
  const stats  = await _getTodayStats(tenantId);

  try {
    const { data } = await n8n.post('/webhook/zapfome/campaign', {
      tenantId,
      tenantName:  tenant.name,
      waNumber:    tenant.whatsapp_number,
      ownerPhone:  tenant.owner_phone,
      copy,
      type,
      targetGroup,
      context:     { ...context, ...stats },
    });
    return { success: true, data, message: data?.message || 'Campanha disparada com sucesso!' };
  } catch (err) {
    logger.warn('[n8n] campaign webhook failed', { status: err.response?.status });
    if (err.response?.status === 404) {
      return { success: false, notConfigured: true, message: 'Webhook de campanha ainda não configurado no n8n.' };
    }
    throw err;
  }
}

/**
 * Dispara recuperação de clientes inativos
 * n8n workflow: recebe lista → envia mensagem personalizada via Evolution API
 */
async function triggerRecovery(tenantId, { days = 15, copy, context = {} }) {
  const tenant    = await _getTenantInfo(tenantId);
  const customers = await _getInactiveCustomers(tenantId, days);

  if (!customers.length) {
    return { success: true, message: `Nenhum cliente inativo há ${days} dias encontrado. 🎉`, customers: [] };
  }

  try {
    const { data } = await n8n.post('/webhook/zapfome/recovery', {
      tenantId,
      tenantName: tenant.name,
      waNumber:   tenant.whatsapp_number,
      ownerPhone: tenant.owner_phone,
      customers:  customers.slice(0, 50), // max 50 por vez
      days,
      copy,
      context,
    });
    return {
      success: true,
      data,
      customers: customers.length,
      message: data?.message || `Recuperação iniciada para ${customers.length} clientes inativos há +${days} dias.`,
    };
  } catch (err) {
    logger.warn('[n8n] recovery webhook failed', { status: err.response?.status });
    if (err.response?.status === 404) {
      // Return the data so the user can see it even without n8n configured
      return {
        success: false,
        notConfigured: true,
        customers: customers.length,
        customerList: customers.slice(0, 10),
        message: `Encontrei ${customers.length} clientes inativos. Configure o webhook no n8n para disparar o envio.`,
      };
    }
    throw err;
  }
}

/**
 * Solicita relatório via n8n (envia resumo no WhatsApp do dono)
 */
async function triggerReport(tenantId, { period = 'today', context = {} }) {
  const tenant = await _getTenantInfo(tenantId);
  const stats  = await _getTodayStats(tenantId);

  try {
    const { data } = await n8n.post('/webhook/zapfome/report', {
      tenantId,
      tenantName: tenant.name,
      ownerPhone: tenant.owner_phone,
      period,
      stats,
      context,
    });
    return { success: true, data, message: data?.message || 'Relatório enviado pro seu WhatsApp!' };
  } catch (err) {
    if (err.response?.status === 404) {
      return { success: false, notConfigured: true, stats, message: 'Webhook de relatório ainda não configurado no n8n.' };
    }
    throw err;
  }
}

/**
 * Verifica se um webhook específico está configurado no n8n
 */
async function isWebhookActive(path) {
  try {
    const { status } = await n8n.options(`/webhook/${path}`, { timeout: 3000 });
    return status < 400;
  } catch {
    return false;
  }
}

/**
 * Health check do n8n
 */
async function isHealthy() {
  try {
    const { data } = await n8n.get('/healthz', { timeout: 3000 });
    return data?.status === 'ok';
  } catch { return false; }
}

// ── Automation webhooks (chamados pelo automation.worker) ──────────────

/**
 * Alerta pedidos travados (> 15 min sem atualização).
 */
async function triggerStuckOrders(tenantId, { ownerPhone, stuckOrders }) {
  try {
    await n8n.post('/webhook/zapfome/stuck-orders', {
      tenantId, ownerPhone, stuckOrders,
    });
    return { success: true };
  } catch (err) {
    if (err.response?.status === 404) return { success: false, notConfigured: true };
    throw err;
  }
}

/**
 * Alerta estoque crítico.
 */
async function triggerLowStock(tenantId, { ownerPhone, items }) {
  try {
    await n8n.post('/webhook/zapfome/low-stock', {
      tenantId, ownerPhone, items,
    });
    return { success: true };
  } catch (err) {
    if (err.response?.status === 404) return { success: false, notConfigured: true };
    throw err;
  }
}

/**
 * Relatório diário automático (08:00 BRT).
 */
async function triggerDailyReport(tenantId, { ownerPhone, context }) {
  const tenant = await _getTenantInfo(tenantId);
  try {
    const { data } = await n8n.post('/webhook/zapfome/report', {
      tenantId,
      tenantName: tenant.name,
      ownerPhone: ownerPhone || tenant.owner_phone,
      period: 'yesterday',
      context,
      automated: true,
    });
    return { success: true, data };
  } catch (err) {
    if (err.response?.status === 404) return { success: false, notConfigured: true };
    throw err;
  }
}

/**
 * Alerta de vendas baixas + criação automática de cupom.
 */
async function triggerLowSalesAlert(tenantId, { ownerPhone, todayRev, avgRev, couponCode }) {
  try {
    await n8n.post('/webhook/zapfome/low-sales', {
      tenantId, ownerPhone, todayRev, avgRev, couponCode,
    });
    return { success: true };
  } catch (err) {
    if (err.response?.status === 404) return { success: false, notConfigured: true };
    throw err;
  }
}

/**
 * Recuperação automática de clientes inativos (versão agendada).
 */
async function triggerAutoRecovery(tenantId, { ownerPhone, customers }) {
  try {
    await n8n.post('/webhook/zapfome/recovery', {
      tenantId, ownerPhone,
      customers: customers.slice(0, 50),
      days: 15,
      automated: true,
    });
    return { success: true };
  } catch (err) {
    if (err.response?.status === 404) return { success: false, notConfigured: true };
    throw err;
  }
}

module.exports = {
  triggerCampaign,
  triggerRecovery,
  triggerReport,
  triggerStuckOrders,
  triggerLowStock,
  triggerDailyReport,
  triggerLowSalesAlert,
  triggerAutoRecovery,
  isWebhookActive,
  isHealthy,
  _getTenantInfo,
  _getInactiveCustomers,
  _getTodayStats,
};
