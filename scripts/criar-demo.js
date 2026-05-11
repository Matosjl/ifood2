#!/usr/bin/env node
/**
 * criar-demo.js — cria um restaurante demo em segundos para prospecção
 *
 * Uso:
 *   node scripts/criar-demo.js "Hamburgueria do Zé"
 *   node scripts/criar-demo.js "Pizzaria Bella" --email dono@email.com
 *
 * O script cria:
 *   - Tenant com trial ativo (Premium 3 dias)
 *   - Usuário owner com senha aleatória
 *   - Categorias e produtos de exemplo
 *   - Imprime URL do painel e do cardápio digital
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');

// ── Config ────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'saas_restaurant',
  user:     process.env.DB_USER     || 'saas_user',
  password: process.env.DB_PASSWORD || '',
});

const BASE_URL     = process.env.APP_URL || 'https://zapfome.com.br';
const TRIAL_DAYS   = 10;
const PREMIUM_DAYS = 3;

// ── Helpers ───────────────────────────────────────────────────
const slugify = (name) =>
  name.toLowerCase().trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 100);

const randomPassword = () => crypto.randomBytes(5).toString('hex'); // ex: a3f9b2c1d0

const parseArgs = () => {
  const args = process.argv.slice(2);
  const name = args.find(a => !a.startsWith('--'));
  const emailFlag = args.indexOf('--email');
  const email = emailFlag !== -1 ? args[emailFlag + 1] : null;
  return { name, email };
};

// ── Demo products por categoria ───────────────────────────────
const DEMO_PRODUCTS = [
  {
    category: 'Lanches',
    items: [
      { name: 'X-Burguer Clássico',   sale_price: 24.90, cost_price: 8.00,  description: 'Hambúrguer artesanal, queijo, alface, tomate' },
      { name: 'X-Bacon Especial',     sale_price: 29.90, cost_price: 10.00, description: 'Hambúrguer duplo, bacon crocante, cheddar' },
      { name: 'X-Frango Crispy',      sale_price: 26.90, cost_price: 8.50,  description: 'Frango empanado crocante, maionese da casa' },
    ],
  },
  {
    category: 'Bebidas',
    items: [
      { name: 'Coca-Cola 350ml',  sale_price: 6.00,  cost_price: 2.50, description: 'Lata gelada' },
      { name: 'Suco de Laranja',  sale_price: 8.00,  cost_price: 2.00, description: 'Natural 300ml' },
      { name: 'Água Mineral',     sale_price: 4.00,  cost_price: 1.00, description: '500ml sem gás' },
    ],
  },
  {
    category: 'Acompanhamentos',
    items: [
      { name: 'Batata Frita',         sale_price: 12.90, cost_price: 3.00, description: 'Porção individual crocante' },
      { name: 'Onion Rings',          sale_price: 14.90, cost_price: 3.50, description: 'Anéis de cebola empanados' },
    ],
  },
  {
    category: 'Sobremesas',
    items: [
      { name: 'Brownie com Sorvete',  sale_price: 16.90, cost_price: 5.00, description: 'Brownie quentinho com sorvete de creme' },
      { name: 'Milkshake 400ml',      sale_price: 18.90, cost_price: 5.50, description: 'Chocolate, morango ou baunilha' },
    ],
  },
];

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const { name, email: emailArg } = parseArgs();

  if (!name) {
    console.error('\nUso: node scripts/criar-demo.js "Nome do Restaurante" [--email dono@email.com]\n');
    process.exit(1);
  }

  const slug     = slugify(name);
  const email    = emailArg || `demo-${slug.slice(0, 20)}-${Date.now().toString(36)}@zapfome.demo`;
  const password = randomPassword();
  const now      = Date.now();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Criar tenant
    const { rows: [tenant] } = await client.query(
      `INSERT INTO tenants
         (name, slug, plan, subscription_status,
          trial_ends_at, premium_trial_ends_at, billing_period_start)
       VALUES ($1, $2, 'premium', 'trialing', $3, $4, date_trunc('month', NOW()))
       ON CONFLICT (slug)
         DO UPDATE SET slug = $2 || '-demo-' || floor(random()*999+1)::text
       RETURNING *`,
      [
        name,
        slug,
        new Date(now + TRIAL_DAYS   * 86400000),
        new Date(now + PREMIUM_DAYS * 86400000),
      ]
    );

    // 2. Criar order counter
    await client.query(
      `INSERT INTO order_counters (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [tenant.id]
    );

    // 3. Criar usuário owner
    const hash = await bcrypt.hash(password, 10);
    await client.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'owner')`,
      [tenant.id, name, email, hash]
    );

    // 4. Criar categorias e produtos
    for (const { category, items } of DEMO_PRODUCTS) {
      const { rows: [cat] } = await client.query(
        `INSERT INTO categories (tenant_id, name) VALUES ($1, $2)
         ON CONFLICT (tenant_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [tenant.id, category]
      );
      for (const item of items) {
        await client.query(
          `INSERT INTO products
             (tenant_id, category_id, name, description, sale_price, cost_price, stock_qty, active)
           VALUES ($1, $2, $3, $4, $5, $6, 50, true)`,
          [tenant.id, cat.id, item.name, item.description, item.sale_price, item.cost_price]
        );
      }
    }

    await client.query('COMMIT');

    // ── Output ───────────────────────────────────────────────
    const line = '─'.repeat(54);
    console.log(`\n${line}`);
    console.log(`  ⚡ DEMO CRIADO: ${name}`);
    console.log(line);
    console.log(`  📱 Cardápio digital:`);
    console.log(`     ${BASE_URL}/menu/${tenant.slug}`);
    console.log('');
    console.log(`  🔑 Acesso ao painel:`);
    console.log(`     URL:   ${BASE_URL}/entrar`);
    console.log(`     Email: ${email}`);
    console.log(`     Senha: ${password}`);
    console.log('');
    console.log(`  ⭐ Trial: ${PREMIUM_DAYS}d Premium + ${TRIAL_DAYS - PREMIUM_DAYS}d Basic`);
    console.log(`  🆔 Tenant ID: ${tenant.id}`);
    console.log(`${line}\n`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nErro ao criar demo:', err.message, '\n');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
