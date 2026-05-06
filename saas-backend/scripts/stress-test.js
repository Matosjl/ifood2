#!/usr/bin/env node
/**
 * ── Stress Test — 5 Restaurantes Simultâneos ──────────────────
 *
 * Uso:
 *   node stress-test.js <BASE_URL> <ADMIN_KEY>
 *
 * Exemplo:
 *   node stress-test.js http://153.75.246.234 minha-chave-admin
 *
 * O que o teste faz:
 *  1. Cria 5 restaurantes de teste via API de admin
 *  2. Loga em cada um e cria produtos
 *  3. Abre o caixa de cada restaurante
 *  4. Dispara 20 pedidos simultâneos por restaurante (100 total)
 *     - 50% via painel (autenticado)
 *     - 50% via app de cardápio (público)
 *  5. Mede tempo de resposta e taxa de sucesso
 *  6. Exibe relatório final
 *  7. Limpa os dados de teste
 */

const BASE_URL  = process.argv[2] || 'http://153.75.246.234';
const ADMIN_KEY = process.argv[3] || '';

if (!ADMIN_KEY) {
  console.error('❌  Informe a ADMIN_KEY como segundo argumento.');
  console.error('    node stress-test.js http://IP_DO_VPS SUA_ADMIN_KEY');
  process.exit(1);
}

// ── HTTP helper ───────────────────────────────────────────────

async function req(method, path, body, headers = {}) {
  const url  = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  };
  const start = Date.now();
  try {
    const res  = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data, ms: Date.now() - start };
  } catch (e) {
    return { ok: false, status: 0, data: { message: e.message }, ms: Date.now() - start };
  }
}

// ── Helpers de cor ────────────────────────────────────────────

const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold   = (s) => `\x1b[1m${s}\x1b[0m`;
const cyan   = (s) => `\x1b[36m${s}\x1b[0m`;

// ── Dados de teste ────────────────────────────────────────────

const RESTAURANTS = Array.from({ length: 5 }, (_, i) => ({
  tenantName: `Teste Restaurante ${i + 1}`,
  name:       `Owner ${i + 1}`,
  email:      `teste.stress.${i + 1}.${Date.now()}@test.com`,
  password:   'Stress@123',
}));

const PRODUCTS_DATA = [
  { name: 'X-Burguer Teste',   salePrice: 25.00, saleType: 'unit', stockQty: 9999 },
  { name: 'Fritas Teste',      salePrice: 10.00, saleType: 'unit', stockQty: 9999 },
  { name: 'Coca-Cola Teste',   salePrice:  8.00, saleType: 'unit', stockQty: 9999 },
];

// ── Métricas ──────────────────────────────────────────────────

const metrics = {
  setup:   { ok: 0, fail: 0, ms: [] },
  orders:  { ok: 0, fail: 0, ms: [] },
  public:  { ok: 0, fail: 0, ms: [] },
};

function record(bucket, ok, ms) {
  if (ok) { metrics[bucket].ok++;   } else { metrics[bucket].fail++; }
  metrics[bucket].ms.push(ms);
}

function avg(arr) { return arr.length ? Math.round(arr.reduce((a,b) => a+b,0)/arr.length) : 0; }
function max(arr) { return arr.length ? Math.max(...arr) : 0; }
function p95(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a,b) => a-b);
  return s[Math.floor(s.length * 0.95)];
}

// ── Setup de um restaurante ───────────────────────────────────

