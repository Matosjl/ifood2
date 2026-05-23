const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');
const db           = require('../../config/database');

// ── iFood config ──────────────────────────────────────────────

/** GET /api/integrations/ifood/config */
const getIfoodConfig = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT ifood_client_id, ifood_merchant_id,
            CASE WHEN ifood_client_secret IS NOT NULL
                 THEN '***' || RIGHT(ifood_client_secret, 4) END AS ifood_client_secret
     FROM tenants WHERE id = $1`,
    [req.user.tenantId]
  );
  res.json({ success: true, data: rows[0] ?? null });
});

/** PUT /api/integrations/ifood/config */
const saveIfoodConfig = asyncHandler(async (req, res) => {
  const { clientId, clientSecret, merchantId } = req.body;
  if (!clientId?.trim() || !merchantId?.trim())
    throw new AppError('clientId e merchantId são obrigatórios.', 400);

  // Se secret vier mascarado, mantém o atual
  const secretUpdate = clientSecret && !clientSecret.startsWith('***')
    ? `ifood_client_secret = $4,` : '';

  const params = [req.user.tenantId, clientId.trim(), merchantId.trim()];
  if (secretUpdate) params.push(clientSecret.trim());

  await db.query(
    `UPDATE tenants
     SET ifood_client_id   = $2,
         ifood_merchant_id = $3,
         ${secretUpdate}
         updated_at = NOW()
     WHERE id = $1`,
    params
  );
  res.json({ success: true, message: 'Configuração iFood salva.' });
});

/** DELETE /api/integrations/ifood/config — desconecta */
const disconnectIfood = asyncHandler(async (req, res) => {
  await db.query(
    `UPDATE tenants
     SET ifood_client_id = NULL, ifood_client_secret = NULL, ifood_merchant_id = NULL
     WHERE id = $1`,
    [req.user.tenantId]
  );
  res.json({ success: true, message: 'iFood desconectado.' });
});

/** POST /api/integrations/ifood/sync — sincroniza agora (forçado) */
const syncIfoodNow = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, ifood_client_id, ifood_client_secret FROM tenants WHERE id = $1`,
    [req.user.tenantId]
  );
  const tenant = rows[0];
  if (!tenant?.ifood_client_id) throw new AppError('iFood não configurado.', 400);

  const { syncTenant } = require('./ifood.service');
  await syncTenant(tenant);
  res.json({ success: true, message: 'Sincronização concluída.' });
});

module.exports = { getIfoodConfig, saveIfoodConfig, disconnectIfood, syncIfoodNow };
