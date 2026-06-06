const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../../config/database');
const env      = require('../../config/env');
const AppError = require('../../utils/AppError');

// ── JWT ───────────────────────────────────────────────────────

const signDriverToken = (driverId) =>
  jwt.sign({ sub: driverId, role: 'driver' }, env.JWT_SECRET, { expiresIn: '30d' });

// ── Auth ──────────────────────────────────────────────────────

const register = async ({ name, phone, email, password }) => {
  const { rows: ex } = await db.query(
    'SELECT id FROM drivers WHERE email = $1', [email.toLowerCase()]
  );
  if (ex.length) throw new AppError('E-mail já cadastrado.', 409);

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    `INSERT INTO drivers (name, phone, email, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, phone, email, status`,
    [name, phone || null, email.toLowerCase(), hash]
  );
  return { driver: rows[0], token: signDriverToken(rows[0].id) };
};

const login = async ({ email, password }) => {
  const { rows } = await db.query(
    'SELECT * FROM drivers WHERE email = $1', [email.toLowerCase()]
  );
  const d = rows[0];
  if (!d) throw new AppError('E-mail ou senha incorretos.', 401);
  const ok = await bcrypt.compare(password, d.password_hash);
  if (!ok) throw new AppError('E-mail ou senha incorretos.', 401);
  return {
    driver: { id: d.id, name: d.name, phone: d.phone, email: d.email, status: d.status },
    token: signDriverToken(d.id),
  };
};

// ── Conexão restaurante ───────────────────────────────────────

const connectToRestaurant = async (driverId, token) => {
  const { rows } = await db.query(
    `SELECT id, name FROM tenants WHERE driver_token = $1 AND active = true`,
    [token.toUpperCase()]
  );
  if (!rows.length) throw new AppError('Token inválido ou restaurante não encontrado.', 404);
  const tenant = rows[0];
  await db.query(
    `INSERT INTO driver_tenant_connections (driver_id, tenant_id)
     VALUES ($1, $2) ON CONFLICT (driver_id, tenant_id) DO NOTHING`,
    [driverId, tenant.id]
  );
  return { restaurantName: tenant.name, tenantId: tenant.id };
};

const getConnectedRestaurants = async (driverId) => {
  const { rows } = await db.query(
    `SELECT t.id, t.name, dtc.connected_at
     FROM driver_tenant_connections dtc
     JOIN tenants t ON t.id = dtc.tenant_id
     WHERE dtc.driver_id = $1
     ORDER BY dtc.connected_at DESC`,
    [driverId]
  );
  return rows;
};

// ── Entregas disponíveis ──────────────────────────────────────

const getAvailableDeliveries = async (driverId) => {
  const { rows } = await db.query(
    `SELECT o.id, o.order_number, o.total, o.payment_method, o.paid_at,
            o.customer_name, o.customer_phone, o.customer_address,
            o.neighborhood, o.notes, o.delivery_fee, t.name AS restaurant_name,
            COALESCE(
              json_agg(
                json_build_object(
                  'productName', oi.product_name,
                  'quantity',    oi.quantity,
                  'total',       oi.total
                ) ORDER BY oi.id
              ) FILTER (WHERE oi.id IS NOT NULL), '[]'
            ) AS items
     FROM orders o
     JOIN tenants t ON t.id = o.tenant_id
     JOIN driver_tenant_connections dtc
          ON dtc.tenant_id = o.tenant_id AND dtc.driver_id = $1
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.status = 'ready'
       AND o.delivery_type = 'delivery'
       AND NOT EXISTS (
         SELECT 1 FROM deliveries d
         WHERE d.order_id = o.id AND d.status != 'cancelled'
       )
     GROUP BY o.id, t.name
     ORDER BY o.created_at ASC`,
    [driverId]
  );
  return rows;
};

// ── Entregas ativas (aceitas por este motoboy) ────────────────

const getActiveDeliveries = async (driverId) => {
  const { rows } = await db.query(
    `SELECT d.id AS delivery_id, d.status AS delivery_status,
            d.accepted_at, d.picked_up_at, d.driver_fee,
            o.id, o.order_number, o.total, o.payment_method, o.paid_at,
            o.customer_name, o.customer_phone, o.customer_address,
            o.neighborhood, o.notes, o.delivery_fee, t.name AS restaurant_name,
            COALESCE(
              json_agg(
                json_build_object(
                  'productName', oi.product_name,
                  'quantity',    oi.quantity,
                  'total',       oi.total
                ) ORDER BY oi.id
              ) FILTER (WHERE oi.id IS NOT NULL), '[]'
            ) AS items
     FROM deliveries d
     JOIN orders o  ON o.id  = d.order_id
     JOIN tenants t ON t.id  = d.tenant_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE d.driver_id = $1
       AND d.status NOT IN ('delivered', 'cancelled')
     GROUP BY d.id, o.id, t.name
     ORDER BY d.accepted_at DESC`,
    [driverId]
  );
  return rows;
};

// ── Aceitar entrega ───────────────────────────────────────────

