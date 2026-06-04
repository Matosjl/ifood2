#!/usr/bin/env node
/**
 * SEEDER — Restaurante Sabor da Serra
 * Dados demo para marketing do ZapFome
 * Uso: node scripts/seed_sabor_da_serra.js
 */

'use strict';
const { Pool } = require('pg');
const crypto   = require('crypto');

// ── Conexão ───────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'saas_restaurant',
  user:     process.env.DB_USER     || 'saas_user',
  password: process.env.DB_PASSWORD || '',
  ssl:      false,
});

// ── Utilitários ───────────────────────────────────────────────
const uuid  = () => crypto.randomUUID();
const pick  = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand  = (min, max) => Math.round((Math.random() * (max - min) + min) * 100) / 100;
const randI = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const ago   = (days, extraHours = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - extraHours);
  return d.toISOString();
};
const phone = () => {
  const ddd  = pick(['51','47','48','11','21','31','41','61','71','85']);
  const num  = `9${randI(1000,9999)}${randI(1000,9999)}`;
  return `${ddd}${num}`;
};
const bcryptHash = '$2b$10$demo.hash.for.seed.only.not.real.passwordXXXXXXXXXX'; // não é hash real

// ── Constantes do restaurante ─────────────────────────────────
const SLUG        = 'sabor-da-serra';
const NOME        = 'Restaurante Sabor da Serra';
const OWNER_EMAIL = 'dono@sabordaser ra.com.br';
const OWNER_PASS  = bcryptHash;

// ── Dados de referência ───────────────────────────────────────
const NOMES_CLIENTES = [
  'Ana Paula Ferreira','João Carlos Silva','Maria Aparecida Santos','Pedro Henrique Oliveira',
  'Fernanda Lima','Lucas Rodrigues','Juliana Costa','Rafael Mendes','Camila Souza','Bruno Alves',
  'Tatiane Nunes','Diego Pereira','Larissa Moraes','Matheus Carvalho','Priscila Rocha',
  'Gustavo Martins','Amanda Ribeiro','Felipe Gonçalves','Aline Barbosa','Thiago Monteiro',
  'Renata Vieira','Eduardo Castro','Bruna Teixeira','Leonardo Azevedo','Vanessa Pinto',
  'Marcelo Freitas','Cristiane Lopes','André Correia','Simone Nascimento','Roberto Campos',
  'Débora Melo','Flávio Cardoso','Patrícia Marques','Sergio Dias','Eliane Cunha',
  'Rodrigo Figueiredo','Mariana Gomes','Alexandre Araújo','Tânia Fernandes','Cláudio Santos',
  'Solange Machado','Leandro Barros','Giovana Cavalcanti','Fábio Moreira','Luciana Ramos',
  'Henrique Flores','Daniela Medeiros','Vitor Hugo Costa','Andressa Lima','Carlos Alberto',
  'Rosana Peixoto','Willian Brito','Natália Magalhães','Maurício Amaral','Sueli Batista',
  'Adriano Fontes','Karina Duarte','Rogério Sampaio','Fernanda Siqueira','Ivan Borges',
  'Denise Queiroz','Alexsandro Mota','Patricia Leite','Heraldo Fonseca','Claudete Vargas',
  'Márcio Abreu','Elisangela Torres','Oswaldo Prates','Cristina Bueno','Cícero Andrade',
  'Miriam Cavalcante','Edilson Sousa','Rosemary Cruz','Adilson Reis','Tereza Cristina',
  'Sandro Nogueira','Edna Coelho','Gilson Paiva','Lúcia Helena','Everaldo Tavares',
  'Neide Portela','Hélio Conceição','Neuza Guimarães','Gerson Lacerda','Cleide Firmino',
  'Evaldo Esteves','Idalina Resende','Alcides Valente','Benedita Cardoso','Zacarias Lima',
  'Ondina Ribeiro','Jovita Braga','Ezequiel Prado','Sebastiana Vaz','Almerindo Costa',
  'Perpétua Macedo','Otoniel Britto','Nazareth Teixeira','Florêncio Parente','Josefa Galdino',
  'Humberto Neto','Graciela Rios','Waldir Aguiar','Aparecida Mendes','Aramis Coutinho',
  'Selma Dantas','Onésimo Barros','Eulália Couto','Clóvis Vasconcelos','Silvana Quint',
  'Wellington Bauer','Soraya Hahn','Emerson Kraus','Roseli Weber','Maximiliano Klein',
  'Izolde Hoffmann','Eliton Schmidt','Hildegard Lang','Osni Braun','Elzira Frank',
  'Adroaldo Müller','Eleonora Wolff','Alaor Ritter','Zelinda Schäfer','Egídio Nied',
  'Hilda Kunze','Alcir Fischer','Ivony Becker','Walmor Siegel','Luzia Haase',
  'Airton Pfeiffer','Marta Reuter','Lotário Menzel','Arlete Vogt','Hilário Sauer',
  'Dagmar Strauss','Gentil Kist','Isolda Brand','Ernesto Strack','Edite Diehl',
  'Hermes Kuhn','Zilda Gassen','Nivaldo Kurtz','Doraci Arndt','Vanderlei Wendt',
  'Teresinha Blum','Oldair Lenz','Ivone Kress','Agenor Kolb','Elza Staudt',
  'Lauro Rau','Ely Ziegler','Noldi Weiss','Irma Geier','Alípio Heck',
  'Liduvina Drews','Rinaldo Bohn','Hedwig Fröhlich','Belisário Günther','Hildur Schwartz',
  'Amâncio Berger','Genoveva Zimmermann','Filomeno Brandt','Edwiges Faber','Roldão Schreiber',
  'Laurinda Böhm','Celestino Kiefer','Trindade Ehlers','Balduíno Meyer','Odette Neumann',
  'Policarpo Richter','Malvina Lehmann','Teodósio Winkler','Aloísio Wenzel','Honorata Roth',
  'Casimiro Fuchs','Valentina Kramer','Sigismundo Huber','Hortensia Bauer','Clodoaldo Kaiser',
  'Emerenciana Rüdiger','Felisberto Stein','Wilhelmina Maier','Dagoberto Koch','Elisa Lorenz',
  'Ataulfo Gruber','Cunegunda Wendt','Eufrásia Nagel','Teobaldo Gerber','Quirino Lutz',
  'Hildegarda Moser','Hermínio Bachmann','Celestina Frey','Hermenegildo Ernst','Florentina Weis',
  'Demétrio Stoll','Celmira Krug','Raimundo Zink','Justina Baum','Emílio Brauer',
  'Modesta Heuser','Arcebaldo Lüdtke','Carmela Sommer','Euvaldo Schäfer','Zenaide Grimm',
  'Heliodoro Bauer','Liduína Vogel','Pacífico Strack','Brígida Schreiber','Ambrósio Rau',
  'Walmira Arndt','Olívio Busch','Elvira Wolff','Teófilo Haas','Idalícia Nied',
  'Estanislau Kurz','Rosalina Weiss','Antenor Strauss','Benedita Möller','Gaudêncio Lehrke',
  'Eufrosina Reichert','Aloisio Lehner','Otacília Schiavon','Servílio Bernd','Zelinda Gärtner',
  'Eliodoro Schaefer','Herculina Kolb','Generoso Vogt','Anunciata Kempf','Hortolano Kunz',
  'Edeltrudes Mann','Orélio Sauer','Miquelina Franzen','Atílio Wicht','Dionísia Bremer',
  'Rodolfo Stocker','Irene Pohl','Nívaldo Schimidt','Aurélia Henkel','Odauto Kist',
  'Evarista Stark','Etelvino Linden','Clarissa Rühl','Anacleto Freund','Josefina Grünewald',
  'Epifânio Brockmann','Lutgarda Schindler','Meroveu Zinn','Irmalinda Holtz','Alceu Blauth',
];

