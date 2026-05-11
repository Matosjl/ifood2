const db          = require('../../config/database');
const bcrypt      = require('bcryptjs');
const asyncHandler = require('../../utils/asyncHandler');
const AppError    = require('../../utils/AppError');

// GET /api/admin/tenants — list all tenants with stats
const listTenants = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.*,
            COUNT(DISTINCT u.id) FILTER (WHERE u.active = true)  AS users_count,
            COUNT(DISTINCT o.id) FILTER (
              WHERE o.created_at >= date_trunc('month', NOW())
            )                                                      AS orders_this_month,
            COUNT(DISTINCT p.id) FILTER (WHERE p.active = true)  AS products_count
     FROM   tenants t
     LEFT   JOIN users    u ON u.tenant_id = t.id
     LEFT   JOIN orders   o ON o.tenant_id = t.id
     LEFT   JOIN products p ON p.tenant_id = t.id
     GROUP  BY t.id
     ORDER  BY t.created_at DESC`
  );
  res.json({ success: true, data: rows });
});

// POST /api/admin/tenants — create tenant + owner
const createTenant = asyncHandler(async (req, res) => {
  const { tenantName, email, password, plan = 'pro' } = req.body;
  if (!tenantName || !email || !password)
    throw new AppError('tenantName, email e password são obrigatórios.', 400);

  const slug = tenantName.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows: [tenant] } = await client.query(
      `INSERT INTO tenants (name, slug, plan)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET slug = $2 || '-' || floor(random()*9000+1000)::text
       RETURNING *`,
      [tenantName, slug, plan]
    );

    const hash = await bcrypt.hash(password, 12);
    await client.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'owner')`,
      [tenant.id, tenantName, email, hash]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: tenant });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw new AppError('Email já cadastrado.', 409);
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /api/admin/tenants/:id — update plan or subscription_status
const updateTenant = asyncHandler(async (req, res) => {
  const { plan, subscription_status } = req.body;
  const { rows: [tenant] } = await db.query(
    `UPDATE tenants
     SET plan                = COALESCE($2, plan),
         subscription_status = COALESCE($3, subscription_status),
         updated_at          = NOW()
     WHERE id = $1
     RETURNING *`,
    [req.params.id, plan ?? null, subscription_status ?? null]
  );
  if (!tenant) throw new AppError('Tenant não encontrado.', 404);
  res.json({ success: true, data: tenant });
});

// POST /api/admin/tenants/:id/activate — ativa conta após pagamento confirmado
const activateTenant = asyncHandler(async (req, res) => {
  const { plan = null } = req.body;
  const { rows: [tenant] } = await db.query(
    `UPDATE tenants
     SET subscription_status  = 'active',
         active               = true,
         plan                 = COALESCE($2, plan),
         trial_ends_at        = NULL,
         premium_trial_ends_at = NULL,
         updated_at           = NOW()
     WHERE id = $1
     RETURNING *`,
    [req.params.id, plan]
  );
  if (!tenant) throw new AppError('Tenant não encontrado.', 404);
  res.json({ success: true, data: tenant });
});

// POST /api/admin/tenants/:id/extend-trial — adiciona dias ao trial
const extendTrial = asyncHandler(async (req, res) => {
  const { days = 7 } = req.body;
  const { rows: [tenant] } = await db.query(
    `UPDATE tenants
     SET trial_ends_at = GREATEST(COALESCE(trial_ends_at, NOW()), NOW()) + ($2 || ' days')::INTERVAL,
         subscription_status = CASE
           WHEN subscription_status = 'suspended' THEN 'trialing'
           ELSE subscription_status
         END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [req.params.id, days]
  );
  if (!tenant) throw new AppError('Tenant não encontrado.', 404);
  res.json({ success: true, data: tenant });
});

// DELETE /api/admin/tenants/:id — deactivate (soft)
const deactivateTenant = asyncHandler(async (req, res) => {
  await db.query(
    `UPDATE tenants SET active = false, subscription_status = 'cancelled', updated_at = NOW() WHERE id = $1`,
    [req.params.id]
  );
  res.json({ success: true, message: 'Tenant desativado.' });
});

// DELETE /api/admin/tenants/:id/destroy — hard delete (permanente)
const destroyTenant = asyncHandler(async (req, res) => {
  const { rows: [tenant] } = await db.query(
    'SELECT id, name FROM tenants WHERE id = $1',
    [req.params.id]
  );
  if (!tenant) throw new AppError('Tenant não encontrado.', 404);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    // Deleta na ordem correta (filhos antes dos pais)
    await client.query(`DELETE FROM stock_movements   WHERE tenant_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM order_items       WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = $1)`, [req.params.id]);
    await client.query(`DELETE FROM orders            WHERE tenant_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM products          WHERE tenant_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM categories        WHERE tenant_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM cash_registers    WHERE tenant_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM banco_transactions WHERE tenant_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM expenses          WHERE tenant_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM refresh_tokens    WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)`, [req.params.id]);
    await client.query(`DELETE FROM users             WHERE tenant_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM order_counters    WHERE tenant_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM tenants           WHERE id = $1`, [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true, message: `Restaurante "${tenant.name}" excluído permanentemente.` });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = { listTenants, createTenant, updateTenant, activateTenant, extendTrial, deactivateTenant, destroyTenant };
