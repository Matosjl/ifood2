#!/usr/bin/env node
/**
 * Stress test: cria N pedidos em um restaurante e verifica após 15 min
 * Uso: node stress-test-orders.js <email> <senha> <api_url> [total_pedidos]
 * Ex:  node stress-test-orders.js owner@rest.com senha123 https://zapfome.com.br 100
 */

const https  = require('https');
const http   = require('http');
const url    = require('url');

const [,, EMAIL, SENHA, API_URL_RAW, N_STR] = process.argv;

if (!EMAIL || !SENHA || !API_URL_RAW) {
  console.error('Uso: node stress-test-orders.js <email> <senha> <api_url> [total=100]');
  process.exit(1);
}

const API_URL = API_URL_RAW.replace(/\/$/, '') + '/api';
const TOTAL   = parseInt(N_STR ?? '100', 10);

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
        ...(token         && { Authorization: `Bearer ${token}` }),
        ...(payload       && { 'Content-Length': Buffer.byteLength(payload) }),
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

// ── Helpers ───────────────────────────────────────────────────

const sleep  = (ms) => new Promise((r) => setTimeout(r, ms));
const pad    = (n)  => String(n).padStart(3, ' ');
const fmt    = (n)  => `R$ ${parseFloat(n ?? 0).toFixed(2)}`;
const rnd    = (arr) => arr[Math.floor(Math.random() * arr.length)];

