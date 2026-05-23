'use strict';
/**
 * whatsapp.service.js
 * Gerencia instâncias Evolution API por tenant.
 * Cria instância automaticamente ao conectar.
 */
const axios = require('axios');
const db    = require('../config/database');
const env   = require('../config/env');

const evo = () => axios.create({
  baseURL: env.EVOLUTION_API_URL,
  headers: { apikey: env.EVOLUTION_API_KEY },
  timeout: 15000,
});

/** Nome único da instância para o tenant */
const instanceName = (tenantId) =>
  `zt_${tenantId.replace(/-/g, '').slice(0, 20)}`;

/** Cria instância (ignora 409 = já existe) e retorna QR code */
async function connectInstance(tenantId) {
  const name = instanceName(tenantId);

  // Cria instância se não existe
  try {
    await evo().post('/instance/create', {
      instanceName: name,
      qrcode:       true,
      integration:  'WHATSAPP-BAILEYS',
    });
  } catch (err) {
    // 409 = já existe; 403 com "already in use" = também já existe — ambos ok
    const alreadyExists =
      err.response?.status === 409 ||
      (err.response?.status === 403 &&
        JSON.stringify(err.response?.data).includes('already in use'));
    if (!alreadyExists) throw err;
  }

  // Salva nome da instância no tenant
  await db.query(
    `UPDATE tenants SET whatsapp_instance = $2, updated_at = NOW() WHERE id = $1`,
    [tenantId, name]
  );

  // Busca QR code
  const { data } = await evo().get(`/instance/connect/${name}`);
  const qrcode   = data.base64 || data.qrcode?.base64 || null;

  return { instance: name, qrcode, status: 'connecting' };
}

/** Retorna status de conexão + QR code se desconectado */
async function getStatus(tenantId) {
  const { rows } = await db.query(
    `SELECT whatsapp_instance FROM tenants WHERE id = $1`, [tenantId]
  );
  const name = rows[0]?.whatsapp_instance;
  if (!name) return { connected: false, instance: null, qrcode: null, status: 'not_configured' };

  try {
    const { data } = await evo().get(`/instance/connectionState/${name}`);
    const state    = data.instance?.state || data.state || 'disconnected';
    const connected = state === 'open';

    let qrcode = null;
    if (!connected) {
      try {
        const qr = await evo().get(`/instance/connect/${name}`);
        qrcode = qr.data.base64 || qr.data.qrcode?.base64 || null;
      } catch { /* ignore */ }
    }

    return { connected, instance: name, qrcode, status: state };
  } catch (err) {
    if (err.response?.status === 404) {
      return { connected: false, instance: name, qrcode: null, status: 'not_found' };
    }
    throw err;
  }
}

/** Desconecta (logout) e limpa instância do tenant */
async function disconnectInstance(tenantId) {
  const { rows } = await db.query(
    `SELECT whatsapp_instance FROM tenants WHERE id = $1`, [tenantId]
  );
  const name = rows[0]?.whatsapp_instance;
  if (!name) return;

  try { await evo().delete(`/instance/logout/${name}`); } catch { /* ignore */ }

  await db.query(
    `UPDATE tenants SET whatsapp_instance = NULL, updated_at = NOW() WHERE id = $1`,
    [tenantId]
  );
}

module.exports = { connectInstance, getStatus, disconnectInstance, instanceName };
