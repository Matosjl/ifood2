'use strict';
/**
 * producao.service.js
 *
 * Módulo de Produção — lotes multi-insumo.
 *
 * Fluxo:
 *   criarLote()     → abre um lote de produção do dia
 *   adicionarItem() → adiciona insumo ao lote (debita estoque via transação)
 *   fecharLote()    → finaliza o lote, calcula custo real e sobra total
 *   registrarPerda()→ descarta quantidade de um insumo do lote
 *   getResumo()     → retorna lote + itens + perdas + custo real
 *   getResumoDia()  → resumo agregado do dia para o Fechamento Operacional
 *
 * Tabelas:
 *   production_lots       ← header do lote (este módulo)
 *   production_batches    ← itens por insumo (compartilhada com insumos)
 *   waste_logs            ← perdas (compartilhada com insumos)
 */

const db       = require('../../config/database');
const AppError = require('../../utils/AppError');

// ── Helpers ───────────────────────────────────────────────────

const assertLoteAberto = async (client, tenantId, loteId) => {
  const { rows } = await client.query(
    `SELECT id, status FROM production_lots WHERE id = $1 AND tenant_id = $2`,
    [loteId, tenantId]
  );
  if (!rows[0])               throw new AppError('Lote não encontrado.', 404);
  if (rows[0].status !== 'open') throw new AppError('Lote já foi fechado.', 409);
  return rows[0];
};

// ── 1. Criar lote ─────────────────────────────────────────────

