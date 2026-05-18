'use strict';
/**
 * waNotify.service.js
 * Envia notificações WhatsApp para o cliente quando o status do pedido muda.
 * Fire-and-forget: erros são logados mas nunca bloqueiam a resposta HTTP.
 */

const axios  = require('axios');
const db     = require('../config/database');
const env    = require('../config/env');

// Statuses que geram notificação ao cliente
const NOTIFY_STATUSES = new Set(['confirmed', 'preparing', 'ready', 'delivering']);

/**
 * Monta a mensagem de acordo com o status e dados do pedido.
 * @param {object} order - objeto retornado pelo service.updateStatus
 * @returns {string|null}
 */
function buildMessage(order) {
  const num      = order.order_number ? `#${order.order_number}` : `#${String(order.id).slice(0, 8)}`;
  const name     = order.customer_name ? ` ${order.customer_name.split(' ')[0]}` : '';
  const isDelivery = (order.delivery_type || '').toLowerCase() === 'delivery';

  switch (order.status) {
    case 'confirmed': {
      const dest = isDelivery
        ? `📍 Endereço: ${order.customer_address || order.delivery_address || 'endereço cadastrado'}`
        : '📍 Retirada no balcão';
      return (
        `✅ *Pedido ${num} confirmado!*\n\n` +
        `Olá${name}! Seu pedido foi aceito e em breve entrará na fila da cozinha. 👨‍🍳\n\n` +
        `${dest}\n\n` +
        `Qualquer dúvida, é só chamar aqui! 😊`
      );
    }

    case 'preparing':
      return (
        `👨‍🍳 *Pedido ${num} em preparo!*\n\n` +
        `Olá${name}! Seu pedido já está sendo preparado com todo carinho. Já já fica pronto! 🔥`
      );

    case 'ready':
      if (isDelivery) return null; // delivery: aguarda "delivering" para avisar
      return (
        `✅ *Pedido ${num} pronto!*\n\n` +
        `Olá${name}! Seu pedido está prontinho esperando por você. Pode vir buscar! 🙌`
      );

    case 'delivering':
      if (!isDelivery) return null; // retirada: não há "saiu para entrega"
      return (
        `🛵 *Pedido ${num} saiu para entrega!*\n\n` +
        `Olá${name}! Seu pedido está a caminho. Já já chega! 🚀`
      );

    default:
      return null;
  }
}

/**
 * Busca a instância WhatsApp configurada para o tenant.
 * @param {string} tenantId
 * @returns {Promise<string|null>}
 */
async function getTenantInstance(tenantId) {
  try {
    const { rows } = await db.query(
      `SELECT whatsapp_instance FROM tenants WHERE id = $1`,
      [tenantId]
    );
    return rows[0]?.whatsapp_instance || null;
  } catch {
    return null;
  }
}

/**
 * Envia notificação WhatsApp para o cliente.
 * Fire-and-forget — nunca lança exceção para o chamador.
 *
 * @param {string} tenantId
 * @param {object} order  — objeto completo do pedido
 */
async function notifyCustomer(tenantId, order) {
  try {
    if (!NOTIFY_STATUSES.has(order.status)) return;

    const phone = (order.customer_phone || '').replace(/\D/g, '');
    if (!phone) return;

    const message = buildMessage(order);
    if (!message) return;

    const instance = await getTenantInstance(tenantId);
    if (!instance) {
      console.log('[waNotify] Instância WhatsApp não configurada para tenant', { tenantId });
      return;
    }

    if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY) {
      console.log('[waNotify] EVOLUTION_API_URL/KEY não configurados');
      return;
    }

    await axios.post(
      `${env.EVOLUTION_API_URL}/message/sendText/${instance}`,
      { number: phone, text: message },
      { headers: { apikey: env.EVOLUTION_API_KEY }, timeout: 8000 }
    );

    console.log('[waNotify] Notificação enviada ao cliente', {
      tenantId,
      status: order.status,
      phone:  `...${phone.slice(-4)}`,
    });
  } catch (err) {
    // Nunca deixa erro de WA quebrar o fluxo principal
    console.warn('[waNotify] Falha ao enviar notificação', {
      tenantId,
      status: order?.status,
      error:  err.message,
    });
  }
}

module.exports = { notifyCustomer };
