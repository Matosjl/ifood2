const { validationResult } = require('express-validator');
const asyncHandler         = require('../../utils/asyncHandler');
const AppError             = require('../../utils/AppError');
const service              = require('./driver.service');
const eventService         = require('../../socket/eventService');

const validate = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    throw new AppError(errors.array().map((e) => e.msg).join('. '), 422);
};

// ── Auth ──────────────────────────────────────────────────────

const register = asyncHandler(async (req, res) => {
  validate(req);
  const result = await service.register(req.body);
  res.status(201).json({ success: true, data: result });
});

const login = asyncHandler(async (req, res) => {
  validate(req);
  const result = await service.login(req.body);
  res.json({ success: true, data: result });
});

const getProfile = asyncHandler(async (req, res) => {
  const profile = await service.getProfile(req.driverId);
  const restaurants = await service.getConnectedRestaurants(req.driverId);
  res.json({ success: true, data: { ...profile, restaurants } });
});

// ── Conexão ───────────────────────────────────────────────────

const connect = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) throw new AppError('Token é obrigatório.', 400);
  const result = await service.connectToRestaurant(req.driverId, token);
  res.json({ success: true, data: result });
});

// ── Status / localização ──────────────────────────────────────

const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status) throw new AppError('Status é obrigatório.', 400);
  await service.updateStatus(req.driverId, status);
  res.json({ success: true });
});

const updateLocation = asyncHandler(async (req, res) => {
  const { lat, lng } = req.body;
  if (lat == null || lng == null) throw new AppError('lat e lng são obrigatórios.', 400);
  await service.updateLocation(req.driverId, lat, lng);
  res.json({ success: true });
});

// ── Entregas ──────────────────────────────────────────────────

const getAvailable = asyncHandler(async (req, res) => {
  const data = await service.getAvailableDeliveries(req.driverId);
  res.json({ success: true, data });
});

const getActive = asyncHandler(async (req, res) => {
  const data = await service.getActiveDeliveries(req.driverId);
  res.json({ success: true, data });
});

const accept = asyncHandler(async (req, res) => {
  const data = await service.acceptDelivery(req.driverId, req.params.orderId);
  res.status(201).json({ success: true, data });
});

const pickup = asyncHandler(async (req, res) => {
  const data = await service.confirmPickup(req.driverId, req.params.deliveryId);
  res.json({ success: true, data });
});

const markPaid = asyncHandler(async (req, res) => {
  const { paymentMethod } = req.body;
  if (!paymentMethod) throw new AppError('paymentMethod é obrigatório.', 400);
  const data = await service.markOrderPaid(req.driverId, req.params.deliveryId, paymentMethod);

  // Notifica o restaurante via Socket.io que o pagamento foi registrado
  try { eventService.orderUpdated(data.tenant_id, data); } catch (_) {}

  res.json({ success: true, data });
});

const complete = asyncHandler(async (req, res) => {
  const { orderId, tenantId } = await service.confirmDelivery(req.driverId, req.params.deliveryId);
  res.json({ success: true });

  // Notifica o restaurante via Socket.io para atualizar o kanban em tempo real
  try {
    const db = require('../../config/database');
    const { rows } = await db.query(
      `SELECT o.*,
              COALESCE(json_agg(json_build_object(
                'id', oi.id, 'product_id', oi.product_id, 'product_name', oi.product_name,
                'quantity', oi.quantity, 'weight_kg', oi.weight_kg,
                'unit_price', oi.unit_price, 'total', oi.total, 'notes', oi.notes
              ) ORDER BY oi.created_at) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
       FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = $1 GROUP BY o.id`,
      [orderId]
    );
    if (rows[0]) eventService.orderUpdated(tenantId, rows[0]);
  } catch (_) {}
});

const getStats = asyncHandler(async (req, res) => {
  const data = await service.getStats(req.driverId);
  res.json({ success: true, data });
});

const getHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const data  = await service.getHistory(req.driverId, limit);
  res.json({ success: true, data });
});

// ── Para o restaurante ────────────────────────────────────────

const getToken = asyncHandler(async (req, res) => {
  const token = await service.getTenantToken(req.user.tenantId);
  res.json({ success: true, data: { token } });
});

const getDrivers = asyncHandler(async (req, res) => {
  const data = await service.getConnectedDrivers(req.user.tenantId);
  res.json({ success: true, data });
});

const assign = asyncHandler(async (req, res) => {
  const { orderId, driverId } = req.body;
  if (!orderId || !driverId) throw new AppError('orderId e driverId são obrigatórios.', 400);
  const data = await service.assignDelivery(req.user.tenantId, orderId, driverId);

  // Notifica o motoboy via Socket.io imediatamente
  try {
    const { getEmitter } = require('../../socket/emitter');
    getEmitter().to(`driver:${driverId}`).emit('delivery:assigned', {
      deliveryId: data.id,
      orderId,
      message: 'Você foi atribuído a uma entrega!',
      timestamp: new Date().toISOString(),
    });
  } catch (_) {}

  res.status(201).json({ success: true, data });
});

module.exports = {
  register, login, getProfile,
  connect, updateStatus, updateLocation,
  getAvailable, getActive, accept, pickup, markPaid, complete,
  getStats, getHistory,
  getToken, getDrivers, assign,
};
