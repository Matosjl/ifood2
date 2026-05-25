const asyncHandler = require('../../utils/asyncHandler');
const service      = require('./promotions.service');

const list    = asyncHandler(async (req, res) => {
  const data = await service.list(req.user.tenantId);
  res.json({ success: true, data });
});

const create  = asyncHandler(async (req, res) => {
  const data = await service.create(req.user.tenantId, req.body);
  res.status(201).json({ success: true, data });
});

const update  = asyncHandler(async (req, res) => {
  const data = await service.update(req.params.id, req.user.tenantId, req.body);
  res.json({ success: true, data });
});

const remove  = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user.tenantId);
  res.json({ success: true });
});

// Public endpoint — returns active promotions for a tenant by slug
const getActive = asyncHandler(async (req, res) => {
  const { rows } = await require('../../config/database').query(
    `SELECT id FROM tenants WHERE slug = $1 AND active = true`,
    [req.params.slug]
  );
  if (!rows[0]) return res.json({ success: true, data: [] });
  const data = await service.getActive(rows[0].id);
  res.json({ success: true, data });
});

module.exports = { list, create, update, remove, getActive };
