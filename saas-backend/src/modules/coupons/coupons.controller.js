'use strict';
const service      = require('./coupons.service');
const asyncHandler = require('../../utils/asyncHandler');

const list     = asyncHandler(async (req, res) => {
  const coupons = await service.listCoupons(req.user.tenantId);
  res.json({ success: true, data: coupons });
});

const create   = asyncHandler(async (req, res) => {
  const coupon = await service.createCoupon(req.user.tenantId, req.body);
  res.status(201).json({ success: true, data: coupon });
});

const update   = asyncHandler(async (req, res) => {
  const coupon = await service.updateCoupon(req.user.tenantId, req.params.id, req.body);
  res.json({ success: true, data: coupon });
});

const validate = asyncHandler(async (req, res) => {
  const { code, orderTotal } = req.body;
  if (!code) throw new (require('../../utils/AppError'))('Código do cupom é obrigatório.', 400);
  const result = await service.validateCoupon(req.user.tenantId, code, orderTotal ?? 0);
  res.json({ success: true, data: result });
});

module.exports = { list, create, update, validate };
