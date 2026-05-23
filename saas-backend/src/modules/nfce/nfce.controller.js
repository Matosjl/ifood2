const asyncHandler = require('../../utils/asyncHandler');
const service      = require('./nfce.service');

/** GET /api/nfce/config */
const getConfig = asyncHandler(async (req, res) => {
  const config = await service.getConfig(req.user.tenantId);
  // Mascara a API key antes de enviar ao frontend
  const safe = config
    ? { ...config, apiKey: config.apiKey ? '***' + config.apiKey.slice(-4) : null }
    : null;
  res.json({ success: true, data: safe });
});

/** PUT /api/nfce/config */
const saveConfig = asyncHandler(async (req, res) => {
  const { apiKey, companyId, environment, defaultNcm, cfop } = req.body;

  // Se apiKey vier mascarada, mantém a atual
  let existing = await service.getConfig(req.user.tenantId);
  const finalApiKey = (apiKey && !apiKey.startsWith('***'))
    ? apiKey.trim()
    : (existing?.apiKey ?? null);

  const config = {
    apiKey:      finalApiKey,
    companyId:   companyId?.trim() || null,
    environment: environment || 'Homologation',
    defaultNcm:  defaultNcm?.trim() || '21069090',
    cfop:        cfop?.trim() || '5102',
  };

  await service.saveConfig(req.user.tenantId, config);
  res.json({ success: true, data: { ...config, apiKey: config.apiKey ? '***' + config.apiKey.slice(-4) : null } });
});

/** POST /api/nfce/orders/:id/issue */
const issue = asyncHandler(async (req, res) => {
  const result = await service.issueNfce(req.user.tenantId, req.params.id);
  res.json({ success: true, data: result });
});

/** GET /api/nfce/orders/:id/status */
const status = asyncHandler(async (req, res) => {
  const result = await service.checkNfce(req.user.tenantId, req.params.id);
  res.json({ success: true, data: result });
});

module.exports = { getConfig, saveConfig, issue, status };
