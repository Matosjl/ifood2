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
const db = require('../../src/config/database');
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

  // D1 delivery tests: uma zona paga (fee=8) e uma grátis (fee=0).
  // A zona grátis é necessária para que deliveryFee=0 passe no guard de frete grátis
  // do public.controller (linha: fee===0 && !zones.some(z => parseFloat(z.fee)===0)).
  await db.query(
    `UPDATE tenants SET delivery_zones = $1 WHERE id = $2`,
    [JSON.stringify([
      { name: 'Zona Paga',   fee: '8.00' },
      { name: 'Zona Grátis', fee: '0.00' },
    ]), tenantId]
  );
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

  it('D1 — delivery com deliveryFee=0 (frete grátis) é aceito → 201', async () => {
    // fee=0 é VÁLIDO quando existe zona grátis configurada no tenant.
    // O guard do public.controller só rejeita fee=0 quando NENHUMA zona tem fee=0.
    // Não confundir com "fee ausente" (undefined → 400).
    const res = await request(app)
      .post(`/api/public/${slug}/orders`)
      .send({
        customerName:    'Cliente Frete Grátis',
        customerAddress: 'Rua das Flores 456',
        deliveryType:    'delivery',
        deliveryFee:     0,
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

  it('D1 — delivery sem deliveryFee retorna 400 (backend bloqueia taxa não calculada)', async () => {
    // deliveryFee ausente para delivery → backend rejeita com 400.
    // O frontend (CustomerApp.jsx) nunca deixa chegar aqui, mas o backend defende ativamente.
    const res = await request(app)
      .post(`/api/public/${slug}/orders`)
      .send({
        customerName:    'Cliente Sem Taxa',
        customerAddress: 'Rua X 1',
        deliveryType:    'delivery',
        // deliveryFee omitido — deve ser rejeitado
        items: [{ productId: 'some-product-id', quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(enqueueAndWait).not.toHaveBeenCalled();
  });
});
