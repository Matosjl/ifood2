/**
 * Tests for POST /api/public/:slug/orders
 *
 * The BullMQ order queue is mocked to prevent Redis connections.
 * enqueueAndWait is configured per test to return a fake order or throw.
 */

jest.mock('../../src/queues/order.queue', () => ({
  enqueueAndWait: jest.fn(),
  getQueue: jest.fn(),
  getQueueEvents: jest.fn(),
  closeQueue: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../../src/app');
const { createTestTenant, cleanupTenant } = require('../helpers/db');
const { enqueueAndWait } = require('../../src/queues/order.queue');

let tenantId, slug;

// A minimal fake order that mimics what the worker returns
const makeFakeOrder = (overrides = {}) => ({
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  order_number: 1,
  status: 'pending',
  total: 33.00,
  customer_name: 'João Teste',
  channel: 'online',
  created_at: new Date().toISOString(),
  items: [],
  ...overrides,
});

beforeAll(async () => {
  const tenant = await createTestTenant({ withProducts: true });
  tenantId = tenant.tenantId;
  slug     = tenant.slug;
});

afterAll(async () => {
  await cleanupTenant(tenantId);
});

beforeEach(() => {
  jest.clearAllMocks();
  // Default: queue succeeds and returns a fake order
  enqueueAndWait.mockResolvedValue(makeFakeOrder());
});

describe('POST /api/public/:slug/orders', () => {
  it('201 — creates an order successfully with valid payload', async () => {
    const res = await request(app)
      .post(`/api/public/${slug}/orders`)
      .send({
        customerName: 'João Teste',
        customerPhone: '11999999999',
        deliveryType: 'pickup',
        items: [{ productId: 'some-product-id', quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(enqueueAndWait).toHaveBeenCalledTimes(1);
    expect(enqueueAndWait).toHaveBeenCalledWith(
      'create',
      expect.objectContaining({
        tenantId,
        isOnline: true,
        payload: expect.objectContaining({ customerName: 'João Teste' }),
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
  });

  it('400 — returns 400 when items array is empty', async () => {
    const res = await request(app)
      .post(`/api/public/${slug}/orders`)
      .send({
        customerName: 'João Teste',
        items: [],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // enqueueAndWait should NOT be called when validation fails
    expect(enqueueAndWait).not.toHaveBeenCalled();
  });

  it('400 — returns 400 when customerName is missing', async () => {
    const res = await request(app)
      .post(`/api/public/${slug}/orders`)
      .send({
        items: [{ productId: 'some-product-id', quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(enqueueAndWait).not.toHaveBeenCalled();
  });

  it('404 — returns 404 for an unknown restaurant slug', async () => {
    const res = await request(app)
      .post('/api/public/slug-that-does-not-exist-xyz/orders')
      .send({
        customerName: 'João Teste',
        items: [{ productId: 'some-product-id', quantity: 1 }],
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(enqueueAndWait).not.toHaveBeenCalled();
  });

  // ── D1: deliveryFee deve chegar ao worker ─────────────────────

  it('D1 — delivery com deliveryFee=8 repassa taxa ao worker', async () => {
    const res = await request(app)
      .post(`/api/public/${slug}/orders`)
      .send({
        customerName:    'Cliente Delivery',
        customerAddress: 'Rua das Flores 123',
        deliveryType:    'delivery',
        deliveryFee:     8,
        items: [{ productId: 'some-product-id', quantity: 1 }],
      });

    expect(res.status).toBe(201);
    // Worker deve receber deliveryFee=8 no payload
    expect(enqueueAndWait).toHaveBeenCalledWith(
      'create',
      expect.objectContaining({
        payload: expect.objectContaining({ deliveryFee: 8 }),
      }),
      expect.any(Object)
    );
  });

  it('D1 — pickup força deliveryFee=0 mesmo se frontend enviar outro valor', async () => {
    const res = await request(app)
      .post(`/api/public/${slug}/orders`)
      .send({
        customerName: 'Cliente Retirada',
        deliveryType: 'pickup',
        deliveryFee:  99,   // valor malicioso — deve ser ignorado
        items: [{ productId: 'some-product-id', quantity: 1 }],
      });

    expect(res.status).toBe(201);
    // Worker deve receber deliveryFee=0 para pickup independente do que veio
    expect(enqueueAndWait).toHaveBeenCalledWith(
      'create',
      expect.objectContaining({
        payload: expect.objectContaining({ deliveryFee: 0 }),
      }),
      expect.any(Object)
    );
  });

  it('D1 — delivery sem deliveryFee no payload grava 0 (comportamento legado documentado)', async () => {
    // Este teste documenta o comportamento sem o guard do frontend:
    // se deliveryFee não vier, o backend grava 0.
    // O guard no CustomerApp.jsx bloqueia este caminho no cardápio digital.
    const res = await request(app)
      .post(`/api/public/${slug}/orders`)
      .send({
        customerName:    'Cliente Sem Taxa',
        customerAddress: 'Rua X 1',
        deliveryType:    'delivery',
        // deliveryFee omitido intencionalmente
        items: [{ productId: 'some-product-id', quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect(enqueueAndWait).toHaveBeenCalledWith(
      'create',
      expect.objectContaining({
        payload: expect.objectContaining({ deliveryFee: 0 }),
      }),
      expect.any(Object)
    );
  });
});
