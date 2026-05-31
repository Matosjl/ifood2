'use strict';
/**
 * insumos.service.js — Controle de estoque + produção diária + perdas + inteligência
 *
 * Fluxo operacional:
 *  1. Cozinheiro registra lote de produção (raw → cooked, debita estoque bruto)
 *  2. Venda confirmada → debita do lote preparado do dia (ou estoque bruto como fallback)
 *  3. Perdas registradas manualmente → waste_logs + deduz do lote/estoque
 *  4. Lista de compras calculada por média de consumo dos últimos N dias
 *  5. Simulador: "quero produzir X marmitas" → ingredientes necessários
 *  6. Ranking de lucro: produtos com maior margem real (revenue - CMV)
 */
const db           = require('../../config/database');
const AppError     = require('../../utils/AppError');
const eventService = require('../../socket/eventService');

// ── CRUD de insumos ───────────────────────────────────────────

const listInsumos = async (tenantId) => {
  const { rows } = await db.query(
    `SELECT id, name, unit, qty_in_stock, min_qty, cost_per_unit, waste_factor,
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
    `SELECT id, name, unit, qty_in_stock, min_qty, cost_per_unit, waste_factor,
            (qty_in_stock <= min_qty AND min_qty > 0) AS low_stock
     FROM insumos WHERE tenant_id = $1 AND id = $2`,
    [tenantId, insumoId]
  );
  return rows[0] ?? null;
};

const createInsumo = async (tenantId, { name, unit = 'un', qty_in_stock = 0, min_qty = 0, cost_per_unit = 0, waste_factor = 0 }) => {
  const { rows } = await db.query(
    `INSERT INTO insumos (tenant_id, name, unit, qty_in_stock, min_qty, cost_per_unit, waste_factor)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, unit, qty_in_stock, min_qty, cost_per_unit, waste_factor`,
    [tenantId, name.trim(), unit, qty_in_stock, min_qty, cost_per_unit, waste_factor]
  );
  return rows[0];
};

const updateInsumo = async (tenantId, insumoId, { name, unit, qty_in_stock, min_qty, cost_per_unit, waste_factor }) => {
  const { rows } = await db.query(
    `UPDATE insumos SET
       name          = COALESCE($3, name),
       unit          = COALESCE($4, unit),
       qty_in_stock  = COALESCE($5, qty_in_stock),
       min_qty       = COALESCE($6, min_qty),
       cost_per_unit = COALESCE($7, cost_per_unit),
       waste_factor  = COALESCE($8, waste_factor),
       updated_at    = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, name, unit, qty_in_stock, min_qty, cost_per_unit, waste_factor,
               (qty_in_stock <= min_qty AND min_qty > 0) AS low_stock`,
    [tenantId, insumoId, name?.trim(), unit, qty_in_stock, min_qty, cost_per_unit, waste_factor]
  );
  return rows[0] ?? null;
};

const deleteInsumo = async (tenantId, insumoId) => {
  await db.query(`DELETE FROM product_insumos WHERE insumo_id = $1 AND tenant_id = $2`, [insumoId, tenantId]);
  const { rowCount } = await db.query(
    `DELETE FROM insumos WHERE tenant_id = $1 AND id = $2`,
    [tenantId, insumoId]
  );
  return rowCount > 0;
};

const adjustStock = async (tenantId, insumoId, qty, reason, userId = null) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Captura estoque atual antes do ajuste
    const { rows: [current] } = await client.query(
      `SELECT qty_in_stock FROM insumos WHERE tenant_id = $1 AND id = $2`,
      [tenantId, insumoId]
    );
    if (!current) { await client.query('ROLLBACK'); return null; }

    const qtyBefore = parseFloat(current.qty_in_stock);

    const { rows } = await client.query(
      `UPDATE insumos
       SET qty_in_stock = GREATEST(0, qty_in_stock + $3),
           updated_at   = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING id, name, unit, qty_in_stock, min_qty, cost_per_unit, waste_factor,
                 (qty_in_stock <= min_qty AND min_qty > 0) AS low_stock`,
      [tenantId, insumoId, qty]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return null; }

    const qtyAfter = parseFloat(rows[0].qty_in_stock);
    const actualDelta = parseFloat((qtyAfter - qtyBefore).toFixed(3));

    // Grava movimentação com audit trail completo
    await client.query(
      `INSERT INTO insumo_movements
         (tenant_id, insumo_id, type, qty, qty_before, qty_after, reason, reference_type, created_by)
       VALUES ($1, $2, 'adjustment', $3, $4, $5, $6, 'manual', $7)`,
      [tenantId, insumoId, actualDelta, qtyBefore, qtyAfter, reason || null, userId || null]
    );

    await client.query('COMMIT');

    if (rows[0].low_stock) eventService.emit(tenantId, 'insumo:low_stock', rows[0]);
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Ficha técnica (produto <-> insumos) ───────────────────────

const getProductInsumos = async (tenantId, productId) => {
  const { rows } = await db.query(
    `SELECT pi.id, pi.insumo_id, i.name, i.unit, pi.qty_per_unit,
            i.qty_in_stock, i.min_qty, i.waste_factor
     FROM product_insumos pi
     JOIN insumos i ON i.id = pi.insumo_id
     WHERE pi.product_id = $1 AND pi.tenant_id = $2
     ORDER BY i.name ASC`,
    [productId, tenantId]
  );
  return rows;
};

const setProductInsumos = async (tenantId, productId, insumos) => {
  await db.query(`DELETE FROM product_insumos WHERE product_id = $1 AND tenant_id = $2`, [productId, tenantId]);
  if (insumos.length > 0) {
    const values = insumos.map((_, i) => `($1, $2, $${i * 2 + 3}, $${i * 2 + 4})`).join(', ');
    const params = [productId, tenantId];
    for (const ins of insumos) params.push(ins.insumo_id, ins.qty_per_unit);
    await db.query(
      `INSERT INTO product_insumos (product_id, tenant_id, insumo_id, qty_per_unit) VALUES ${values}`,
      params
    );
  }
  return getProductInsumos(tenantId, productId);
};

// ── Produção diária ───────────────────────────────────────────

/**
 * Registra lote de produção.
 * Debita raw_quantity do estoque bruto e cria lote preparado.
 */
const createBatch = async (tenantId, userId, { insumo_id, raw_quantity, cooked_quantity, produced_at, notes, expires_at }) => {
  const rawQty    = parseFloat(raw_quantity);
  const cookedQty = parseFloat(cooked_quantity);
  if (!rawQty    || rawQty    <= 0) throw new AppError('Quantidade bruta deve ser maior que zero.', 400);
  if (!cookedQty || cookedQty <= 0) throw new AppError('Quantidade preparada deve ser maior que zero.', 400);

  const { rows: [insumo] } = await db.query(
    `SELECT id, name, qty_in_stock FROM insumos WHERE id = $1 AND tenant_id = $2`,
    [insumo_id, tenantId]
  );
  if (!insumo) throw new AppError('Insumo não encontrado.', 404);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE insumos SET qty_in_stock = GREATEST(0, qty_in_stock - $2), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $3`,
      [insumo_id, rawQty, tenantId]
    );
    const date = produced_at || new Date().toISOString().split('T')[0];
    const { rows } = await client.query(
      `INSERT INTO production_batches
         (tenant_id, insumo_id, raw_quantity, cooked_quantity, remaining_qty, produced_at, notes, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8)
       RETURNING *`,
      [tenantId, insumo_id, rawQty, cookedQty, date, notes || null, expires_at || null, userId || null]
    );
    await client.query('COMMIT');
    return { ...rows[0], insumo_name: insumo.name };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Lista lotes de produção de uma data.
 * Inclui flag de validade vencida/próxima.
 */
const listBatches = async (tenantId, date) => {
  const targetDate = date || new Date().toISOString().split('T')[0];
  const { rows } = await db.query(
    `SELECT pb.*, i.name AS insumo_name, i.unit, i.cost_per_unit,
            ROUND((pb.cooked_quantity - pb.remaining_qty), 3)   AS consumed_qty,
            ROUND(pb.raw_quantity * i.cost_per_unit, 2)         AS raw_cost,
            CASE
              WHEN pb.expires_at IS NOT NULL AND pb.expires_at < CURRENT_DATE THEN 'expired'
              WHEN pb.expires_at = CURRENT_DATE THEN 'expires_today'
              WHEN pb.expires_at = CURRENT_DATE + 1 THEN 'expires_tomorrow'
              ELSE 'ok'
            END AS expiry_status
     FROM production_batches pb
     JOIN insumos i ON i.id = pb.insumo_id
     WHERE pb.tenant_id = $1 AND pb.produced_at = $2
     ORDER BY pb.created_at DESC`,
    [tenantId, targetDate]
  );
  return rows;
};

/**
 * Alertas de validade: lotes que vencem hoje ou amanhã, com remaining_qty > 0.
 */
const getExpiryAlerts = async (tenantId) => {
  const { rows } = await db.query(
    `SELECT pb.id, pb.remaining_qty, pb.expires_at, i.name AS insumo_name, i.unit,
            CASE WHEN pb.expires_at = CURRENT_DATE THEN 'expires_today' ELSE 'expires_tomorrow' END AS status
     FROM production_batches pb
     JOIN insumos i ON i.id = pb.insumo_id
     WHERE pb.tenant_id = $1
       AND pb.remaining_qty > 0
       AND pb.expires_at BETWEEN CURRENT_DATE AND CURRENT_DATE + 1
     ORDER BY pb.expires_at ASC, i.name ASC`,
    [tenantId]
  );
  return rows;
};

/**
 * Relatório consolidado do dia.
 */
const getDayReport = async (tenantId, date) => {
  const targetDate = date || new Date().toISOString().split('T')[0];
  const { rows: batches } = await db.query(
    `SELECT
       i.name AS insumo_name, i.unit, i.cost_per_unit,
       SUM(pb.raw_quantity)                                               AS total_raw,
       SUM(pb.cooked_quantity)                                            AS total_cooked,
       SUM(pb.remaining_qty)                                              AS total_remaining,
       SUM(pb.cooked_quantity - pb.remaining_qty)                        AS total_consumed,
       CASE WHEN SUM(pb.cooked_quantity) > 0
            THEN ROUND(SUM(pb.cooked_quantity - pb.remaining_qty) / SUM(pb.cooked_quantity) * 100, 1)
            ELSE 0 END                                                    AS consumption_pct,
       ROUND(SUM(pb.raw_quantity) * i.cost_per_unit, 2)                  AS raw_cost
     FROM production_batches pb
     JOIN insumos i ON i.id = pb.insumo_id
     WHERE pb.tenant_id = $1 AND pb.produced_at = $2
     GROUP BY i.name, i.unit, i.cost_per_unit
     ORDER BY i.name ASC`,
    [tenantId, targetDate]
  );
  const totalRawCost = batches.reduce((s, r) => s + parseFloat(r.raw_cost ?? 0), 0);
  return { date: targetDate, batches, totalRawCost: parseFloat(totalRawCost.toFixed(2)) };
};

// ── Perdas operacionais ───────────────────────────────────────

/**
 * Registra perda manual.
 * Debita do lote de produção do dia (se existir) ou do estoque bruto.
 * Grava em waste_logs para rastreabilidade e impacto no CMV.
 */
const logWaste = async (tenantId, userId, { insumo_id, quantity, reason_type = 'operational', notes }) => {
  const qty = parseFloat(quantity);
  if (!qty || qty <= 0) throw new AppError('Quantidade deve ser maior que zero.', 400);

  const { rows: [insumo] } = await db.query(
    `SELECT id, name, unit, qty_in_stock, cost_per_unit FROM insumos WHERE id = $1 AND tenant_id = $2`,
    [insumo_id, tenantId]
  );
  if (!insumo) throw new AppError('Insumo não encontrado.', 404);

  const cost = parseFloat((qty * parseFloat(insumo.cost_per_unit)).toFixed(2));
  const today = new Date().toISOString().split('T')[0];

  // Tenta debitar do lote do dia primeiro
  const { rowCount } = await db.query(
    `UPDATE production_batches
     SET remaining_qty = GREATEST(0, remaining_qty - $3)
     WHERE id = (
       SELECT id FROM production_batches
       WHERE tenant_id = $1 AND insumo_id = $2 AND produced_at = $4 AND remaining_qty > 0
       ORDER BY created_at DESC LIMIT 1
     )`,
    [tenantId, insumo_id, qty, today]
  );

  // Fallback: debita do estoque bruto
  if (rowCount === 0) {
    await db.query(
      `UPDATE insumos SET qty_in_stock = GREATEST(0, qty_in_stock - $2), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $3`,
      [insumo_id, qty, tenantId]
    );
  }

  const { rows } = await db.query(
    `INSERT INTO waste_logs (tenant_id, insumo_id, insumo_name, unit, quantity, reason_type, notes, cost, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [tenantId, insumo_id, insumo.name, insumo.unit, qty, reason_type, notes || null, cost, userId || null]
  );

  return rows[0];
};

/**
 * Lista perdas (filtro por data e tipo).
 */
const listWasteLogs = async (tenantId, { startDate, endDate, reason_type, limit = 100 } = {}) => {
  const params = [tenantId];
  const conds  = ['tenant_id = $1'];
  if (startDate) { params.push(startDate); conds.push(`created_at::date >= $${params.length}`); }
  if (endDate)   { params.push(endDate);   conds.push(`created_at::date <= $${params.length}`); }
  if (reason_type) { params.push(reason_type); conds.push(`reason_type = $${params.length}`); }
  params.push(limit);
  const { rows } = await db.query(
    `SELECT * FROM waste_logs WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  return rows;
};

// ── Lista de compras automática ────────────────────────────────

/**
 * Calcula lista de compras com base em:
 *  - Consumo médio diário dos últimos `lookbackDays` dias (raw_quantity dos lotes)
 *  - Estoque atual do insumo bruto
 *  - Cobertura desejada em dias (`coverDays`)
 *
 * Retorna apenas insumos que precisam de reposição.
 */
const getShoppingList = async (tenantId, { lookbackDays = 7, coverDays = 3 } = {}) => {
  const { rows } = await db.query(
    `WITH daily_usage AS (
       SELECT pb.insumo_id,
              SUM(pb.raw_quantity) / $2::numeric                AS avg_daily_raw
       FROM production_batches pb
       WHERE pb.tenant_id = $1
         AND pb.produced_at >= CURRENT_DATE - ($2::int - 1)
       GROUP BY pb.insumo_id
     )
     SELECT
       i.id, i.name, i.unit, i.qty_in_stock, i.min_qty, i.cost_per_unit,
       COALESCE(du.avg_daily_raw, 0)                             AS avg_daily_usage,
       ROUND(COALESCE(du.avg_daily_raw, 0) * $3::numeric, 3)   AS needed_for_cover,
       GREATEST(0,
         ROUND(COALESCE(du.avg_daily_raw, 0) * $3::numeric - i.qty_in_stock, 3)
       )                                                          AS qty_to_buy,
       CASE
         WHEN COALESCE(du.avg_daily_raw, 0) > 0 AND i.qty_in_stock > 0
         THEN ROUND(i.qty_in_stock / du.avg_daily_raw, 1)
         WHEN i.qty_in_stock <= 0 THEN 0
         ELSE NULL
       END                                                        AS days_remaining,
       ROUND(GREATEST(0,
         COALESCE(du.avg_daily_raw, 0) * $3::numeric - i.qty_in_stock
       ) * i.cost_per_unit, 2)                                   AS estimated_cost
     FROM insumos i
     LEFT JOIN daily_usage du ON du.insumo_id = i.id
     WHERE i.tenant_id = $1
       AND (
         -- Precisa de compra: estoque abaixo do necessário ou abaixo do mínimo
         GREATEST(0, COALESCE(du.avg_daily_raw, 0) * $3::numeric - i.qty_in_stock) > 0
         OR (i.min_qty > 0 AND i.qty_in_stock <= i.min_qty)
       )
     ORDER BY days_remaining ASC NULLS FIRST, i.name ASC`,
    [tenantId, lookbackDays, coverDays]
  );

  const totalCost = rows.reduce((s, r) => s + parseFloat(r.estimated_cost ?? 0), 0);
  return {
    items: rows,
    totalEstimatedCost: parseFloat(totalCost.toFixed(2)),
    coverDays,
    lookbackDays,
    generatedAt: new Date().toISOString(),
  };
};

// ── Simulador de produção em massa ────────────────────────────

/**
 * Calcula ingredientes necessários para produzir `quantity` unidades de um produto.
 * Retorna cada insumo com: necessário, disponível (lote do dia + estoque), suficiente.
 */
const simulateProduction = async (tenantId, productId, quantity) => {
  const qty = parseFloat(quantity);
  if (!qty || qty <= 0) throw new AppError('Quantidade deve ser maior que zero.', 400);

  const { rows: recipe } = await db.query(
    `SELECT pi.insumo_id, pi.qty_per_unit, i.name, i.unit, i.qty_in_stock,
            i.cost_per_unit, i.waste_factor
     FROM product_insumos pi
     JOIN insumos i ON i.id = pi.insumo_id
     WHERE pi.product_id = $1 AND pi.tenant_id = $2`,
    [productId, tenantId]
  );

  if (recipe.length === 0) return { quantity, recipe: [], totalCost: 0, feasible: true };

  const today = new Date().toISOString().split('T')[0];

  // Disponibilidade dos lotes do dia
  const { rows: batches } = await db.query(
    `SELECT insumo_id, SUM(remaining_qty) AS available_in_batches
     FROM production_batches
     WHERE tenant_id = $1 AND produced_at = $2 AND remaining_qty > 0
     GROUP BY insumo_id`,
    [tenantId, today]
  );
  const batchMap = Object.fromEntries(batches.map((b) => [b.insumo_id, parseFloat(b.available_in_batches)]));

  let totalCost = 0;
  const items = recipe.map((r) => {
    const wasteMult      = 1 + (parseFloat(r.waste_factor) || 0) / 100;
    const needed         = parseFloat((r.qty_per_unit * qty * wasteMult).toFixed(3));
    const inBatch        = batchMap[r.insumo_id] || 0;
    const inRawStock     = parseFloat(r.qty_in_stock);
    const totalAvailable = parseFloat((inBatch + inRawStock).toFixed(3));
    const sufficient     = totalAvailable >= needed;
    const missing        = sufficient ? 0 : parseFloat((needed - totalAvailable).toFixed(3));
    const itemCost       = parseFloat((needed * parseFloat(r.cost_per_unit)).toFixed(2));
    totalCost           += itemCost;
    return {
      insumo_id: r.insumo_id, name: r.name, unit: r.unit,
      qty_per_unit: r.qty_per_unit, waste_factor: r.waste_factor,
      needed, inBatch, inRawStock, totalAvailable, sufficient, missing,
      cost: itemCost,
    };
  });

  return {
    quantity,
    recipe: items,
    totalCost: parseFloat(totalCost.toFixed(2)),
    feasible: items.every((i) => i.sufficient),
    missingItems: items.filter((i) => !i.sufficient),
  };
};

// ── Ranking de lucro por produto ──────────────────────────────

/**
 * Produtos ordenados por lucro bruto real (receita - CMV gravado nos itens).
 * Usa order_items.total (receita) e order_items.total_cost (CMV snapshot).
 * Filtro por período opcional (padrão: últimos 30 dias).
 */
const getProductProfitRanking = async (tenantId, { days = 30 } = {}) => {
  const { rows } = await db.query(
    `SELECT
       oi.product_name,
       COUNT(DISTINCT oi.order_id)              AS order_count,
       SUM(oi.quantity)                         AS units_sold,
       ROUND(SUM(oi.total)::numeric, 2)         AS revenue,
       ROUND(SUM(oi.total_cost)::numeric, 2)    AS cmv,
       ROUND((SUM(oi.total) - SUM(oi.total_cost))::numeric, 2) AS gross_profit,
       ROUND(
         CASE WHEN SUM(oi.total) > 0
              THEN (1 - SUM(oi.total_cost) / SUM(oi.total)) * 100
              ELSE 0 END
       , 1)                                     AS margin_pct,
       ROUND(AVG(oi.unit_price)::numeric, 2)    AS avg_price
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.tenant_id = $1
       AND o.status NOT IN ('cancelled')
       AND o.created_at >= NOW() - ($2 || ' days')::interval
       AND oi.total_cost > 0
     GROUP BY oi.product_name
     ORDER BY gross_profit DESC
     LIMIT 20`,
    [tenantId, days]
  );
  return rows;
};

// ── Auto-deduction ao confirmar pedido ────────────────────────

/**
 * Deduz insumos quando pedido é confirmado.
 * Prioridade: lote preparado do dia → fallback estoque bruto.
 * Aplica waste_factor na dedução.
 *
 * Idempotência: usa orders.insumos_deducted + FOR UPDATE para garantir
 * que execuções concorrentes ou repetidas não baixem o estoque 2x.
 * Toda a dedução é atômica: se qualquer insumo falhar, tudo reverte.
 */
const deductForOrder = async (tenantId, orderId) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Bloqueia a linha do pedido e checa flag de idempotência em uma operação atômica.
    // FOR UPDATE impede execução concorrente para o mesmo pedido.
    const { rows: [order] } = await client.query(
      `SELECT id, insumos_deducted FROM orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [orderId, tenantId]
    );

    if (!order) { await client.query('ROLLBACK'); return; }

    // Já foi deduzido — retorna sem fazer nada (idempotência)
    if (order.insumos_deducted) {
      await client.query('ROLLBACK');
      return;
    }

    // Busca itens do pedido
    const { rows: items } = await client.query(
      `SELECT product_id, quantity, weight_kg FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    const productIds = items.map((i) => i.product_id).filter(Boolean);
    if (productIds.length === 0) {
      await client.query('ROLLBACK');
      return;
    }

    // ── Expansão de combos ─────────────────────────────────────────────
    // Verifica quais produtos do pedido são combos.
    // Combos não têm ficha técnica própria — a dedução de insumos ocorre
    // sobre os filhos, proporcionalmente à quantidade do combo vendido.
    const { rows: productTypes } = await client.query(
      `SELECT id, is_combo FROM products WHERE id = ANY($1) AND tenant_id = $2`,
      [productIds, tenantId]
    );
    const isComboMap = Object.fromEntries(productTypes.map((p) => [p.id, p.is_combo]));

    // effectiveItems: lista de { product_id, effectiveQty } após expansão dos combos
    const effectiveItemsRaw = [];
    for (const item of items) {
      if (!item.product_id) continue;
      const qty = parseFloat(item.quantity ?? 1);

      if (!isComboMap[item.product_id]) {
        // Produto normal — usa diretamente
        effectiveItemsRaw.push({ product_id: item.product_id, effectiveQty: qty });
      } else {
        // Combo — expandir filhos
        const { rows: children } = await client.query(
          `SELECT child_product_id, qty FROM product_combos
           WHERE combo_product_id = $1 AND tenant_id = $2`,
          [item.product_id, tenantId]
        );
        if (children.length === 0) {
          throw new AppError(
            `Combo sem itens cadastrados (product_id: ${item.product_id}). Cadastre os itens do combo antes de confirmar pedidos.`,
            400
          );
        }
        for (const child of children) {
          const childEffectiveQty = parseFloat((parseFloat(child.qty) * qty).toFixed(3));
          effectiveItemsRaw.push({ product_id: child.child_product_id, effectiveQty: childEffectiveQty });
        }
        // O combo em si não tem ficha técnica — não adiciona seu product_id
      }
    }

    // Mescla quantidades do mesmo product_id (ex: mesmo filho em dois combos)
    const mergedMap = {};
    for (const ei of effectiveItemsRaw) {
      mergedMap[ei.product_id] = (mergedMap[ei.product_id] || 0) + ei.effectiveQty;
    }
    const effectiveItems = Object.entries(mergedMap).map(([product_id, effectiveQty]) => ({
      product_id,
      effectiveQty,
    }));

    const effectiveProductIds = effectiveItems.map((ei) => ei.product_id);
    if (effectiveProductIds.length === 0) {
      await client.query('ROLLBACK');
      return;
    }
    // ── Fim expansão de combos ─────────────────────────────────────────

    // Busca fichas técnicas dos produtos efetivos (filhos de combos + produtos normais)
    const { rows: recipes } = await client.query(
      `SELECT pi.product_id, pi.insumo_id, pi.qty_per_unit, i.waste_factor
       FROM product_insumos pi
       JOIN insumos i ON i.id = pi.insumo_id
       WHERE pi.product_id = ANY($1) AND pi.tenant_id = $2`,
      [effectiveProductIds, tenantId]
    );
    if (recipes.length === 0) {
      // Nenhum produto (ou filho de combo) tem ficha técnica — nada a deduzir
      await client.query('ROLLBACK');
      return;
    }

    // Calcula deduções por insumo usando os itens efetivos (pós-expansão de combos)
    const deductions = {};
    for (const ei of effectiveItems) {
      for (const recipe of recipes) {
        if (recipe.product_id !== ei.product_id) continue;
        const wasteMult = 1 + (parseFloat(recipe.waste_factor) || 0) / 100;
        deductions[recipe.insumo_id] = (deductions[recipe.insumo_id] || 0)
          + recipe.qty_per_unit * ei.effectiveQty * wasteMult;
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const lowStockInsumos = [];


    // Executa todas as deduções dentro da mesma transação
    for (const [insumoId, qty] of Object.entries(deductions)) {
      const { rowCount } = await client.query(
        `UPDATE production_batches
         SET remaining_qty = GREATEST(0, remaining_qty - $3)
         WHERE id = (
           SELECT id FROM production_batches
           WHERE tenant_id = $1 AND insumo_id = $2
             AND produced_at = $4 AND remaining_qty > 0
           ORDER BY created_at DESC LIMIT 1
         )`,
        [tenantId, insumoId, qty, today]
      );

      if (rowCount === 0) {
        const { rows } = await client.query(
          `UPDATE insumos
           SET qty_in_stock = GREATEST(0, qty_in_stock - $3), updated_at = NOW()
           WHERE tenant_id = $1 AND id = $2
           RETURNING id, name, unit, qty_in_stock, min_qty,
                     (qty_in_stock <= min_qty AND min_qty > 0) AS low_stock`,
          [tenantId, insumoId, qty]
        );
        if (rows[0]?.low_stock) lowStockInsumos.push(rows[0]);
      }
    }

    // Marca pedido como deduzido — impede re-execução futura
    await client.query(
      `UPDATE orders SET insumos_deducted = true, insumos_deducted_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [orderId, tenantId]
    );

    await client.query('COMMIT');

    // Emite alertas de estoque baixo fora da transação (fire-and-forget)
    for (const ins of lowStockInsumos) {
      eventService.emit(tenantId, 'insumo:low_stock', ins);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  listInsumos, getInsumo, createInsumo, updateInsumo, deleteInsumo, adjustStock,
  getProductInsumos, setProductInsumos,
  createBatch, listBatches, getExpiryAlerts, getDayReport,
  logWaste, listWasteLogs,
  getShoppingList,
  simulateProduction,
  getProductProfitRanking,
  deductForOrder,
};
