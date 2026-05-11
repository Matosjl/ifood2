#!/usr/bin/env node
/**
 * criar-demo.js — cria um restaurante demo em segundos para prospecção
 *
 * Uso:
 *   node scripts/criar-demo.js "Hamburgueria do Zé"
 *   node scripts/criar-demo.js "Pizzaria Bella" --email dono@email.com
 *   node scripts/criar-demo.js "Açaí do Zé" --tipo acai
 *   node scripts/criar-demo.js "Marmitaria" --tipo marmitaria --email dono@email.com
 *
 * Tipos disponíveis: hamburgueria (padrão), pizzaria, marmitaria, acai, lanchonete
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
  const emailIdx = args.indexOf('--email');
  const tipoIdx  = args.indexOf('--tipo');
  const email = emailIdx !== -1 ? args[emailIdx + 1] : null;
  const tipo  = tipoIdx  !== -1 ? args[tipoIdx  + 1] : 'hamburgueria'; // default
  return { name, email, tipo };
};

// ── Segmentos de produtos por tipo ────────────────────────────
const SEGMENTS = {
  hamburgueria: [
    { category: 'Hambúrgueres', items: [
      { name: 'X-Burguer Artesanal',   sale_price: 28.90, cost_price: 9.00,  description: 'Hambúrguer 180g, queijo cheddar, alface, tomate, molho especial', featured: true },
      { name: 'X-Bacon Double',         sale_price: 35.90, cost_price: 12.00, description: 'Dois hambúrgueres 150g, bacon crocante, cheddar duplo', featured: true },
      { name: 'X-Frango Crispy',        sale_price: 26.90, cost_price: 8.50,  description: 'Frango empanado crocante, alface, maionese da casa' },
      { name: 'X-Vegano',               sale_price: 27.90, cost_price: 9.00,  description: 'Hambúrguer de grão-de-bico, queijo vegano, rúcula' },
      { name: 'Smash Burguer',          sale_price: 32.90, cost_price: 11.00, description: 'Blend especial prensado, caramelizado, queijo americano', featured: true },
    ]},
    { category: 'Acompanhamentos', items: [
      { name: 'Batata Frita Crocante',  sale_price: 14.90, cost_price: 3.50, description: 'Porção 200g temperada, crocante por fora' },
      { name: 'Onion Rings',            sale_price: 16.90, cost_price: 4.00, description: 'Anéis de cebola empanados, molho barbecue' },
      { name: 'Batata Frita com Cheddar', sale_price: 19.90, cost_price: 5.00, description: 'Batatas fritas cobertas com cheddar cremoso' },
    ]},
    { category: 'Bebidas', items: [
      { name: 'Milkshake Chocolate',    sale_price: 19.90, cost_price: 5.00, description: '400ml cremoso, com chantilly' },
      { name: 'Coca-Cola 350ml',        sale_price: 7.00,  cost_price: 2.50, description: 'Lata gelada' },
      { name: 'Suco Natural 300ml',     sale_price: 9.00,  cost_price: 2.50, description: 'Laranja, limão ou maracujá' },
    ]},
    { category: 'Sobremesas', items: [
      { name: 'Brownie com Sorvete',    sale_price: 18.90, cost_price: 5.00, description: 'Brownie quentinho, sorvete de creme, calda de chocolate' },
    ]},
  ],

  pizzaria: [
    { category: 'Pizzas Salgadas', items: [
      { name: 'Margherita',             sale_price: 49.90, cost_price: 15.00, description: 'Molho de tomate, mussarela, manjericão fresco', featured: true },
      { name: 'Calabresa',              sale_price: 52.90, cost_price: 16.00, description: 'Calabresa fatiada, cebola, azeitona, orégano', featured: true },
      { name: 'Quatro Queijos',         sale_price: 59.90, cost_price: 18.00, description: 'Mussarela, provolone, catupiry, parmesão', featured: true },
      { name: 'Frango com Catupiry',    sale_price: 55.90, cost_price: 17.00, description: 'Frango desfiado, catupiry, milho' },
      { name: 'Portuguesa',             sale_price: 54.90, cost_price: 16.50, description: 'Presunto, ovo, cebola, azeitona, pimentão' },
    ]},
    { category: 'Pizzas Doces', items: [
      { name: 'Nutella com Morango',    sale_price: 52.90, cost_price: 14.00, description: 'Nutella, morangos frescos, leite condensado', featured: true },
      { name: 'Romeu e Julieta',        sale_price: 47.90, cost_price: 12.00, description: 'Catupiry, goiabada, queijo mussarela' },
    ]},
    { category: 'Bebidas', items: [
      { name: 'Refrigerante 2L',        sale_price: 12.00, cost_price: 4.00, description: 'Coca, Guaraná ou Sprite' },
      { name: 'Suco Natural 500ml',     sale_price: 12.00, cost_price: 3.00, description: 'Laranja, limão ou uva' },
      { name: 'Água Mineral 500ml',     sale_price: 5.00,  cost_price: 1.50, description: 'Com ou sem gás' },
    ]},
  ],

  marmitaria: [
    { category: 'Marmitas', items: [
      { name: 'Marmita Frango Grelhado', sale_price: 22.90, cost_price: 8.00,  description: 'Frango grelhado, arroz, feijão, salada e farofa', featured: true },
      { name: 'Marmita Bife Acebolado',  sale_price: 24.90, cost_price: 9.00,  description: 'Bife bovino, arroz, feijão, macarrão e salada', featured: true },
      { name: 'Marmita Peixe Grelhado', sale_price: 26.90, cost_price: 10.00, description: 'Filé de tilápia, arroz, feijão e legumes' },
      { name: 'Marmita Vegetariana',    sale_price: 20.90, cost_price: 7.00,  description: 'Proteína de soja, arroz, feijão, salada e grelhados' },
      { name: 'Marmita Executiva',      sale_price: 19.90, cost_price: 6.50,  description: 'Prato do dia com arroz e feijão', featured: true },
    ]},
    { category: 'Porções', items: [
      { name: 'Porção de Fritas',       sale_price: 14.90, cost_price: 3.50, description: 'Batata frita 200g' },
      { name: 'Porção de Frango',       sale_price: 22.90, cost_price: 8.00, description: 'Frango à passarinho 300g' },
    ]},
    { category: 'Bebidas', items: [
      { name: 'Suco Natural 300ml',     sale_price: 8.00, cost_price: 2.00, description: 'Laranja, maracujá ou abacaxi' },
      { name: 'Refrigerante Lata',      sale_price: 6.00, cost_price: 2.00, description: 'Diversas opções' },
      { name: 'Água Mineral',           sale_price: 4.00, cost_price: 1.00, description: '500ml' },
    ]},
  ],

  acai: [
    { category: 'Açaí', items: [
      { name: 'Açaí 300ml',             sale_price: 18.90, cost_price: 5.00, description: 'Açaí cremoso com granola, banana e mel', featured: true },
      { name: 'Açaí 500ml',             sale_price: 24.90, cost_price: 7.00, description: 'Açaí cremoso, escolha 3 complementos', featured: true },
      { name: 'Açaí 700ml',             sale_price: 32.90, cost_price: 9.00, description: 'Açaí cremoso, escolha 5 complementos', featured: true },
      { name: 'Bowl de Açaí',           sale_price: 28.90, cost_price: 8.00, description: 'Açaí, granola, frutas da estação, mel' },
    ]},
    { category: 'Vitaminas', items: [
      { name: 'Vitamina de Banana',     sale_price: 12.90, cost_price: 3.00, description: 'Banana, leite, mel, aveia' },
      { name: 'Vitamina de Morango',    sale_price: 13.90, cost_price: 3.50, description: 'Morango, leite, açúcar, leite condensado' },
      { name: 'Vitamina de Abacate',    sale_price: 14.90, cost_price: 4.00, description: 'Abacate, leite, mel, limão' },
    ]},
    { category: 'Complementos', items: [
      { name: 'Granola Extra 50g',      sale_price: 4.00, cost_price: 1.00, description: 'Granola crocante artesanal' },
      { name: 'Leite Ninho Extra',      sale_price: 3.00, cost_price: 0.80, description: 'Porção extra de leite ninho' },
      { name: 'Paçoca',                 sale_price: 3.00, cost_price: 0.80, description: 'Paçoca triturada' },
    ]},
    { category: 'Bebidas', items: [
      { name: 'Água de Coco 300ml',     sale_price: 8.00, cost_price: 2.50, description: 'Natural gelada' },
      { name: 'Limonada 400ml',         sale_price: 10.00, cost_price: 2.00, description: 'Limonada suíça com leite condensado' },
    ]},
  ],

  lanchonete: [
    { category: 'Lanches', items: [
      { name: 'Misto Quente',           sale_price: 12.90, cost_price: 3.00, description: 'Presunto e queijo na chapa', featured: true },
      { name: 'Bauru',                  sale_price: 16.90, cost_price: 4.50, description: 'Rosbife, queijo derretido, tomate, pepino', featured: true },
      { name: 'Sanduíche Natural',      sale_price: 14.90, cost_price: 4.00, description: 'Frango, cenoura, requeijão, alface' },
      { name: 'Cachorro Quente',        sale_price: 11.90, cost_price: 3.00, description: 'Salsicha, molho especial, batata palha' },
    ]},
    { category: 'Salgados', items: [
      { name: 'Coxinha de Frango',      sale_price: 6.90,  cost_price: 2.00, description: 'Frango desfiado temperado, massa crocante', featured: true },
      { name: 'Esfiha de Carne',        sale_price: 6.90,  cost_price: 2.00, description: 'Carne moída temperada com toque árabe' },
      { name: 'Pão de Queijo',          sale_price: 5.90,  cost_price: 1.50, description: 'Caseiro, quentinho, tamanho grande' },
      { name: 'Pastel de Queijo',       sale_price: 8.90,  cost_price: 2.50, description: 'Queijo mussarela, massa crocante' },
    ]},
    { category: 'Bebidas', items: [
      { name: 'Café Expresso',          sale_price: 5.00,  cost_price: 1.00, description: 'Curto ou longo' },
      { name: 'Cappuccino',             sale_price: 8.00,  cost_price: 2.00, description: 'Com canela' },
      { name: 'Refrigerante Lata',      sale_price: 6.00,  cost_price: 2.00, description: 'Coca, Guaraná, Fanta' },
      { name: 'Suco Natural 300ml',     sale_price: 8.00,  cost_price: 2.00, description: 'Laranja ou limão' },
    ]},
    { category: 'Doces', items: [
      { name: 'Brigadeiro Gourmet',     sale_price: 5.00,  cost_price: 1.50, description: 'Brigadeiro artesanal, vários sabores', featured: true },
      { name: 'Fatia de Bolo',          sale_price: 9.90,  cost_price: 3.00, description: 'Bolo do dia com cobertura' },
    ]},
  ],
};

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const { name, email: emailArg, tipo } = parseArgs();

  if (!name) {
    console.error('\nUso: node scripts/criar-demo.js "Nome do Restaurante" [--email dono@email.com] [--tipo hamburgueria|pizzaria|marmitaria|acai|lanchonete]\n');
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
    const segmentProducts = SEGMENTS[tipo] ?? SEGMENTS.hamburgueria;
    for (const { category, items } of segmentProducts) {
      const { rows: [cat] } = await client.query(
        `INSERT INTO categories (tenant_id, name) VALUES ($1, $2)
         ON CONFLICT (tenant_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [tenant.id, category]
      );
      for (const item of items) {
        await client.query(
          `INSERT INTO products
             (tenant_id, category_id, name, description, sale_price, cost_price, stock_qty, featured, active)
           VALUES ($1, $2, $3, $4, $5, $6, 50, $7, true)`,
          [tenant.id, cat.id, item.name, item.description, item.sale_price, item.cost_price, item.featured ?? false]
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
    console.log(`  🍽️  Segmento: ${tipo}`);
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
