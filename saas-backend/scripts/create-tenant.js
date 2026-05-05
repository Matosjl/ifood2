#!/usr/bin/env node
/**
 * Usage: node scripts/create-tenant.js "Restaurant Name" owner@email.com "password" [plan]
 * Plans: basic | pro | premium (default: pro)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const db     = require('../src/config/database');

async function main() {
  const [,, tenantName, email, password, plan = 'pro'] = process.argv;
  if (!tenantName || !email || !password) {
    console.error('Usage: node scripts/create-tenant.js "Restaurant Name" email@example.com "password" [plan]');
    process.exit(1);
  }

  const slug = tenantName.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows: [tenant] } = await client.query(
      `INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET slug = $2 || '-' || floor(random()*9000+1000)::text
       RETURNING *`,
      [tenantName, slug, plan]
    );

    const hash = await bcrypt.hash(password, 12);
    const { rows: [user] } = await client.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'owner') RETURNING id, name, email, role`,
      [tenant.id, tenantName, email, hash]
    );

    await client.query('COMMIT');
    console.log('\n✅ Tenant criado com sucesso!');
    console.log(`   Restaurante : ${tenant.name}`);
    console.log(`   Slug        : ${tenant.slug}`);
    console.log(`   Plano       : ${tenant.plan}`);
    console.log(`   Owner email : ${user.email}`);
    console.log(`   Cardápio    : /menu/${tenant.slug}\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}
main();
