/**
 * OpenPix (Woovi) PIX integration
 * Docs: https://developers.openpix.com.br/docs
 */
const https      = require('https');
const crypto     = require('crypto');
const db         = require('../../config/database');
const AppError   = require('../../utils/AppError');
const eventService = require('../../socket/eventService');
const { deductForOrder } = require('../insumos/insumos.service');

const OPENPIX_BASE = 'https://api.openpix.com.br/api/v1';

// ── HTTP helper ───────────────────────────────────────────────

function openpixRequest(appId, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url  = new URL(OPENPIX_BASE + path);
    const options = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method,
      headers: {
        Authorization: appId,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode >= 400) return reject(new AppError(json?.error ?? `OpenPix ${res.statusCode}`, 502));
          resolve(json);
        } catch {
          reject(new AppError('Resposta inválida do OpenPix', 502));
        }
      });
    });
    req.on('error', (e) => reject(new AppError(`OpenPix: ${e.message}`, 502)));
    if (data) req.write(data);
    req.end();
  });
}

// ── Config ────────────────────────────────────────────────────

async function getConfig(tenantId) {
  const { rows } = await db.query(`SELECT pix_openpix_app_id FROM tenants WHERE id = $1`, [tenantId]);
  return rows[0]?.pix_openpix_app_id ?? null;
}

async function saveConfig(tenantId, appId) {
  await db.query(
    `UPDATE tenants SET pix_openpix_app_id = $1 WHERE id = $2`,
    [appId || null, tenantId]
  );
  return { appId: appId || null };
}

// ── Generate QR code for an order ────────────────────────────
//
// NOTA: Esta função gera uma cobrança pelo TOTAL do pedido via correlationID=orderId.
// Para pedidos com pagamento dividido (payment_method='mixed'), o PIX dentro de um split
// é tratado como confirmação manual pelo atendente — o operador verifica o PIX no celular
// e confirma manualmente. NÃO chame esta função para cobrar apenas uma parcela do split.
// Futuramente: suporte a correlationID=order_payment_id para rastrear parcelas individualmente.

async function generatePixCharge(tenantId, orderId) {
  const appId = await getConfig(tenantId);
  if (!appId) throw new AppError('PIX não configurado. Configure o App ID OpenPix em Configurações.', 400);

  // Get order
  const { rows: [order] } = await db.query(
    `SELECT id, total, order_number, customer_name FROM orders WHERE id = $1 AND tenant_id = $2`,
    [orderId, tenantId]
  );
  if (!order) throw new AppError('Pedido não encontrado', 404);

  // Check if already has a pending charge
  const { rows: [existing] } = await db.query(
    `SELECT pix_charge_id, pix_qr_code, pix_br_code, pix_link FROM orders WHERE id = $1`,
    [orderId]
  );
  if (existing?.pix_charge_id && existing?.pix_qr_code) {
    return {
      chargeId: existing.pix_charge_id,
      qrCode:   existing.pix_qr_code,
      brCode:   existing.pix_br_code,
      link:     existing.pix_link,
    };
  }

  const correlationId = `zapfome-${orderId}`;
  const valueInCents  = Math.round(Number(order.total) * 100);

  const payload = {
    value:         valueInCents,
    correlationID: correlationId,
    comment:       `Pedido #${order.order_number ?? orderId.slice(-6).toUpperCase()}`,
  };

  const result = await openpixRequest(appId, 'POST', '/charge', payload);
  const charge = result.charge ?? result;

  const chargeId = charge.correlationID ?? charge.id ?? correlationId;
  const qrCode   = charge.qrCodeImage  ?? charge.brCode ?? null;
  const brCode   = charge.brCode       ?? null;
  const link     = charge.paymentLinkUrl ?? null;

  // Persist on order
  await db.query(
    `UPDATE orders
     SET pix_charge_id = $1, pix_qr_code = $2, pix_br_code = $3, pix_link = $4
     WHERE id = $5`,
    [chargeId, qrCode, brCode, link, orderId]
  );

  return { chargeId, qrCode, brCode, link };
}

// ── Webhook: OpenPix notifies when PIX is paid ───────────────

