/**
 * WhatsApp Bot Service — por tenant
 *
 * Cada tenant tem seu próprio Client (sessão separada).
 * A sessão é persistida em disco via LocalAuth (pasta .wwebjs_auth/<tenantId>).
 *
 * API pública:
 *   initClient(tenantId)         — inicia/reconecta cliente
 *   getStatus(tenantId)          — 'disconnected' | 'qr' | 'connecting' | 'ready'
 *   getQR(tenantId)              — data URL do QR code (PNG)
 *   sendMessage(tenantId, phone, text) — envia mensagem
 *   disconnect(tenantId)         — desconecta e limpa sessão
 *
 * Notificações de pedido:
 *   notifyOrderCreated(tenantId, order)
 *   notifyOrderReady(tenantId, order)
 *   notifyOrderDelivering(tenantId, order)
 *   notifyOrderDelivered(tenantId, order)
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode                = require('qrcode');
const { createLogger }      = require('../../utils/logger');

const logger = createLogger('WhatsAppService');

// Mapa tenantId → { client, status, qrDataUrl, qrRaw }
const tenants = new Map();

// ── Helpers ───────────────────────────────────────────────────

/** Formata número BR para o formato do whatsapp-web.js (5511999998888@c.us) */
const formatPhone = (phone) => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  // Garante DDI 55
  const with55 = digits.startsWith('55') ? digits : `55${digits}`;
  return `${with55}@c.us`;
};

const getOrCreateEntry = (tenantId) => {
  if (!tenants.has(tenantId)) {
    tenants.set(tenantId, { client: null, status: 'disconnected', qrDataUrl: null });
  }
  return tenants.get(tenantId);
};

// ── Core ──────────────────────────────────────────────────────

/**
 * Inicializa (ou reconecta) o cliente WhatsApp para um tenant.
 * Idempotente: se já existe cliente inicializado, retorna sem fazer nada.
 */
const initClient = (tenantId) => {
  const entry = getOrCreateEntry(tenantId);

  // Já inicializado
  if (entry.client && entry.status !== 'disconnected') return;

  // Destrói client anterior se houver
  if (entry.client) {
    try { entry.client.destroy(); } catch (_) {}
  }

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: `tenant_${tenantId}` }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
      ],
    },
  });

  entry.client = client;
  entry.status = 'connecting';

  client.on('qr', async (qr) => {
    try {
      entry.qrRaw    = qr;
      entry.qrDataUrl = await qrcode.toDataURL(qr);
      entry.status   = 'qr';
      logger.info('QR code gerado', { tenantId });
    } catch (err) {
      logger.error('Erro ao gerar QR', { tenantId, error: err.message });
    }
  });

  client.on('ready', () => {
    entry.status   = 'ready';
    entry.qrDataUrl = null;
    entry.qrRaw    = null;
    logger.info('WhatsApp conectado', { tenantId });
  });

  client.on('authenticated', () => {
    entry.status = 'connecting';
    logger.info('Autenticado', { tenantId });
  });

  client.on('auth_failure', (msg) => {
    entry.status = 'disconnected';
    logger.error('Falha de autenticação', { tenantId, msg });
  });

  client.on('disconnected', (reason) => {
    entry.status = 'disconnected';
    logger.warn('Desconectado', { tenantId, reason });
  });

  client.initialize().catch((err) => {
    entry.status = 'disconnected';
    logger.error('Erro ao inicializar cliente', { tenantId, error: err.message });
  });
};

/** Retorna o status atual do tenant. */
const getStatus = (tenantId) => {
  const entry = tenants.get(tenantId);
  return entry ? entry.status : 'disconnected';
};

/** Retorna o QR code como data URL PNG, ou null se não disponível. */
const getQR = (tenantId) => {
  const entry = tenants.get(tenantId);
  return entry?.qrDataUrl ?? null;
};

