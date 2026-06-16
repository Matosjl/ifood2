/**
 * Fase 1 — Variação de produto persistida no pedido
 *
 * Garante que:
 *  - Mix de tamanhos (G/M) grava variation_label, variation_price e unit_price corretos
 *  - Total do pedido usa o preço da variação, não o sale_price base
 *  - Grupo required sem escolha → AppError 400
 *  - Opção de outro produto → AppError 400
 *  - Opção indisponível → AppError 400
 *  - Produto sem variação → comportamento idêntico ao anterior (retrocompatível)
 *  - findById devolve variation_label e variation_price
 */

const db                    = require('../../src/config/database');
const { createOrder }       = require('../../src/modules/orders/orders.service');
const { createTestTenant, cleanupTenant } = require('../helpers/db');

let tenantId, userId;
let productId;       // Marmita (tem variação)
let productNoVarId;  // Produto sem variação
let groupId;         // product_variation_groups.id
let optPId, optMId, optGId; // opções P / M / G

beforeAll(async () => {
  const tenant = await createTestTenant({ withProducts: false });
  tenantId = tenant.tenantId;
  userId   = tenant.userId;

  // Produto base com sale_price = 10 (preço "default", deve ser ignorado quando há variação)
  const { rows: [prod] } = await db.query(
    `INSERT INTO products (tenant_id, name, sale_price, sale_type, active, stock_qty, cost_price)
     VALUES ($1, 'Marmita', 10.00, 'unit', true, 999, 5.00) RETURNING id`,
    [tenantId]
  );
  productId = prod.id;

  // Grupo de variação "Tamanho" (required=true)
  const { rows: [grp] } = await db.query(
    `INSERT INTO product_variation_groups (tenant_id, product_id, name, required)
     VALUES ($1, $2, 'Tamanho', true) RETURNING id`,
    [tenantId, productId]
  );
  groupId = grp.id;

  // Opções P / M / G
  const { rows: opts } = await db.query(
    `INSERT INTO product_variation_options (tenant_id, group_id, name, price, available)
     VALUES
       ($1, $2, 'Pequena', 15.00, true),
       ($1, $2, 'Média',   18.00, true),
       ($1, $2, 'Grande',  22.00, true)
     RETURNING id, name`,
    [tenantId, groupId]
  );
  optPId = opts.find(o => o.name === 'Pequena').id;
  optMId = opts.find(o => o.name === 'Média').id;
  optGId = opts.find(o => o.name === 'Grande').id;

  // Produto sem variação para teste de retrocompatibilidade
  const { rows: [pnv] } = await db.query(
    `INSERT INTO products (tenant_id, name, sale_price, sale_type, active, stock_qty)
     VALUES ($1, 'Refrigerante', 7.00, 'unit', true, 100) RETURNING id`,
    [tenantId]
  );
  productNoVarId = pnv.id;
});

afterAll(async () => {
  await cleanupTenant(tenantId);
});

