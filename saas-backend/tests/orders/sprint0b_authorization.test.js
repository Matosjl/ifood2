/**
 * Sprint 0B — A6: Testes de autorização para cancelamento via PATCH /status
 *
 * Garante que:
 *  - role=attendant NÃO pode cancelar via PATCH /status → 403
 *  - role=owner PODE cancelar → enfileira cancel
 *  - role=manager PODE cancelar → enfileira cancel
 */

jest.mock('../../src/queues/order.queue', () => ({
  enqueueAndWait: jest.fn(),
  getQueue:       jest.fn(),
  getQueueEvents: jest.fn(),
  closeQueue:     jest.fn().mockResolvedValue(undefined),
}));

const request        = require('supertest');
const app            = require('../../src/app');
const db             = require('../../src/config/database');
const { createTestTenant, createOrder, cleanupTenant } = require('../helpers/db');
const { makeToken }  = require('../helpers/auth');
const { enqueueAndWait } = require('../../src/queues/order.queue');

let tenantId, userId, orderId;

beforeAll(async () => {
  const tenant = await createTestTenant({ withProducts: false });
  tenantId = tenant.tenantId;
  userId   = tenant.userId;
});

afterAll(async () => {
  await cleanupTenant(tenantId);
});

beforeEach(async () => {
  jest.clearAllMocks();
  // Cria novo pedido para cada teste (cada cancelamento consome o pedido)
  const order = await createOrder({ tenantId, status: 'pending' });
  orderId = order.id;
});

describe('A6 — PATCH /api/orders/:id/status → cancelled', () => {
  it('403 — role=attendant não pode cancelar', async () => {
    const token = makeToken({ userId, tenantId, role: 'attendant' });

    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(enqueueAndWait).not.toHaveBeenCalled();
  });

  it('200 — role=owner pode cancelar', async () => {
    enqueueAndWait.mockResolvedValueOnce({ id: orderId, status: 'cancelled' });
    const token = makeToken({ userId, tenantId, role: 'owner' });

    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'cancelled', cancelReason: 'teste' });

    expect(res.status).toBe(200);
    expect(enqueueAndWait).toHaveBeenCalledWith('cancel', expect.objectContaining({
      orderId, tenantId,
    }));
  });

  it('200 — role=manager pode cancelar', async () => {
    enqueueAndWait.mockResolvedValueOnce({ id: orderId, status: 'cancelled' });
    const token = makeToken({ userId, tenantId, role: 'manager' });

    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(enqueueAndWait).toHaveBeenCalled();
  });

  it('200 — role=attendant pode mudar status para preparing (não cancelamento)', async () => {
    const token = makeToken({ userId, tenantId, role: 'attendant' });

    // Confirma o pedido primeiro
    await db.query(
      `UPDATE orders SET status = 'confirmed' WHERE id = $1`, [orderId]
    );

    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'preparing' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('preparing');
  });
});
