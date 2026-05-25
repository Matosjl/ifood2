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

    let phone = (order.customer_phone || '').replace(/\D/g, '');
    if (!phone) return;
    // Garante prefixo Brasil (55) — Evolution API exige número completo
    if (!phone.startsWith('55')) phone = '55' + phone;

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

// ── Receipts (OCR de notas fiscais) ──────────────────────────────

const fmtBRL = (v) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Envia mensagem livre via instância do tenant.
 * Fire-and-forget — loga mas não lança.
 */
async function sendText(tenantId, phone, message) {
  try {
    const normPhone = String(phone || '').replace(/\D/g, '');
    if (!normPhone || !message) return;
    const phoneFull = normPhone.startsWith('55') ? normPhone : '55' + normPhone;

    const instance = await getTenantInstance(tenantId);
    if (!instance || !env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY) {
      console.log('[waNotify.sendText] config WA incompleta', { tenantId });
      return;
    }

    await axios.post(
      `${env.EVOLUTION_API_URL}/message/sendText/${instance}`,
      { number: phoneFull, text: message },
      { headers: { apikey: env.EVOLUTION_API_KEY }, timeout: 8000 }
    );
  } catch (err) {
    console.warn('[waNotify.sendText] falha', { tenantId, error: err.message });
  }
}

/**
 * Formata preview da nota fiscal pra WhatsApp.
 * pending: row de pending_receipts (com raw_extraction e matched_items)
 */
function buildReceiptPreview(pending) {
  const raw = pending.raw_extraction || {};
  const itens = pending.matched_items || [];

  if (raw.erro) {
    return (
      `❌ *Não consegui ler essa nota fiscal*\n\n` +
      `Manda outra foto: melhor luz, sem dobra, mais perto. ` +
      `Se já está boa e mesmo assim falhou, abre o financeiro no app pra cadastrar manualmente.`
    );
  }

  const linhas = itens.slice(0, 12).map((m, idx) => {
    const r = m.raw || {};
    const qty = Number(r.quantidade || 0);
    const unidade = r.unidade || 'un';
    const valor = fmtBRL(r.valor_total);

    let icon, suffix;
    if (m.action === 'auto' && m.match_name) {
      icon = '✅';
      suffix = `→ *${m.match_name}* (estoque +${qty})`;
    } else if (m.action === 'ask' && m.match_name) {
      icon = '❓';
      suffix = `→ casar com *${m.match_name}*? (score ${(m.score || 0).toFixed(2)})`;
    } else {
      icon = '🆕';
      suffix = '→ vou criar como novo insumo';
    }

    return `${icon} ${qty}${unidade} ${r.descricao} (${valor})\n   ${suffix}`;
  }).join('\n');

  const restantes = itens.length > 12 ? `\n   _...mais ${itens.length - 12} itens_` : '';
  const fornecedor = raw.fornecedor ? `*${raw.fornecedor}*\n` : '';
  const data = raw.data_emissao ? `📅 ${raw.data_emissao}\n` : '';
  const total = fmtBRL(raw.total);
  const conf = Number(raw.confianca || 0);
  const confAlert = conf < 0.6 ? `\n⚠️ _Confiança baixa (${(conf*100).toFixed(0)}%) — confere antes de confirmar._` : '';

  return (
    `📸 *Nota fiscal recebida*\n\n` +
    fornecedor + data +
    `💰 Total: *${total}*\n\n` +
    `*Itens:*\n${linhas}${restantes}${confAlert}\n\n` +
    `_Código:_ *${pending.short_code}*\n\n` +
    `Responda:\n` +
    `✅ *SIM* — confirmar e atualizar estoque/financeiro\n` +
    `❌ *NÃO* — cancelar esta nota\n` +
    `✏️ *EDITAR* — abrir no app pra ajustar`
  );
}

/**
 * Manda o preview da nota fiscal no WhatsApp do remetente.
 */
async function sendReceiptPreview(tenantId, senderPhone, pending) {
  const msg = buildReceiptPreview(pending);
  await sendText(tenantId, senderPhone, msg);
}

/**
 * Confirmação pós-SIM.
 */
async function sendReceiptConfirmed(tenantId, senderPhone, { pending, expense, stockMovements }) {
  const raw = pending.raw_extraction || {};
  const total = fmtBRL(raw.total);
  const itens = (pending.matched_items || []).length;
  const stocksAtualizados = stockMovements?.length || 0;

  const msg =
    `✅ *Nota confirmada!*\n\n` +
    `💰 Despesa registrada: ${total}\n` +
    `📦 ${itens} itens processados${stocksAtualizados ? ` (${stocksAtualizados} produtos no estoque)` : ''}\n\n` +
    `Tudo certo. Pode ver no financeiro: https://app.zapfome.com/financeiro`;

  await sendText(tenantId, senderPhone, msg);
}

module.exports = {
  notifyCustomer,
  sendText,
  sendReceiptPreview,
  sendReceiptConfirmed,
  buildReceiptPreview, // exportado pra testes
};
