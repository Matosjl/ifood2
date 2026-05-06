#!/usr/bin/env node
/**
 * ── Setup DegusttiRotisseria ────────────────────────────────────
 * Cria o restaurante completo com categorias, produtos e imagens.
 *
 * Uso:
 *   node setup-degusti.js <BASE_URL> <ADMIN_KEY>
 *
 * Exemplo (no VPS via docker):
 *   node /scripts/setup-degusti.js http://backend:3000 SUA_ADMIN_KEY
 */

const BASE_URL  = process.argv[2] || 'http://backend:3000';
const ADMIN_KEY = process.argv[3] || '';

if (!ADMIN_KEY) {
  console.error('❌  Informe a ADMIN_KEY. Ex: node setup-degusti.js http://backend:3000 CHAVE');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────

const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold   = (s) => `\x1b[1m${s}\x1b[0m`;
const cyan   = (s) => `\x1b[36m${s}\x1b[0m`;

async function api(method, path, body, headers = {}) {
  const res  = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function ok(label) { console.log(`  ${green('✅')} ${label}`); }
function fail(label, info) { console.log(`  ${red('❌')} ${label}  ${yellow(info || '')}`); }

// ── Dados do restaurante ──────────────────────────────────────

const RUN_ID = Date.now().toString(36);

const RESTAURANTE = {
  tenantName: 'DegusttiRotisseria',
  name:       'Degusti Admin',
  email:      `degusti.${RUN_ID}@zapfome.com`,
  password:   'Degusti@2026!',
};

// ── Imagens por produto ───────────────────────────────────────
// Imagens públicas gratuitas (Wikipedia Commons + Unsplash)

const IMG = {
  esfiha_gourmet:     'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Sfiha.jpg/480px-Sfiha.jpg',
  esfiha_trad:        'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Sfiha.jpg/480px-Sfiha.jpg',
  combo_bandeja:      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&w=480&q=80',
  combo_grande:       'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&w=480&q=80',
  coca_cola:          'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Cocacola_bottle_2L.jpg/200px-Cocacola_bottle_2L.jpg',
  coca_zero:          'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Coca-Cola_Zero.jpg/200px-Coca-Cola_Zero.jpg',
  fanta_laranja:      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Fanta_Orange_bottle.jpg/200px-Fanta_Orange_bottle.jpg',
  fanta_uva:          'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&w=200&q=80',
  fanta_maracuja:     'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&w=200&q=80',
  sprite:             'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Sprite_Can.jpg/200px-Sprite_Can.jpg',
  guarana:            'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Guarana-Antarctica.jpg/200px-Guarana-Antarctica.jpg',
  pepsi:              'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Pepsi_logo_2014.svg/200px-Pepsi_logo_2014.svg.png',
  pepsi_black:        'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Pepsi_logo_2014.svg/200px-Pepsi_logo_2014.svg.png',
  lata:               'https://images.unsplash.com/photo-1625772452859-1c03d5bf1137?auto=format&w=200&q=80',
};

// ── Cardápio completo ─────────────────────────────────────────

const CATEGORIAS = [
  {
    name: '🥟 Combos Gourmet',
    produtos: [
      { name: 'Combo 1 Gourmet',    description: '6 Esfihas, monte como preferir.',  salePrice: 48.00,  imageKey: 'esfiha_gourmet' },
      { name: 'Combo 2 Gourmet',    description: '8 Esfihas, monte como preferir.',  salePrice: 60.00,  imageKey: 'esfiha_gourmet' },
      { name: 'Combo 3 Gourmet',    description: '12 Esfihas, monte como preferir.', salePrice: 84.00,  imageKey: 'combo_bandeja'   },
      { name: 'Combo 4 Gourmet',    description: '24 Esfihas, monte como preferir.', salePrice: 156.00, imageKey: 'combo_grande'    },
    ],
  },
  {
    name: '🫓 Combos Tradicionais',
    produtos: [
      { name: 'Combo 1 Tradicional', description: '6 Esfihas, monte como preferir.',  salePrice: 34.00,  imageKey: 'esfiha_trad'  },
      { name: 'Combo 2 Tradicional', description: '8 Esfihas, monte como preferir.',  salePrice: 48.00,  imageKey: 'esfiha_trad'  },
      { name: 'Combo 3',             description: '12 Esfihas, monte como preferir.', salePrice: 66.00,  imageKey: 'combo_bandeja' },
      { name: 'Combo 4 Tradicional', description: '24 Esfihas, monte como preferir.', salePrice: 130.00, imageKey: 'combo_grande'  },
    ],
  },
  {
    name: '🥤 Bebidas 600ml / 2L',
    produtos: [
      { name: 'Coca-Cola 600ml',    description: 'Garrafa 600ml gelada.',  salePrice: 8.00,  imageKey: 'coca_cola'   },
      { name: 'Coca-Cola Zero 600', description: 'Garrafa 600ml zero.',    salePrice: 8.00,  imageKey: 'coca_zero'   },
      { name: 'Fanta Laranja 600',  description: 'Garrafa 600ml gelada.',  salePrice: 8.00,  imageKey: 'fanta_laranja' },
      { name: 'Sprite 600ml',       description: 'Garrafa 600ml gelada.',  salePrice: 8.00,  imageKey: 'sprite'      },
      { name: 'Guaraná 600ml',      description: 'Garrafa 600ml gelada.',  salePrice: 8.00,  imageKey: 'guarana'     },
      { name: 'Coca-Cola 2L',       description: 'Garrafa 2 litros.',      salePrice: 15.00, imageKey: 'coca_cola'   },
      { name: 'Coca-Cola Zero 2L',  description: 'Garrafa 2 litros zero.', salePrice: 15.00, imageKey: 'coca_zero'   },
    ],
  },
  {
    name: '🥫 Bebidas Lata 350ml',
    produtos: [
      { name: 'Coca-Cola Zero Lata',    description: 'Lata 350ml.',  salePrice: 6.00, imageKey: 'coca_zero'    },
      { name: 'Fanta Laranja Lata',     description: 'Lata 350ml.',  salePrice: 6.00, imageKey: 'fanta_laranja'},
      { name: 'Fanta Uva Lata',         description: 'Lata 350ml.',  salePrice: 6.00, imageKey: 'fanta_uva'    },
      { name: 'Fanta Maracujá Lata',    description: 'Lata 350ml.',  salePrice: 6.00, imageKey: 'fanta_maracuja'},
      { name: 'Sprite Lata 350ml',      description: 'Lata 350ml.',  salePrice: 6.00, imageKey: 'sprite'       },
      { name: 'Pepsi Lata 350ml',       description: 'Lata 350ml.',  salePrice: 6.00, imageKey: 'pepsi'        },
      { name: 'Pepsi Black Lata 350ml', description: 'Lata 350ml.',  salePrice: 6.00, imageKey: 'pepsi_black'  },
    ],
  },
];

// ── Função para setar image_url via update (SQL direto) ───────
// Faz PUT no produto passando imageUrl — alguns backends aceitam.
// Se não aceitar, seta via endpoint de imagem com download remoto.

async function setImageUrl(productId, imageUrl, token) {
  // Tenta download + upload como multipart
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
    if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const buffer      = await imgRes.arrayBuffer();
    const blob        = new Blob([buffer], { type: contentType });

    const form = new FormData();
    form.append('image', blob, 'produto.jpg');

    const up = await fetch(`${BASE_URL}/api/products/${productId}/image`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
      body:    form,
    });
    return up.ok;
  } catch (e) {
    // Fallback: tenta PUT com campo imageUrl
    const r = await api('PUT', `/api/products/${productId}`,
      { imageUrl }, { Authorization: `Bearer ${token}` });
    return r.ok;
  }
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(bold(cyan('\n🍕  SETUP DegusttiRotisseria — ZapFome\n')));

  // ── 1. Registrar ─────────────────────────────────────────────
  console.log(bold('📋  1. Criando restaurante...'));
  const reg = await api('POST', '/api/auth/register', RESTAURANTE, {
    'x-admin-key': ADMIN_KEY,
  });
  if (!reg.ok) {
    fail('Register', JSON.stringify(reg.data).slice(0, 200));
    process.exit(1);
  }
  const slug     = reg.data.data?.tenant?.slug;
  const tenantId = reg.data.data?.tenant?.id;
  ok(`Restaurante criado  slug=${yellow(slug)}  id=${yellow(tenantId)}`);

  // ── 2. Login ─────────────────────────────────────────────────
  console.log(bold('\n🔑  2. Fazendo login...'));
  const login = await api('POST', '/api/auth/login', {
    email: RESTAURANTE.email, password: RESTAURANTE.password,
  });
  if (!login.ok) { fail('Login', JSON.stringify(login.data)); process.exit(1); }
  const token = login.data.data?.accessToken;
  ok('Login OK — token obtido');

  const AUTH = { Authorization: `Bearer ${token}` };

  // ── 3. Abrir caixa ───────────────────────────────────────────
  console.log(bold('\n💰  3. Abrindo caixa...'));
  const caixa = await api('POST', '/api/caixa/open',
    { openingBalance: 0, notes: 'Abertura inicial DegusttiRotisseria' }, AUTH);
  caixa.ok ? ok('Caixa aberto') : fail('Caixa', JSON.stringify(caixa.data));

  // ── 4. Criar categorias e produtos ───────────────────────────
  console.log(bold('\n🗂️   4. Criando categorias e produtos...\n'));

  let totalProdutos = 0;
  let totalImagens  = 0;

  for (const cat of CATEGORIAS) {
    // Criar categoria
    const catRes = await api('POST', '/api/categories', { name: cat.name }, AUTH);
    const catId  = catRes.data.data?.id;
    catRes.ok
      ? ok(`Categoria: ${bold(cat.name)}  id=${yellow(catId)}`)
      : fail(`Categoria: ${cat.name}`, JSON.stringify(catRes.data));

    // Criar cada produto da categoria
    for (const p of cat.produtos) {
      const prodRes = await api('POST', '/api/products', {
        name:        p.name,
        description: p.description,
        saleType:    'unit',
        salePrice:   p.salePrice,
        costPrice:   0,
        stockQty:    9999,
        categoryId:  catId || undefined,
        active:      true,
      }, AUTH);

      if (!prodRes.ok) {
        fail(`  Produto: ${p.name}`, JSON.stringify(prodRes.data).slice(0, 100));
        continue;
      }

      const prodId = prodRes.data.data?.id;
      totalProdutos++;
      process.stdout.write(`    ${green('+')} ${p.name.padEnd(30)} R$${String(p.salePrice.toFixed(2)).padStart(7)}`);

      // Adicionar imagem
      const imageUrl = IMG[p.imageKey];
      if (imageUrl && prodId) {
        const imgOk = await setImageUrl(prodId, imageUrl, token);
        if (imgOk) { totalImagens++; process.stdout.write(`  ${green('🖼️')} imagem OK`); }
        else        { process.stdout.write(`  ${yellow('⚠️')} sem imagem`); }
      }
      process.stdout.write('\n');
    }
    console.log('');
  }

  // ── Resultado ─────────────────────────────────────────────────
  console.log(bold('═'.repeat(60)));
  console.log(bold(cyan('  🎉  RESTAURANTE CRIADO COM SUCESSO!')));
  console.log(bold('═'.repeat(60)));
  console.log(`\n  ${bold('Nome:')}        DegusttiRotisseria`);
  console.log(`  ${bold('Slug:')}        ${yellow(slug)}`);
  console.log(`  ${bold('E-mail:')}      ${RESTAURANTE.email}`);
  console.log(`  ${bold('Senha:')}       ${RESTAURANTE.password}`);
  console.log(`  ${bold('Produtos:')}    ${green(totalProdutos)} cadastrados`);
  console.log(`  ${bold('Imagens:')}     ${green(totalImagens)} adicionadas`);
  console.log(`  ${bold('Caixa:')}       ${green('Aberto')}`);
  console.log(`\n  ${bold('App (cardápio):')}  ${yellow(`${BASE_URL.replace('backend:3000','SEU_IP')}/menu/${slug}`)}`);
  console.log(bold('═'.repeat(60)) + '\n');
}

main().catch((err) => {
  console.error(red('\n❌  Erro fatal: ' + err.message));
  process.exit(1);
});
