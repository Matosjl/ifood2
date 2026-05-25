'use strict';
const http = require('http');

const ADMIN_KEY = 'StressTest@2026!';

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!token) headers['X-Admin-Key'] = ADMIN_KEY;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const r = http.request({ hostname: 'localhost', port: 3000, path, method, headers }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(b) }); }
        catch(e) { resolve({ status: res.statusCode, data: b }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  console.log('\n=== 1. Criando tenant Tinhos Burguer ===');
  let res = await req('POST', '/api/auth/register', {
    tenantName: 'Tinhos Burguer',
    name:       'Tinho Proprietario',
    email:      'tinhos.burguer.demo@zapfome.com.br',
    password:   'TinhosBurguer@2026',
    trial:      true,
  });
  console.log('Register status:', res.status, JSON.stringify(res.data).slice(0, 200));

  if (!res.data.success) {
    console.log('Tentando login...');
    res = await req('POST', '/api/auth/login', {
      email: 'tinhos.burguer.demo@zapfome.com.br',
      password: 'TinhosBurguer@2026',
    });
    console.log('Login status:', res.status);
  }

  const token    = res.data.data ? res.data.data.accessToken : res.data.accessToken;
  const tenantId = res.data.data ? (res.data.data.tenant ? res.data.data.tenant.id : null) : null;
  console.log('Token:', token ? token.slice(0, 40) + '...' : 'NONE');
  console.log('TenantId:', tenantId);

  if (!token) { console.error('Sem token, abortando'); process.exit(1); }

  console.log('\n=== 2. Cadastrando produtos ===');

  const IMG = {
    smash1:  'https://images.unsplash.com/photo-1607013251379-e6eecfffe234?w=600&q=80',
    smash2:  'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?w=600&q=80',
    burger1: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=80',
    burger2: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=600&q=80',
    burger3: 'https://images.unsplash.com/photo-1596956470007-2bf6095e7e16?w=600&q=80',
    burger4: 'https://images.unsplash.com/photo-1550317138-10000687a72b?w=600&q=80',
    burger5: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&q=80',
    burger6: 'https://images.unsplash.com/photo-1530554764233-e79e16c91d08?w=600&q=80',
    burger7: 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=600&q=80',
    hotdog1: 'https://images.unsplash.com/photo-1612392166886-ee8475b03af2?w=600&q=80',
    hotdog2: 'https://images.unsplash.com/photo-1612392062631-94dd858cba88?w=600&q=80',
    hotdog3: 'https://images.unsplash.com/photo-1638368593249-7cadb261e8b3?w=600&q=80',
    fries1:  'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=600&q=80',
    fries2:  'https://images.unsplash.com/photo-1518013431117-eb1465fa5752?w=600&q=80',
    fries3:  'https://images.unsplash.com/photo-1630431341973-02e1b662ec35?w=600&q=80',
    fries4:  'https://images.unsplash.com/photo-1598679253544-2c97992403ea?w=600&q=80',
    shake1:  'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&q=80',
    shake2:  'https://images.unsplash.com/photo-1553787499-6f9133860278?w=600&q=80',
    shake4:  'https://images.unsplash.com/photo-1579954115545-a95591f28bfc?w=600&q=80',
  };

  const produtos = [
    { name: 'X-Burguer',               description: 'Pao brioche, hamburguer 120g, queijo mussarela, alface, tomate e maionese da casa',                                                          sale_price: 18.00, category: 'Burgers',  image_url: IMG.burger4 },
    { name: 'X-Bacon',                 description: 'Pao brioche, hamburguer 120g, bacon crocante, queijo cheddar, alface, tomate e molho barbecue',                                              sale_price: 22.00, category: 'Burgers',  image_url: IMG.burger5 },
    { name: 'X-Egg Bacon',             description: 'Pao brioche, hamburguer 120g, ovo frito, bacon crocante, queijo cheddar, alface, tomate e maionese',                                         sale_price: 25.00, category: 'Burgers',  image_url: IMG.burger6 },
    { name: 'Smash Burguer',           description: 'Dois discos de carne smashados na chapa, queijo americano derretido, picles, cebola e molho especial Tinhos',                                sale_price: 26.00, category: 'Burgers',  image_url: IMG.smash1 },
    { name: 'Smash Duplo',             description: 'Quatro discos de carne smashados, duplo queijo americano, picles, cebola caramelizada e molho especial Tinhos',                              sale_price: 32.00, category: 'Burgers',  image_url: IMG.smash2 },
    { name: 'X-Tudo',                  description: 'Pao brioche, hamburguer 150g, bacon, ovo, queijo cheddar, presunto, alface, tomate, milho e batata palha',                                   sale_price: 28.00, category: 'Burgers',  image_url: IMG.burger1 },
    { name: 'Frango Crocante',         description: 'File de frango empanado crocante, queijo mussarela, alface, tomate, picles e maionese de alho',                                              sale_price: 22.00, category: 'Burgers',  image_url: IMG.burger2 },
    { name: 'Burguer Especial Tinhos', description: 'Pao brioche artesanal, blend de carnes 180g, queijo provolone, cebola caramelizada, rucula, tomate seco e molho de pimenta',                 sale_price: 35.00, category: 'Burgers',  image_url: IMG.burger3 },
    { name: 'Burguer Vegano',          description: 'Pao integral, hamburguer de grao-de-bico, queijo vegano, alface, tomate, cebola roxa e hummus',                                              sale_price: 24.00, category: 'Burgers',  image_url: IMG.burger7 },
    { name: 'Hotdog Simples',          description: 'Salsicha suica, pao frances, ketchup, maionese e mostarda',                                                                                  sale_price: 12.00, category: 'Hotdogs',  image_url: IMG.hotdog1 },
    { name: 'Hotdog Completo',         description: 'Salsicha suica, pao frances, milho, ervilha, batata palha, ketchup, maionese e mostarda',                                                    sale_price: 16.00, category: 'Hotdogs',  image_url: IMG.hotdog2 },
    { name: 'Hotdog Especial Tinhos',  description: 'Salsicha especial defumada, pao brioche, cheddar cremoso, bacon crocante, milho, ervilha, batata palha e molho especial',                    sale_price: 22.00, category: 'Hotdogs',  image_url: IMG.hotdog3 },
    { name: 'Batata Frita Pequena',    description: 'Batata frita crocante porcao P (~200g), sal e tempero especial da casa',                                                                     sale_price: 12.00, category: 'Batatas',  image_url: IMG.fries1 },
    { name: 'Batata Frita Grande',     description: 'Batata frita crocante porcao G (~400g), sal e tempero especial da casa',                                                                     sale_price: 18.00, category: 'Batatas',  image_url: IMG.fries2 },
    { name: 'Batata Cheddar Bacon',    description: 'Batata frita crocante coberta com cheddar cremoso e bacon crocante. Porcao G',                                                               sale_price: 24.00, category: 'Batatas',  image_url: IMG.fries3 },
    { name: 'Batata Rustica',          description: 'Batata com casca temperada e assada, crocante por fora e macia por dentro. Porcao G',                                                        sale_price: 20.00, category: 'Batatas',  image_url: IMG.fries4 },
    { name: 'Coca-Cola Lata 350ml',    description: 'Coca-Cola gelada lata 350ml',                                                                                                                sale_price: 6.00,  category: 'Bebidas',  image_url: null },
    { name: 'Guarana Antarctica Lata', description: 'Guarana Antarctica gelado lata 350ml',                                                                                                      sale_price: 5.00,  category: 'Bebidas',  image_url: null },
    { name: 'Agua Mineral 500ml',      description: 'Agua mineral sem gas 500ml',                                                                                                                sale_price: 4.00,  category: 'Bebidas',  image_url: null },
    { name: 'Milkshake Chocolate',     description: 'Milkshake cremoso de chocolate ao leite com chantilly. 400ml',                                                                               sale_price: 18.00, category: 'Bebidas',  image_url: IMG.shake1 },
    { name: 'Milkshake Morango',       description: 'Milkshake cremoso de morango fresco com chantilly. 400ml',                                                                                   sale_price: 18.00, category: 'Bebidas',  image_url: IMG.shake4 },
    { name: 'Milkshake Baunilha',      description: 'Milkshake cremoso de baunilha com chantilly. 400ml',                                                                                        sale_price: 18.00, category: 'Bebidas',  image_url: IMG.shake2 },
    { name: 'Suco Natural de Laranja', description: 'Suco de laranja natural espremido na hora. 400ml',                                                                                          sale_price: 9.00,  category: 'Bebidas',  image_url: null },
  ];

  const createdProducts = {};

  for (const p of produtos) {
    const payload = {
      name:        p.name,
      description: p.description,
      sale_price:  p.sale_price,
      sale_type:   'unit',
      category:    p.category,
      active:      true,
    };
    if (p.image_url) payload.image_url = p.image_url;

    const r = await req('POST', '/api/products', payload, token);
    const pid = r.data.data ? r.data.data.id : (r.data.id || null);
    console.log(`  [${r.status}] ${p.name} => ${pid || JSON.stringify(r.data).slice(0,80)}`);
    if (pid) createdProducts[p.name] = pid;
  }

  console.log('\n=== 3. Criando grupos de complementos ===');

  const grupos = [
    {
      name: 'Proteinas Extras', description: 'Adicione mais proteina no seu lanche', min_qty: 0, max_qty: 3,
      items: [
        { name: 'Hamburguer Extra (120g)', price: 8.00 },
        { name: 'Bacon Crocante',          price: 4.00 },
        { name: 'Frango Grelhado',         price: 5.00 },
        { name: 'Ovo Frito',               price: 3.00 },
      ]
    },
    {
      name: 'Queijos', description: 'Escolha seus queijos favoritos', min_qty: 0, max_qty: 2,
      items: [
        { name: 'Queijo Cheddar',   price: 3.00 },
        { name: 'Queijo Mussarela', price: 2.00 },
        { name: 'Queijo Provolone', price: 3.00 },
        { name: 'Queijo Prato',     price: 2.00 },
        { name: 'Cheddar Cremoso',  price: 4.00 },
      ]
    },
    {
      name: 'Molhos', description: 'Capricha nos molhos!', min_qty: 0, max_qty: 4,
      items: [
        { name: 'Ketchup',          price: 0.00 },
        { name: 'Maionese da Casa', price: 0.00 },
        { name: 'Mostarda',         price: 0.00 },
        { name: 'Molho Barbecue',   price: 2.00 },
        { name: 'Molho Chipotle',   price: 2.00 },
        { name: 'Molho de Pimenta', price: 2.00 },
        { name: 'Maionese de Alho', price: 2.00 },
      ]
    },
    {
      name: 'Adicionais do Hotdog', description: 'Recheie seu hotdog do seu jeito', min_qty: 0, max_qty: 6,
      items: [
        { name: 'Milho Verde',     price: 2.00 },
        { name: 'Ervilha',         price: 1.00 },
        { name: 'Batata Palha',    price: 1.00 },
        { name: 'Catupiry',        price: 3.00 },
        { name: 'Cebola Refogada', price: 2.00 },
        { name: 'Vinagrete',       price: 1.00 },
        { name: 'Pimentao',        price: 1.00 },
      ]
    },
    {
      name: 'Ponto da Carne', description: 'Como voce prefere seu hamburguer?', min_qty: 0, max_qty: 1,
      items: [
        { name: 'Ao Ponto',           price: 0.00 },
        { name: 'Ao Ponto Para Bem',  price: 0.00 },
        { name: 'Bem Passado',        price: 0.00 },
      ]
    },
    {
      name: 'Bebida do Combo', description: 'Adicione uma bebida por preco especial', min_qty: 0, max_qty: 1,
      items: [
        { name: 'Coca-Cola 350ml',    price: 5.00 },
        { name: 'Guarana 350ml',      price: 4.00 },
        { name: 'Suco Natural 400ml', price: 7.00 },
        { name: 'Agua Mineral',       price: 3.00 },
      ]
    },
  ];

  const createdGroups = {};

  for (const g of grupos) {
    const gr = await req('POST', '/api/addons', {
      name: g.name, description: g.description, min_qty: g.min_qty, max_qty: g.max_qty
    }, token);
    const gid = gr.data.data ? gr.data.data.id : null;
    console.log(`  [${gr.status}] Grupo "${g.name}" => ${gid || JSON.stringify(gr.data).slice(0,80)}`);
    if (!gid) continue;
    createdGroups[g.name] = gid;

    for (const item of g.items) {
      const ir = await req('POST', `/api/addons/${gid}/items`, { name: item.name, price: item.price, active: true }, token);
      console.log(`    [${ir.status}] "${item.name}" R$ ${item.price}`);
    }
  }

  console.log('\n=== 4. Vinculando complementos aos produtos ===');

  const burgerProductKeys = [
    'X-Burguer', 'X-Bacon', 'X-Egg Bacon', 'Smash Burguer', 'Smash Duplo',
    'X-Tudo', 'Frango Crocante', 'Burguer Especial Tinhos', 'Burguer Vegano'
  ];
  const hotdogProductKeys = ['Hotdog Simples', 'Hotdog Completo', 'Hotdog Especial Tinhos'];

  const burgerGroupNames = ['Proteinas Extras', 'Queijos', 'Molhos', 'Ponto da Carne', 'Bebida do Combo'];
  const hotdogGroupNames = ['Adicionais do Hotdog', 'Molhos', 'Bebida do Combo'];

  for (const name of burgerProductKeys) {
    const pid = createdProducts[name];
    if (!pid) { console.log(`  SKIP ${name}`); continue; }
    const gids = burgerGroupNames.map(g => createdGroups[g]).filter(Boolean);
    const lr = await req('PUT', `/api/addons/product/${pid}`, { groupIds: gids }, token);
    console.log(`  [${lr.status}] Burger "${name}" => ${gids.length} grupos`);
  }

  for (const name of hotdogProductKeys) {
    const pid = createdProducts[name];
    if (!pid) { console.log(`  SKIP ${name}`); continue; }
    const gids = hotdogGroupNames.map(g => createdGroups[g]).filter(Boolean);
    const lr = await req('PUT', `/api/addons/product/${pid}`, { groupIds: gids }, token);
    console.log(`  [${lr.status}] Hotdog "${name}" => ${gids.length} grupos`);
  }

  console.log('\n========================================');
  console.log('TINHOS BURGUER CRIADO COM SUCESSO!');
  console.log('Email:    tinhos.burguer.demo@zapfome.com.br');
  console.log('Senha:    TinhosBurguer@2026');
  console.log('Tenant:   ' + tenantId);
  console.log('Produtos: ' + Object.keys(createdProducts).length);
  console.log('Grupos:   ' + Object.keys(createdGroups).length);
  console.log('========================================');
}

main().catch(e => { console.error('ERRO FATAL:', e.message, e.stack); process.exit(1); });