const criarLote = async (tenantId, userId, { date, notes } = {}) => {
  const loteDate = date || new Date().toISOString().split('T')[0];

  const { rows } = await db.query(
    `INSERT INTO production_lots (tenant_id, date, notes, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [tenantId, loteDate, notes || null, userId || null]
  );
  return rows[0];
};

// ── 2. Adicionar item ao lote ─────────────────────────────────

const adicionarItem = async (tenantId, userId, loteId, {
  insumoId,
  rawQty,
  cookedQty,
  notes,
  expiresAt,
}) => {
  const raw    = parseFloat(rawQty);
  const cooked = parseFloat(cookedQty);

  if (!raw    || raw    <= 0) throw new AppError('Quantidade bruta deve ser maior que zero.', 400);
  if (!cooked || cooked <= 0) throw new AppError('Quantidade preparada deve ser maior que zero.', 400);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Verifica lote aberto
    await assertLoteAberto(client, tenantId, loteId);

    // Busca insumo + custo
    const { rows: [insumo] } = await client.query(
      `SELECT id, name, unit, qty_in_stock, cost_per_unit
       FROM insumos WHERE id = $1 AND tenant_id = $2`,
      [insumoId, tenantId]
    );
    if (!insumo) throw new AppError('Insumo não encontrado.', 404);

    // Debita estoque bruto
    await client.query(
      `UPDATE insumos
       SET qty_in_stock = GREATEST(0, qty_in_stock - $2), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $3`,
      [insumoId, raw, tenantId]
    );

    // Cria batch vinculado ao lote
    const { rows: [batch] } = await client.query(
      `INSERT INTO production_batches
         (tenant_id, insumo_id, raw_quantity, cooked_quantity, remaining_qty,
          produced_at, notes, expires_at, created_by, lot_id)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [tenantId, insumoId, raw, cooked,
       new Date().toISOString().split('T')[0],
       notes || null, expiresAt || null, userId || null, loteId]
    );

    // Atualiza custo total do lote
    const itemCost = parseFloat((raw * parseFloat(insumo.cost_per_unit)).toFixed(2));
    await client.query(
      `UPDATE production_lots
       SET total_cost = total_cost + $2
       WHERE id = $1`,
      [loteId, itemCost]
    );

    await client.query('COMMIT');
    return { ...batch, insumo_name: insumo.name, unit: insumo.unit, item_cost: itemCost };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── 3. Fechar lote ────────────────────────────────────────────

const fecharLote = async (tenantId, loteId) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    await assertLoteAberto(client, tenantId, loteId);

    // Recalcula custo total real a partir dos batches do lote
    const { rows: [costRow] } = await client.query(
      `SELECT COALESCE(SUM(pb.raw_quantity * i.cost_per_unit), 0) AS total_cost
       FROM production_batches pb
       JOIN insumos i ON i.id = pb.insumo_id
       WHERE pb.lot_id = $1 AND pb.tenant_id = $2`,
      [loteId, tenantId]
    );

    const { rows: [lot] } = await client.query(
      `UPDATE production_lots
       SET status     = 'closed',
           closed_at  = NOW(),
           total_cost = $2
       WHERE id = $1 AND tenant_id = $3
       RETURNING *`,
      [loteId, parseFloat(costRow.total_cost).toFixed(2), tenantId]
    );

    await client.query('COMMIT');

    // Retorna lote com resumo de itens
    return getResumo(tenantId, loteId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── 4. Registrar perda ────────────────────────────────────────

const registrarPerda = async (tenantId, userId, loteId, { insumoId, qty, reason }) => {
  const quantity = parseFloat(qty);
  if (!quantity || quantity <= 0) throw new AppError('Quantidade deve ser maior que zero.', 400);

  const { rows: [insumo] } = await db.query(
    `SELECT id, name, unit, cost_per_unit FROM insumos WHERE id = $1 AND tenant_id = $2`,
    [insumoId, tenantId]
  );
  if (!insumo) throw new AppError('Insumo não encontrado.', 404);

  const cost = parseFloat((quantity * parseFloat(insumo.cost_per_unit)).toFixed(2));

  // Tenta debitar do batch deste lote primeiro
  await db.query(
    `UPDATE production_batches
     SET remaining_qty = GREATEST(0, remaining_qty - $2)
     WHERE lot_id = $1 AND insumo_id = $3 AND tenant_id = $4 AND remaining_qty > 0`,
    [loteId, quantity, insumoId, tenantId]
  );

  // Grava no waste_log com referência ao lote
  const { rows } = await db.query(
    `INSERT INTO waste_logs
       (tenant_id, insumo_id, insumo_name, unit, quantity, reason_type, notes, cost, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [tenantId, insumoId, insumo.name, insumo.unit, quantity,
     reason || 'operational', null, cost, userId || null]
  );
  return { ...rows[0], lot_id: loteId };
};

// ── 5. Resumo do lote ─────────────────────────────────────────

const getResumo = async (tenantId, loteId) => {
  const { rows: [lot] } = await db.query(
    `SELECT * FROM production_lots WHERE id = $1 AND tenant_id = $2`,
    [loteId, tenantId]
  );
  if (!lot) throw new AppError('Lote não encontrado.', 404);

  const { rows: itens } = await db.query(
    `SELECT
       pb.id, pb.insumo_id, i.name AS insumo_name, i.unit,
       pb.raw_quantity, pb.cooked_quantity, pb.remaining_qty,
       ROUND(pb.cooked_quantity - pb.remaining_qty, 3)        AS consumed_qty,
       ROUND(pb.raw_quantity * i.cost_per_unit, 2)            AS item_cost,
       pb.expires_at, pb.notes
     FROM production_batches pb
     JOIN insumos i ON i.id = pb.insumo_id
     WHERE pb.lot_id = $1 AND pb.tenant_id = $2
     ORDER BY i.name ASC`,
    [loteId, tenantId]
  );

  const totalRawCost      = itens.reduce((s, r) => s + parseFloat(r.item_cost  ?? 0), 0);
  const totalCookedQty    = itens.reduce((s, r) => s + parseFloat(r.cooked_quantity ?? 0), 0);
  const totalRemainingQty = itens.reduce((s, r) => s + parseFloat(r.remaining_qty  ?? 0), 0);
  const totalConsumedQty  = itens.reduce((s, r) => s + parseFloat(r.consumed_qty   ?? 0), 0);

  return {
    ...lot,
    itens,
    totais: {
      custo_real:     parseFloat(totalRawCost.toFixed(2)),
      qty_produzida:  parseFloat(totalCookedQty.toFixed(3)),
      qty_consumida:  parseFloat(totalConsumedQty.toFixed(3)),
      qty_sobra:      parseFloat(totalRemainingQty.toFixed(3)),
    },
  };
};

// ── 6. Resumo do dia (para o Fechamento Operacional) ──────────

const getResumoDia = async (tenantId, date) => {
  const targetDate = date || new Date().toISOString().split('T')[0];

  const { rows: lotes } = await db.query(
    `SELECT id, status, notes, total_cost, created_at, closed_at
     FROM production_lots
     WHERE tenant_id = $1 AND date = $2
     ORDER BY created_at ASC`,
    [tenantId, targetDate]
  );

  const { rows: [agg] } = await db.query(
    `SELECT
       COUNT(DISTINCT pb.lot_id)::int                               AS total_lotes,
       COALESCE(SUM(pb.raw_quantity * i.cost_per_unit), 0)::float  AS custo_total,
       COALESCE(SUM(pb.cooked_quantity), 0)::float                 AS qty_produzida,
       COALESCE(SUM(pb.remaining_qty), 0)::float                   AS qty_sobra,
       COALESCE(SUM(pb.cooked_quantity - pb.remaining_qty), 0)::float AS qty_consumida
     FROM production_batches pb
     JOIN insumos i   ON i.id   = pb.insumo_id
     JOIN production_lots pl ON pl.id = pb.lot_id
     WHERE pb.tenant_id = $1
       AND pl.date = $2`,
    [tenantId, targetDate]
  );

  const { rows: perdas } = await db.query(
    `SELECT COALESCE(SUM(cost), 0)::float AS custo_perdas,
            COALESCE(SUM(quantity), 0)::float AS qty_perdas
     FROM waste_logs
     WHERE tenant_id = $1 AND created_at::date = $2::date`,
    [tenantId, targetDate]
  );

  return {
    date:         targetDate,
    lotes,
    custo_total:  parseFloat((agg.custo_total  ?? 0).toFixed(2)),
    qty_produzida: parseFloat((agg.qty_produzida ?? 0).toFixed(3)),
    qty_consumida: parseFloat((agg.qty_consumida ?? 0).toFixed(3)),
    qty_sobra:    parseFloat((agg.qty_sobra     ?? 0).toFixed(3)),
    perdas: {
      custo:    parseFloat((perdas[0]?.custo_perdas ?? 0).toFixed(2)),
      qty:      parseFloat((perdas[0]?.qty_perdas   ?? 0).toFixed(3)),
    },
  };
};

module.exports = {
  criarLote,
  adicionarItem,
  fecharLote,
  registrarPerda,
  getResumo,
  getResumoDia,
};
