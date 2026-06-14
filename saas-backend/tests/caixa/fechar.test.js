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
    // cash: expected=100 (troco), counted=50 → diff -50
    // card: expected=0, counted=30 → diff +30
    // pix:  expected=0, counted=20 → diff +20
    // discrepancy = -50 + 30 + 20 = 0 (per-method formula, not totalCounted-revenue)
    expect(parseFloat(data.discrepancy)).toBeCloseTo(0, 2);
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

  // ───────────────────────────────────────────────────────────────
  // Costura 4 — saída rápida descontada do esperado em dinheiro
  // ───────────────────────────────────────────────────────────────
  const openRegisterId = async () => {
    const { rows } = await db.query(
      `SELECT id FROM cash_registers WHERE tenant_id = $1 AND status = 'open' LIMIT 1`,
      [tenantId]
    );
    return rows[0]?.id;
  };

  const psOf = (data) =>
    typeof data.payment_summary === 'string'
      ? JSON.parse(data.payment_summary)
      : data.payment_summary;

  it('200 — C4: desconta saída rápida do esperado (happy path, diff 0)', async () => {
    await openCashRegister(tenantId, userId, 100); // troco inicial
    await createOrder({ tenantId, status: 'delivered', paymentMethod: 'cash',
      items: [{ price: 50.00, qty: 1, name: 'Produto A' }] });

    // saída rápida R$20 com categoria (Costura 3)
    await request(app)
      .post('/api/caixa/saida-rapida')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 20, categoria: 'gas', reason: 'compra de gás' })
      .expect(201);

    // esperado = 100 + 50 − 20 = 130 → contar 130 → diff 0
    const res = await request(app)
      .post('/api/caixa/close')
      .set('Authorization', `Bearer ${token}`)
      .send({ cashCounted: 130, cardCounted: 0, pixCounted: 0 });

    expect(res.status).toBe(200);
    const ps = psOf(res.body.data);
    expect(parseFloat(ps.expected_cash)).toBeCloseTo(130, 2);
    expect(parseFloat(ps.saidas_rapidas)).toBeCloseTo(20, 2);
    expect(parseFloat(res.body.data.discrepancy)).toBeCloseTo(0, 2);
  });

  it('200 — C4: saída rápida + quebra real (diff −10)', async () => {
    await openCashRegister(tenantId, userId, 100);
    await createOrder({ tenantId, status: 'delivered', paymentMethod: 'cash',
      items: [{ price: 50.00, qty: 1, name: 'Produto A' }] });

    await request(app)
      .post('/api/caixa/saida-rapida')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 20, categoria: 'gas' })
      .expect(201);

    // esperado 130, conta 120 → quebra real −10 (não falsa)
    const res = await request(app)
      .post('/api/caixa/close')
      .set('Authorization', `Bearer ${token}`)
      .send({ cashCounted: 120, cardCounted: 0, pixCounted: 0 });

    expect(res.status).toBe(200);
    expect(parseFloat(res.body.data.discrepancy)).toBeCloseTo(-10, 2);
  });

  it('200 — C4 regressão: sem saída rápida o esperado é troco+vendas (Costura 1 intacta)', async () => {
    await openCashRegister(tenantId, userId, 100);
    await createOrder({ tenantId, status: 'delivered', paymentMethod: 'cash',
      items: [{ price: 50.00, qty: 1, name: 'Produto A' }] });

    // sem saída → esperado 150 → contar 150 → diff 0
    const res = await request(app)
      .post('/api/caixa/close')
      .set('Authorization', `Bearer ${token}`)
      .send({ cashCounted: 150, cardCounted: 0, pixCounted: 0 });

    expect(res.status).toBe(200);
    const ps = psOf(res.body.data);
    expect(parseFloat(ps.expected_cash)).toBeCloseTo(150, 2);
    expect(parseFloat(ps.saidas_rapidas)).toBeCloseTo(0, 2);
    expect(parseFloat(res.body.data.discrepancy)).toBeCloseTo(0, 2);
  });

  it('200 — C4: fiado-em-dinheiro soma e saída rápida subtrai (termos independentes)', async () => {
    await openCashRegister(tenantId, userId, 100);
    const regId = await openRegisterId();

    // fiado recebido em dinheiro R$30 (espelho do que a Costura 2 grava)
    await db.query(
      `INSERT INTO caixa_movements (tenant_id, cash_register_id, type, amount, reason, created_by)
       VALUES ($1, $2, 'fiado_recebido', 30, 'baixa fiado teste', $3)`,
      [tenantId, regId, userId]
    );
    // saída rápida R$20
    await request(app)
      .post('/api/caixa/saida-rapida')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 20, categoria: 'gas' })
      .expect(201);

    // esperado = 100 + 0 vendas + 30 fiado − 20 saída = 110
    const res = await request(app)
      .post('/api/caixa/close')
      .set('Authorization', `Bearer ${token}`)
      .send({ cashCounted: 110, cardCounted: 0, pixCounted: 0 });

    expect(res.status).toBe(200);
    const ps = psOf(res.body.data);
    expect(parseFloat(ps.expected_cash)).toBeCloseTo(110, 2);
    expect(parseFloat(ps.fiado_recebido)).toBeCloseTo(30, 2);
    expect(parseFloat(ps.saidas_rapidas)).toBeCloseTo(20, 2);
    expect(parseFloat(res.body.data.discrepancy)).toBeCloseTo(0, 2);
  });

  // ───────────────────────────────────────────────────────────────
  // Costura 5 — alerta por método individual (net zero não esconde furo)
  // ───────────────────────────────────────────────────────────────
  // afterTime isola cada teste: só incidentes criados APÓS o início deste teste
  const waitIncident = async (type, maxMs = 1500, afterTime = new Date()) => {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const { rows } = await db.query(
        `SELECT id, cost FROM operational_incidents
         WHERE tenant_id = $1 AND type = $2 AND created_at > $3
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId, type, afterTime]
      );
      if (rows[0]) return rows[0];
      await new Promise(r => setTimeout(r, 100));
    }
    return null;
  };

  it('200 — C5: divergência por método com net 0 AINDA gera incidente', async () => {
    const before = new Date();
    await openCashRegister(tenantId, userId, 100);
    // sem pedidos: esperado cash=100, card=0, pix=0
    // contar 50/30/20 → cashDiff -50, cardDiff +30, pixDiff +20 → net 0
    const res = await request(app)
      .post('/api/caixa/close')
      .set('Authorization', `Bearer ${token}`)
      .send({ cashCounted: 50, cardCounted: 30, pixCounted: 20 });

    expect(res.status).toBe(200);
    const ps = psOf(res.body.data);
    expect(parseFloat(res.body.data.discrepancy)).toBeCloseTo(0, 2);   // net continua 0
    expect(parseFloat(ps.cash_diff)).toBeCloseTo(-50, 2);
    expect(parseFloat(ps.card_diff)).toBeCloseTo(30, 2);
    expect(parseFloat(ps.pix_diff)).toBeCloseTo(20, 2);

    const inc = await waitIncident('cash_difference', 1500, before);
    expect(inc).not.toBeNull();                         // ANTES da C5 isto seria null
    expect(parseFloat(inc.cost)).toBeCloseTo(100, 2);   // exposição = |−50|+|30|+|20|
  });

  it('200 — C5: fechamento perfeito (todos os métodos batem) NÃO gera incidente', async () => {
    const before = new Date();
    await openCashRegister(tenantId, userId, 100);
    const res = await request(app)
      .post('/api/caixa/close')
      .set('Authorization', `Bearer ${token}`)
      .send({ cashCounted: 100, cardCounted: 0, pixCounted: 0 });

    expect(res.status).toBe(200);
    expect(parseFloat(res.body.data.discrepancy)).toBeCloseTo(0, 2);

    const inc = await waitIncident('cash_difference', 800, before);
    expect(inc).toBeNull();
  });
});