const BAIRROS = [
  'Centro','Itapeva','Tupinambá','Praia Gaúcha','Praia Estrela',
  'São Brás','Campo Bonito','Praia Real','Itapeva Norte','Praia Paraíso',
];

const RUAS = [
  'Rua das Acácias','Rua do Comércio','Av. Principal','Rua Flores','Rua das Palmeiras',
  'Rua Garibaldi','Rua Marechal','Av. Brasil','Rua Sete de Setembro','Rua das Pedras',
];

// ── Categorias ────────────────────────────────────────────────
const CATEGORIAS = [
  { name: 'Marmitas',      printer_target: 'kitchen' },
  { name: 'Lanches',       printer_target: 'kitchen' },
  { name: 'Hambúrgueres',  printer_target: 'kitchen' },
  { name: 'Refrigerantes', printer_target: 'bar'     },
  { name: 'Sobremesas',    printer_target: 'kitchen' },
  { name: 'Porções',       printer_target: 'kitchen' },
];

// ── Produtos (120) ────────────────────────────────────────────
const PRODUTOS = [
  // Marmitas (20)
  { cat:'Marmitas', name:'Marmita Pequena',       cost:8.50,  price:18.00, desc:'Arroz, feijão, proteína e salada' },
  { cat:'Marmitas', name:'Marmita Média',          cost:11.20, price:24.00, desc:'Arroz, feijão, 2 proteínas e salada' },
  { cat:'Marmitas', name:'Marmita Grande',         cost:14.80, price:32.00, desc:'Arroz, feijão, 3 proteínas e salada' },
  { cat:'Marmitas', name:'Marmita Executiva',      cost:16.50, price:38.00, desc:'Completa com sobremesa inclusa' },
  { cat:'Marmitas', name:'Marmita Frango Grelhado',cost:10.20, price:22.00, desc:'Frango grelhado, arroz integral e legumes' },
  { cat:'Marmitas', name:'Marmita Carne Assada',   cost:13.40, price:28.00, desc:'Carne assada temperada com arroz e feijão' },
  { cat:'Marmitas', name:'Marmita Peixe',          cost:15.60, price:34.00, desc:'Filé de peixe grelhado com arroz e legumes' },
  { cat:'Marmitas', name:'Marmita Vegetariana',    cost:7.80,  price:20.00, desc:'Arroz, feijão, legumes refogados e ovo' },
  { cat:'Marmitas', name:'Marmita Low Carb',       cost:12.30, price:30.00, desc:'Proteína, salada e legumes sem carboidratos' },
  { cat:'Marmitas', name:'Marmita Fitness',        cost:9.60,  price:26.00, desc:'Frango, batata doce e brócolis' },
  { cat:'Marmitas', name:'Marmita Dupla',          cost:22.00, price:44.00, desc:'Duas marmitas médias embaladas juntas' },
  { cat:'Marmitas', name:'Marmita Strogonoff',     cost:12.80, price:28.00, desc:'Strogonoff de frango com arroz e batata palha' },
  { cat:'Marmitas', name:'Marmita Panqueca',       cost:9.20,  price:22.00, desc:'Panquecas de carne ao molho vermelho' },
  { cat:'Marmitas', name:'Marmita Frango c/ Creme',cost:11.50, price:26.00, desc:'Frango cremoso, arroz e purê' },
  { cat:'Marmitas', name:'Marmita Costela',        cost:18.90, price:42.00, desc:'Costela assada com arroz, feijão e farofa' },
  { cat:'Marmitas', name:'Marmita Picanha',        cost:24.50, price:52.00, desc:'Picanha ao ponto com arroz, feijão e farofa' },
  { cat:'Marmitas', name:'Marmita Porco',          cost:11.00, price:24.00, desc:'Lombo suíno com arroz e feijão' },
  { cat:'Marmitas', name:'Marmita Linguiça',       cost:9.80,  price:20.00, desc:'Linguiça calabresa com arroz e feijão' },
  { cat:'Marmitas', name:'Marmita Sobrecoxa',      cost:10.40, price:22.00, desc:'Sobrecoxa assada com arroz e feijão' },
  { cat:'Marmitas', name:'Marmita Especial Serra', cost:19.50, price:45.00, desc:'Receita exclusiva da chef com ingredientes da serra' },

  // Lanches (20)
  { cat:'Lanches', name:'Bauru Simples',        cost:5.80,  price:14.00 },
  { cat:'Lanches', name:'Bauru Especial',       cost:7.20,  price:18.00 },
  { cat:'Lanches', name:'Misto Quente',         cost:3.50,  price:9.00  },
  { cat:'Lanches', name:'Cachorro Quente',      cost:4.20,  price:11.00 },
  { cat:'Lanches', name:'Hot Dog Especial',     cost:6.80,  price:16.00 },
  { cat:'Lanches', name:'Croissant Presunto',   cost:5.50,  price:14.00 },
  { cat:'Lanches', name:'Croissant Queijo',     cost:5.00,  price:13.00 },
  { cat:'Lanches', name:'Sanduíche Natural',    cost:6.20,  price:15.00 },
  { cat:'Lanches', name:'Wrap Frango',          cost:7.50,  price:18.00 },
  { cat:'Lanches', name:'Wrap Atum',            cost:8.20,  price:20.00 },
  { cat:'Lanches', name:'Tosta Mista',          cost:4.80,  price:12.00 },
  { cat:'Lanches', name:'Panini Caprese',       cost:8.50,  price:22.00 },
  { cat:'Lanches', name:'Pão de Alho',          cost:2.80,  price:7.00  },
  { cat:'Lanches', name:'Pão de Queijo Grande', cost:1.80,  price:5.00  },
  { cat:'Lanches', name:'Coxinha',              cost:2.20,  price:6.00  },
  { cat:'Lanches', name:'Kibe Frito',           cost:2.50,  price:7.00  },
  { cat:'Lanches', name:'Risole Carne',         cost:2.30,  price:6.00  },
  { cat:'Lanches', name:'Pastel Carne',         cost:3.80,  price:9.00  },
  { cat:'Lanches', name:'Pastel Frango',        cost:3.50,  price:9.00  },
  { cat:'Lanches', name:'Esfiha Carne',         cost:2.80,  price:7.00  },

  // Hambúrgueres (20)
  { cat:'Hambúrgueres', name:'X-Burguer',         cost:9.20,  price:22.00 },
  { cat:'Hambúrgueres', name:'X-Salada',           cost:9.80,  price:24.00 },
  { cat:'Hambúrgueres', name:'X-Bacon',            cost:11.50, price:28.00 },
  { cat:'Hambúrgueres', name:'X-Egg',              cost:10.20, price:25.00 },
  { cat:'Hambúrgueres', name:'X-Tudo',             cost:14.80, price:35.00 },
  { cat:'Hambúrgueres', name:'Hambúrguer Simples', cost:8.50,  price:20.00 },
  { cat:'Hambúrgueres', name:'Cheese Burguer',     cost:9.00,  price:22.00 },
  { cat:'Hambúrgueres', name:'Smash Burguer',      cost:12.50, price:32.00 },
  { cat:'Hambúrgueres', name:'Double Smash',       cost:18.00, price:42.00 },
  { cat:'Hambúrgueres', name:'Frango Crispy',      cost:10.80, price:26.00 },
  { cat:'Hambúrgueres', name:'Fish Burguer',       cost:11.20, price:28.00 },
  { cat:'Hambúrgueres', name:'Veggie Burguer',     cost:9.50,  price:24.00 },
  { cat:'Hambúrgueres', name:'BBQ Especial',       cost:15.20, price:38.00 },
  { cat:'Hambúrgueres', name:'Trufado',            cost:16.80, price:42.00 },
  { cat:'Hambúrgueres', name:'Cheddar Blend',      cost:13.40, price:34.00 },
  { cat:'Hambúrgueres', name:'Burguer da Serra',   cost:14.00, price:36.00 },
  { cat:'Hambúrgueres', name:'Cowboy Burguer',     cost:17.50, price:44.00 },
  { cat:'Hambúrgueres', name:'Crispy Ranch',       cost:12.00, price:30.00 },
  { cat:'Hambúrgueres', name:'Burguer Kids',       cost:7.80,  price:19.00 },
  { cat:'Hambúrgueres', name:'Combo Burguer+Frita',cost:18.50, price:38.00 }, // margem baixa intencional

  // Refrigerantes (15)
  { cat:'Refrigerantes', name:'Coca-Cola Lata',   cost:2.80, price:6.00  },
  { cat:'Refrigerantes', name:'Coca-Cola 600ml',  cost:3.50, price:7.00  },
  { cat:'Refrigerantes', name:'Coca-Cola 2L',     cost:6.00, price:10.00 },
  { cat:'Refrigerantes', name:'Pepsi Lata',       cost:2.50, price:6.00  },
  { cat:'Refrigerantes', name:'Guaraná Lata',     cost:2.40, price:5.50  },
  { cat:'Refrigerantes', name:'Guaraná 2L',       cost:5.50, price:9.00  },
  { cat:'Refrigerantes', name:'Fanta Laranja',    cost:2.40, price:6.00  },
  { cat:'Refrigerantes', name:'Sprite Lata',      cost:2.40, price:6.00  },
  { cat:'Refrigerantes', name:'Água Mineral',     cost:1.20, price:4.00  },
  { cat:'Refrigerantes', name:'Água com Gás',     cost:1.50, price:5.00  },
  { cat:'Refrigerantes', name:'Suco Caixinha',    cost:1.80, price:5.00  },
  { cat:'Refrigerantes', name:'Suco Natural 500ml',cost:4.50,price:12.00 },
  { cat:'Refrigerantes', name:'Vitamina Fruta',   cost:5.20, price:14.00 },
  { cat:'Refrigerantes', name:'Chá Gelado',       cost:2.20, price:6.00  },
  { cat:'Refrigerantes', name:'Energético',       cost:4.50, price:8.00  }, // margem baixa

  // Sobremesas (15)
  { cat:'Sobremesas', name:'Pudim',              cost:3.20,  price:10.00 },
  { cat:'Sobremesas', name:'Torta de Limão',     cost:4.50,  price:14.00 },
  { cat:'Sobremesas', name:'Bolo de Chocolate',  cost:3.80,  price:12.00 },
  { cat:'Sobremesas', name:'Bolo de Cenoura',    cost:3.60,  price:11.00 },
  { cat:'Sobremesas', name:'Mousse Maracujá',    cost:4.20,  price:13.00 },
  { cat:'Sobremesas', name:'Brownie',            cost:3.50,  price:11.00 },
  { cat:'Sobremesas', name:'Brigadeiro',         cost:1.80,  price:5.00  },
  { cat:'Sobremesas', name:'Beijinho',           cost:1.60,  price:5.00  },
  { cat:'Sobremesas', name:'Açaí 300ml',         cost:5.50,  price:14.00 },
  { cat:'Sobremesas', name:'Açaí 500ml',         cost:8.20,  price:20.00 },
  { cat:'Sobremesas', name:'Sorvete 2 Bolas',    cost:4.00,  price:12.00 },
  { cat:'Sobremesas', name:'Crepe Doce',         cost:4.50,  price:14.00 },
  { cat:'Sobremesas', name:'Romeu e Julieta',    cost:3.80,  price:10.00 },
  { cat:'Sobremesas', name:'Quindim',            cost:3.20,  price:9.00  },
  { cat:'Sobremesas', name:'Torta Holandesa',    cost:6.80,  price:22.00 },

  // Porções (10) — inclui produtos vendendo ABAIXO do custo (bug real)
  { cat:'Porções', name:'Batata Frita P',           cost:4.80,  price:12.00 },
  { cat:'Porções', name:'Batata Frita G',           cost:7.20,  price:18.00 },
  { cat:'Porções', name:'Batata Frita Cheddar',     cost:9.50,  price:16.00 }, // vendendo quase no custo
  { cat:'Porções', name:'Frango Frito 500g',        cost:18.50, price:16.00 }, // ABAIXO DO CUSTO (bug)
  { cat:'Porções', name:'Mandioca Frita',           cost:5.20,  price:14.00 },
  { cat:'Porções', name:'Linguiça 300g',            cost:12.00, price:28.00 },
  { cat:'Porções', name:'Calabresa Acebolada',      cost:11.50, price:26.00 },
  { cat:'Porções', name:'Mix de Fritos',            cost:14.00, price:11.00 }, // ABAIXO DO CUSTO (bug)
  { cat:'Porções', name:'Bolinho de Bacalhau 6un',  cost:0,     price:18.00 }, // SEM CUSTO CADASTRADO
  { cat:'Porções', name:'Polenta Frita',            cost:0,     price:12.00 }, // SEM CUSTO CADASTRADO
];

