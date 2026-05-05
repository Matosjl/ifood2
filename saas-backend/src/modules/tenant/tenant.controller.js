const db           = require('../../config/database');
const service      = require('./tenant.service');
const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');

/** GET /api/tenant/me */
const getMe = asyncHandler(async (req, res) => {
  const tenant = await service.getMyTenant(req.user.tenantId);
  res.json({ success: true, data: tenant });
});

/** PUT /api/tenant/plan — body: { plan: 'basic' | 'pro' | 'premium' } */
const updatePlan = asyncHandler(async (req, res) => {
  const { plan } = req.body;
  if (!plan) throw new AppError('Campo "plan" e obrigatorio.', 400);
  const tenant = await service.changePlan(req.user.tenantId, plan, req.user.role);
  res.json({ success: true, data: tenant });
});

/**
 * PUT /api/tenant/profile
 * Body: { name }
 * Atualiza o nome do restaurante (owner only).
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) throw new AppError('Nome do restaurante é obrigatório.', 400);

  const { rows } = await db.query(
    `UPDATE tenants
     SET name = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, slug`,
    [req.user.tenantId, name.trim()]
  );
  if (!rows[0]) throw new AppError('Restaurante não encontrado.', 404);

  res.json({ success: true, data: rows[0] });
});

module.exports = { getMe, updatePlan, updateProfile };
