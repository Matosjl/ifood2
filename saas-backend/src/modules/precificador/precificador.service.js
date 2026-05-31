'use strict';
const db = require('../../config/database');

// ── Overhead padrão do tenant ──────────────────────────────────

const DEFAULT_OVERHEAD = {
  embalagem:       0,
  gas:             0,
  energia:         0,
  taxa_app:        0,
  taxa_pagamento:  0,
  mao_obra:        0,
  margem_minima:   30,
  margem_desejada: 40,
};

async function getOverhead(tenantId) {
  const { rows } = await db.query(
    `SELECT embalagem, gas, energia, taxa_app, taxa_pagamento, mao_obra,
            margem_minima, margem_desejada
     FROM pricing_overhead WHERE tenant_id = $1`,
    [tenantId]
  );
  return rows[0] || DEFAULT_OVERHEAD;
}

async function saveOverhead(tenantId, payload) {
  const {
    embalagem = 0, gas = 0, energia = 0,
    taxa_app = 0, taxa_pagamento = 0, mao_obra = 0,
    margem_minima = 30, margem_desejada = 40,
  } = payload;

  const { rows } = await db.query(`
    INSERT INTO pricing_overhead
      (tenant_id, embalagem, gas, energia, taxa_app, taxa_pagamento, mao_obra, margem_minima, margem_desejada, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    ON CONFLICT (tenant_id) DO UPDATE SET
      embalagem       = EXCLUDED.embalagem,
      gas             = EXCLUDED.gas,
      energia         = EXCLUDED.energia,
      taxa_app        = EXCLUDED.taxa_app,
      taxa_pagamento  = EXCLUDED.taxa_pagamento,
      mao_obra        = EXCLUDED.mao_obra,
      margem_minima   = EXCLUDED.margem_minima,
      margem_desejada = EXCLUDED.margem_desejada,
      updated_at      = NOW()
    RETURNING *
  `, [tenantId, embalagem, gas, energia, taxa_app, taxa_pagamento, mao_obra, margem_minima, margem_desejada]);
  return rows[0];
}

// ── Cálculo de preço ──────────────────────────────────────────

/**
 * Arredonda para o próximo preço psicológico terminado em .90 que seja >= value.
 * Garante que preco_sugerido nunca fique abaixo do preco_ideal.
 *
 * Ex: 20.10 → 20.90 | 20.90 → 20.90 | 20.91 → 21.90 | 20.95 → 21.90
 */
function psychologicalPrice(value) {
  const floor = Math.floor(value);
  if (value <= floor + 0.90) return floor + 0.90;
  return floor + 1 + 0.90; // passou de .90 — sobe para o próximo inteiro + .90
}

/**
 * Calcula o custo de ingredientes do produto via ficha técnica.
 * Retorna um array de itens para o breakdown.
 */
async function calcIngredientCost(tenantId, productId) {
  const { rows } = await db.query(`
    SELECT
      i.name,
      i.unit,
      i.cost_per_unit,
      i.waste_factor,
      pi.qty_per_unit,
      -- Quantidade real considerando fator de perda
      pi.qty_per_unit * (1 + COALESCE(i.waste_factor, 0) / 100.0) AS qty_with_waste,
      -- Custo real por unidade do produto
      pi.qty_per_unit * (1 + COALESCE(i.waste_factor, 0) / 100.0) * i.cost_per_unit AS line_cost
    FROM product_insumos pi
    JOIN insumos i ON i.id = pi.insumo_id
    WHERE pi.product_id = $1 AND pi.tenant_id = $2
    ORDER BY line_cost DESC
  `, [productId, tenantId]);

  const total = rows.reduce((acc, r) => acc + parseFloat(r.line_cost || 0), 0);
  return { total, items: rows };
}

/**
 * Calcula preço de venda sugerido.
 *
 * @param {string}  tenantId
 * @param {object}  params
 * @param {string}  [params.product_id]         - se informado, busca ficha técnica automaticamente
 * @param {number}  [params.custo_insumos]       - custo manual de ingredientes (sobrescreve ficha técnica)
 * @param {object}  [params.overhead]            - overhead por item (sobrescreve defaults do tenant)
 * @param {number}  [params.margem_desejada]     - % de margem desejada (sobrescreve tenant default)
 * @param {number}  [params.margem_minima]       - % de margem mínima
 * @param {number}  [params.preco_venda_atual]   - se informado, calcula margem real do preço atual
 * @param {string}  [params.product_name]        - para salvar histórico
 * @param {boolean} [params.salvar]              - se true, salva na tabela pricing_calculations
 * @param {string}  [params.user_id]             - para auditoria
 */
