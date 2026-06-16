/**
 * Fase 2 — Ordem estável dos itens (line_no) + guard de itens externos
 *
 * Garante:
 *  - createExternalOrder sem itens → AppError 400
 *  - createOrder com 3 itens em ordem [A, B, C] → findById devolve A, B, C (line_no 0,1,2)
 *  - Itens externos também têm line_no gravado em ordem
 */

const db                    = require('../../src/config/database');
const { createOrder, createExternalOrder } = require('../../src/modules/orders/orders.service');
const { createTestTenant, cleanupTenant }  = require('../helpers/db');

let tenantId;
let prodAId, prodBId, prodCId;

beforeAll(async () => {
  const tenant = await createTestTenant({ withProducts: false });
  tenantId = tenant.tenantId;

  // 3 produtos distintos para testar ordenação
  const { rows } = await db.query(
    `INSERT INTO products (tenant_id, name, sale_price, sale_type, active, stock_qty, cost_price)
     VALUES
       ($1, 'Produto A', 5.00,  'unit', true, 100, 1.00),
       ($1, 'Produto B', 10.00, 'unit', true, 100, 2.00),
       ($1, 'Produto C', 15.00, 'unit', true, 100, 3.00)
     RETURNING id, name`,
    [tenantId]
  );
  prodAId = rows.find(r => r.name === 'Produto A').id;
  prodBId = rows.find(r => r.name === 'Produto B').id;
  prodCId = rows.find(r => r.name === 'Produto C').id;
});

afterAll(async () => {
  await cleanupTenant(tenantId);
});

describe('Fase 2 — line_no e guard de itens externos', () => {
  it('createExternalOrder sem itens → AppError 400', async () => {
    await expect(
      createExternalOrder(tenantId, {
        externalId:  'ext-no-items-' + Date.now(),
        channel:     'ifood',
        customerName: 'Sem Item',
        items:       [],
        deliveryType: 'delivery',
        paymentMethod: 'pix',
        total: 0,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('createExternalOrder com items=[undefined, null, {}] → AppError 400 (itens inválidos)', async () => {
    await expect(
      createExternalOrder(tenantId, {
        externalId:  'ext-invalid-items-' + Date.now(),
        channel:     'ifood',
        customerName: 'Item Inválido',
        items:       [undefined, null, {}],
        deliveryType: 'delivery',
        paymentMethod: 'pix',
        total: 0,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('createOrder [A, B, C] → findById devolve A, B, C na mesma ordem (line_no 0,1,2)', async () => {
    const order = await createOrder(tenantId, {
      customerName: 'Teste Ordem',
      channel: 'manual',
      items: [
        { productId: prodAId, quantity: 1 }, // line_no = 0
        { productId: prodBId, quantity: 2 }, // line_no = 1
        { productId: prodCId, quantity: 1 }, // line_no = 2
      ],
      deliveryType: 'pickup',
      paymentMethod: 'cash',
    });

    expect(order).toBeDefined();

    // Verificar order_items com line_no no banco
    const { rows } = await db.query(
      `SELECT product_name, line_no FROM order_items
       WHERE order_id = $1
       ORDER BY line_no NULLS LAST, id`,
      [order.id]
    );

    expect(rows).toHaveLength(3);
    expect(rows[0].line_no).toBe(0);
    expect(rows[0].product_name).toBe('Produto A');
    expect(rows[1].line_no).toBe(1);
    expect(rows[1].product_name).toBe('Produto B');
    expect(rows[2].line_no).toBe(2);
    expect(rows[2].product_name).toBe('Produto C');

    // findById deve retornar na mesma ordem
    const fetched = await order; // já foi retornado com findById no createOrder
    const Order = require('../../src/models/Order');
    const refetched = await Order.findById(order.id, tenantId);
    expect(refetched.items[0].product_name).toBe('Produto A');
    expect(refetched.items[1].product_name).toBe('Produto B');
    expect(refetched.items[2].product_name).toBe('Produto C');
  });

  it('createExternalOrder com itens válidos → line_no gravado em ordem', async () => {
    const order = await createExternalOrder(tenantId, {
      externalId:   'ext-order-lineno-' + Date.now(),
      channel:      'ifood',
      customerName: 'iFood Cliente',
      items: [
        { name: 'X-Burguer',  quantity: 1, unitPrice: 25.00, total: 25.00 },
        { name: 'Batata Fri', quantity: 2, unitPrice: 10.00, total: 20.00 },
        { name: 'Coca-Cola',  quantity: 1, unitPrice: 8.00,  total: 8.00  },
      ],
      deliveryType:  'delivery',
      paymentMethod: 'pix',
      deliveryFee:   5.00,
      total:         53.00,
    });

    const { rows } = await db.query(
      `SELECT product_name, line_no FROM order_items
       WHERE order_id = $1
       ORDER BY line_no NULLS LAST, id`,
      [order.id]
    );

    expect(rows).toHaveLength(3);
    expect(rows[0].line_no).toBe(0);
    expect(rows[0].product_name).toBe('X-Burguer');
    expect(rows[1].line_no).toBe(1);
    expect(rows[1].product_name).toBe('Batata Fri');
    expect(rows[2].line_no).toBe(2);
    expect(rows[2].product_name).toBe('Coca-Cola');
  });
});
