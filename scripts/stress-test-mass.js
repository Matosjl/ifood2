#!/usr/bin/env node
/**
 * Stress test em massa: N restaurantes × M pedidos
 * Uso: node stress-test-mass.js <api_url> [restaurantes=50] [pedidos=100]
 * Ex:  node stress-test-mass.js http://localhost 50 100
 */

const https = require('https');
const http  = require('http');
const url   = require('url');

const [,, API_URL_RAW, R_STR, P_STR] = process.argv;
if (!API_URL_RAW) {
  console.error('Uso: node stress-test-mass.js <api_url> [restaurantes=50] [pedidos=100]');
  process.exit(1);
}

const API_URL     = API_URL_RAW.replace(/\/$/, '') + '/api';
const N_REST      = parseInt(R_STR ?? '50', 10);
const N_PEDIDOS   = parseInt(P_STR ?? '100', 10);
const CONCURRENCY = 5; // restaurantes em paralelo

// ── HTTP helper ───────────────────────────────────────────────

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const parsed  = url.parse(API_URL + path);
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

// ── Setup de um restaurante ───────────────────────────────────

async function setupRestaurante(idx) {
  const email = `stressmass${idx}@teste.com`;
  const senha = 'Senha1234';

  // Registrar (ignora se já existe)
  const regRes = await req('POST', '/auth/trial-register', {
    tenantName: `Stress Rest ${idx}`,
    name: `Admin ${idx}`,
    email,
    password: senha,
  });

  let token, refreshToken;

  if (regRes.status === 201) {
    token        = regRes.body.data.accessToken;
    refreshToken = regRes.body.data.refreshToken;
  } else {
    // Já existe — faz login
    const loginRes = await req('POST', '/auth/login', { email, password: senha });
    if (loginRes.status !== 200) throw new Error(`Login falhou rest ${idx}: ${loginRes.body?.message}`);
    token        = loginRes.body.data.accessToken;
    refreshToken = loginRes.body.data.refreshToken;
  }

  // Buscar produtos existentes
  let products = [];
  const prodRes = await req('GET', '/products?active=true&limit=10', null, token);
  products = (prodRes.body?.data?.data ?? prodRes.body?.data ?? []).filter(p => p.active);

  // Criar produtos se não existir nenhum
  if (products.length === 0) {
    const catRes = await req('POST', '/categories', { name: 'Cardápio' }, token);
    const catId  = catRes.body?.data?.id;

    for (const name of ['Hambúrguer', 'Pizza', 'Suco']) {
      const p = await req('POST', '/products', {
        name, saleType: 'unit', salePrice: '20.00', categoryId: catId,
      }, token);
      if (p.body?.data?.id) products.push(p.body.data);
    }
  }

  if (products.length === 0) throw new Error(`Rest ${idx}: nenhum produto criado`);

  // Abrir caixa (ignora se já aberto)
  const caixaRes = await req('GET', '/caixa/current', null, token);
  if (!caixaRes.body?.data) {
    await req('POST', '/caixa/open', { initialBalance: 0 }, token);
  }

  return { idx, email, token, refreshToken, products };
}

// ── Pedidos de um restaurante ─────────────────────────────────

async function criarPedidos(rest) {
  const PAYMENT  = ['cash', 'pix', 'credit', 'debit'];
  const DELIVERY = ['pickup', 'delivery'];
  const CHANNELS = ['manual', 'whatsapp'];

  let ok = 0, fail = 0;

  for (let i = 0; i < N_PEDIDOS; i++) {
    const prod = rnd(rest.products);
    const deliveryType = rnd(DELIVERY);
    const body = {
      customerName:    `Cliente ${i + 1}`,
      deliveryType,
      customerAddress: deliveryType === 'delivery' ? `Rua ${i + 1}` : undefined,
      paymentMethod:   rnd(PAYMENT),
      channel:         rnd(CHANNELS),
      items:           [{ productId: prod.id, quantity: 1 }],
    };

    const res = await req('POST', '/orders', body, rest.token);

    if (res.status === 401) {
      const ref = await req('POST', '/auth/refresh', { refreshToken: rest.refreshToken });
      if (ref.status === 200) {
        rest.token        = ref.body.data.accessToken;
        rest.refreshToken = ref.body.data.refreshToken;
        const retry = await req('POST', '/orders', body, rest.token);
        retry.status === 201 ? ok++ : fail++;
      } else { fail++; }
    } else if (res.status === 201) {
      ok++;
    } else {
      fail++;
    }

    await sleep(30); // 30ms entre pedidos
  }

  return { ok, fail };
}

// ── Runner com concorrência ───────────────────────────────────

async function runBatch(batch) {
  return Promise.all(batch.map(async (idx) => {
    try {
      const rest    = await setupRestaurante(idx);
      const result  = await criarPedidos(rest);
      return { idx, ...result, error: null };
    } catch (e) {
      return { idx, ok: 0, fail: N_PEDIDOS, error: e.message };
    }
  }));
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Stress test em massa`);
  console.log(`   ${N_REST} restaurantes × ${N_PEDIDOS} pedidos = ${N_REST * N_PEDIDOS} pedidos total`);
  console.log(`   Concorrência: ${CONCURRENCY} restaurantes em paralelo\n`);

  const startTime   = Date.now();
  let totalOk       = 0;
  let totalFail     = 0;
  let restOk        = 0;
  let restFail      = 0;

  // Processar em lotes de CONCURRENCY
  for (let i = 0; i < N_REST; i += CONCURRENCY) {
    const batch   = Array.from({ length: Math.min(CONCURRENCY, N_REST - i) }, (_, j) => i + j + 1);
    const results = await runBatch(batch);

    for (const r of results) {
      totalOk   += r.ok;
      totalFail += r.fail;
      if (r.error || r.fail > r.ok) {
        restFail++;
        process.stdout.write(`  ❌ Rest #${r.idx}: ${r.ok}/${N_PEDIDOS} criados${r.error ? ` — ${r.error}` : ''}\n`);
      } else {
        restOk++;
        process.stdout.write(`  ✅ Rest #${r.idx}: ${r.ok}/${N_PEDIDOS} criados\n`);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const taxa    = ((totalOk / (N_REST * N_PEDIDOS)) * 100).toFixed(1);

  console.log('\n' + '─'.repeat(50));
  console.log(`📊 RESULTADO FINAL`);
  console.log(`   Tempo total:        ${elapsed}s`);
  console.log(`   Restaurantes OK:    ${restOk}/${N_REST}`);
  console.log(`   Pedidos criados:    ${totalOk}/${N_REST * N_PEDIDOS} (${taxa}%)`);
  console.log(`   Pedidos com erro:   ${totalFail}`);

  if (parseFloat(taxa) >= 95) {
    console.log(`\n   ✅ SISTEMA ESTÁVEL — taxa de sucesso ${taxa}%\n`);
  } else {
    console.log(`\n   ⚠️  Taxa de sucesso abaixo do esperado: ${taxa}%\n`);
  }
}

main().catch(e => { console.error('\n❌ Erro fatal:', e.message); process.exit(1); });
