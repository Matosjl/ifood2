#!/usr/bin/env node
/**
 * Stress test em massa: cria N restaurantes via DB + M pedidos via HTTP
 * Uso: node stress-test-mass.js <db_url> <api_url> [restaurantes=50] [pedidos=100]
 * Ex:  DB_URL="postgres://user:pass@localhost:5432/db" node stress-test-mass.js http://localhost 50 100
 */

const https  = require('https');
const http   = require('http');
const urlLib = require('url');
const crypto = require('crypto');
const { execSync } = require('child_process');

const [,, API_URL_RAW, R_STR, P_STR] = process.argv;
if (!API_URL_RAW) {
  console.error('Uso: DB_URL="postgres://..." node stress-test-mass.js <api_url> [rest=50] [pedidos=100]');
  process.exit(1);
}

const API_URL   = API_URL_RAW.replace(/\/$/, '') + '/api';
const N_REST    = parseInt(R_STR  ?? '50',  10);
const N_PEDIDOS = parseInt(P_STR  ?? '100', 10);
// Suporta DB_URL direto ou via docker exec
const DB_URL       = process.env.DB_URL;
const DB_CONTAINER = process.env.DB_CONTAINER ?? 'saas_postgres';
const DB_USER_ENV  = process.env.DB_USER ?? 'postgres';
const DB_NAME_ENV  = process.env.DB_NAME ?? 'saas_db';

// ── HTTP helper ───────────────────────────────────────────────

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const parsed  = urlLib.parse(API_URL + path);
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port ?? (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token   && { Authorization: `Bearer ${token}` }),
        ...(payload && { 'Content-Length': Buffer.byteLength(payload) }),
      },
    };
    const transport = parsed.protocol === 'https:' ? https : http;
    const r = transport.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rnd   = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ── Seed via docker exec psql ─────────────────────────────────

function psql(sql) {
  try {
    // Sempre usa docker exec — postgres não está exposto no host
    const cmd = `docker exec ${DB_CONTAINER} psql -U ${DB_USER_ENV} -d ${DB_NAME_ENV} -t -c "${sql.replace(/"/g, '\\"')}"`;
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    throw new Error(`psql: ${e.stderr?.toString()?.trim() ?? e.message}`);
  }
}

async function seedRestaurantes(n) {
  process.stdout.write(`  🌱 Criando ${n} restaurantes no banco...`);

  // Limpar dados de testes anteriores (cascata cuida de users, products, etc.)
  psql(`DELETE FROM orders WHERE tenant_id IN (SELECT id FROM tenants WHERE name LIKE 'Load Test %')`);
  psql(`DELETE FROM cash_registers WHERE tenant_id IN (SELECT id FROM tenants WHERE name LIKE 'Load Test %')`);
  psql(`DELETE FROM products WHERE tenant_id IN (SELECT id FROM tenants WHERE name LIKE 'Load Test %')`);
  psql(`DELETE FROM order_counters WHERE tenant_id IN (SELECT id FROM tenants WHERE name LIKE 'Load Test %')`);
  psql(`DELETE FROM users WHERE email LIKE 'stressteste%@load.test'`);
  psql(`DELETE FROM tenants WHERE name LIKE 'Load Test %'`);

  // bcrypt hash de 'Senha1234' (pre-computado)
  const hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LPVImNNyRXW';

  const tenants = [];
  for (let i = 1; i <= n; i++) {
    const tenantId = psql(`SELECT gen_random_uuid()`);
    const userId   = psql(`SELECT gen_random_uuid()`);
    const email    = `stressteste${i}@load.test`;

    psql(`INSERT INTO tenants (id, name, slug, plan, subscription_status, trial_ends_at)
          VALUES ('${tenantId}', 'Load Test ${i}', 'load-test-${i}-${Date.now()}', 'basic', 'trialing', NOW() + INTERVAL '14 days')`);

    psql(`INSERT INTO order_counters (tenant_id) VALUES ('${tenantId}')`);

    psql(`INSERT INTO users (id, tenant_id, name, email, password_hash, role)
          VALUES ('${userId}', '${tenantId}', 'Admin ${i}', '${email}', '${hash}', 'owner')`);

    psql(`INSERT INTO products (tenant_id, name, sale_type, sale_price, active)
          VALUES ('${tenantId}', 'Item Teste', 'unit', 10.00, true)`);

    psql(`INSERT INTO cash_registers (tenant_id, opened_by, opening_balance)
          VALUES ('${tenantId}', '${userId}', 0)`);

    tenants.push({ idx: i, tenantId, userId, email });
  }

  console.log(' ✅');
  return tenants;
}

