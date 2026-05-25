'use strict';
/**
 * receipts.service.js — lógica de confirmação/edição/rejeição de pending_receipts.
 *
 * Quando o usuário confirma uma nota:
 *   1. Cria 1 row em expenses (gasto consolidado)
 *   2. Pra cada item:
 *      - Se match_type='insumo': INSERT stock_movements (type='in') + UPDATE insumos.qty_in_stock
 *      - Se match_type='product': INSERT stock_movements (type='in') + UPDATE products.stock_qty
 *      - Se action='create_new' (sem match): cria insumo novo + stock_movement inicial
 *   3. INSERT em banco_transactions (type='debit', source='expense')
 *   4. UPDATE pending_receipts (status='confirmed', expense_id, confirmed_at)
 *
 * Tudo em TRANSAÇÃO — se qualquer passo falhar, rollback.
 */
const db        = require('../../config/database');
const AppError  = require('../../utils/AppError');
const eventService = require('../../socket/eventService');
const { sanitize } = require('./ingest.service');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('receipts.service');

// ── List ──────────────────────────────────────────────────────────

async function listPending(tenantId, { status = 'awaiting_confirmation', limit = 20 } = {}) {
  const { rows } = await db.query(
    `SELECT id, tenant_id, sender_phone, source, raw_extraction, matched_items,
            status, short_code, expense_id, expires_at, confirmed_at, created_at
     FROM pending_receipts
     WHERE tenant_id = $1
       AND status = $2
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT $3`,
    [tenantId, status, limit]
  );
  return rows;
}

async function getById(tenantId, id) {
  const { rows } = await db.query(
    `SELECT * FROM pending_receipts WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (!rows[0]) throw new AppError('Nota não encontrada', 404);
  return rows[0];
}

/** Resgata o pending mais recente do sender_phone (usado pelo handler WA "SIM"/"NAO") */
async function getMostRecentByPhone(tenantId, senderPhone) {
  const { rows } = await db.query(
    `SELECT * FROM pending_receipts
     WHERE tenant_id = $1
       AND sender_phone = $2
       AND status = 'awaiting_confirmation'
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantId, senderPhone]
  );
  return rows[0] || null;
}

async function getByShortCode(tenantId, shortCode) {
  const { rows } = await db.query(
    `SELECT * FROM pending_receipts
     WHERE tenant_id = $1
       AND short_code = $2
       AND status = 'awaiting_confirmation'
       AND expires_at > NOW()
     LIMIT 1`,
    [tenantId, String(shortCode).toUpperCase()]
  );
  return rows[0] || null;
}

// ── Edit ──────────────────────────────────────────────────────────

/**
 * Permite o usuário ajustar itens/fornecedor/total antes de confirmar.
 * Body: { raw_extraction?, matched_items? }
 */
async function edit(tenantId, id, patch) {
  const pending = await getById(tenantId, id);
  if (pending.status !== 'awaiting_confirmation') {
    throw new AppError(`Nota já está ${pending.status}, não pode mais ser editada`, 400);
  }

  const newRaw     = patch.raw_extraction
    ? { ...pending.raw_extraction, ...patch.raw_extraction }
    : pending.raw_extraction;
  const newMatched = patch.matched_items || pending.matched_items;

  const { rows } = await db.query(
    `UPDATE pending_receipts
     SET raw_extraction = $3::jsonb,
         matched_items  = $4::jsonb,
         updated_at     = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [id, tenantId, JSON.stringify(newRaw), JSON.stringify(newMatched)]
  );
  return rows[0];
}

// ── Reject ────────────────────────────────────────────────────────

async function reject(tenantId, id, reason = null) {
  const { rows } = await db.query(
    `UPDATE pending_receipts
     SET status = 'rejected',
         raw_extraction = jsonb_set(raw_extraction, '{rejected_reason}', to_jsonb($3::text), true),
         updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [id, tenantId, reason || 'rejected_by_user']
  );
  if (!rows[0]) throw new AppError('Nota não encontrada', 404);

  try { eventService.emit?.(tenantId, 'receipt:rejected', sanitize(rows[0])); } catch {}
  return rows[0];
}

// ── Confirm ───────────────────────────────────────────────────────

/**
 * Confirma a nota: cria expense, stock_movements, banco_transactions e atualiza estoques.
 * Tudo em uma transação atômica.
 *
 * @param {string} tenantId
 * @param {string} id  — pending_receipts.id
 * @param {string} userId  — quem confirmou (pra expenses.user_id; se internal/WA, pode ser null)
 * @returns {Promise<{pending, expense, stockMovements}>}
 */