// ── Insumos (80) ──────────────────────────────────────────────
const INSUMOS = [
  // Proteínas
  { name:'Frango Inteiro',         unit:'kg', cost:8.50,  stock:45 },
  { name:'Sobrecoxa de Frango',    unit:'kg', cost:7.20,  stock:30 },
  { name:'Peito de Frango',        unit:'kg', cost:12.80, stock:25 },
  { name:'Carne Moída Bovina',     unit:'kg', cost:18.50, stock:20 },
  { name:'Contrafilé',             unit:'kg', cost:28.00, stock:15 },
  { name:'Picanha',                unit:'kg', cost:55.00, stock:8  },
  { name:'Costela Bovina',         unit:'kg', cost:22.00, stock:12 },
  { name:'Linguiça Calabresa',     unit:'kg', cost:14.00, stock:10 },
  { name:'Linguiça Toscana',       unit:'kg', cost:13.50, stock:8  },
  { name:'Lombo Suíno',            unit:'kg', cost:16.00, stock:12 },
  { name:'Filé de Peixe',          unit:'kg', cost:22.00, stock:6  },
  { name:'Ovo',                    unit:'un', cost:0.65,  stock:180 },
  { name:'Presunto Fatiado',       unit:'kg', cost:18.00, stock:5  },
  { name:'Bacon',                  unit:'kg', cost:24.00, stock:4  },
  { name:'Hambúrguer Artesanal',   unit:'un', cost:6.50,  stock:80 },

  // Laticínios
  { name:'Queijo Muçarela',        unit:'kg', cost:28.00, stock:8  },
  { name:'Queijo Prato',           unit:'kg', cost:26.00, stock:5  },
  { name:'Queijo Cheddar',         unit:'kg', cost:32.00, stock:4  },
  { name:'Requeijão Cremoso',      unit:'kg', cost:18.00, stock:6  },
  { name:'Creme de Leite',         unit:'l',  cost:6.50,  stock:10 },
  { name:'Leite Integral',         unit:'l',  cost:3.80,  stock:20 },
  { name:'Manteiga',               unit:'kg', cost:28.00, stock:3  },
  { name:'Nata',                   unit:'kg', cost:15.00, stock:4  },

  // Grãos e Secos
  { name:'Arroz Tipo 1',           unit:'kg', cost:3.20,  stock:80 },
  { name:'Feijão Carioca',         unit:'kg', cost:6.50,  stock:40 },
  { name:'Feijão Preto',           unit:'kg', cost:7.00,  stock:20 },
  { name:'Farinha de Trigo',       unit:'kg', cost:2.80,  stock:30 },
  { name:'Farinha de Mandioca',    unit:'kg', cost:4.50,  stock:15 },
  { name:'Amido de Milho',         unit:'kg', cost:5.20,  stock:8  },
  { name:'Açúcar',                 unit:'kg', cost:3.50,  stock:20 },
  { name:'Sal Refinado',           unit:'kg', cost:1.80,  stock:15 },

  // Vegetais e Frescos
  { name:'Batata Inglesa',         unit:'kg', cost:3.80,  stock:40 },
  { name:'Batata Doce',            unit:'kg', cost:4.20,  stock:15 },
  { name:'Mandioca',               unit:'kg', cost:3.50,  stock:20 },
  { name:'Alface Americana',       unit:'un', cost:1.80,  stock:30 },
  { name:'Tomate',                 unit:'kg', cost:5.50,  stock:10 },
  { name:'Cebola',                 unit:'kg', cost:3.20,  stock:15 },
  { name:'Alho',                   unit:'kg', cost:18.00, stock:5  },
  { name:'Pimentão Verde',         unit:'kg', cost:6.00,  stock:5  },
  { name:'Brócolis',               unit:'kg', cost:7.50,  stock:6  },
  { name:'Cenoura',                unit:'kg', cost:3.80,  stock:10 },
  { name:'Abobrinha',              unit:'kg', cost:4.20,  stock:8  },
  { name:'Limão',                  unit:'kg', cost:4.50,  stock:6  },

  // Temperos e Condimentos
  { name:'Óleo de Soja',           unit:'l',  cost:5.80,  stock:20 },
  { name:'Azeite',                 unit:'l',  cost:22.00, stock:4  },
  { name:'Molho de Tomate',        unit:'kg', cost:5.50,  stock:15 },
  { name:'Molho Shoyu',            unit:'l',  cost:12.00, stock:3  },
  { name:'Ketchup',                unit:'kg', cost:8.50,  stock:5  },
  { name:'Maionese',               unit:'kg', cost:9.50,  stock:6  },
  { name:'Mostarda',               unit:'kg', cost:7.80,  stock:3  },
  { name:'Pimenta do Reino',       unit:'kg', cost:28.00, stock:2  },
  { name:'Orégano',                unit:'kg', cost:22.00, stock:1  },

  // Panificação e Confeitaria
  { name:'Pão Hambúrguer',         unit:'un', cost:1.20,  stock:150 },
  { name:'Pão de Forma',           unit:'un', cost:0.80,  stock:100 },
  { name:'Pão Cachorro Quente',    unit:'un', cost:0.90,  stock:80  },
  { name:'Polvilho Doce',          unit:'kg', cost:6.50,  stock:8   },
  { name:'Chocolate em Pó',        unit:'kg', cost:18.00, stock:3   },
  { name:'Chocolate Cobertura',    unit:'kg', cost:32.00, stock:4   },
  { name:'Gelatina Sem Sabor',     unit:'kg', cost:45.00, stock:1   },
  { name:'Leite Condensado',       unit:'un', cost:4.50,  stock:20  },

  // Bebidas (base)
  { name:'Coca-Cola 2L (cx)',      unit:'un', cost:5.20,  stock:24 },
  { name:'Coca-Cola Lata (cx)',    unit:'un', cost:2.20,  stock:48 },
  { name:'Guaraná 2L (cx)',        unit:'un', cost:4.80,  stock:18 },
  { name:'Água Mineral 500ml',     unit:'un', cost:0.90,  stock:60 },
  { name:'Suco Polpa Frutas',      unit:'kg', cost:8.50,  stock:10 },

  // Descartáveis e Embalagens
  { name:'Embalagem Marmita M',    unit:'un', cost:0.85,  stock:500 },
  { name:'Embalagem Marmita G',    unit:'un', cost:1.10,  stock:300 },
  { name:'Sacola Delivery',        unit:'un', cost:0.35,  stock:800 },
  { name:'Copo Descartável 300ml', unit:'un', cost:0.18,  stock:400 },
  { name:'Embalagem Burguer',      unit:'un', cost:0.65,  stock:400 },
  { name:'Papel Kraft',            unit:'m²', cost:0.45,  stock:100 },
  { name:'Palito de Dente',        unit:'cx', cost:2.80,  stock:20  },
  { name:'Guardanapo',             unit:'cx', cost:8.50,  stock:15  },

  // Gás e Limpeza
  { name:'Gás de Cozinha 13kg',    unit:'un', cost:98.00, stock:4  },
  { name:'Detergente',             unit:'l',  cost:4.50,  stock:10 },
  { name:'Álcool 70%',             unit:'l',  cost:8.50,  stock:6  },
  { name:'Esponja',                unit:'un', cost:1.50,  stock:20 },
  { name:'Pano de Limpeza',        unit:'un', cost:3.80,  stock:15 },
];

