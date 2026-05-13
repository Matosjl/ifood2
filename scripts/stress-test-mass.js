#!/usr/bin/env node
/**
 * Stress test em massa: cria N restaurantes via DB + M pedidos via HTTP
 * Uso: node stress-test-mass.js <api_url> [restaurantes=50] [pedidos=100]
 * Ex:  JWT_SECRET=xxx DB_CONTAINER=saas_postgres node stress-test-mass.js http://localhost 10 25
 */

const https  = require('https');
const http   = require('http');
const urlLib = require('url');
const { execSync } = require('child_process');
const jwt   = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const [,, API_URL_RAW, R_STR, P_STR] = process.argv;
if (!API_URL_RAW) {
  console.error('Uso: JWT_SECRET="..." node stress-test-mass.js <api_url> [rest=50] [pedidos=100]');
  process.exit(1);
}

const API_URL      = API_URL_RAW.replace(/\/$/, '') + '/api';
const N_REST       = parseInt(R_STR  ?? '50',  10);
const N_PEDIDOS    = parseInt(P_STR  ?? '100', 10);
const DB_CONTAINER = process.env.DB_CONTAINER ?? 'saas_postgres';
const DB_USER_ENV  = process.env.DB_USER  ?? 'postgres';
const DB_NAME_ENV  = process.env.DB_NAME  ?? 'saas_db';
const JWT_SECRET   = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('Defina JWT_SECRET no ambiente'); process.exit(1); }

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

// ── Retry em caso de 429 ou 503 ──────────────────────────────

async function withRetry(fn, { maxRetries = 5, retryAfterMs = 3000, label = '' } = {}) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await fn();
    // 429 = rate limit, 503 = servidoo sobrecarregado — ambos sao transitorios
    if (result.status !== 429 && result.status !== 503) return result;
    const waitMs = retryAfterMs * attempt;
    if (attempt < maxRetries) {
      const code = result.status;
      process.stdout.write(`\n    [${code}] ${code === 429 ? 'Rate limit' : 'Servidor ocupado'} em ${label} - aguardando ${(waitMs/1000).toFixed(1)}s (${attempt}/${maxRetries})...`);
      await sleep(waitMs);
    }
  }
  return fn();
}

// ── Seed via docker exec psql ─────────────────────────────────

function psql(sql) {
  try {
    const cmd = `docker exec ${DB_CONTAINER} psql -U ${DB_USER_ENV} -d ${DB_NAME_ENV} -t -c "${sql.replace(/"/g, '\\"')}"`;
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    throw new Error(`psql: ${e.stderr?.toString()?.trim() ?? e.message}`);
  }
}

async function seedRestaurantes(n) {
  process.stdout.write(`  [seed] Criando ${n} restaurantes no banco...`);

  psql(`DELETE FROM orders WHERE tenant_id IN (SELECT id FROM tenants WHERE name LIKE 'Load Test %')`);
  psql(`DELETE FROM cash_registers WHERE tenant_id IN (SELECT id FROM tenants WHERE name LIKE 'Load Test %')`);
  psql(`DELETE FROM products WHERE tenant_id IN (SELECT id FROM tenants WHERE name LIKE 'Load Test %')`);
  psql(`DELETE FROM order_counters WHERE tenant_id IN (SELECT id FROM tenants WHERE name LIKE 'Load Test %')`);
  psql(`DELETE FROM users WHERE email LIKE 'stressteste%@load.test'`);
  psql(`DELETE FROM tenants WHERE name LIKE 'Load Test %'`);

  const hash = bcrypt.hashSync('Senha1234', 10);
  const tenants = [];

  for (let i = 1; i <= n; i++) {
    const tenantId = psql(`SELECT gen_random_uuid()`).trim();
    const userId   = psql(`SELECT gen_random_uuid()`).trim();
    const email    = `stressteste${i}@load.test`;
    const slug     = `load-test-${i}-${Date.now()}`;

    psql(`INSERT INTO tenants (id, name, slug, plan, subscription_status, trial_ends_at) VALUES ('${tenantId}', 'Load Test ${i}', '${slug}', 'basic', 'trialing', NOW() + INTERVAL '14 days')`);
    psql(`INSERT INTO order_counters (tenant_id) VALUES ('${tenantId}')`);
    psql(`INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES ('${userId}', '${tenantId}', 'Admin ${i}', '${email}', '${hash}', 'owner')`);
    psql(`INSERT INTO products (tenant_id, name, sale_type, sale_price, active) VALUES ('${tenantId}', 'Item Teste', 'unit', 10.00, true)`);
    psql(`INSERT INTO cash_registers (tenant_id, opened_by, opening_balance) VALUES ('${tenantId}', '${userId}', 0)`);

    tenants.push({ idx: i, tenantId, userId, email });
    if (i % 10 === 0) process.stdout.write(` ${i}...`);
  }

  console.log(' OK');
  return tenants;
}

