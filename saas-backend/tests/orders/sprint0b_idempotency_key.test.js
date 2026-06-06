/**
 * Sprint 0B — B3: idempotency_key única por tenant (não global)
 *
 * Garante que:
 *  - Mesmo idempotency_key em tenants DIFERENTES → permitido
 *  - Mesmo idempotency_key no MESMO tenant → viola constraint (unique por tenant)
 */

const db = require('../../src/config/database');
const { createTestTenant, cleanupTenant } = require('../helpers/db');

let tenantA, tenantB;

beforeAll(async () => {
  [tenantA, tenantB] = await Promise.all([
    createTestTenant(),
    createTestTenant(),
  ]);
});

afterAll(async () => {
  await Promise.all([
    cleanupTenant(tenantA.tenantId),
    cleanupTenant(tenantB.tenantId),
  ]);
});

const insertOrderWithKey = async (tenantId, userId, key, orderNum) =>
  db.query(
    `INSERT INTO orders
       (tenant_id, order_number, status, total, channel, payment_method, delivery_type, idempotency_key)
     VALUES ($1, $2, 'pending', 10.00, 'manual', 'cash', 'pickup', $3)`,
    [tenantId, orderNum, key]
  );

describe('B3 — uq_orders_idem_per_tenant', () => {
  it('permite mesmo idempotency_key em tenants diferentes', async () => {
    const sharedKey = `shared-key-${Date.now()}`;

    await expect(insertOrderWithKey(tenantA.tenantId, tenantA.userId, sharedKey, 9001))
      .resolves.not.toThrow();

    await expect(insertOrderWithKey(tenantB.tenantId, tenantB.userId, sharedKey, 9001))
      .resolves.not.toThrow();
  });

  it('bloqueia idempotency_key duplicado no mesmo tenant', async () => {
    const sameKey = `dup-key-${Date.now()}`;

    await expect(insertOrderWithKey(tenantA.tenantId, tenantA.userId, sameKey, 9002))
      .resolves.not.toThrow();

    await expect(insertOrderWithKey(tenantA.tenantId, tenantA.userId, sameKey, 9003))
      .rejects.toMatchObject({ code: '23505' }); // unique_violation
  });

  it('permite NULL em idempotency_key sem restrição (não entra no índice parcial)', async () => {
    await expect(
      db.query(
        `INSERT INTO orders
           (tenant_id, order_number, status, total, channel, payment_method, delivery_type, idempotency_key)
         VALUES ($1, 9004, 'pending', 5.00, 'manual', 'cash', 'pickup', NULL)`,
        [tenantA.tenantId]
      )
    ).resolves.not.toThrow();

    await expect(
      db.query(
        `INSERT INTO orders
           (tenant_id, order_number, status, total, channel, payment_method, delivery_type, idempotency_key)
         VALUES ($1, 9005, 'pending', 5.00, 'manual', 'cash', 'pickup', NULL)`,
        [tenantA.tenantId]
      )
    ).resolves.not.toThrow();
  });
});