/**
 * Validates the webhook signature and processes the event.
 * OpenPix sends HMAC-SHA1 in the `x-webhook-signature` header.
 */
async function handleWebhook(rawBody, signature, webhookSecret) {
  // Verificação de assinatura OBRIGATÓRIA quando webhookSecret está configurado
  // Se webhookSecret não está configurado, loga aviso mas não bloqueia (retrocompatibilidade)
  if (webhookSecret) {
    if (!signature) {
      throw new AppError('Webhook PIX rejeitado: assinatura ausente. Configure o webhookSecret na OpenPix.', 401);
    }
    const expected = crypto
      .createHmac('sha1', webhookSecret)
      .update(rawBody)
      .digest('hex');
    if (expected !== signature) {
      throw new AppError('Assinatura do webhook PIX inválida', 401);
    }
  } else {
    // Aviso: sem webhookSecret qualquer POST é aceito — configure na OpenPix
    console.warn('[PIX webhook] ATENÇÃO: webhookSecret não configurado. Configure em Configurações → PIX para segurança máxima.');
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new AppError('Payload do webhook inválido', 400);
  }

  // We only care about charge completed events
  const eventName = event.event ?? event.type ?? '';
  if (!['OPENPIX:CHARGE_COMPLETED', 'charge.completed'].includes(eventName)) {
    return { ignored: true };
  }

  const charge = event.charge ?? event.data?.charge ?? {};
  const correlationId = charge.correlationID ?? '';

  // Correlation ID format: zapfome-<orderId>
  const match = correlationId.match(/^zapfome-([0-9a-f-]{36})$/i);
  if (!match) return { ignored: true };

  const orderId = match[1];

  // Find order
  const { rows: [order] } = await db.query(
    `SELECT id, tenant_id, status, payment_method FROM orders WHERE id = $1`,
    [orderId]
  );
  if (!order) return { ignored: true };

  // Mark as paid and confirmed (if still pending)
  const now  = new Date().toISOString();
  const updates = [
    `pix_paid_at = $2`,
  ];
  const params = [orderId, now];

  // Auto-confirm if still pending
  let newStatus = order.status;
  if (order.status === 'pending') {
    newStatus = 'confirmed';
    updates.push(`status = $${params.length + 1}`);
    params.push('confirmed');
  }

  // Não sobrescrever payment_method em pedidos com pagamento dividido (mixed).
  // Para esses pedidos, o PIX era apenas uma das parcelas — a informação de split
  // está em order_payments e não deve ser perdida.
  if (order.payment_method !== 'mixed') {
    updates.push(`payment_method = $${params.length + 1}`);
    params.push('pix');
  }
  updates.push(`paid_at = $${params.length + 1}`);
  params.push(now);

  await db.query(
    `UPDATE orders SET ${updates.join(', ')} WHERE id = $1`,
    params
  );

  // Emit socket event
  const { rows: [updatedOrder] } = await db.query(
    `SELECT * FROM orders WHERE id = $1`,
    [orderId]
  );
  if (updatedOrder) {
    eventService.orderUpdated(order.tenant_id, updatedOrder);
  }

  // C6: pedido confirmado via PIX → baixa insumos (idempotente via insumos_deducted)
  if (newStatus === 'confirmed') {
    deductForOrder(order.tenant_id, orderId).catch((err) => {
      console.error('[PIX webhook] deductForOrder falhou (non-critical):', err.message);
    });
  }

  return { processed: true, orderId, newStatus };
}

// ── Check charge status ───────────────────────────────────────

async function getChargeStatus(tenantId, orderId) {
  const { rows: [order] } = await db.query(
    `SELECT pix_charge_id, pix_paid_at FROM orders WHERE id = $1 AND tenant_id = $2`,
    [orderId, tenantId]
  );
  if (!order) throw new AppError('Pedido não encontrado', 404);

  return {
    paid:     Boolean(order.pix_paid_at),
    paidAt:   order.pix_paid_at,
    chargeId: order.pix_charge_id,
  };
}

module.exports = {
  getConfig,
  saveConfig,
  generatePixCharge,
  handleWebhook,
  getChargeStatus,
};