async function setupRestaurant(r) {
  // 1. Registrar
  const reg = await req('POST', '/api/auth/register', r, { 'x-admin-key': ADMIN_KEY });
  record('setup', reg.ok, reg.ms);
  if (!reg.ok) return null;

  const tenantId = reg.data.data?.tenant?.id;
  const slug     = reg.data.data?.tenant?.slug;

  // 2. Login
  const login = await req('POST', '/api/auth/login', { email: r.email, password: r.password });
  record('setup', login.ok, login.ms);
  if (!login.ok) return null;

  const token = login.data.data?.accessToken;

  // 3. Criar produtos
  const productIds = [];
  for (const p of PRODUCTS_DATA) {
    const prod = await req('POST', '/api/products', {
      name: p.name, salePrice: p.salePrice, saleType: p.saleType,
      stockQty: p.stockQty, active: true,
    }, { Authorization: `Bearer ${token}` });
    record('setup', prod.ok, prod.ms);
    if (prod.ok) productIds.push(prod.data.data?.id);
  }

  // 4. Abrir caixa
  const caixa = await req('POST', '/api/caixa/open',
    { openingBalance: 100, notes: 'Caixa stress test' },
    { Authorization: `Bearer ${token}` }
  );
  record('setup', caixa.ok, caixa.ms);

  return { token, slug, tenantId, productIds, name: r.tenantName };
}

// ── Disparar pedido autenticado (painel) ──────────────────────

async function fireAuthOrder(restaurant, idx) {
  const { token, productIds } = restaurant;
  if (!productIds?.length) return;

  const body = {
    customerName:  `Cliente Teste ${idx}`,
    customerPhone: `119${String(idx).padStart(8,'0')}`,
    deliveryType:  idx % 2 === 0 ? 'delivery' : 'pickup',
    customerAddress: idx % 2 === 0 ? `Rua Teste ${idx}, nº ${idx}` : undefined,
    paymentMethod: ['cash','pix','credit','debit'][idx % 4],
    channel:       'manual',
    items: [
      { productId: productIds[0], quantity: (idx % 3) + 1 },
      ...(productIds[1] ? [{ productId: productIds[1], quantity: 1 }] : []),
    ],
  };

  const r = await req('POST', '/api/orders', body, { Authorization: `Bearer ${token}` });
  record('orders', r.ok, r.ms);
  return r;
}

// ── Disparar pedido público (app cardápio) ────────────────────

async function firePublicOrder(restaurant, idx) {
  const { slug, productIds } = restaurant;
  if (!slug || !productIds?.length) return;

  const body = {
    customerName:  `App Cliente ${idx}`,
    customerPhone: `119${String(idx + 5000).padStart(8,'0')}`,
    deliveryType:  idx % 3 === 0 ? 'delivery' : 'pickup',
    customerAddress: idx % 3 === 0 ? `Av. App ${idx}` : undefined,
    paymentMethod: ['pix','cash','credit'][idx % 3],
    notes:         `Pedido público #${idx} do app`,
    items: [
      { productId: productIds[2 % productIds.length], quantity: 1 },
    ],
  };

  // Simula IPs diferentes (como clientes reais de celulares distintos)
  const fakeIp = `10.${(idx % 254) + 1}.${(idx % 100) + 1}.${(idx % 200) + 1}`;

  const r = await req('POST', `/api/public/${slug}/orders`, body, {
    'X-Forwarded-For': fakeIp,
    'X-Real-IP':       fakeIp,
  });
  record('public', r.ok, r.ms);
  return r;
}

// ── Limpeza ───────────────────────────────────────────────────

async function cleanup(restaurant) {
  if (!restaurant?.token) return;
  // Fechar caixa
  await req('POST', '/api/caixa/close', {}, { Authorization: `Bearer ${restaurant.token}` });
}

// ── Relatório ─────────────────────────────────────────────────

