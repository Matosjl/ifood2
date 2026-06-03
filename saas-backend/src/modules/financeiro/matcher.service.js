'use strict';
/**
 * matcher.service.js — fuzzy match de itens de nota fiscal com insumos/produtos do tenant.
 * Usa pg_trgm (similarity GIN index) já criado no schema.
 *
 * Thresholds:
 *   score >= 0.7 → auto_match (alta confiança)
 *   0.3 <= score < 0.7 → ask (pergunta pro humano confirmar)
 *   score < 0.3 → create_new (sem match razoável)
 */
const db = require('../../config/database');

const AUTO_MATCH_THRESHOLD = 0.7;
const ASK_THRESHOLD = 0.3;

/**
 * Normaliza nome do item da nota antes de comparar.
 * Remove unidades de medida, prefixos comuns e caracteres especiais.
 */
function normalize(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/\b(un|kg|g|ml|l|cx|pct|pc|lt|litro|litros|grama|gramas)\b/g, ' ')
    .replace(/\b\d+\b/g, ' ')              // remove números soltos (2L, 900ml já tirados acima)
    .replace(/[^\p{L}\s]/gu, ' ')          // remove pontuação, mantém letras com acento
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Busca matches em insumos do tenant.
 * @returns {Promise<Array<{id, name, unit, score}>>}
 */
async function searchInsumos(tenantId, normalized) {
  if (!normalized) return [];
  const { rows } = await db.query(
    `SELECT id,
            name,
            unit,
            qty_in_stock,
            cost_per_unit,
            similarity(LOWER(name), $1) AS score
     FROM insumos
     WHERE tenant_id = $2
       AND similarity(LOWER(name), $1) > $3
     ORDER BY score DESC
     LIMIT 3`,
    [normalized, tenantId, ASK_THRESHOLD]
  );
  return rows.map((r) => ({ ...r, score: parseFloat(r.score) }));
}

/**
 * Busca matches em products do tenant (fallback se não houver insumo).
 */
async function searchProducts(tenantId, normalized) {
  if (!normalized) return [];
  const { rows } = await db.query(
    `SELECT id,
            name,
            sale_type AS unit,
            stock_qty,
            cost_price,
            similarity(LOWER(name), $1) AS score
     FROM products
     WHERE tenant_id = $2
       AND active = TRUE
       AND similarity(LOWER(name), $1) > $3
     ORDER BY score DESC
     LIMIT 3`,
    [normalized, tenantId, ASK_THRESHOLD]
  );
  return rows.map((r) => ({ ...r, score: parseFloat(r.score) }));
}

/**
 * Passo 1 — comparação direta (sem normalizar): captura nomes quase idênticos
 * como "Nata Friolack 280g" ↔ "Nata Friolack 280g" que a normalização prejudica
 * ao remover os números.
 */
async function searchDirect(tenantId, rawName) {
  if (!rawName) return { insumo: null, product: null };
  const lower = rawName.toLowerCase().trim();

  const [ins, prod] = await Promise.all([
    db.query(
      `SELECT id, name, unit, qty_in_stock, cost_per_unit,
              similarity(LOWER(name), $1) AS score
       FROM insumos
       WHERE tenant_id = $2
         AND similarity(LOWER(name), $1) >= 0.55
       ORDER BY score DESC LIMIT 1`,
      [lower, tenantId]
    ),
    db.query(
      `SELECT id, name, sale_type AS unit, stock_qty, cost_price,
              similarity(LOWER(name), $1) AS score
       FROM products
       WHERE tenant_id = $2
         AND active = TRUE
         AND similarity(LOWER(name), $1) >= 0.55
       ORDER BY score DESC LIMIT 1`,
      [lower, tenantId]
    ),
  ]);

  return {
    insumo:  ins.rows[0]  ? { ...ins.rows[0],  score: parseFloat(ins.rows[0].score)  } : null,
    product: prod.rows[0] ? { ...prod.rows[0], score: parseFloat(prod.rows[0].score) } : null,
  };
}

