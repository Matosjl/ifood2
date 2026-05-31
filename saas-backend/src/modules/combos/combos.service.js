'use strict';
/**
 * combos.service.js — Gerenciamento de produtos do tipo combo.
 *
 * Um combo é um produto (is_combo = true) que agrupa produtos filhos.
 * Na venda: o pedido registra o combo como item único.
 * No estoque: o sistema debita os filhos, não o combo.
 * No CMV: o custo é a soma dos custos dos filhos × quantidade.
 */
const db       = require('../../config/database');
const AppError = require('../../utils/AppError');

// ── Helpers internos ──────────────────────────────────────────

/**
 * Valida que o produto existe, pertence ao tenant e tem is_combo = true.
 */
const assertIsCombo = async (tenantId, productId) => {
  const { rows } = await db.query(
    `SELECT id, name, sale_price, cost_price, active, is_combo
     FROM products WHERE id = $1 AND tenant_id = $2`,
    [productId, tenantId]
  );
  if (!rows[0]) throw new AppError('Produto não encontrado.', 404);
  if (!rows[0].is_combo) throw new AppError(
    `Produto "${rows[0].name}" não é do tipo combo. Marque "is_combo = true" antes de gerenciar itens.`,
    400
  );
  return rows[0];
};

/**
 * Valida que o produto filho existe, pertence ao tenant e NÃO é combo.
 */
const assertValidChild = async (tenantId, childProductId, comboProductId) => {
  if (childProductId === comboProductId) {
    throw new AppError('Um combo não pode conter a si mesmo como item.', 400);
  }
  const { rows } = await db.query(
    `SELECT id, name, cost_price, is_combo FROM products
     WHERE id = $1 AND tenant_id = $2`,
    [childProductId, tenantId]
  );
  if (!rows[0]) throw new AppError('Produto filho não encontrado.', 404);
  if (rows[0].is_combo) throw new AppError(
    `Produto "${rows[0].name}" também é um combo. Combos dentro de combos não são permitidos.`,
    400
  );
  return rows[0];
};

// ── Leitura ───────────────────────────────────────────────────

/**
 * Retorna o combo com seus itens, custo estimado e margem estimada.
 */
const getCombo = async (tenantId, productId) => {
  const combo = await assertIsCombo(tenantId, productId);

  const { rows: items } = await db.query(
    `SELECT
       pc.id,
       pc.child_product_id,
       p.name          AS child_name,
       p.sale_price    AS child_sale_price,
       p.cost_price    AS child_cost_price,
       p.active        AS child_active,
       pc.qty,
       ROUND((p.cost_price * pc.qty)::numeric, 4) AS line_cost
     FROM product_combos pc
     JOIN products p ON p.id = pc.child_product_id
     WHERE pc.combo_product_id = $1 AND pc.tenant_id = $2
     ORDER BY pc.created_at ASC`,
    [productId, tenantId]
  );

  const estimatedCost   = items.reduce((s, i) => s + parseFloat(i.line_cost || 0), 0);
  const salePrice       = parseFloat(combo.sale_price || 0);
  const estimatedMargin = parseFloat((salePrice - estimatedCost).toFixed(2));
  const marginPct       = salePrice > 0
    ? parseFloat(((estimatedMargin / salePrice) * 100).toFixed(1))
    : null;

  return {
    combo: {
      id:          combo.id,
      name:        combo.name,
      sale_price:  salePrice,
      cost_price:  parseFloat(combo.cost_price || 0), // custo manual (pode divergir do estimado)
      active:      combo.active,
    },
    items,
    estimated_cost:   parseFloat(estimatedCost.toFixed(2)),
    estimated_margin: estimatedMargin,
    margin_pct:       marginPct,
    item_count:       items.length,
  };
};

// ── Escrita ───────────────────────────────────────────────────

/**
 * Adiciona um produto filho ao combo.
 * Retorna o estado completo do combo após a inserção.
 */
const addItem = async (tenantId, productId, { child_product_id, qty }) => {
  const qtyNum = parseFloat(qty);
  if (!qtyNum || qtyNum <= 0) throw new AppError('qty deve ser maior que zero.', 400);

  // Valida combo pai e produto filho
  await assertIsCombo(tenantId, productId);
  await assertValidChild(tenantId, child_product_id, productId);

  // Insere — a constraint UNIQUE(combo_product_id, child_product_id) garante sem duplicata
  try {
    await db.query(
      `INSERT INTO product_combos (tenant_id, combo_product_id, child_product_id, qty)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, productId, child_product_id, qtyNum]
    );
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      throw new AppError('Este produto já está cadastrado como item deste combo.', 409);
    }
    throw err;
  }

  return getCombo(tenantId, productId);
};

/**
 * Remove um item do combo pelo id do registro em product_combos.
 * Retorna o estado completo do combo após a remoção.
 */
const removeItem = async (tenantId, productId, itemId) => {
  await assertIsCombo(tenantId, productId);

  const { rowCount } = await db.query(
    `DELETE FROM product_combos
     WHERE id = $1 AND combo_product_id = $2 AND tenant_id = $3`,
    [itemId, productId, tenantId]
  );
  if (rowCount === 0) throw new AppError('Item não encontrado neste combo.', 404);

  return getCombo(tenantId, productId);
};

/**
 * Retorna os itens de um combo para uso interno (ex: orders.service, deductForOrder).
 * Não valida is_combo — apenas busca os filhos se existirem.
 */
const getComboItems = async (tenantId, productId) => {
  const { rows } = await db.query(
    `SELECT
       pc.child_product_id,
       pc.qty,
       p.name,
       p.cost_price,
       p.sale_type,
       p.stock_qty,
       p.is_combo
     FROM product_combos pc
     JOIN products p ON p.id = pc.child_product_id
     WHERE pc.combo_product_id = $1 AND pc.tenant_id = $2
     ORDER BY pc.created_at ASC`,
    [productId, tenantId]
  );
  return rows;
};

module.exports = { getCombo, addItem, removeItem, getComboItems };