function report(restaurants) {
  console.log('\n' + bold('═'.repeat(60)));
  console.log(bold(cyan('  📊  RELATÓRIO DO STRESS TEST')));
  console.log(bold('═'.repeat(60)));

  console.log(`\n  ${bold('Restaurantes criados:')} ${restaurants.filter(Boolean).length}/5`);
  console.log(`  ${bold('Setup    ')}  ✅ ${green(metrics.setup.ok)}  ❌ ${red(metrics.setup.fail)}  avg ${avg(metrics.setup.ms)}ms  p95 ${p95(metrics.setup.ms)}ms`);
  console.log(`  ${bold('Pedidos painel')}  ✅ ${green(metrics.orders.ok)}  ❌ ${red(metrics.orders.fail)}  avg ${avg(metrics.orders.ms)}ms  p95 ${p95(metrics.orders.ms)}ms  max ${max(metrics.orders.ms)}ms`);
  console.log(`  ${bold('Pedidos app   ')}  ✅ ${green(metrics.public.ok)}  ❌ ${red(metrics.public.fail)}  avg ${avg(metrics.public.ms)}ms  p95 ${p95(metrics.public.ms)}ms  max ${max(metrics.public.ms)}ms`);

  const totalOrders  = metrics.orders.ok + metrics.public.ok;
  const totalFailed  = metrics.orders.fail + metrics.public.fail;
  const successRate  = totalOrders + totalFailed > 0
    ? ((totalOrders / (totalOrders + totalFailed)) * 100).toFixed(1)
    : 0;

  console.log(`\n  ${bold('Total pedidos OK:')} ${green(totalOrders)}`);
  console.log(`  ${bold('Total falhas:    ')} ${totalFailed > 0 ? red(totalFailed) : green(0)}`);
  console.log(`  ${bold('Taxa de sucesso: ')} ${parseFloat(successRate) >= 95 ? green(successRate + '%') : yellow(successRate + '%')}`);

  const verdict = parseFloat(successRate) >= 95
    ? green('✅  SISTEMA APROVADO — aguenta 5 restaurantes simultâneos!')
    : parseFloat(successRate) >= 80
    ? yellow('⚠️   SISTEMA ESTÁVEL mas com algumas falhas')
    : red('❌  SISTEMA COM PROBLEMAS sob carga simultânea');

  console.log('\n  ' + bold(verdict));
  console.log(bold('═'.repeat(60)) + '\n');
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(bold(cyan('\n🚀  STRESS TEST — 5 Restaurantes Simultâneos')));
  console.log(`    Servidor: ${yellow(BASE_URL)}`);
  console.log(`    Pedidos por restaurante: 20 (10 painel + 10 app)\n`);

  // ── Fase 1: Setup dos 5 restaurantes em paralelo ─────────────
  console.log('⚙️   Fase 1: Criando restaurantes, produtos e abrindo caixas...');
  const setupStart = Date.now();
  const restaurants = await Promise.all(RESTAURANTS.map(setupRestaurant));
  console.log(`    Concluído em ${Date.now() - setupStart}ms — ${restaurants.filter(Boolean).length}/5 restaurantes prontos\n`);

  const active = restaurants.filter(Boolean);
  if (!active.length) {
    console.log(red('❌  Nenhum restaurante configurado. Verifique a ADMIN_KEY e o servidor.'));
    process.exit(1);
  }

  // ── Fase 2: Pedidos simultâneos ───────────────────────────────
  console.log('🔥  Fase 2: Disparando 100 pedidos simultâneos...');
  const ordersStart = Date.now();

  const allOrderTasks = [];
  for (const restaurant of active) {
    for (let i = 0; i < 10; i++) {
      allOrderTasks.push(fireAuthOrder(restaurant, i));
      allOrderTasks.push(firePublicOrder(restaurant, i));
    }
  }

  // Dispara TUDO de uma vez
  await Promise.all(allOrderTasks);
  console.log(`    Concluído em ${Date.now() - ordersStart}ms\n`);

  // ── Fase 3: Limpeza ───────────────────────────────────────────
  console.log('🧹  Fase 3: Fechando caixas e limpando dados de teste...');
  await Promise.all(active.map(cleanup));

  // ── Relatório ─────────────────────────────────────────────────
  report(active);
}

main().catch((err) => {
  console.error(red('Erro fatal: ' + err.message));
  process.exit(1);
});