function progress(done, total, errors) {
  const pct  = Math.round((done / total) * 100);
  const bar  = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
  process.stdout.write(`\r  [${bar}] ${pad(done)}/${total}  erros: ${errors}  `);
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Stress test — ${TOTAL} pedidos em ${API_URL}\n`);

  // 1. Login
  process.stdout.write('  📋 Fazendo login... ');
  const loginRes = await req('POST', '/auth/login', { email: EMAIL, password: SENHA });
  if (loginRes.status !== 200 || !loginRes.body?.data?.accessToken) {
    console.error('\n  ❌ Login falhou:', loginRes.body?.message ?? loginRes.status);
    process.exit(1);
  }
  const { accessToken, refreshToken } = loginRes.body.data;
  console.log('✅ OK');

  // 2. Buscar produtos
  process.stdout.write('  📦 Buscando produtos... ');
  const prodRes = await req('GET', '/products?active=true&limit=50', null, accessToken);
  const products = prodRes.body?.data?.data ?? prodRes.body?.data ?? [];
  const activeProds = products.filter((p) => p.active);
  if (activeProds.length === 0) {
    console.error('\n  ❌ Nenhum produto ativo com estoque encontrado. Cadastre produtos primeiro.');
    process.exit(1);
  }
  console.log(`✅ ${activeProds.length} produtos`);

  // 3. Verificar/abrir caixa
  process.stdout.write('  💰 Verificando caixa... ');
  const caixaRes = await req('GET', '/caixa/current', null, accessToken);
  if (!caixaRes.body?.data) {
    await req('POST', '/caixa/open', { initialBalance: 0 }, accessToken);
    console.log('✅ Caixa aberto');
  } else {
    console.log('✅ Caixa já aberto');
  }

  // 4. Criar pedidos
  console.log(`\n  🍽️  Criando ${TOTAL} pedidos...\n`);
  const CHANNELS = ['manual', 'whatsapp', 'ifood'];
  const PAYMENT  = ['cash', 'pix', 'credit', 'debit'];
  const DELIVERY = ['pickup', 'delivery'];

  let token     = accessToken;
  let refresh   = refreshToken;
  let created   = 0;
  let errors    = 0;
  const startTime = Date.now();
  const orderIds  = [];

  for (let i = 0; i < TOTAL; i++) {
    // Seleciona 1-3 produtos aleatórios
    const shuffled = [...activeProds].sort(() => Math.random() - 0.5).slice(0, Math.ceil(Math.random() * 3));
    const items = shuffled.map((p) =>
      p.sale_type === 'kg'
        ? { productId: p.id, weightKg: (Math.random() * 2 + 0.1).toFixed(2) }
        : { productId: p.id, quantity: Math.ceil(Math.random() * 3) }
    );

    const deliveryType = rnd(DELIVERY);
    const body = {
      customerName:    `Cliente Teste ${i + 1}`,
      customerPhone:   `119${String(Math.floor(Math.random() * 90000000) + 10000000)}`,
      deliveryType,
      customerAddress: deliveryType === 'delivery' ? `Rua Teste ${i + 1}, ${i + 100}` : undefined,
      paymentMethod:   rnd(PAYMENT),
      channel:         rnd(CHANNELS),
      items,
    };

    const res = await req('POST', '/orders', body, token);

    if (res.status === 401) {
      // Tenta refresh automático
      const refRes = await req('POST', '/auth/refresh', { refreshToken: refresh });
      if (refRes.status === 200) {
        token   = refRes.body.data.accessToken;
        refresh = refRes.body.data.refreshToken;
        // Retentar pedido
        const retry = await req('POST', '/orders', body, token);
        if (retry.status === 201) { created++; orderIds.push(retry.body.data?.id); }
        else errors++;
      } else {
        errors++;
        console.error('\n  ❌ Refresh falhou — sessão expirada!');
      }
    } else if (res.status === 201) {
      created++;
      orderIds.push(res.body.data?.id);
    } else {
      errors++;
      if (errors <= 3) {
        process.stdout.write(`\n  ⚠️  Erro #${errors} [HTTP ${res.status}]: ${res.body?.message ?? JSON.stringify(res.body)}\n`);
      }
    }

    progress(i + 1, TOTAL, errors);
    await sleep(50); // 50ms entre pedidos → ~20 req/s
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n  ✅ ${created} criados  ❌ ${errors} erros  ⏱  ${elapsed}s\n`);

  if (created === 0) { console.log('  Nenhum pedido criado. Encerrando.'); process.exit(1); }

  // 5. Aguardar 15 minutos verificando a cada minuto
  console.log('  ⏳ Aguardando 15 minutos para testar persistência da sessão...\n');
  const WAIT_MIN = 15;
  for (let m = 1; m <= WAIT_MIN; m++) {
    await sleep(60_000);
    // Tenta listar pedidos com token atual
    const checkRes = await req('GET', '/orders?limit=1', null, token);
    if (checkRes.status === 401) {
      // Tenta refresh
      const refRes = await req('POST', '/auth/refresh', { refreshToken: refresh });
      if (refRes.status === 200) {
        token   = refRes.body.data.accessToken;
        refresh = refRes.body.data.refreshToken;
        console.log(`  [${m}min] 🔄 Token renovado com sucesso — sessão mantida!`);
      } else {
        console.log(`  [${m}min] ❌ FALHA: refresh inválido — usuário seria deslogado!`);
      }
    } else if (checkRes.status === 200) {
      console.log(`  [${m}min] ✅ Sessão ativa  |  pedidos visíveis`);
    } else {
      console.log(`  [${m}min] ⚠️  Status inesperado: ${checkRes.status}`);
    }
  }

  // 6. Resultado final
  console.log('\n  📊 Resultado final:');
  const finalRes = await req('GET', `/orders?limit=${TOTAL}&page=1`, null, token);
  const finalOrders = finalRes.body?.data?.data ?? [];
  const testOrders  = finalOrders.filter((o) => o.customer_name?.startsWith('Cliente Teste'));
  console.log(`     Pedidos de teste encontrados: ${testOrders.length}/${created}`);
  if (testOrders.length === created) {
    console.log('     ✅ SUCESSO — todos os pedidos persistiram e sessão se manteve!\n');
  } else {
    console.log(`     ⚠️  Apenas ${testOrders.length} encontrados (podem estar em páginas diferentes)\n`);
  }
}

main().catch((e) => { console.error('\n❌ Erro fatal:', e.message); process.exit(1); });