/**
 * Encontra o melhor match pra um item da nota.
 *
 * Estratégia de dois passes:
 *   Passo 1 — comparação direta (nome cru): detecta nomes quase idênticos
 *   Passo 2 — comparação normalizada (sem números/unidades): detecta matches semânticos
 *
 * Thresholds finais:
 *   score >= 0.7 → auto  (alta confiança)
 *   score >= 0.3 → ask   (pede revisão)
 *   score <  0.3 → create_new
 */
async function findMatch(tenantId, itemName) {
  const normalized = normalize(itemName);

  // ── Passo 1: comparação direta ────────────────────────────────
  const direct = await searchDirect(tenantId, itemName);
  const dirBest     = direct.insumo && (!direct.product || direct.insumo.score >= direct.product.score)
    ? { match: direct.insumo, type: 'insumo' }
    : direct.product
      ? { match: direct.product, type: 'product' }
      : null;

  // Se o passo direto deu score alto, usa como auto_match sem custo do fuzzy
  if (dirBest && dirBest.match.score >= AUTO_MATCH_THRESHOLD) {
    const [insumos, products] = await Promise.all([
      searchInsumos(tenantId, normalized),
      searchProducts(tenantId, normalized),
    ]);
    return {
      action:      'auto',
      match:       dirBest.match,
      match_type:  dirBest.type,
      score:       dirBest.match.score,
      suggestions: [...insumos.slice(0, 3), ...products.slice(0, 2)].slice(0, 3),
      normalized,
    };
  }

  // ── Passo 2: comparação normalizada (fuzzy) ───────────────────
  const [insumos, products] = await Promise.all([
    searchInsumos(tenantId, normalized),
    searchProducts(tenantId, normalized),
  ]);

  const insBest  = insumos[0]  || null;
  const prodBest = products[0] || null;

  // Combina melhor resultado direto (passo1) com fuzzy (passo2)
  const candidates = [
    dirBest  ? { m: dirBest.match,  t: dirBest.type }   : null,
    insBest  ? { m: insBest,         t: 'insumo' }       : null,
    prodBest ? { m: prodBest,        t: 'product' }       : null,
  ].filter(Boolean);

  let best = null, best_type = null;
  for (const c of candidates) {
    if (!best || c.m.score > best.score) { best = c.m; best_type = c.t; }
    // Insumo tem prioridade em empate
    if (c.m.score === best.score && c.t === 'insumo') { best = c.m; best_type = 'insumo'; }
  }

  const score = best?.score || 0;
  let action;
  if (score >= AUTO_MATCH_THRESHOLD)  action = 'auto';
  else if (score >= ASK_THRESHOLD)    action = 'ask';
  else                                action = 'create_new';

  return {
    action,
    match:       best,
    match_type:  best_type,
    score,
    suggestions: [...insumos.slice(0, 3), ...products.slice(0, 2)].slice(0, 3),
    normalized,
  };
}

/**
 * Aplica findMatch a uma lista de itens da nota.
 * Retorna array de matched_items pronto pra gravar em pending_receipts.matched_items.
 */
async function matchAll(tenantId, items) {
  if (!Array.isArray(items) || !items.length) return [];

  return Promise.all(
    items.map(async (raw) => {
      const m = await findMatch(tenantId, raw.descricao);
      return {
        raw, // { descricao, quantidade, unidade, valor_unit, valor_total }
        action:      m.action,
        match_type:  m.match_type,
        match_id:    m.match?.id || null,
        match_name:  m.match?.name || null,
        match_unit:  m.match?.unit || null,
        score:       m.score,
        suggestions: m.suggestions.map((s) => ({
          id: s.id, name: s.name, score: s.score,
        })),
      };
    })
  );
}

module.exports = {
  findMatch,
  matchAll,
  normalize,
  AUTO_MATCH_THRESHOLD,
  ASK_THRESHOLD,
};