/**
 * Envia uma mensagem WhatsApp para um número.
 * Retorna false silenciosamente se o cliente não estiver pronto.
 */
const sendMessage = async (tenantId, phone, text) => {
  const entry = tenants.get(tenantId);
  if (!entry?.client || entry.status !== 'ready') return false;

  const chatId = formatPhone(phone);
  if (!chatId) return false;

  try {
    await entry.client.sendMessage(chatId, text);
    logger.debug('Mensagem enviada', { tenantId, phone: chatId });
    return true;
  } catch (err) {
    logger.error('Falha ao enviar mensagem', { tenantId, phone: chatId, error: err.message });
    return false;
  }
};

/** Desconecta o cliente e remove a entrada. */
const disconnect = async (tenantId) => {
  const entry = tenants.get(tenantId);
  if (!entry?.client) return;
  try {
    await entry.client.destroy();
  } catch (_) {}
  tenants.delete(tenantId);
  logger.info('Desconectado manualmente', { tenantId });
};

// ── Notificações de pedido ────────────────────────────────────

const formatMoney = (n) => `R$ ${parseFloat(n || 0).toFixed(2).replace('.', ',')}`;

const itemsText = (items = []) =>
  items.map((i) => `  • ${i.quantity}x ${i.product_name || i.productName} — ${formatMoney(i.total)}`).join('\n');

const notifyOrderCreated = async (tenantId, order) => {
  if (!order.customer_phone && !order.customerPhone) return;
  const phone = order.customer_phone || order.customerPhone;
  const num   = order.order_number  || order.orderNumber;
  const items = order.items || [];

  const msg = [
    `✅ *Pedido #${num} confirmado!*`,
    '',
    itemsText(items),
    '',
    `*Total:* ${formatMoney(order.total)}`,
    order.delivery_type === 'delivery' || order.deliveryType === 'delivery'
      ? `🛵 *Entrega* — ${order.customer_address || order.customerAddress || 'endereço não informado'}`
      : `🏪 *Retirada no local*`,
    '',
    'Obrigado pela preferência! 🍽️',
  ].join('\n');

  await sendMessage(tenantId, phone, msg);
};

const notifyOrderReady = async (tenantId, order) => {
  if (!order.customer_phone && !order.customerPhone) return;
  const phone = order.customer_phone || order.customerPhone;
  const num   = order.order_number  || order.orderNumber;

  const isDelivery = order.delivery_type === 'delivery' || order.deliveryType === 'delivery';
  const msg = isDelivery
    ? `🛵 *Pedido #${num} saiu para entrega!*\n\nSeu pedido está a caminho. Em breve chegará até você!`
    : `🔔 *Pedido #${num} pronto!*\n\nSeu pedido está pronto para retirada. Pode vir buscar! 😊`;

  await sendMessage(tenantId, phone, msg);
};

const notifyOrderDelivering = async (tenantId, order) => {
  if (!order.customer_phone && !order.customerPhone) return;
  const phone = order.customer_phone || order.customerPhone;
  const num   = order.order_number  || order.orderNumber;

  const msg = `🛵 *Pedido #${num} a caminho!*\n\nSeu pedido saiu para entrega agora. Prepare-se para receber! 😋`;
  await sendMessage(tenantId, phone, msg);
};

const notifyOrderDelivered = async (tenantId, order) => {
  if (!order.customer_phone && !order.customerPhone) return;
  const phone = order.customer_phone || order.customerPhone;
  const num   = order.order_number  || order.orderNumber;

  const msg = `✅ *Pedido #${num} entregue!*\n\nObrigado pela preferência! Esperamos que tenha gostado. 🍽️⭐`;
  await sendMessage(tenantId, phone, msg);
};

module.exports = {
  initClient,
  getStatus,
  getQR,
  sendMessage,
  disconnect,
  notifyOrderCreated,
  notifyOrderReady,
  notifyOrderDelivering,
  notifyOrderDelivered,
};