// ── Pedidos para um restaurante ───────────────────────────────

async function criarPedidos(tenantInfo) {
  let token = jwt.sign(
    { sub: tenantInfo.userId, tenantId: tenantInfo.tenantId, role: 'owner' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  // Busca produtos com retry em caso de 429
  const prodRes = await withRetry(
    () => req('GET', '/products?active=true&limit=5', null, token),
    { maxRetries: 6, retryAfterMs: 2000, label: `Rest #${tenantInfo.idx} produtos` }
  );

  if (prodRes.status !== 200) {
    return { ok: 0, fail: N_PEDIDOS, error: `produtos HTTP ${prodRes.status}` };
  }

  const products = (prodRes.body?.data?.data ?? prodRes.body?.data ?? []).filter(p => p.active);
  if (!products.length) {
    return { ok: 0, fail: N_PEDIDOS, error: `sem produtos (HTTP ${prodRes.status})` };
  }

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

    const res = await withRetry(
      () => req('POST', '/orders', body, token),
      { maxRetries: 4, retryAfterMs: 2500, label: `Rest #${tenantInfo.idx} pedido ${i+1}` }
    );

    if (res.status === 401) {
      token = jwt.sign(
        { sub: tenantInfo.userId, tenantId: tenantInfo.tenantId, role: 'owner' },
        JWT_SECRET, { expiresIn: '2h' }
      );
      const retry = await req('POST', '/orders', body, token);
      retry.status === 201 ? ok++ : fail++;
    } else if (res.status === 201) {
      ok++;
    } else {
      fail++;
      if (fail <= 2) {
        process.stdout.write(`\n     Pedido ${i+1} falhou: HTTP ${res.status} - ${res.body?.message ?? ''}\n`);
      }
    }

    await sleep(220);
  }

  return { ok, fail, error: null };
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(`\nStress test em massa`);
  console.log(`   ${N_REST} restaurantes x ${N_PEDIDOS} pedidos = ${N_REST * N_PEDIDOS} pedidos`);
  console.log(`   Modo: sequencial - 220ms entre pedidos - retry em 429 - 2s entre restaurantes\n`);

  const tenants = await seedRestaurantes(N_REST);
  console.log(`  Criando pedidos (1 restaurante por vez)...\n`);

  const startTime   = Date.now();
  let totalOk = 0, totalFail = 0, restOk = 0, restFail = 0;

  for (let i = 0; i < tenants.length; i++) {
    if (i > 0) await sleep(2000);

    const r = await criarPedidos(tenants[i]);
    totalOk   += r.ok;
    totalFail += r.fail;
    const icon = (r.ok === N_PEDIDOS) ? '[OK]' : r.ok > 0 ? '[PARCIAL]' : '[FALHA]';
    process.stdout.write(`  ${icon} Rest #${tenants[i].idx}: ${r.ok}/${N_PEDIDOS}${r.error ? ` - ${r.error}` : ''}\n`);
    r.ok === N_PEDIDOS ? restOk++ : restFail++;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const taxa    = ((totalOk / (N_REST * N_PEDIDOS)) * 100).toFixed(1);

  console.log('\n' + '-'.repeat(50));
  console.log(`RESULTADO FINAL`);
  console.log(`   Tempo:              ${elapsed}s`);
  console.log(`   Restaurantes OK:    ${restOk}/${N_REST}`);
  console.log(`   Pedidos criados:    ${totalOk}/${N_REST * N_PEDIDOS} (${taxa}%)`);
  console.log(`   Pedidos com erro:   ${totalFail}`);
  console.log(parseFloat(taxa) >= 95
    ? `\n   SISTEMA ESTAVEL - ${taxa}% de sucesso\n`
    : `\n   Taxa abaixo do esperado: ${taxa}%\n`
  );
}

main().catch(e => { console.error('\nERRO FATAL:', e.message); process.exit(1); });
