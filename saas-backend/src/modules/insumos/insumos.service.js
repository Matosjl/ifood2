/**
 * insumos.service.js — Controle de estoque de insumos (ingredientes)
 * Auto-deducts from stock when an order is confirmed.
 * Emits low-stock alert via eventService.
 */
const db           = require('../../config/database');
const eventService = require('../../socket/eventService');

// ── CRUD de insumos ───────────────────────────────────────────

const listInsumos = async (tenantId) => {
  const { rows } = await db.query(
    `SELECT id, name, unit, qty_in_stock, min_qty, cost_per_unit,
            (qty_in_stock <= min_qty AND min_qty > 0) AS low_stock,
            created_at, updated_at
     FROM insumos
     WHERE tenant_id = $1
     ORDER BY name ASC`,
    [tenantId]
  );
  return rows;
};

const getInsumo = async (tenantId, insumoId) => {
  const { rows } = await db.query(
    `SELECT id, name, unit, qty_in_stock, min_qty, cost_per_unit,
            (qty_in_stock <= min_qty AND min_qty > 0) AS low_stock
     FROM insumos WHERE tenant_id = $1 AND id = $2`,
    [tenantId, insumoId]
  );
  return rows[0] ?? null;
};

const createInsumo = async (tenantId, { name, unit = 'un', qty_in_stock = 0, min_qty = 0, cost_per_unit = 0 }) => {
  const { rows } = await db.query(
    `INSERT INTO insumos (tenant_id, name, unit, qty_in_stock, min_qty, cost_per_unit)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, unit, qty_in_stock, min_qty, cost_per_unit`,
    [tenantId, name.trim(), unit, qty_in_stock, min_qty, cost_per_unit]
  );
  return rows[0];
};

const updateInsumo = async (tenantId, insumoId, { name, unit, qty_in_stock, min_qty, cost_per_unit }) => {
  const { rows } = await db.query(
    `UPDATE insumos SET
       name          = COALESCE($3, name),
       unit          = COALESCE($4, unit),
       qty_in_stock  = COALESCE($5, qty_in_stock),
       min_qty       = COALESCE($6, min_qty),
       cost_per_unit = COALESCE($7, cost_per_unit),
       updated_at    = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, name, unit, qty_in_stock, min_qty, cost_per_unit,
               (qty_in_stock <= min_qty AND min_qty > 0) AS low_stock`,
    [tenantId, insumoId, name?.trim(), unit, qty_in_stock, min_qty, cost_per_unit]
  );
  return rows[0] ?? null;
};

const deleteInsumo = async (tenantId, insumoId) => {
  // Remove links primeiro (ON DELETE CASCADE não cobre pq tenant_id está separado)
  await db.query(`DELETE FROM product_insumos WHERE insumo_id = $1 AND tenant_id = $2`, [insumoId, tenantId]);
  const { rowCount } = await db.query(
    `DELETE FROM insumos WHERE tenant_id = $1 AND id = $2`,
    [tenantId, insumoId]
  );
  return rowCount > 0;
};

/**
 * Ajuste manual de estoque (entrada/saída) para um insumo.
 */
const adjustStock = async (tenantId, insumoId, qty, reason) => {
  const { rows } = await db.query(
    `UPDATE insumos
     SET qty_in_stock = GREATEST(0, qty_in_stock + $3),
         updated_at   = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, name, unit, qty_in_stock, min_qty, cost_per_unit,
               (qty_in_stock <= min_qty AND min_qty > 0) AS low_stock`,
    [tenantId, insumoId, qty]
  );
  if (!rows[0]) return null;

  // Emite alerta se estoque ficou baixo
  if (rows[0].low_stock) {
    eventService.emit(tenantId, 'insumo:low_stock', rows[0]);
  }

  return rows[0];
};

// ── Ligação produto <-> insumos (receita) ─────────────────────

const getProductInsumos = async (tenantId, productId) => {
  const { rows } = await db.query(
    `SELECT pi.id, pi.insumo_id, i.name, i.unit, pi.qty_per_unit, i.qty_in_stock, i.min_qty
     FROM product_insumos pi
     JOIN insumos i ON i.id = pi.insumo_id
     WHERE pi.product_id = $1 AND pi.tenant_id = $2
     ORDER BY i.name ASC`,
    [productId, tenantId]
  );
  return rows;
};

/**
 * Substitui toda a receita de um produto.
 * insumos: [{ insumo_id, qty_per_unit }]
 */
const setProductInsumos = async (tenantId, productId, insumos) => {
  await db.query(
    `DELETE FROM product_insumos WHERE product_id = $1 AND tenant_id = $2`,
    [productId, tenantId]
  );

  if (insumos.length > 0) {
    const values = insumos
      .map((_, i) => `($1, $2, $${i * 2 + 3}, $${i * 2 + 4})`)
      .join(', ');
    const params = [productId, tenantId];
    for (const ins of insumos) {
      params.push(ins.insumo_id, ins.qty_per_unit);
    }
    await db.query(
      `INSERT INTO product_insumos (product_id, tenant_id, insumo_id, qty_per_unit) VALUES ${values}`,
      params
    );
  }

  return getProductInsumos(tenantId, productId);
};

// ── Auto-deduction ao confirmar pedido ────────────────────────

/**
 * Deduz insumos para todos os itens de um pedido.
 * Chame quando order.status muda para 'confirmed'.
 * Emite 'insumo:low_stock' para cada insumo que ficar abaixo do mínimo.
 */
const deductForOrder = async (tenantId, orderId) => {
  // Busca itens do pedido
  const { rows: items } = await db.query(
    `SELECT product_id, quantity, weight_kg FROM order_items WHERE order_id = $1`,
    [orderId]
  );

  const productIds = items.map((i) => i.product_id).filter(Boolean);
  if (productIds.length === 0) return;

  // Busca receitas de todos os produtos do pedido
  const { rows: recipes } = await db.query(
    `SELECT pi.product_id, pi.insumo_id, pi.qty_per_unit
     FROM product_insumos pi
     WHERE pi.product_id = ANY($1) AND pi.tenant_id = $2`,
    [productIds, tenantId]
  );

  if (recipes.length === 0) return;

  // Agrupa deduções por insumo
  const deductions = {};
  for (const item of items) {
    if (!item.product_id) continue;
    const qty = item.quantity ?? 1;
    for (const recipe of recipes) {
      if (recipe.product_id !== item.product_id) continue;
      deductions[recipe.insumo_id] ??= 0;
      deductions[recipe.insumo_id] += recipe.qty_per_unit * qty;
    }
  }

  // Aplica deduções
  const lowStockInsumos = [];
  for (const [insumoId, qty] of Object.entries(deductions)) {
    const { rows } = await db.query(
      `UPDATE insumos
       SET qty_in_stock = GREATEST(0, qty_in_stock - $3),
           updated_at   = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING id, name, unit, qty_in_stock, min_qty,
                 (qty_in_stock <= min_qty AND min_qty > 0) AS low_stock`,
      [tenantId, insumoId, qty]
    );
    if (rows[0]?.low_stock) lowStockInsumos.push(rows[0]);
  }

  // Emite alertas
  for (const ins of lowStockInsumos) {
    eventService.emit(tenantId, 'insumo:low_stock', ins);
  }
};

module.exports = {
  listInsumos, getInsumo, createInsumo, updateInsumo, deleteInsumo, adjustStock,
  getProductInsumos, setProductInsumos,
  deductForOrder,
};
