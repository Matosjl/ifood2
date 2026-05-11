/**
 * Tests for POST /api/caixa/close
 *
 * Each test manages its own cash register state. BullMQ is mocked because
 * the orders module imports the queue at module-load time, and we don't want
 * any Redis connections during this test suite.
 */

jest.mock('../../src/queues/order.queue', () => ({
  enqueueAndWait: jest.fn(),
  getQueue: jest.fn(),
  getQueueEvents: jest.fn(),
  closeQueue: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/database');
const {
  createTestTenant,
  openCashRegister,
  createOrder,
  cleanupTenant,
} = require('../helpers/db');
const { makeToken } = require('../helpers/auth');

let tenantId, userId, token;

beforeAll(async () => {
  const tenant = await createTestTenant({ withProducts: false });
  tenantId = tenant.tenantId;
  userId   = tenant.userId;
  token    = makeToken({ userId, tenantId });
});

afterAll(async () => {
  await cleanupTenant(tenantId);
});

// Helper: ensure there is no open cash register for the tenant before each test
const closeAnyOpenRegister = async () => {
  await db.query(
    `UPDATE cash_registers SET status = 'closed', closed_at = NOW()
     WHERE tenant_id = $1 AND status = 'open'`,
    [tenantId]
  );
};

describe('POST /api/caixa/close', () => {
  beforeEach(async () => {
    await closeAnyOpenRegister();
  });

  it('200 — closes the cash register and returns correct discrepancy (zero orders)', async () => {
    // Open a new register (no orders → system revenue = 0)
    await openCashRegister(tenantId, userId, 100);

    const res = await request(app)
      .post('/api/caixa/close')
      .set('Authorization', `Bearer ${token}`)
      .send({ cashCounted: 50, cardCounted: 30, pixCounted: 20 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.status).toBe('closed');
    // totalCounted = 50 + 30 + 20 = 100; system revenue = 0 → discrepancy = 100
    expect(parseFloat(data.discrepancy)).toBeCloseTo(100, 2);
    expect(parseFloat(data.cash_counted)).toBeCloseTo(50, 2);
    expect(parseFloat(data.card_counted)).toBeCloseTo(30, 2);
    expect(parseFloat(data.pix_counted)).toBeCloseTo(20, 2);
  });

  it('200 — detects positive discrepancy (counted > system revenue)', async () => {
    // Open register and create a delivered order worth R$40 (cash)
    await openCashRegister(tenantId, userId, 0);
    await createOrder({ tenantId, status: 'delivered', paymentMethod: 'cash',
      items: [{ price: 40.00, qty: 1, name: 'Produto A' }] });

    // Operator counts R$60 in cash — R$20 surplus
    const res = await request(app)
      .post('/api/caixa/close')
      .set('Authorization', `Bearer ${token}`)
      .send({ cashCounted: 60, cardCounted: 0, pixCounted: 0 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.status).toBe('closed');
    // system revenue = 40 (delivered order); counted = 60 → discrepancy = +20
    expect(parseFloat(data.discrepancy)).toBeCloseTo(20, 2);
  });

  it('400 — returns 400 when all count values are omitted', async () => {
    await openCashRegister(tenantId, userId, 0);

    const res = await request(app)
      .post('/api/caixa/close')
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'forgot to count' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('404 — returns 404 when no cash register is open', async () => {
    // closeAnyOpenRegister() in beforeEach already closed everything
    const res = await request(app)
      .post('/api/caixa/close')
      .set('Authorization', `Bearer ${token}`)
      .send({ cashCounted: 0, cardCounted: 0, pixCounted: 0 });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