const acceptDelivery = async (driverId, orderId) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Verifica se o pedido ainda está disponível + busca driver_fee_pct do tenant
    const { rows: orderRows } = await client.query(
      `SELECT o.id, o.tenant_id, o.delivery_fee,
              COALESCE(t.driver_fee_pct, 70) AS driver_fee_pct,
              COALESCE(t.driver_min_fee,  0) AS driver_min_fee
       FROM orders o
       JOIN tenants t ON t.id = o.tenant_id
       JOIN driver_tenant_connections dtc
            ON dtc.tenant_id = o.tenant_id AND dtc.driver_id = $1
       WHERE o.id = $2 AND o.status = 'ready' AND o.delivery_type = 'delivery'`,
      [driverId, orderId]
    );
    if (!orderRows.length) throw new AppError('Pedido não disponível.', 409);

    const { rows: existing } = await client.query(
      `SELECT id, driver_id FROM deliveries WHERE order_id = $1 AND status != 'cancelled'`,
      [orderId]
    );
    if (existing.length) {
      // Mesmo motoboy clicou duas vezes — retorna idempotente sem erro
      if (String(existing[0].driver_id) === String(driverId)) {
        await client.query('ROLLBACK');
        const { rows: current } = await db.query('SELECT * FROM deliveries WHERE id = $1', [existing[0].id]);
        return current[0];
      }
      throw new AppError('Pedido já aceito por outro motoboy.', 409);
    }

    const pct       = parseFloat(orderRows[0].driver_fee_pct) / 100;
    const minFee    = parseFloat(orderRows[0].driver_min_fee) || 0;
    // D3: Math.max garante piso mínimo — motoboy nunca recebe R$ 0
    const driverFee = Math.max((parseFloat(orderRows[0].delivery_fee) || 0) * pct, minFee);

    const { rows } = await client.query(
      `INSERT INTO deliveries (order_id, driver_id, tenant_id, status, driver_fee, accepted_at)
       VALUES ($1, $2, $3, 'accepted', $4, NOW())
       RETURNING *`,
      [orderId, driverId, orderRows[0].tenant_id, driverFee.toFixed(2)]
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

// ── Confirmar coleta ──────────────────────────────────────────

const confirmPickup = async (driverId, deliveryId) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE deliveries SET status = 'picked_up', picked_up_at = NOW()
       WHERE id = $1 AND driver_id = $2 AND status = 'accepted'
       RETURNING *`,
      [deliveryId, driverId]
    );
    if (!rows.length) throw new AppError('Entrega não encontrada ou status inválido.', 404);
    // Atualiza pedido para 'delivering' para o kanban do restaurante refletir
    await client.query(
      `UPDATE orders SET status = 'delivering', updated_at = NOW() WHERE id = $1`,
      [rows[0].order_id]
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

// ── Registrar pagamento ───────────────────────────────────────

const markOrderPaid = async (driverId, deliveryId, paymentMethod) => {
  const { rows: del } = await db.query(
    `SELECT d.*, o.payment_method AS orig_method
     FROM deliveries d JOIN orders o ON o.id = d.order_id
     WHERE d.id = $1 AND d.driver_id = $2 AND d.status = 'picked_up'`,
    [deliveryId, driverId]
  );
  if (!del.length) throw new AppError('Entrega não encontrada ou status inválido.', 404);

  const { rows } = await db.query(
    `UPDATE orders SET paid_at = NOW(), payment_method = $1 WHERE id = $2 RETURNING *`,
    [paymentMethod, del[0].order_id]
  );
  return rows[0];
};

// ── Confirmar entrega ─────────────────────────────────────────

const confirmDelivery = async (driverId, deliveryId) => {
  const { rows: del } = await db.query(
    `SELECT d.*, o.paid_at, o.payment_method
     FROM deliveries d JOIN orders o ON o.id = d.order_id
     WHERE d.id = $1 AND d.driver_id = $2`,
    [deliveryId, driverId]
  );
  if (!del.length) throw new AppError('Entrega não encontrada.', 404);
  const delivery = del[0];

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE deliveries SET status = 'delivered', delivered_at = NOW() WHERE id = $1`,
      [deliveryId]
    );
    await client.query(
      `UPDATE orders SET status = 'delivered', updated_at = NOW() WHERE id = $1`,
      [delivery.order_id]
    );
    await client.query('COMMIT');
    return { orderId: delivery.order_id, tenantId: delivery.tenant_id };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

// ── Status e localização ──────────────────────────────────────

const updateStatus = async (driverId, status) => {
  const valid = ['offline', 'available', 'busy'];
  if (!valid.includes(status)) throw new AppError('Status inválido.', 400);
  await db.query(
    'UPDATE drivers SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, driverId]
  );
};

const updateLocation = async (driverId, lat, lng) => {
  await db.query(
    'UPDATE drivers SET current_lat = $1, current_lng = $2, updated_at = NOW() WHERE id = $3',
    [lat, lng, driverId]
  );
};

// ── Perfil e stats ────────────────────────────────────────────

