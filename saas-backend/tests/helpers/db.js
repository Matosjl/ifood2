const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('../../src/config/database');

/**
 * Creates a complete test tenant with an owner user and optional products.
 * Returns { tenantId, userId, slug, productIds?, categoryId?, products? }
 *
 * @param {object} [opts]
 * @param {string} [opts.plan='pro']
 * @param {boolean} [opts.withProducts=false]
 */
const createTestTenant = async ({ plan = 'pro', withProducts = false } = {}) => {
  const tenantId = uuidv4();
  const userId   = uuidv4();
  const slug     = `test-${tenantId.slice(0, 8)}`;

  // Insert tenant — subscription_status 'active' bypasses trial/suspended checks
  await db.query(
    `INSERT INTO tenants
       (id, name, slug, plan, subscription_status, active,
        trial_ends_at, orders_count_monthly, billing_period_start)
     VALUES ($1, $2, $3, $4, 'active', true,
        NOW() + INTERVAL '14 days', 0, date_trunc('month', NOW()))`,
    [tenantId, `Test Restaurant ${slug}`, slug, plan]
  );

  // Insert owner user with a fast low-cost bcrypt hash
  const hash = await bcrypt.hash('TestPass123!', 4);
  await db.query(
    `INSERT INTO users (id, tenant_id, name, email, password_hash, role, active)
     VALUES ($1, $2, $3, $4, $5, 'owner', true)`,
    [userId, tenantId, 'Test Owner', `owner-${slug}@test.com`, hash]
  );

  const result = { tenantId, userId, slug };

  if (withProducts) {
    const catId = uuidv4();
    await db.query(
      `INSERT INTO categories (id, tenant_id, name) VALUES ($1, $2, 'Lanches')`,
      [catId, tenantId]
    );

    const p1Id = uuidv4();
    const p2Id = uuidv4();
    await db.query(
      `INSERT INTO products
         (id, tenant_id, category_id, name, sale_price, cost_price, stock_qty, active)
       VALUES
         ($1, $2, $3, 'X-Burguer', 25.00, 10.00, 100, true),
         ($4, $2, $3, 'Coca-Cola',  8.00,  3.00,  50, true)`,
      [p1Id, tenantId, catId, p2Id]
    );

    result.categoryId = catId;
    result.productIds = [p1Id, p2Id];
    result.products = [
      { id: p1Id, name: 'X-Burguer', price: 25.00 },
      { id: p2Id, name: 'Coca-Cola',  price: 8.00 },
    ];
  }

  return result;
};

/**
 * Opens a cash register for a tenant and returns the inserted row.
 *
 * @param {string} tenantId
 * @param {string} userId
 * @param {number} [openingBalance=0]
 */
const openCashRegister = async (tenantId, userId, openingBalance = 0) => {
  const { rows } = await db.query(
    `INSERT INTO cash_registers (tenant_id, opened_by, opening_balance)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [tenantId, userId, openingBalance]
  );
  return rows[0];
};

/**
 * Creates an order directly in the DB, bypassing BullMQ.
 * Returns the inserted order row.
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {Array<{productId: string, name?: string, price: number, qty?: number}>} [opts.items=[]]
 * @param {string} [opts.status='confirmed']
 * @param {string} [opts.paymentMethod='cash']
 */
const createOrder = async ({
  tenantId,
  items = [],
  status = 'confirmed',
  paymentMethod = 'cash',
}) => {
  const orderId = uuidv4();
  const total = items.reduce((sum, i) => sum + i.price * (i.qty || 1), 0);

  // Upsert order counter so we always get a valid sequential number
  const { rows: counterRows } = await db.query(
    `INSERT INTO order_counters (tenant_id, last_number)
     VALUES ($1, 1)
     ON CONFLICT (tenant_id)
     DO UPDATE SET last_number = order_counters.last_number + 1
     RETURNING last_number`,
    [tenantId]
  );
  const orderNumber = counterRows[0].last_number;

  const { rows } = await db.query(
    `INSERT INTO orders
       (id, tenant_id, order_number, status, total, customer_name, channel, payment_method)
     VALUES ($1, $2, $3, $4, $5, 'Cliente Teste', 'internal', $6)
     RETURNING *`,
    [orderId, tenantId, orderNumber, status, total, paymentMethod]
  );

  const order = rows[0];

  for (const item of items) {
    await db.query(
      `INSERT INTO order_items
         (order_id, product_id, product_name, quantity, unit_price, total)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        orderId,
        item.productId,
        item.name || 'Produto',
        item.qty || 1,
        item.price,
        item.price * (item.qty || 1),
      ]
    );
  }

  return order;
};

/**
 * Deletes all test data for a tenant in correct FK order.
 *
 * Uses a safe wrapper so that tables added after the initial DB init
 * (e.g. banco_transactions, fiado_*) don't crash cleanup on older DBs.
 * The final DELETE on tenants cascades everything else automatically.
 *
 * @param {string} tenantId
 */
const cleanupTenant = async (tenantId) => {
  // Ignores "relation does not exist" (42P01) — safe on DBs missing newer tables
  const safeDel = (sql, params) =>
    db.query(sql, params).catch((e) => { if (e.code !== '42P01') throw e; });

  // Tables without a direct tenant_id FK must be cleaned first
  await safeDel(
    `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = $1)`,
    [tenantId]
  );
  await safeDel(
    `DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)`,
    [tenantId]
  );

  // Everything else cascades from tenant deletion — explicit deletes
  // are belt-and-suspenders for tables that may not have cascade configured
  await safeDel(`DELETE FROM stock_movements  WHERE tenant_id = $1`, [tenantId]);
  await safeDel(`DELETE FROM fiado_compras    WHERE tenant_id = $1`, [tenantId]);
  await safeDel(`DELETE FROM fiado_clientes   WHERE tenant_id = $1`, [tenantId]);
  await safeDel(`DELETE FROM orders           WHERE tenant_id = $1`, [tenantId]);
  await safeDel(`DELETE FROM products         WHERE tenant_id = $1`, [tenantId]);
  await safeDel(`DELETE FROM categories       WHERE tenant_id = $1`, [tenantId]);
  await safeDel(`DELETE FROM expenses         WHERE tenant_id = $1`, [tenantId]);
  await safeDel(`DELETE FROM cash_registers   WHERE tenant_id = $1`, [tenantId]);
  await safeDel(`DELETE FROM banco_transactions WHERE tenant_id = $1`, [tenantId]);
  await safeDel(`DELETE FROM order_counters   WHERE tenant_id = $1`, [tenantId]);

  // Tenant delete cascades users + anything still remaining
  await db.query(`DELETE FROM users   WHERE tenant_id = $1`, [tenantId]);
  await db.query(`DELETE FROM tenants WHERE id         = $1`, [tenantId]);
};

module.exports = { createTestTenant, openCashRegister, createOrder, cleanupTenant };
