const asyncHandler = require('../../utils/asyncHandler');
const service      = require('./reservations.service');

const list   = asyncHandler(async (req, res) => {
  const data = await service.list(req.user.tenantId, {
    date:   req.query.date,
    status: req.query.status,
  });
  res.json({ success: true, data });
});

const create = asyncHandler(async (req, res) => {
  const data = await service.create(req.user.tenantId, req.body);
  res.status(201).json({ success: true, data });
});

const update = asyncHandler(async (req, res) => {
  const prev = req.body._prevStatus;
  const data = await service.update(req.params.id, req.user.tenantId, req.body);

  // Send WhatsApp if status changed to confirmed
  if (req.body.status === 'confirmed' && prev !== 'confirmed') {
    service.sendConfirmation(req.user.tenantId, data).catch(() => {});
  }

  res.json({ success: true, data });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user.tenantId);
  res.json({ success: true });
});

module.exports = { list, create, update, remove };
