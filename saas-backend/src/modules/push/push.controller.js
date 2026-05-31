'use strict';
const asyncHandler = require('../../utils/asyncHandler');
const svc          = require('./push.service');
const env          = require('../../config/env');

/** GET /api/push/vapid-key — retorna a chave pública VAPID */
const getVapidKey = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { publicKey: env.VAPID_PUBLIC_KEY || null } });
});

/** POST /api/push/subscribe — salva assinatura do dispositivo */
const subscribePush = asyncHandler(async (req, res) => {
  const { subscription, deviceLabel } = req.body;
  if (!subscription?.endpoint) {
    return res.status(400).json({ success: false, message: 'Subscription inválida.' });
  }
  await svc.subscribe(req.user.tenantId, req.user.userId, subscription, deviceLabel);
  const devices = await svc.countDevices(req.user.tenantId);
  res.json({ success: true, data: { devices } });
});

/** DELETE /api/push/subscribe — remove assinatura */
const unsubscribePush = asyncHandler(async (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) await svc.unsubscribe(endpoint);
  res.json({ success: true });
});

/** GET /api/push/status — quantos dispositivos inscritos */
const getStatus = asyncHandler(async (req, res) => {
  const devices = await svc.countDevices(req.user.tenantId);
  res.json({ success: true, data: { devices, vapidConfigured: !!env.VAPID_PUBLIC_KEY } });
});

module.exports = { getVapidKey, subscribePush, unsubscribePush, getStatus };
