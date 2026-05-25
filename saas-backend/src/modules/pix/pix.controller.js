const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');
const pixService   = require('./pix.service');

// GET /api/pix/config
const getConfig = asyncHandler(async (req, res) => {
  const appId = await pixService.getConfig(req.user.tenantId);
  // Mask the app ID — show only last 6 chars
  const masked = appId ? `***${appId.slice(-6)}` : null;
  res.json({ success: true, data: { appId: masked, configured: Boolean(appId) } });
});

// PUT /api/pix/config
const saveConfig = asyncHandler(async (req, res) => {
  const { appId } = req.body;

  // If the frontend sends the masked value back, preserve the existing key
  let finalAppId = appId;
  if (appId && appId.startsWith('***')) {
    finalAppId = await pixService.getConfig(req.user.tenantId);
  }

  const result = await pixService.saveConfig(req.user.tenantId, finalAppId);
  res.json({ success: true, data: result });
});

// POST /api/pix/orders/:id/charge — generate QR code for an order
const generateCharge = asyncHandler(async (req, res) => {
  const result = await pixService.generatePixCharge(req.user.tenantId, req.params.id);
  res.json({ success: true, data: result });
});

// GET /api/pix/orders/:id/status — check if paid
const chargeStatus = asyncHandler(async (req, res) => {
  const result = await pixService.getChargeStatus(req.user.tenantId, req.params.id);
  res.json({ success: true, data: result });
});

// POST /api/pix/webhook — OpenPix sends events here (no auth middleware)
const webhook = async (req, res) => {
  try {
    const rawBody    = JSON.stringify(req.body); // already parsed by express
    const signature  = req.headers['x-webhook-signature'] ?? req.headers['x-openpix-signature'] ?? '';
    const secret     = process.env.OPENPIX_WEBHOOK_SECRET ?? '';

    const result = await pixService.handleWebhook(rawBody, signature, secret);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[PIX webhook] erro:', err.message);
    res.status(err.statusCode ?? 500).json({ success: false, message: err.message });
  }
};

module.exports = { getConfig, saveConfig, generateCharge, chargeStatus, webhook };
