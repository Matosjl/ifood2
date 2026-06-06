/**
 * Sprint 0B — A5: deductForOrder usa weight_kg quando produto é por kg
 *
 * Garante que:
 *  - Produto por kg com weight_kg=2.5 → deduz 2.5× a ficha técnica
 *  - Cancelamento de produto por kg → devolve 2.5×
 *  - Produto por unidade (weight_kg=null) → comportamento inalterado
 */

const db                = require('../../src/config/database');
const { deductForOrder, revertForOrder } = require('../../src/modules/insumos/insumos.service');
const { createTestTenant, cleanupTenant } = require('../helpers/db');

let tenantId, userId;
let insumoId, productId, orderIdKg, orderIdUnit;

beforeAll(async () => {
  const tenant = await createTestTenant({ withProducts: false });
  tenantId = tenant.tenantId;
  userId   = tenant.userId;

  // Cria insumo com estoque 100
  const { rows: [ins] } = await db.query(
    `INSERT INTO insumos (tenant_id, name, unit, qty_in_stock, cost_per_unit)
     VALUES ($1, 'Farinha', 'kg', 100, 5.00) RETURNING id`,
    [tenantId]
  );
  insumoId = ins.id;

  // Cria produto por kg
  const { rows: [prod] } = await db.query(
    `INSERT INTO products (tenant_id, name, sale_price, sale_type, active, stock_qty)
     VALUES ($1, 'Pão por kg', 10.00, 'kg', true, 999) RETURNING id`,
    [tenantId]
  );
  productId = prod.id;

  // Vincula ficha técnica: 1kg de farinha por 1 unidade do produto
  await db.query(
    `INSERT INTO product_insumos (product_id, tenant_id, insumo_id, qty_per_unit)
     VALUES ($1, $2, $3, 1.0)`,
    [productId, tenantId, insumoId]
  );

  // Cria pedido por KG (weight_kg=2.5, quantity=1)
  const { rows: [ordKg] } = await db.query(
    `INSERT INTO orders (tenant_id, order_number, status, total, channel, payment_method, delivery_type)
     VALUES ($1, 8001, 'confirmed', 25.00, 'manual', 'cash', 'pickup') RETURNING id`,
    [tenantId]
  );
  orderIdKg = ordKg.id;
  await db.query(
    `INSERT INTO order_items (order_id, product_id, product_name, quantity, weight_kg, unit_price, total)
     VALUES ($1, $2, 'Pão por kg', 1, 2.5, 10.00, 25.00)`,
    [orderIdKg, productId]
  );

  // Cria pedido por UNIDADE (weight_kg=null, quantity=3)
  const { rows: [ordUnit] } = await db.query(
    `INSERT INTO orders (tenant_id, order_number, status, total, channel, payment_method, delivery_type)
     VALUES ($1, 8002, 'confirmed', 30.00, 'manual', 'cash', 'pickup') RETURNING id`,
    [tenantId]
  );
  orderIdUnit = ordUnit.id;
  await db.query(
    `INSERT INTO order_items (order_id, product_id, product_name, quantity, weight_kg, unit_price, total)
     VALUES ($1, $2, 'Pão por kg', 3, NULL, 10.00, 30.00)`,
    [orderIdUnit, productId]
  );
});

afterAll(async () => {
  await cleanupTenant(tenantId);
});

const getStock = async () => {
  const { rows: [r] } = await db.query(
    `SELECT qty_in_stock FROM insumos WHERE id = $1`, [insumoId]
  );
  return parseFloat(r.qty_in_stock);
};

describe('A5 — weight_kg em deductForOrder / revertForOrder', () => {
  it('deduz 2.5× a ficha técnica quando weight_kg=2.5', async () => {
    const before = await getStock();             // 100
    await deductForOrder(tenantId, orderIdKg);
    const after = await getStock();

    expect(after).toBeCloseTo(before - 2.5, 2); // 97.5
  });

  it('revertForOrder devolve exatamente 2.5×', async () => {
    const before = await getStock();             // 97.5
    await revertForOrder(tenantId, orderIdKg);
    const after = await getStock();

    expect(after).toBeCloseTo(before + 2.5, 2); // 100
  });

  it('produto por unidade (weight_kg=null) deduz 3× (quantity=3)', async () => {
    const before = await getStock();             // 100
    await deductForOrder(tenantId, orderIdUnit);
    const after = await getStock();

    expect(after).toBeCloseTo(before - 3, 2);   // 97
  });

  it('idempotência: segunda chamada de deductForOrder não altera estoque', async () => {
    // Já foi deduzido no teste anterior; chama de novo
    const before = await getStock();
    await deductForOrder(tenantId, orderIdUnit);
    const after = await getStock();

    expect(after).toBe(before);
  });
});
