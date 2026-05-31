'use strict';
/**
 * Push Notification Service
 * Gerencia assinaturas Web Push e envio de notificações por tenant.
 */

const webpush  = require('web-push');
const db       = require('../../config/database');
const env      = require('../../config/env');

// Configura VAPID uma vez na inicialização
if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );
}

/**
 * Salva ou atualiza uma assinatura push para o tenant/usuário.
 */
const subscribe = async (tenantId, userId, subscription, deviceLabel) => {
  const endpoint = subscription.endpoint;
  await db.query(
    `INSERT INTO push_subscriptions (tenant_id, user_id, endpoint, subscription, device_label, last_used_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (endpoint) DO UPDATE
       SET subscription  = EXCLUDED.subscription,
           tenant_id     = EXCLUDED.tenant_id,
           user_id       = EXCLUDED.user_id,
           device_label  = COALESCE(EXCLUDED.device_label, push_subscriptions.device_label),
           last_used_at  = NOW()`,
    [tenantId, userId || null, endpoint, JSON.stringify(subscription), deviceLabel || null]
  );
};

/**
 * Remove uma assinatura push pelo endpoint.
 */
const unsubscribe = async (endpoint) => {
  await db.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
};

/**
 * Envia notificação push para TODOS os dispositivos do tenant.
 * Expired/invalid subscriptions são removidas automaticamente.
 *
 * @param {string} tenantId
 * @param {{ title, body, tag, url, requireInteraction }} payload
 */
const sendToTenant = async (tenantId, payload) => {
  if (!env.VAPID_PUBLIC_KEY) return; // VAPID não configurado

  const { rows } = await db.query(
    `SELECT endpoint, subscription FROM push_subscriptions WHERE tenant_id = $1`,
    [tenantId]
  );
  if (!rows.length) return;

  const pushPayload = JSON.stringify({
    title:              payload.title              ?? '🍽️ ZapFome',
    body:               payload.body               ?? '',
    tag:                payload.tag                ?? 'zapfome',
    url:                payload.url                ?? env.FRONTEND_URL,
    requireInteraction: payload.requireInteraction ?? true,
  });

  const results = await Promise.allSettled(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(JSON.parse(row.subscription), pushPayload);
      } catch (err) {
        // 410 Gone ou 404 = subscription expirada — remove do banco
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [row.endpoint])
            .catch(() => {});
        }
        throw err;
      }
    })
  );

  const sent   = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed) console.warn(`[Push] ${failed}/${rows.length} notificações falharam para tenant ${tenantId}`);
  return { sent, failed };
};

/**
 * Retorna o número de dispositivos inscritos para um tenant.
 */
const countDevices = async (tenantId) => {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS cnt FROM push_subscriptions WHERE tenant_id = $1`,
    [tenantId]
  );
  return rows[0]?.cnt ?? 0;
};

module.exports = { subscribe, unsubscribe, sendToTenant, countDevices };
