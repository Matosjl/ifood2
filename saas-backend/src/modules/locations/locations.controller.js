const asyncHandler = require('../../utils/asyncHandler');
const service      = require('./locations.service');

const list = asyncHandler(async (req, res) => {
  const data = await service.listLocations(req.user.tenantId);
  res.json({ success: true, data });
});

const getOne = asyncHandler(async (req, res) => {
  const loc = await service.getLocation(req.user.tenantId, req.params.id);
  if (!loc) return res.status(404).json({ success: false, message: 'Filial não encontrada.' });
  res.json({ success: true, data: loc });
});

const create = asyncHandler(async (req, res) => {
  const loc = await service.createLocation(req.user.tenantId, req.body);
  res.status(201).json({ success: true, data: loc });
});

const update = asyncHandler(async (req, res) => {
  const loc = await service.updateLocation(req.user.tenantId, req.params.id, req.body);
  res.json({ success: true, data: loc });
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteLocation(req.user.tenantId, req.params.id);
  res.json({ success: true });
});

module.exports = { list, getOne, create, update, remove };
