const db          = require('../../config/database');
const bcrypt      = require('bcrypt');
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

// DELETE /api/admin/tenants/:id — deactivate (soft)
const deactivateTenant = asyncHandler(async (req, res) => {
  await db.query(
    `UPDATE tenants SET active = false, subscription_status = 'cancelled', updated_at = NOW() WHERE id = $1`,
    [req.params.id]
  );
  res.json({ success: true, message: 'Tenant desativado.' });
});

module.exports = { listTenants, createTenant, updateTenant, deactivateTenant };