async function confirm(tenantId, id, userId = null) {
  const pending = await getById(tenantId, id);

  if (pending.status === 'confirmed') {
    throw new AppError('Nota já confirmada', 400);
  }
  if (pending.status !== 'awaiting_confirmation') {
    throw new AppError(`Status inválido pra confirmação: ${pending.status}`, 400);
  }

  const raw     = pending.raw_extraction || {};
  const matched = pending.matched_items || [];
  const total   = parseFloat(raw.total || 0);

  if (total <= 0) {
    throw new AppError('Total da nota é zero ou inválido — edite antes de confirmar', 400);
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Cria expense (gasto consolidado da nota)
    const dueDate = raw.data_emissao || new Date().toISOString().slice(0, 10);
    const supplier = raw.fornecedor || null;
    const category = raw.categoria_sugerida || 'food_supplier';
    const name = supplier ? `Nota fiscal — ${supplier}` : 'Nota fiscal';

    const { rows: [expense] } = await client.query(
      `INSERT INTO expenses
         (tenant_id, name, supplier, category, amount, payment_method,
          due_date, paid_at, status, notes)
       VALUES ($1, $2, $3, $4, $5, 'pix', $6, NOW(), 'paid', $7)
       RETURNING *`,
      [
        tenantId, name, supplier, category, total, dueDate,
        `Nota processada via IA. CNPJ: ${raw.cnpj || 'n/a'} | Itens: ${matched.length} | Confiança: ${raw.confianca || 0}`,
      ]
    );

    // 2. Pra cada item: cria/atualiza insumo + stock_movement
    const stockMovements = [];

    for (const item of matched) {
      const r = item.raw;
      if (!r) continue;
      const qty = parseFloat(r.quantidade || 0);
      if (qty <= 0) continue;

      let insumoId = null;
      let productId = null;
      let productName = r.descricao;

      if (item.match_type === 'insumo' && item.match_id) {
        insumoId = item.match_id;
        productName = item.match_name;

        // UPDATE insumos.qty_in_stock + cost_per_unit (média ponderada simples se quiser)
        await client.query(
          `UPDATE insumos
           SET qty_in_stock = qty_in_stock + $1,
               cost_per_unit = CASE WHEN $2 > 0 THEN $2 ELSE cost_per_unit END,
               updated_at = NOW()
           WHERE id = $3 AND tenant_id = $4`,
          [qty, parseFloat(r.valor_unit || 0), insumoId, tenantId]
        );
      } else if (item.match_type === 'product' && item.match_id) {
        productId = item.match_id;
        productName = item.match_name;

        await client.query(
          `UPDATE products
           SET stock_qty = stock_qty + $1,
               updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3`,
          [qty, productId, tenantId]
        );
      } else {
        // Sem match: cria insumo novo
        const { rows: [novoInsumo] } = await client.query(
          `INSERT INTO insumos
             (tenant_id, name, unit, qty_in_stock, cost_per_unit)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name`,
          [
            tenantId,
            r.descricao.slice(0, 200),
            (r.unidade || 'un').slice(0, 20),
            qty,
            parseFloat(r.valor_unit || 0),
          ]
        );
        insumoId = novoInsumo.id;
        productName = novoInsumo.name;
      }

      // Stock movement (apenas se houver product_id — schema atual exige product_id NOT NULL)
      // Pra insumos, registramos o histórico em outro lugar (poderíamos criar tabela insumo_movements,
      // mas pra MVP só atualizamos qty_in_stock)
      if (productId) {
        const { rows: [mov] } = await client.query(
          `INSERT INTO stock_movements
             (tenant_id, product_id, product_name, quantity, type, reason)
           VALUES ($1, $2, $3, $4, 'replenishment', $5)
           RETURNING *`,
          [
            tenantId, productId, productName, qty,
            `Reposição via nota fiscal (pending_receipt ${id})`,
          ]
        );
        stockMovements.push(mov);
      }
    }

    // 3. INSERT banco_transactions (saída de caixa pela nota)
    await client.query(
      `INSERT INTO banco_transactions
         (tenant_id, type, amount, description, source, reference_id)
       VALUES ($1, 'debit', $2, $3, 'expense', $4)`,
      [
        tenantId, total,
        `Pagamento: ${name}`,
        expense.id,
      ]
    );

    // 4. UPDATE pending_receipts
    const { rows: [updatedPending] } = await client.query(
      `UPDATE pending_receipts
       SET status = 'confirmed',
           expense_id = $3,
           confirmed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId, expense.id]
    );

    await client.query('COMMIT');

    // Eventos socket fora da transação
    try {
      eventService.emit?.(tenantId, 'receipt:confirmed', sanitize(updatedPending));
      eventService.emit?.(tenantId, 'expense:created', expense);
    } catch {}

    logger.info('nota confirmada', {
      tenantId, pendingId: id, expenseId: expense.id,
      total, items: matched.length, stockMovements: stockMovements.length,
    });

    return { pending: updatedPending, expense, stockMovements };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('falha ao confirmar nota — rollback', { tenantId, id, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

// ── Expire (job/cron pode chamar pra limpar) ──────────────────────

async function expireOld() {
  const { rowCount } = await db.query(
    `UPDATE pending_receipts
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'awaiting_confirmation'
       AND expires_at <= NOW()`
  );
  return rowCount;
}

module.exports = {
  listPending,
  getById,
  getMostRecentByPhone,
  getByShortCode,
  edit,
  reject,
  confirm,
  expireOld,
};
