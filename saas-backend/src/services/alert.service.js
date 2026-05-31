/**
 * Alert Service — envia alertas críticos via WhatsApp (Evolution API).
 *
 * Env vars necessárias:
 *   ALERT_PHONE        — número do dono/ops ex: "5551981521264"
 *   EVOLUTION_INSTANCE — nome da instância, ex: "zapfome" (default: "default")
 *   EVOLUTION_API_URL  — já existe
 *   EVOLUTION_API_KEY  — já existe
 *
 * Cooldown de 5 minutos por tipo de alerta para evitar flood.
 */

const axios         = require('axios');
const env           = require('../config/env');
const { createLogger } = require('../utils/logger');

const logger = createLogger('alert.service');

const ALERT_PHONE        = process.env.ALERT_PHONE;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'default';
const COOLDOWN_MS        = 5 * 60 * 1000; // 5 min

// Rastreia último envio por tipo (evita flood do mesmo alerta)
const lastSentAt = {};

/**
 * Envia alerta WhatsApp. Silencioso se não configurado.
 *
 * @param {string} type    — chave de cooldown, ex: "db_down"
 * @param {string} message — texto do alerta
 */
async function sendAlert(type, message) {
  if (!ALERT_PHONE || !env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY) {
    logger.warn('Alerta nao enviado: ALERT_PHONE ou EVOLUTION_API_* nao configurado', { type });
    return;
  }

  const now = Date.now();
  if (lastSentAt[type] && now - lastSentAt[type] < COOLDOWN_MS) return;
  lastSentAt[type] = now;

  try {
    await axios.post(
      `${env.EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      { number: ALERT_PHONE, text: message },
      { headers: { apikey: env.EVOLUTION_API_KEY }, timeout: 8_000 }
    );
    logger.info('Alerta enviado', { type, phone: ALERT_PHONE });
  } catch (err) {
    logger.error('Falha ao enviar alerta', { type, error: err.message });
  }
}

/**
 * Envia alerta para um telefone específico (usado pelo automation worker).
 * Cooldown independente por (type + phone).
 */
async function sendAlertToPhone(type, phone, message) {
  if (!phone || !env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY) {
    logger.warn('sendAlertToPhone: telefone ou Evolution não configurado', { type });
    return;
  }

  const key = `${type}:${phone}`;
  const now  = Date.now();
  if (lastSentAt[key] && now - lastSentAt[key] < COOLDOWN_MS) return;
  lastSentAt[key] = now;

  try {
    await axios.post(
      `${env.EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      { number: phone, text: message },
      { headers: { apikey: env.EVOLUTION_API_KEY }, timeout: 8_000 }
    );
    logger.info('Alerta enviado', { type, phone });
  } catch (err) {
    logger.error('Falha ao enviar alerta', { type, error: err.message });
  }
}

module.exports = { sendAlert, sendAlertToPhone };