async function calculate(tenantId, params) {
  const {
    product_id,
    custo_insumos: custoPassing,
    overhead: overrideOverhead,
    margem_desejada: overrideMargem,
    margem_minima: overrideMinima,
    preco_venda_atual,
    product_name: productNameParam,
    salvar = false,
    user_id,
  } = params;

  // ── Overhead do tenant (mesclado com overrides da requisição) ──
  const tenantOverhead = await getOverhead(tenantId);
  const oh = { ...tenantOverhead, ...(overrideOverhead || {}) };

  const margemMin  = parseFloat(overrideMinima  ?? oh.margem_minima  ?? 30);
  const margemIdeal = parseFloat(overrideMargem ?? oh.margem_desejada ?? 40);

  // ── Custo de ingredientes ──────────────────────────────────────
  let custoInsumos  = parseFloat(custoPassing || 0);
  let ingredientes  = [];
  let productName   = productNameParam || 'Produto sem nome';

  if (product_id) {
    // Busca nome do produto
    const { rows: prod } = await db.query(
      `SELECT name, sale_price, cost_price FROM products WHERE id = $1 AND tenant_id = $2`,
      [product_id, tenantId]
    );
    if (prod.length) {
      productName = prod[0].name;
      // Se não foi passado custo manual, usa ficha técnica
      if (!custoPassing) {
        const { total, items } = await calcIngredientCost(tenantId, product_id);
        custoInsumos = total;
        ingredientes = items;
        // Fallback: se ficha técnica vazia, usa cost_price do produto
        if (custoInsumos === 0 && parseFloat(prod[0].cost_price || 0) > 0) {
          custoInsumos = parseFloat(prod[0].cost_price);
        }
      }
    }
  }

  // ── Overhead fixo por unidade ──────────────────────────────────
  const overheadFixo =
    parseFloat(oh.embalagem || 0) +
    parseFloat(oh.gas       || 0) +
    parseFloat(oh.energia   || 0) +
    parseFloat(oh.mao_obra  || 0);

  // Custo total antes de percentuais
  const custoBase = custoInsumos + overheadFixo;

  // taxa_app e taxa_pagamento são % sobre o PREÇO DE VENDA, não sobre o custo.
  // Então isolamos no cálculo do markup.
  // Fórmula: preco = custo_base / (1 - margem/100 - taxa_app/100 - taxa_pagamento/100)
  const taxaTotal = parseFloat(oh.taxa_app || 0) + parseFloat(oh.taxa_pagamento || 0);

  // ── Preços sugeridos ───────────────────────────────────────────
  const divisorMin   = 1 - (margemMin   / 100) - (taxaTotal / 100);
  const divisorIdeal = 1 - (margemIdeal / 100) - (taxaTotal / 100);

  // Proteção contra divisor <= 0
  const precoMinimo  = divisorMin   > 0 ? custoBase / divisorMin   : custoBase * 3;
  const precoIdeal   = divisorIdeal > 0 ? custoBase / divisorIdeal : custoBase * 2.5;
  const precoSugerido = psychologicalPrice(precoIdeal);

  // Overhead total (fixo + percentual sobre preço sugerido)
  const overheadPercentual = (precoSugerido * taxaTotal) / 100;
  const custoOverheadTotal  = overheadFixo + overheadPercentual;
  const custoTotal          = custoInsumos + custoOverheadTotal;

  // ── Margem sobre preço atual (se fornecido) ────────────────────
  let margemPrecoAtual = null;
  if (preco_venda_atual && parseFloat(preco_venda_atual) > 0) {
    const pv = parseFloat(preco_venda_atual);
    margemPrecoAtual = ((pv - custoTotal) / pv) * 100;
  }

  const resultado = {
    produto:         productName,
    // Custos
    custo_insumos:   round2(custoInsumos),
    custo_overhead:  round2(custoOverheadTotal),
    custo_total:     round2(custoTotal),
    // Preços sugeridos
    preco_minimo:    round2(precoMinimo),
    preco_ideal:     round2(precoIdeal),
    preco_sugerido:  round2(precoSugerido),
    // Margens
    margem_minima:   margemMin,
    margem_desejada: margemIdeal,
    margem_real:     margemPrecoAtual !== null ? round2(margemPrecoAtual) : null,
    // Overhead usado no cálculo
    overhead_usado: {
      embalagem:      round2(parseFloat(oh.embalagem      || 0)),
      gas:            round2(parseFloat(oh.gas            || 0)),
      energia:        round2(parseFloat(oh.energia        || 0)),
      taxa_app:       round2(parseFloat(oh.taxa_app       || 0)),
      taxa_pagamento: round2(parseFloat(oh.taxa_pagamento || 0)),
      mao_obra:       round2(parseFloat(oh.mao_obra       || 0)),
    },
    // Breakdown de ingredientes (se calculado via ficha técnica)
    ingredientes: ingredientes.map((i) => ({
      nome:        i.name,
      unidade:     i.unit,
      qty:         round4(parseFloat(i.qty_per_unit)),
      qty_c_perda: round4(parseFloat(i.qty_with_waste)),
      custo_unit:  round4(parseFloat(i.cost_per_unit)),
      custo_linha: round2(parseFloat(i.line_cost)),
      perda_pct:   parseFloat(i.waste_factor || 0),
    })),
  };

  // ── Salvar histórico ───────────────────────────────────────────
  if (salvar) {
    await db.query(`
      INSERT INTO pricing_calculations
        (tenant_id, product_id, product_name, custo_insumos, custo_overhead, custo_total,
         preco_minimo, preco_ideal, preco_sugerido, margem_real, overhead_snapshot, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [
      tenantId, product_id || null, productName,
      custoInsumos, custoOverheadTotal, custoTotal,
      precoMinimo, precoIdeal, precoSugerido,
      margemPrecoAtual, JSON.stringify(oh), user_id || null,
    ]);
  }

  return resultado;
}

/** Lista histórico de cálculos */
async function listHistory(tenantId, limit = 50) {
  const { rows } = await db.query(`
    SELECT id, product_id, product_name, custo_total, preco_sugerido, margem_real, created_at
    FROM pricing_calculations
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `, [tenantId, limit]);
  return rows;
}


/**
 * Aplica o custo do último cálculo do produto em products.cost_price.
 * Atualiza cost_price_source = 'precificador'.
 * NAO altera sale_price — decisão de preço de venda é do dono.
 * NAO altera order_items antigos.
 *
 * @returns {{ product_id, old_cost_price, new_cost_price, calculation_id, product_name }}
 */
async function applyToProduct(tenantId, productId, userId = null) {
  // Busca o último cálculo salvo para este produto e tenant
  const { rows: [calc] } = await db.query(`
    SELECT id, custo_total, product_name, created_at
    FROM pricing_calculations
    WHERE tenant_id = $1 AND product_id = $2
    ORDER BY created_at DESC
    LIMIT 1
  `, [tenantId, productId]);

  if (!calc) {
    const AppError = require('../../utils/AppError');
    throw new AppError(
      'Nenhum cálculo de precificação encontrado para este produto. Execute /calculate com salvar=true primeiro.',
      404
    );
  }

  // Captura custo atual antes de alterar (para rastreabilidade e rollback)
  const { rows: [product] } = await db.query(
    `SELECT id, name, cost_price, cost_price_source FROM products
     WHERE id = $1 AND tenant_id = $2`,
    [productId, tenantId]
  );

  if (!product) {
    const AppError = require('../../utils/AppError');
    throw new AppError('Produto não encontrado.', 404);
  }

  const oldCostPrice = parseFloat(product.cost_price);
  const newCostPrice = round2(parseFloat(calc.custo_total));

  // Aplica novo custo e marca a origem como 'precificador'
  await db.query(
    `UPDATE products
     SET cost_price        = $3,
         cost_price_source = 'precificador',
         updated_at        = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [productId, tenantId, newCostPrice]
  );

  return {
    product_id:     productId,
    product_name:   product.name,
    old_cost_price: oldCostPrice,
    new_cost_price: newCostPrice,
    calculation_id: calc.id,
    calculated_at:  calc.created_at,
    applied_by:     userId || null,
    message:        'Custo oficial atualizado. Revise o preço de venda se necessário.',
  };
}

// ── Helpers ───────────────────────────────────────────────────

function round2(n) { return Math.round(parseFloat(n || 0) * 100) / 100; }
function round4(n) { return Math.round(parseFloat(n || 0) * 10000) / 10000; }

module.exports = { getOverhead, saveOverhead, calculate, listHistory, applyToProduct };