const getProfile = async (driverId) => {
  const { rows } = await db.query(
    `SELECT id, name, phone, email, status, current_lat, current_lng, created_at
     FROM drivers WHERE id = $1`,
    [driverId]
  );
  if (!rows.length) throw new AppError('Motoboy não encontrado.', 404);
  return rows[0];
};

const getStats = async (driverId) => {
  const { rows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE delivered_at >= NOW() - INTERVAL '1 day')   AS today_count,
       COALESCE(SUM(driver_fee) FILTER (WHERE delivered_at >= NOW() - INTERVAL '1 day'),  0) AS today_earnings,
       COUNT(*) FILTER (WHERE delivered_at >= NOW() - INTERVAL '7 days')  AS week_count,
       COALESCE(SUM(driver_fee) FILTER (WHERE delivered_at >= NOW() - INTERVAL '7 days'), 0) AS week_earnings,
       COUNT(*) FILTER (WHERE delivered_at >= NOW() - INTERVAL '30 days') AS month_count,
       COALESCE(SUM(driver_fee) FILTER (WHERE delivered_at >= NOW() - INTERVAL '30 days'),0) AS month_earnings
     FROM deliveries
     WHERE driver_id = $1 AND status = 'delivered'`,
    [driverId]
  );
  return rows[0];
};

const getHistory = async (driverId, limit = 30) => {
  const { rows } = await db.query(
    `SELECT d.id, d.driver_fee, d.delivered_at,
            o.order_number, o.total, o.customer_name, o.neighborhood,
            t.name AS restaurant_name
     FROM deliveries d
     JOIN orders o  ON o.id = d.order_id
     JOIN tenants t ON t.id = d.tenant_id
     WHERE d.driver_id = $1 AND d.status = 'delivered'
     ORDER BY d.delivered_at DESC
     LIMIT $2`,
    [driverId, limit]
  );
  return rows;
};

// ── Para o painel do restaurante ──────────────────────────────

const getTenantToken = async (tenantId) => {
  const { rows } = await db.query(
    'SELECT driver_token FROM tenants WHERE id = $1', [tenantId]
  );
  if (!rows.length) throw new AppError('Restaurante não encontrado.', 404);
  return rows[0].driver_token;
};

const getConnectedDrivers = async (tenantId) => {
  const { rows } = await db.query(
    `SELECT d.id, d.name, d.phone, d.status, d.current_lat, d.current_lng, dtc.connected_at
     FROM driver_tenant_connections dtc
     JOIN drivers d ON d.id = dtc.driver_id
     WHERE dtc.tenant_id = $1
     ORDER BY d.status, d.name`,
    [tenantId]
  );
  return rows;
};

// ── Restaurante atribui motoboy a um pedido ───────────────────

const assignDelivery = async (tenantId, orderId, driverId) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows: orderRows } = await client.query(
      `SELECT o.id, o.delivery_fee,
              COALESCE(t.driver_fee_pct, 70) AS driver_fee_pct,
              COALESCE(t.driver_min_fee,  0) AS driver_min_fee
       FROM orders o
       JOIN tenants t ON t.id = o.tenant_id
       WHERE o.id=$1 AND o.tenant_id=$2 AND o.status='ready' AND o.delivery_type='delivery'`,
      [orderId, tenantId]
    );
    if (!orderRows.length)
      throw new AppError('Pedido não encontrado ou não está pronto para entrega.', 404);

    const { rows: connRows } = await client.query(
      `SELECT id FROM driver_tenant_connections WHERE driver_id=$1 AND tenant_id=$2`,
      [driverId, tenantId]
    );
    if (!connRows.length)
      throw new AppError('Motoboy não está conectado a este restaurante.', 403);

    const { rows: existing } = await client.query(
      `SELECT id FROM deliveries WHERE order_id=$1 AND status!='cancelled'`,
      [orderId]
    );
    if (existing.length)
      throw new AppError('Este pedido já foi atribuído a um motoboy.', 409);

    const pct       = parseFloat(orderRows[0].driver_fee_pct) / 100;
    const minFee    = parseFloat(orderRows[0].driver_min_fee) || 0;
    // D3: Math.max garante piso mínimo — motoboy nunca recebe R$ 0
    const driverFee = Math.max((parseFloat(orderRows[0].delivery_fee) || 0) * pct, minFee);

    const { rows } = await client.query(
      `INSERT INTO deliveries (order_id, driver_id, tenant_id, status, driver_fee, accepted_at)
       VALUES ($1, $2, $3, 'accepted', $4, NOW()) RETURNING *`,
      [orderId, driverId, tenantId, driverFee.toFixed(2)]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

module.exports = {
  register, login,
  connectToRestaurant, getConnectedRestaurants,
  getAvailableDeliveries, getActiveDeliveries,
  acceptDelivery, confirmPickup, markOrderPaid, confirmDelivery,
  updateStatus, updateLocation,
  getProfile, getStats, getHistory,
  getTenantToken, getConnectedDrivers,
  assignDelivery,
};
