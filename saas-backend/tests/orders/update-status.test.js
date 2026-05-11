/**
 * Tests for PATCH /api/orders/:id/status
 *
 * BullMQ is mocked so the test process never touches Redis.
 * Statuses other than 'cancelled' hit the DB directly; only 'cancelled' uses
 * the queue — so the mock is only called for the cancellation path.
 */

jest.mock('../../src/queues/order.queue', () => ({
  enqueueAndWait: jest.fn(),
  getQueue: jest.fn(),
  getQueueEvents: jest.fn(),
  closeQueue: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../../src/app');
const { createTestTenant, createOrder, cleanupTenant } = require('../helpers/db');
const { makeToken } = require('../helpers/auth');
const { enqueueAndWait } = require('../../src/queues/order.queue');

let tenantId, userId, token, orderId;

beforeAll(async () => {
  const tenant = await createTestTenant({ withProducts: false });
  tenantId = tenant.tenantId;
  userId   = tenant.userId;
  token    = makeToken({ userId, tenantId });

  // Create an order we'll manipulate during the tests
  const order = await createOrder({ tenantId, status: 'pending' });
  orderId = order.id;
});

afterAll(async () => {
  await cleanupTenant(tenantId);
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PATCH /api/orders/:id/status', () => {
  it('200 — transitions pending → confirmed successfully', async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'confirmed' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('confirmed');
    expect(res.body.data.id).toBe(orderId);
  });

  it('200 — transitions confirmed → preparing successfully', async () => {
    // Order is now 'confirmed' after previous test
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'preparing' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('preparing');
  });

  it('200 — status persists to DB after update', async () => {
    // Order is now 'preparing'; advance to 'ready' and verify persistence
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ready' });

    expect(res.status).toBe(200);

    // Verify by fetching the order directly
    const getRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.status).toBe('ready');
  });

  it('404 — returns 404 for non-existent order ID', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .patch(`/api/orders/${fakeId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'confirmed' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('400 — returns 400 for invalid status value', async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'invalid_status' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('401 — returns 401 when no Authorization header is sent', async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .send({ status: 'confirmed' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('200 — cancelled status delegates to BullMQ queue', async () => {
    // Create a fresh 'pending' order for the cancellation test so it has a
    // valid state — the shared orderId is now 'ready' and can't be cancelled
    // through the normal state machine (only 'ready' → 'delivered' is allowed).
    // We mock the queue to skip actual Redis processing.
    const cancelOrder = await createOrder({ tenantId, status: 'pending' });
    const fakeResult = {
      id: cancelOrder.id,
      status: 'cancelled',
      tenant_id: tenantId,
    };
    enqueueAndWait.mockResolvedValueOnce(fakeResult);

    const res = await request(app)
      .patch(`/api/orders/${cancelOrder.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(enqueueAndWait).toHaveBeenCalledWith(
      'cancel',
      expect.objectContaining({ orderId: cancelOrder.id, tenantId })
    );
  });
});