// ── Despesas mensais ──────────────────────────────────────────
const DESPESAS_FIXAS = [
  { name:'Aluguel Ponto Comercial', cat:'rent',     amount:2800, supplier:'Imob. Serra Alta' },
  { name:'Energia Elétrica',        cat:'utilities', amount:680,  supplier:'CEEE' },
  { name:'Água e Esgoto',           cat:'utilities', amount:185,  supplier:'CORSAN' },
  { name:'Internet Fibra',          cat:'utilities', amount:159,  supplier:'Vero Internet' },
  { name:'Telefone',                cat:'utilities', amount:89,   supplier:'Claro' },
  { name:'Folha Funcionários',      cat:'staff',     amount:4200, supplier:null },
  { name:'Pró-labore Sócio',        cat:'staff',     amount:3000, supplier:null },
  { name:'FGTS + INSS',             cat:'tax',       amount:980,  supplier:'Receita Federal' },
  { name:'Simples Nacional',        cat:'tax',       amount:1250, supplier:'Receita Federal' },
  { name:'Contabilidade',           cat:'other',     amount:480,  supplier:'Escritório Contábil Souza' },
  { name:'Seguro do Estabelecimento',cat:'other',    amount:280,  supplier:'Porto Seguro' },
  { name:'Sistema ZapFome',         cat:'other',     amount:149,  supplier:'ZapFome' },
];