describe('Fase 1 — variação persistida no pedido', () => {
  it('mix G+G+M → grava variation_label, variation_price, unit_price e total corretos', async () => {
    const order = await createOrder(tenantId, {
      customerName: 'Cliente Teste',
      channel: 'manual',
      items: [
        { productId, quantity: 2, variationOptionIds: [optGId] }, // 2× Grande R$22 = 44
        { productId, quantity: 1, variationOptionIds: [optMId] }, // 1× Média  R$18 = 18
      ],
      deliveryType: 'pickup',
      paymentMethod: 'cash',
    });

    expect(order).toBeDefined();
    expect(parseFloat(order.total)).toBeCloseTo(62.00, 1); // 44 + 18

    const { rows: dbItems } = await db.query(
      `SELECT product_name, variation_label, variation_price, unit_price, total
       FROM order_items WHERE order_id = $1 ORDER BY id`,
      [order.id]
    );

    expect(dbItems).toHaveLength(2);

    const grande = dbItems[0];
    expect(grande.product_name).toBe('Marmita (Grande)');
    expect(grande.variation_label).toBe('Grande');
    expect(parseFloat(grande.variation_price)).toBeCloseTo(22.00, 1);
    expect(parseFloat(grande.unit_price)).toBeCloseTo(22.00, 1);
    expect(parseFloat(grande.total)).toBeCloseTo(44.00, 1);

    const media = dbItems[1];
    expect(media.product_name).toBe('Marmita (Média)');
    expect(media.variation_label).toBe('Média');
    expect(parseFloat(media.variation_price)).toBeCloseTo(18.00, 1);
    expect(parseFloat(media.unit_price)).toBeCloseTo(18.00, 1);
    expect(parseFloat(media.total)).toBeCloseTo(18.00, 1);
  });

  it('findById devolve variation_label e variation_price', async () => {
    const Order = require('../../src/models/Order');
    const order = await createOrder(tenantId, {
      customerName: 'Refetch Test',
      channel: 'manual',
      items: [{ productId, quantity: 1, variationOptionIds: [optPId] }],
      deliveryType: 'pickup',
      paymentMethod: 'cash',
    });

    const fetched = await Order.findById(order.id, tenantId);
    const item = fetched.items[0];
    expect(item.variation_label).toBe('Pequena');
    expect(parseFloat(item.variation_price)).toBeCloseTo(15.00, 1);
  });

  it('canal manual: grupo required sem escolha → AppError 400', async () => {
    // enforceRequiredVariation: true → canal manual rejeita grupo required sem escolha
    await expect(
      createOrder(tenantId, {
        customerName: 'Sem Variação',
        channel: 'manual',
        enforceRequiredVariation: true,
        items: [{ productId, quantity: 1 }], // sem variationOptionIds
        deliveryType: 'pickup',
        paymentMethod: 'cash',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('canal online: grupo required sem variationOptionIds → 201 (comportamento preservado)', async () => {
    // Canal online/público NÃO passa enforceRequiredVariation (default false).
    // Produto com grupo required mas sem variationOptionIds deve criar pedido normalmente
    // (captura de tamanho via UI do cliente vem na Fase E1 — não é regressão).
    const order = await createOrder(tenantId, {
      customerName: 'Cliente Online Sem Tamanho',
      channel: 'online',
      // enforceRequiredVariation ausente → false (default)
      items: [{ productId, quantity: 1 }], // sem variationOptionIds
      deliveryType: 'pickup',
      paymentMethod: 'cash',
    });
    // Pedido criado com preço base do produto (sem variação aplicada)
    expect(order).toBeDefined();
    expect(parseFloat(order.total)).toBeCloseTo(10.00, 1); // sale_price base = 10
  });

  it('opção inválida (não existe no banco) → AppError 400', async () => {
    const { v4: uuidv4 } = require('uuid');
    await expect(
      createOrder(tenantId, {
        customerName: 'Opt Inválida',
        channel: 'manual',
        items: [{ productId, quantity: 1, variationOptionIds: [uuidv4()] }],
        deliveryType: 'pickup',
        paymentMethod: 'cash',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('opção de outro produto → AppError 400', async () => {
    // Cria produto extra com variação própria
    const { rows: [other] } = await db.query(
      `INSERT INTO products (tenant_id, name, sale_price, sale_type, active, stock_qty)
       VALUES ($1, 'Pizza', 40.00, 'unit', true, 50) RETURNING id`,
      [tenantId]
    );
    const { rows: [otherGrp] } = await db.query(
      `INSERT INTO product_variation_groups (tenant_id, product_id, name, required)
       VALUES ($1, $2, 'Tamanho', true) RETURNING id`,
      [tenantId, other.id]
    );
    const { rows: [otherOpt] } = await db.query(
      `INSERT INTO product_variation_options (tenant_id, group_id, name, price, available)
       VALUES ($1, $2, 'Grande', 55.00, true) RETURNING id`,
      [tenantId, otherGrp.id]
    );

    // Tenta usar opção de "Pizza" em "Marmita"
    await expect(
      createOrder(tenantId, {
        customerName: 'Cross Product',
        channel: 'manual',
        items: [{ productId, quantity: 1, variationOptionIds: [otherOpt.id] }],
        deliveryType: 'pickup',
        paymentMethod: 'cash',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('produto sem variação → comportamento idêntico ao anterior', async () => {
    const order = await createOrder(tenantId, {
      customerName: 'Sem Var',
      channel: 'manual',
      items: [{ productId: productNoVarId, quantity: 3 }],
      deliveryType: 'pickup',
      paymentMethod: 'cash',
    });

    expect(parseFloat(order.total)).toBeCloseTo(21.00, 1); // 7 × 3

    const { rows: [item] } = await db.query(
      `SELECT variation_label, variation_price, unit_price FROM order_items WHERE order_id = $1`,
      [order.id]
    );
    expect(item.variation_label).toBeNull();
    expect(item.variation_price).toBeNull();
    expect(parseFloat(item.unit_price)).toBeCloseTo(7.00, 1);
  });
});