// ── Pedidos para um restaurante ───────────────────────────────

async function criarPedidos(email, senha) {
  const loginRes = await req('POST', '/auth/login', { email, password: senha });
  if (loginRes.status !== 200) return { ok: 0, fail: N_PEDIDOS, error: loginRes.body?.message };

  let { accessToken: token, refreshToken } = loginRes.body.data;

  // Buscar produto
  const prodRes = await req('GET', '/products?active=true&limit=5', null, token);
  const products = (prodRes.body?.data?.data ?? prodRes.body?.data ?? []).filter(p => p.active);
  if (!products.length) return { ok: 0, fail: N_PEDIDOS, error: 'sem produtos' };

  const PAYMENT  = ['cash', 'pix', 'credit', 'debit'];
  const DELIVERY = ['pickup', 'delivery'];

  let ok = 0, fail = 0;

  for (let i = 0; i < N_PEDIDOS; i++) {
    const prod         = rnd(products);
    const deliveryType = rnd(DELIVERY);
    const body = {
      customerName:    `Cliente ${i + 1}`,
      deliveryType,
      customerAddress: deliveryType === 'delivery' ? `Rua ${i + 1}` : undefined,
      paymentMethod:   rnd(PAYMENT),
      channel:         'manual',
      items:           [{ productId: prod.id, quantity: 1 }],
    };

    const res = await req('POST', '/orders', body, token);

    if (res.status === 401) {
      const ref = await req('POST', '/auth/refresh', { refreshToken });
      if (ref.status === 200) {
        token        = ref.body.data.accessToken;
        refreshToken = ref.body.data.refreshToken;
        const retry  = await req('POST', '/orders', body, token);
        retry.status === 201 ? ok++ : fail++;
      } else fail++;
    } else if (res.status === 201) {
      ok++;
    } else {
      fail++;
    }

    await sleep(20);
  }

  return { ok, fail, error: null };
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Stress test em massa`);
  console.log(`   ${N_REST} restaurantes × ${N_PEDIDOS} pedidos = ${N_REST * N_PEDIDOS} pedidos\n`);

  const tenants = await seedRestaurantes(N_REST);

  console.log(`  🍽️  Criando pedidos (5 restaurantes em paralelo)...\n`);

  const CONCURRENCY = 5;
  const startTime   = Date.now();
  let totalOk = 0, totalFail = 0, restOk = 0, restFail = 0;

  for (let i = 0; i < tenants.length; i += CONCURRENCY) {
    const batch   = tenants.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(t => criarPedidos(t.email, 'Senha1234').then(r => ({ ...r, idx: t.idx })))
    );

    for (const r of results) {
      totalOk   += r.ok;
      totalFail += r.fail;
      const icon = (r.ok === N_PEDIDOS) ? '✅' : r.ok > 0 ? '⚠️ ' : '❌';
      process.stdout.write(`  ${icon} Rest #${r.idx}: ${r.ok}/${N_PEDIDOS}${r.error ? ` — ${r.error}` : ''}\n`);
      r.ok === N_PEDIDOS ? restOk++ : restFail++;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const taxa    = ((totalOk / (N_REST * N_PEDIDOS)) * 100).toFixed(1);

  console.log('\n' + '─'.repeat(50));
  console.log(`📊 RESULTADO FINAL`);
  console.log(`   Tempo:              ${elapsed}s`);
  console.log(`   Restaurantes OK:    ${restOk}/${N_REST}`);
  console.log(`   Pedidos criados:    ${totalOk}/${N_REST * N_PEDIDOS} (${taxa}%)`);
  console.log(`   Pedidos com erro:   ${totalFail}`);
  console.log(parseFloat(taxa) >= 95
    ? `\n   ✅ SISTEMA ESTÁVEL — ${taxa}% de sucesso\n`
    : `\n   ⚠️  Taxa abaixo do esperado: ${taxa}%\n`
  );
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