const DESPESAS_VARIAVEIS = [
  { name:'Compra Frango',           cat:'food_supplier', supplier:'Frigorífico Três Pinheiros' },
  { name:'Compra Carnes Bovinas',   cat:'food_supplier', supplier:'Açougue Central' },
  { name:'Compra Hortifruti',       cat:'food_supplier', supplier:'CEASA Serra' },
  { name:'Compra Descartáveis',     cat:'food_supplier', supplier:'Distribuidora Pack Sul' },
  { name:'Compra Bebidas',          cat:'food_supplier', supplier:'Distribuidora Bebidas Serra' },
  { name:'Gás de Cozinha',          cat:'utilities',     supplier:'Ultragaz' },
  { name:'Manutenção Equipamentos', cat:'maintenance',   supplier:'Técnico Silva' },
  { name:'Marketing / Panfletos',   cat:'marketing',     supplier:'Gráfica Express' },
  { name:'Combustível Delivery',    cat:'other',         supplier:'Posto Petrobras' },
  { name:'Material de Limpeza',     cat:'other',         supplier:'Distribuidora Limpeza' },
];

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  const db = await pool.connect();
  console.log('🌱 Iniciando seeder — Sabor da Serra...');

  try {
    await db.query('BEGIN');

    // ── 1. Tenant ────────────────────────────────────────────
    console.log('  → Criando tenant...');
    const tenantRes = await db.query(`
      INSERT INTO tenants (id, name, slug, plan, subscription_status, trial_ends_at,
        restaurant_lat, restaurant_lng, whatsapp_number, address)
      VALUES ($1,$2,$3,'premium','active', NOW() + INTERVAL '365 days',
        -29.3328, -49.7292, '54999887766', 'Av. Principal, 450 — Centro — Torres/RS')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [uuid(), NOME, SLUG]);
    const TID = tenantRes.rows[0].id;
    console.log(`     Tenant ID: ${TID}`);

    // ── 2. Usuário owner ─────────────────────────────────────
    await db.query(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role)
      VALUES ($1,$2,'João da Serra',$3,$4,'owner')
      ON CONFLICT (tenant_id, email) DO NOTHING
    `, [uuid(), TID, OWNER_EMAIL, OWNER_PASS]);

    // ── 3. Order counter ─────────────────────────────────────
    await db.query(`
      INSERT INTO order_counters (tenant_id, last_number) VALUES ($1, 0)
      ON CONFLICT (tenant_id) DO NOTHING
    `, [TID]);

    // ── 4. Categorias ────────────────────────────────────────
    console.log('  → Criando categorias...');
    const catMap = {};
    for (const c of CATEGORIAS) {
      const r = await db.query(`
        INSERT INTO categories (id, tenant_id, name, printer_target)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (tenant_id, name) DO UPDATE SET printer_target = EXCLUDED.printer_target
        RETURNING id
      `, [uuid(), TID, c.name, c.printer_target]);
      catMap[c.name] = r.rows[0].id;
    }

    // ── 5. Produtos ──────────────────────────────────────────
    console.log('  → Criando 120 produtos...');
    const prodMap = {}; // name → id
    for (const p of PRODUTOS) {
      const pid = uuid();
      await db.query(`
        INSERT INTO products (id, tenant_id, category_id, name, description,
          cost_price, sale_price, active, cost_price_source, stock_qty, alert_threshold)
        VALUES ($1,$2,$3,$4,$5,$6,$7,true,'manual',$8,$9)
        ON CONFLICT DO NOTHING
      `, [pid, TID, catMap[p.cat], p.name, p.desc || null,
          p.cost, p.price, randI(20, 200), randI(5, 20)]);
      prodMap[p.name] = pid;
    }

    // ── 6. Insumos ───────────────────────────────────────────
    console.log('  → Criando 80 insumos...');
    const insMap = {}; // name → { id, cost, unit }
    for (const ins of INSUMOS) {
      const iid = uuid();
      await db.query(`
        INSERT INTO insumos (id, tenant_id, name, unit, qty_in_stock, min_qty, cost_per_unit)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT DO NOTHING
      `, [iid, TID, ins.name, ins.unit, ins.stock, ins.stock * 0.2, ins.cost]);
      insMap[ins.name] = { id: iid, cost: ins.cost, unit: ins.unit };
    }

    // ── 7. Fichas técnicas (product_insumos) ─────────────────
    console.log('  → Vinculando fichas técnicas...');
    const RECIPES = [
      { prod:'Marmita Pequena',   ins:[ ['Arroz Tipo 1',0.15], ['Feijão Carioca',0.08], ['Sobrecoxa de Frango',0.12], ['Embalagem Marmita M',1] ] },
      { prod:'Marmita Média',     ins:[ ['Arroz Tipo 1',0.20], ['Feijão Carioca',0.10], ['Frango Inteiro',0.15], ['Carne Moída Bovina',0.08], ['Embalagem Marmita M',1] ] },
      { prod:'Marmita Grande',    ins:[ ['Arroz Tipo 1',0.25], ['Feijão Carioca',0.12], ['Frango Inteiro',0.18], ['Contrafilé',0.12], ['Embalagem Marmita G',1] ] },
      { prod:'Marmita Executiva', ins:[ ['Arroz Tipo 1',0.25], ['Feijão Preto',0.12], ['Picanha',0.14], ['Embalagem Marmita G',1] ] },
      { prod:'X-Burguer',         ins:[ ['Hambúrguer Artesanal',1], ['Pão Hambúrguer',1], ['Queijo Muçarela',0.04], ['Molho de Tomate',0.03], ['Embalagem Burguer',1] ] },
      { prod:'X-Salada',          ins:[ ['Hambúrguer Artesanal',1], ['Pão Hambúrguer',1], ['Queijo Muçarela',0.04], ['Alface Americana',0.15], ['Tomate',0.06], ['Embalagem Burguer',1] ] },
      { prod:'X-Bacon',           ins:[ ['Hambúrguer Artesanal',1], ['Pão Hambúrguer',1], ['Queijo Muçarela',0.04], ['Bacon',0.06], ['Embalagem Burguer',1] ] },
      { prod:'X-Tudo',            ins:[ ['Hambúrguer Artesanal',1], ['Pão Hambúrguer',1], ['Queijo Muçarela',0.06], ['Bacon',0.08], ['Ovo',1], ['Alface Americana',0.1], ['Tomate',0.05], ['Embalagem Burguer',1] ] },
      { prod:'Batata Frita P',    ins:[ ['Batata Inglesa',0.18], ['Óleo de Soja',0.05], ['Sal Refinado',0.005] ] },
      { prod:'Batata Frita G',    ins:[ ['Batata Inglesa',0.30], ['Óleo de Soja',0.08], ['Sal Refinado',0.008] ] },
      { prod:'Pudim',             ins:[ ['Leite Condensado',0.5], ['Leite Integral',0.3], ['Ovo',3], ['Açúcar',0.1] ] },
      { prod:'Torta de Limão',    ins:[ ['Leite Condensado',1], ['Creme de Leite',0.2], ['Limão',0.15], ['Farinha de Trigo',0.15] ] },
      { prod:'Misto Quente',      ins:[ ['Pão de Forma',2], ['Presunto Fatiado',0.06], ['Queijo Prato',0.04], ['Manteiga',0.01] ] },
      { prod:'Frango Frito 500g', ins:[ ['Frango Inteiro',0.55], ['Farinha de Trigo',0.08], ['Óleo de Soja',0.15], ['Sal Refinado',0.01] ] },
      { prod:'Linguiça 300g',     ins:[ ['Linguiça Calabresa',0.33], ['Cebola',0.08], ['Óleo de Soja',0.03] ] },
    ];
    for (const r of RECIPES) {
      const pid = prodMap[r.prod];
      if (!pid) continue;
      for (const [insName, qty] of r.ins) {
        const ins = insMap[insName];
        if (!ins) continue;
        await db.query(`
          INSERT INTO product_insumos (id, product_id, insumo_id, tenant_id, qty_per_unit)
          VALUES ($1,$2,$3,$4,$5) ON CONFLICT (product_id, insumo_id) DO NOTHING
        `, [uuid(), pid, ins.id, TID, qty]);
      }
    }

    // ── 8. Clientes (loyalty_customers) ──────────────────────
    console.log('  → Criando 250 clientes...');
    const customers = [];
    for (let i = 0; i < 250; i++) {
      const cid  = uuid();
      const name = NOMES_CLIENTES[i % NOMES_CLIENTES.length];
      const ph   = phone();
      const freq = i < 50 ? 'vip' : i < 200 ? 'normal' : 'inativo';
      const totalOrders = freq === 'vip' ? randI(20,60) : freq === 'normal' ? randI(3,15) : randI(0,2);
      const totalSpent  = parseFloat((totalOrders * rand(25, 65)).toFixed(2));
      const cashback    = freq === 'vip' ? parseFloat((totalSpent * 0.03).toFixed(2)) : 0;
      await db.query(`
        INSERT INTO loyalty_customers (id, tenant_id, name, phone, cashback_balance, total_orders, total_spent)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (tenant_id, phone) DO NOTHING
      `, [cid, TID, name, ph, cashback, totalOrders, totalSpent]);
      customers.push({ id: cid, name, phone: ph, freq });
    }

    // ── 9. Pedidos (1500) ─────────────────────────────────────
    console.log('  → Criando 1500 pedidos (pode demorar ~30s)...');
    const prodList = PRODUTOS.map(p => ({ id: prodMap[p.name], name: p.name, price: p.price, cost: p.cost }))
                             .filter(p => p.id);
    const deliveryTypes = ['delivery','delivery','delivery','delivery','pickup','pickup','pickup','balcao','balcao','balcao'];
    const payMethods    = ['pix','pix','pix','pix','credit','credit','credit','debit','debit','cash','cash','fiado'];
    const statuses      = ['delivered','delivered','delivered','delivered','delivered','delivered','delivered',
                           'cancelled','cancelled','confirmed'];
    const neighborhoods = BAIRROS;

    let orderNum = 1;
    const orderIds  = [];
    const fiadoCustomers = customers.slice(0, 15); // 15 clientes para fiado

    for (let i = 0; i < 1500; i++) {
      const daysAgo = randI(0, 59);
      const hour    = randI(10, 22);
      const createdAt = ago(daysAgo, 24 - hour);

      const customer    = customers[randI(0, customers.length - 1)];
      const delivType   = pick(deliveryTypes);
      let   payMethod   = pick(payMethods);
      const status      = pick(statuses);
      const isFiado     = fiadoCustomers.some(fc => fc.id === customer.id) && payMethod === 'fiado';
      if (!isFiado && payMethod === 'fiado') payMethod = 'pix';

      const itemCount = randI(1, 4);
      const items     = [];
      let total = 0;

      for (let j = 0; j < itemCount; j++) {
        const prod = pick(prodList);
        const qty  = randI(1, 3);
        const unitCost = prod.cost || 0;
        items.push({ prod, qty, unitCost });
        total += prod.price * qty;
      }

      const delivFee  = delivType === 'delivery' ? pick([6,8,10,10,12,15,20]) : 0;
      total = parseFloat((total + delivFee).toFixed(2));
      const paidAt    = (status === 'delivered' || status === 'confirmed') ? createdAt : null;
      const neighborhood = delivType === 'delivery' ? pick(neighborhoods) : null;
      const address      = delivType === 'delivery'
        ? `${pick(RUAS)}, ${randI(10, 999)} — ${neighborhood}`
        : null;

      const oid = uuid();
      await db.query(`
        INSERT INTO orders (
          id, tenant_id, order_number, customer_name, customer_phone,
          customer_address, neighborhood, delivery_type, payment_method,
          status, total, delivery_fee, paid_at, created_at, updated_at,
          insumos_deducted
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,true)
      `, [oid, TID, orderNum++, customer.name, customer.phone,
          address, neighborhood, delivType, payMethod,
          status, total, delivFee, paidAt, createdAt]);

      for (const { prod, qty, unitCost } of items) {
        await db.query(`
          INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_price, total, unit_cost, total_cost)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `, [uuid(), oid, prod.id, prod.name, qty, prod.price,
            parseFloat((prod.price * qty).toFixed(2)),
            unitCost, parseFloat((unitCost * qty).toFixed(2))]);
      }

      if (isFiado && status === 'delivered') {
        orderIds.push({ oid, total, customer, createdAt });
      }
    }

    // ── 10. Clientes Fiado ────────────────────────────────────
    console.log('  → Criando fiados...');
    const fiadoNomes = [
      'José Artur Nunes','Cleonice Batista','Valdecir Pacheco',
      'Marilene Krause','Eloir Schmitt','Ângela Teixeira',
      'Osvaldo Brandão','Vera Lúcia Soares','Paulinho da Serra',
      'Iraci Fonseca','Nelci Gomes','Reni Schuster',
    ];
    const fiadoMap = [];
    for (const nm of fiadoNomes) {
      const fcid = uuid();
      const diasAcerto = pick([5,10,15,20,25]);
      await db.query(`
        INSERT INTO fiado_clientes (id, tenant_id, name, phone, dia_acerto, bloqueado)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [fcid, TID, nm, phone(), diasAcerto, nm === 'Paulinho da Serra']);
      fiadoMap.push({ id: fcid, name: nm });
    }

    // Compras fiadas realistas
    const fiadoScenarios = [
      { cli:0, valor:85.00,  status:'pago',     daysAgo:45 },
      { cli:0, valor:120.00, status:'pago',     daysAgo:30 },
      { cli:0, valor:95.00,  status:'pendente', daysAgo:12 },
      { cli:1, valor:220.00, status:'pago',     daysAgo:50 },
      { cli:1, valor:180.00, status:'pendente', daysAgo:20 },
      { cli:1, valor:145.00, status:'pendente', daysAgo:8  },
      { cli:2, valor:340.00, status:'pendente', daysAgo:35 }, // vencido
      { cli:2, valor:280.00, status:'pendente', daysAgo:28 }, // vencido
      { cli:3, valor:75.00,  status:'pago',     daysAgo:40 },
      { cli:3, valor:110.00, status:'pago',     daysAgo:25 },
      { cli:3, valor:95.00,  status:'pendente', daysAgo:5  },
      { cli:4, valor:450.00, status:'pendente', daysAgo:42 }, // vencido
      { cli:5, valor:160.00, status:'pago',     daysAgo:55 },
      { cli:5, valor:190.00, status:'pendente', daysAgo:18 },
      { cli:6, valor:320.00, status:'pendente', daysAgo:38 }, // vencido
      { cli:7, valor:85.00,  status:'pago',     daysAgo:22 },
      { cli:7, valor:95.00,  status:'pendente', daysAgo:10 },
      { cli:8, valor:510.00, status:'pendente', daysAgo:48 }, // vencido — bloqueado
      { cli:9, valor:130.00, status:'pago',     daysAgo:35 },
      { cli:9, valor:145.00, status:'pendente', daysAgo:15 },
      { cli:10,valor:75.00,  status:'pago',     daysAgo:30 },
      { cli:11,valor:420.00, status:'pendente', daysAgo:52 }, // vencido
    ];
    for (const sc of fiadoScenarios) {
      const cli = fiadoMap[sc.cli];
      if (!cli) continue;
      const paidAt = sc.status === 'pago' ? ago(sc.daysAgo - 5) : null;
      await db.query(`
        INSERT INTO fiado_compras (id, tenant_id, cliente_id, descricao, valor, status, paid_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [uuid(), TID, cli.id,
          `Pedido ${pick(['marmitas','delivery','almoço','jantar'])} ${pick(['seg','ter','qua','qui','sex'])}`,
          sc.valor, sc.status, paidAt, ago(sc.daysAgo)]);
    }

    // ── 11. Despesas (60 dias) ────────────────────────────────
    console.log('  → Criando despesas financeiras...');
    for (let month = 0; month < 2; month++) {
      for (const d of DESPESAS_FIXAS) {
        const dueDay  = month === 0 ? 30 : 5;
        const dueDate = new Date(); dueDate.setDate(dueDate.getDate() - dueDay);
        const paid    = Math.random() > 0.1;
        const eid     = uuid();
        await db.query(`
          INSERT INTO expenses (id, tenant_id, name, supplier, category, amount,
            payment_method, due_date, paid_at, status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [eid, TID, d.name, d.supplier, d.cat, d.amount,
            pick(['pix','transfer','boleto']),
            dueDate.toISOString().split('T')[0],
            paid ? ago(dueDay - 2) : null,
            paid ? 'paid' : 'overdue']);
      }
    }
    // Despesas variáveis
    for (let i = 0; i < 25; i++) {
      const d       = pick(DESPESAS_VARIAVEIS);
      const daysAgo = randI(1, 58);
      const amount  = rand(180, 2800);
      const paid    = Math.random() > 0.15;
      const dueDate = new Date(); dueDate.setDate(dueDate.getDate() - daysAgo);
      await db.query(`
        INSERT INTO expenses (id, tenant_id, name, supplier, category, amount,
          payment_method, due_date, paid_at, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [uuid(), TID, d.name, d.supplier, d.cat, amount,
          pick(['pix','cash','credit']),
          dueDate.toISOString().split('T')[0],
          paid ? ago(daysAgo - 1) : null,
          paid ? 'paid' : (daysAgo > 5 ? 'overdue' : 'pending')]);
    }

    // ── 12. Caixas (30 dias) ──────────────────────────────────
    console.log('  → Criando fechamentos de caixa...');
    for (let d = 1; d <= 30; d++) {
      const openAgo  = ago(d, -1 * 10); // 10h
      const closeAgo = ago(d, -1 * 22); // 22h
      const revenue  = rand(800, 3200);
      const expected = parseFloat((revenue * 0.25).toFixed(2)); // 25% em dinheiro
      const divergencia = d % 5 === 0 ? rand(-150, -20) : d % 11 === 0 ? rand(10, 80) : 0;
      const cashCounted = parseFloat((expected + divergencia).toFixed(2));
      const cid = uuid();

      const userRes = await db.query(
        `SELECT id FROM users WHERE tenant_id=$1 LIMIT 1`, [TID]);
      const userId = userRes.rows[0]?.id || null;

      await db.query(`
        INSERT INTO cash_registers (
          id, tenant_id, opened_by, closed_by, opening_balance, closing_balance,
          total_revenue, total_orders, status, opened_at, closed_at,
          cash_counted, pix_counted, card_counted, discrepancy,
          payment_summary
        ) VALUES ($1,$2,$3,$3,$4,$5,$6,$7,'closed',$8,$9,$10,$11,$12,$13,$14)
      `, [cid, TID, userId,
          rand(50, 200),
          parseFloat(revenue.toFixed(2)),
          parseFloat(revenue.toFixed(2)),
          randI(20, 80),
          openAgo, closeAgo,
          cashCounted,
          parseFloat((revenue * 0.35).toFixed(2)),
          parseFloat((revenue * 0.40).toFixed(2)),
          parseFloat(divergencia.toFixed(2)),
          JSON.stringify({
            cash:   parseFloat((revenue * 0.25).toFixed(2)),
            pix:    parseFloat((revenue * 0.35).toFixed(2)),
            credit: parseFloat((revenue * 0.25).toFixed(2)),
            debit:  parseFloat((revenue * 0.15).toFixed(2)),
          })]);

      // banco_transactions: crédito pelo fechamento
      await db.query(`
        INSERT INTO banco_transactions (id, tenant_id, type, amount, description, source, reference_id, created_at)
        VALUES ($1,$2,'credit',$3,$4,'caixa',$5,$6)
      `, [uuid(), TID, parseFloat(revenue.toFixed(2)),
          `Fechamento caixa dia ${d} ago`, cid, closeAgo]);

      // Sangria em alguns dias
      if (d % 4 === 0) {
        const sangria = rand(50, 300);
        await db.query(`
          INSERT INTO caixa_movements (id, tenant_id, cash_register_id, type, amount, reason, created_at)
          VALUES ($1,$2,$3,'sangria',$4,$5,$6)
        `, [uuid(), TID, cid, parseFloat(sangria.toFixed(2)),
            pick(['Pagamento fornecedor','Retirada operacional','Troco para funcionário']),
            openAgo]);
        await db.query(`
          INSERT INTO banco_transactions (id, tenant_id, type, amount, description, source, created_at)
          VALUES ($1,$2,'debit',$3,$4,'sangria',$5)
        `, [uuid(), TID, parseFloat(sangria.toFixed(2)),
            `Sangria: ${pick(['Pagamento fornecedor','Retirada operacional'])}`,
            openAgo]);
      }
    }

    // ── 13. Consumo Interno (30 dias) ─────────────────────────
    console.log('  → Criando consumo interno...');
    const insList    = Object.entries(insMap).map(([n, v]) => ({ name: n, ...v }));
    const consumoTypes = ['funcionario','funcionario','funcionario','familia','brinde','degustacao','perda'];
    for (let i = 0; i < 80; i++) {
      const ins     = pick(insList);
      const daysAgo = randI(0, 29);
      const qty     = rand(0.1, 2);
      const totalCost = parseFloat((qty * ins.cost).toFixed(2));
      await db.query(`
        INSERT INTO internal_consumptions (id, tenant_id, insumo_id, item_name, unit, quantity,
          unit_cost, total_cost, consumption_type, notes, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `, [uuid(), TID, ins.id, ins.name, ins.unit, qty, ins.cost, totalCost,
          pick(consumoTypes),
          pick([null, null, 'Refeição funcionário almoço', 'Brinde cliente VIP', 'Degustação novo produto']),
          ago(daysAgo)]);
    }
    // Também produto (marmita/lanche)
    for (let i = 0; i < 40; i++) {
      const prod    = pick(prodList);
      const daysAgo = randI(0, 29);
      const qty     = randI(1, 3);
      const totalCost = parseFloat(((prod.cost || 0) * qty).toFixed(2));
      await db.query(`
        INSERT INTO internal_consumptions (id, tenant_id, product_id, item_name, unit, quantity,
          unit_cost, total_cost, consumption_type, created_at)
        VALUES ($1,$2,$3,$4,'un',$5,$6,$7,$8,$9)
      `, [uuid(), TID, prod.id, prod.name, qty, prod.cost || 0, totalCost,
          pick(['funcionario','funcionario','familia','brinde']),
          ago(daysAgo)]);
    }

    // ── 14. Perdas (waste_logs) ───────────────────────────────
    console.log('  → Criando perdas operacionais...');
    for (let i = 0; i < 25; i++) {
      const ins   = pick(insList);
      const daysAgo = randI(0, 29);
      const qty   = rand(0.1, 3);
      const cost  = parseFloat((qty * ins.cost).toFixed(2));
      await db.query(`
        INSERT INTO waste_logs (id, tenant_id, insumo_id, insumo_name, unit, quantity,
          reason_type, cost, notes, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [uuid(), TID, ins.id, ins.name, ins.unit, qty,
          pick(['burned','expired','operational','operational','operational']),
          cost,
          pick([null,'Produto vencido','Queimou na fritadeira','Descarte operacional']),
          ago(daysAgo)]);
    }

    // ── 15. Notas OCR (30 notas) ─────────────────────────────
    console.log('  → Criando notas fiscais OCR...');
    const OCR_ITENS = [
      { descricao:'FRANGO INTEIRO KG', insumo:'Frango Inteiro',       un:'kg',  qty:10, vlr:85.00 },
      { descricao:'CARNE MOIDA BOV',   insumo:'Carne Moída Bovina',   un:'kg',  qty:5,  vlr:92.50 },
      { descricao:'REQUEIJAO ELEGE 200G',insumo:null,                  un:'un',  qty:12, vlr:98.40 },
      { descricao:'NATA FRIOLACK 280G', insumo:null,                  un:'un',  qty:8,  vlr:64.00 },
      { descricao:'FARINHA PANFACIL TP1',insumo:'Farinha de Trigo',   un:'kg',  qty:25, vlr:70.00 },
      { descricao:'BATATA BRANCA KG',   insumo:'Batata Inglesa',      un:'kg',  qty:30, vlr:114.00 },
      { descricao:'ARROZ TIPO 1 5KG',   insumo:'Arroz Tipo 1',        un:'kg',  qty:50, vlr:160.00 },
      { descricao:'OLEO SOJA 900ML',     insumo:'Óleo de Soja',       un:'l',   qty:12, vlr:69.60 },
      { descricao:'QUEIJO MUSSARELA KG', insumo:'Queijo Muçarela',    un:'kg',  qty:4,  vlr:112.00 },
      { descricao:'OVO BRANCO GRN',      insumo:'Ovo',                un:'un',  qty:180,vlr:117.00 },
      { descricao:'PATE EXCELSIOR',      insumo:null,                  un:'un',  qty:6,  vlr:42.00 },
      { descricao:'TOMATE KG',           insumo:'Tomate',             un:'kg',  qty:10, vlr:55.00 },
    ];

    const SUPPLIERS = ['Frigorífico Três Pinheiros','Distribuidora Alimentos Serra',
                       'CEASA Torres','Atacadão','Makro','Distribuidora Bebidas RS'];

    for (let n = 0; n < 30; n++) {
      const daysAgo   = randI(0, 58);
      const supplier  = pick(SUPPLIERS);
      const nItems    = randI(3, 8);
      const items     = [];
      let   totalNota = 0;

      for (let j = 0; j < nItems; j++) {
        const item  = pick(OCR_ITENS);
        const qty   = item.qty * rand(0.5, 1.5);
        const vlr   = parseFloat((item.vlr * rand(0.8, 1.2)).toFixed(2));
        totalNota  += vlr;

        // Determina o insumo_id
        let matchId   = null;
        let matchName = item.insumo;
        let score     = 0;
        let action    = 'create_new';

        if (item.insumo && insMap[item.insumo]) {
          matchId   = insMap[item.insumo].id;
          score     = rand(0.75, 0.98);
          action    = score > 0.85 ? 'auto' : 'ask';
        } else {
          score  = rand(0.30, 0.65);
          action = 'ask';
        }

        items.push({
          raw:        item.descricao,
          match_type: 'insumo',
          match_id:   matchId,
          match_name: matchName,
          score:      parseFloat(score.toFixed(3)),
          action,
          quantidade: parseFloat(qty.toFixed(3)),
          unidade:    item.un,
          valor_unit: parseFloat((vlr / qty).toFixed(4)),
          valor_total: vlr,
        });
      }

      const status = n < 10 ? 'confirmed' : n < 20 ? 'awaiting_confirmation' : 'rejected';
      await db.query(`
        INSERT INTO pending_receipts (id, tenant_id, source, raw_extraction, matched_items,
          status, expires_at, confirmed_at, created_at)
        VALUES ($1,$2,'upload',$3,$4,$5,NOW() + INTERVAL '24 hours',$6,$7)
      `, [uuid(), TID,
          JSON.stringify({
            fornecedor: supplier,
            cnpj: `${randI(10,99)}.${randI(100,999)}.${randI(100,999)}/0001-${randI(10,99)}`,
            data_emissao: ago(daysAgo).split('T')[0],
            total: parseFloat(totalNota.toFixed(2)),
            itens: items.map(i => ({
              descricao:   i.raw,
              quantidade:  i.quantidade,
              unidade:     i.unidade,
              valor_unit:  i.valor_unit,
              valor_total: i.valor_total,
            })),
            confianca: rand(0.7, 0.98),
          }),
          JSON.stringify(items),
          status,
          status === 'confirmed' ? ago(daysAgo - 1) : null,
          ago(daysAgo)]);
    }

    // ── 16. Banco Transactions (despesas pagas) ───────────────
    console.log('  → Populando banco virtual...');
    const expRes = await db.query(
      `SELECT id, amount FROM expenses WHERE tenant_id=$1 AND status='paid' LIMIT 40`, [TID]);
    for (const exp of expRes.rows) {
      await db.query(`
        INSERT INTO banco_transactions (id, tenant_id, type, amount, description, source, reference_id)
        VALUES ($1,$2,'debit',$3,$4,'expense',$5)
        ON CONFLICT DO NOTHING
      `, [uuid(), TID, exp.amount, 'Pagamento despesa', exp.id]);
    }

    // ── 17. Overhead do Precificador ─────────────────────────
    await db.query(`
      INSERT INTO pricing_overhead (id, tenant_id, embalagem, gas, energia, taxa_app, taxa_pagamento, mao_obra, margem_minima, margem_desejada)
      VALUES ($1,$2, 0.85, 0.45, 0.60, 12.00, 2.50, 2.80, 30, 42)
      ON CONFLICT (tenant_id) DO NOTHING
    `, [uuid(), TID]);

    // ── 18. OCR Aliases (memória de matches) ──────────────────
    const aliasData = [
      { raw:'ARROZ TIPO 1 5KG',     ins:'Arroz Tipo 1',    used:8  },
      { raw:'FRANGO INTEIRO KG',    ins:'Frango Inteiro',  used:12 },
      { raw:'BATATA BRANCA KG',     ins:'Batata Inglesa',  used:5  },
      { raw:'FARINHA PANFACIL TP1', ins:'Farinha de Trigo',used:6  },
      { raw:'OLEO SOJA 900ML',      ins:'Óleo de Soja',    used:9  },
      { raw:'QUEIJO MUSSARELA KG',  ins:'Queijo Muçarela', used:4  },
    ];
    for (const a of aliasData) {
      const ins = insMap[a.ins];
      if (!ins) continue;
      await db.query(`
        INSERT INTO ocr_aliases (id, tenant_id, ocr_raw, match_type, match_id, match_name, used_count)
        VALUES ($1,$2,$3,'insumo',$4,$5,$6)
        ON CONFLICT (tenant_id, ocr_raw) DO NOTHING
      `, [uuid(), TID, a.raw, ins.id, a.ins, a.used]);
    }

    // ── 19. Avaliações de pedidos ─────────────────────────────
    console.log('  → Criando avaliações...');
    const ordersForRating = await db.query(
      `SELECT id FROM orders WHERE tenant_id=$1 AND status='delivered' LIMIT 200`, [TID]);
    const starsDist = [5,5,5,5,4,4,4,3,2,1];
    const comments  = [
      'Comida deliciosa, sempre faço pedido aqui!',
      'Marmita chegou quente e bem temperada.',
      'Entrega rápida, recomendo!',
      'Hamburguer excelente, melhor da cidade!',
      'Poderia ter mais opções vegetarianas.',
      'Boa comida mas demorou um pouco.',
      null, null, null,
      'Chegou frio, não gostei muito.',
    ];
    for (let i = 0; i < Math.min(ordersForRating.rows.length, 180); i++) {
      const ord = ordersForRating.rows[i];
      await db.query(`
        INSERT INTO order_ratings (id, tenant_id, order_id, stars, comment)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (order_id) DO NOTHING
      `, [uuid(), TID, ord.id, pick(starsDist), pick(comments)]);
    }

    // ── 20. Atualiza order_counter ────────────────────────────
    await db.query(
      `UPDATE order_counters SET last_number=$1 WHERE tenant_id=$2`, [1500, TID]);

    await db.query('COMMIT');
    console.log('\n✅ SEEDER CONCLUÍDO COM SUCESSO!');
    console.log(`\n   Tenant:  ${NOME}`);
    console.log(`   Slug:    ${SLUG}`);
    console.log(`   ID:      ${TID}`);
    console.log(`   Login:   ${OWNER_EMAIL}`);
    console.log(`   Senha:   (use o sistema de reset — hash demo)`);
    console.log('\n   Dados criados:');
    console.log(`   • ${PRODUTOS.length} produtos em 6 categorias`);
    console.log(`   • ${INSUMOS.length} insumos com fichas técnicas`);
    console.log(`   • 250 clientes (50 VIP, 150 normais, 50 inativos)`);
    console.log(`   • 1.500 pedidos em 60 dias`);
    console.log(`   • 30 notas OCR (10 confirmadas, 10 aguardando, 10 rejeitadas)`);
    console.log(`   • 12 clientes fiado (R$2.700+ em aberto)`);
    console.log(`   • 30 fechamentos de caixa com divergências`);
    console.log(`   • Despesas fixas + variáveis (2 meses)`);
    console.log(`   • 80 consumos internos + 25 perdas`);

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('\n❌ ERRO NO SEEDER:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    db.release();
    await pool.end();
  }
}

main();
