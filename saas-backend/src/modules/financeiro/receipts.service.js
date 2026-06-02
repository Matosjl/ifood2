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
  // Suporta tanto número float quanto string pt-BR "1.234,56"
  const rawTotal = String(raw.total ?? 0);
  const total = parseFloat(
    rawTotal.includes(',') ? rawTotal.replace(/\./g, '').replace(',', '.') : rawTotal
  );

  if (total <= 0) {
    throw new AppError('Total da nota é zero ou inválido — edite antes de confirmar', 400);
  }

  // P2 — Bloqueia confirmação em lote se há itens com action='ask' (correspondência incerta).
  // O usuário deve resolver cada item no painel antes de confirmar.
  const askItems = matched.filter((m) => m.action === 'ask');
  if (askItems.length > 0) {
    const nomes = askItems
      .slice(0, 3)
      .map((m) => m.raw?.descricao || m.match_name || 'item desconhecido')
      .join(', ');
    const sufixo = askItems.length > 3 ? ` e mais ${askItems.length - 3}` : '';
    throw new AppError(
      `Há ${askItems.length} ${askItems.length === 1 ? 'item' : 'itens'} com correspondência incerta que precisam de revisão: ${nomes}${sufixo}. ` +
      `Abra o painel, edite os itens marcados como "Revisar" e tente confirmar novamente.`,
      422
    );
  }

  // P3 — Valida soma dos itens vs total da nota.
  const somaItens = matched.reduce((acc, m) => {
    const vt = parseFloat(m.raw?.valor_total ?? 0);
    return acc + (isNaN(vt) ? 0 : vt);
  }, 0);
  const TOLERANCIA = 0.50; // R$ 0,50 de tolerância para arredondamentos
  if (matched.length > 0 && Math.abs(somaItens - total) > TOLERANCIA) {
    const diff = (somaItens - total).toFixed(2).replace('.', ',');
    const sinal = somaItens > total ? '+' : '';
    throw new AppError(
      `Divergência entre soma dos itens (R$ ${somaItens.toFixed(2).replace('.', ',')}) e total da nota (R$ ${total.toFixed(2).replace('.', ',')}). ` +
      `Diferença: R$ ${sinal}${diff}. Edite os valores antes de confirmar.`,
      422
    );
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Cria expense (gasto consolidado da nota)
    // Usa timezone BRT pra evitar que meia-noite UTC vire dia errado no Brasil
    const dueDate = raw.data_emissao ||
      new Date().toLocaleDateString('fr-CA', { timeZone: 'America/Sao_Paulo' });
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
        // Sem match (create_new) — o valor já está no total da nota (expense + banco_transaction).
        // Não cria insumo automaticamente: o dono decide depois se quer cadastrar via WA ou UI.
        // Apenas registra no log para auditoria.
        logger.info('item sem match — só financeiro registrado', {
          tenantId, pendingId: id,
          descricao: (r.descricao || '').slice(0, 60),
          valor: r.valor_total,
        });
        continue; // pula stock_movement (não há produto vinculado)
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

// ── Notas para Revisar ────────────────────────────────────────────

/**
 * Retorna todos os pending_receipts relevantes para a tela "Notas para Revisar":
 *   - status='awaiting_confirmation' (não expiradas)
 *   - status='extraction_failed' (últimos 7 dias)
 *   - status='confirmed' com itens action='create_new' (últimos 30 dias)
 */
async function listForRevisar(tenantId) {
  const { rows } = await db.query(
    `SELECT id, tenant_id, sender_phone, source, raw_extraction, matched_items,
            status, short_code, expense_id, expires_at, confirmed_at, created_at
     FROM pending_receipts
     WHERE tenant_id = $1
       AND (
         (status = 'awaiting_confirmation'
          AND (expires_at IS NULL OR expires_at > NOW()))
         OR
         (status = 'extraction_failed'
          AND created_at > NOW() - INTERVAL '7 days')
         OR
         (status = 'confirmed'
          AND confirmed_at > NOW() - INTERVAL '30 days'
          AND matched_items::text LIKE '%"create_new"%')
       )
     ORDER BY
       CASE status
         WHEN 'awaiting_confirmation' THEN 1
         WHEN 'extraction_failed'     THEN 2
         WHEN 'confirmed'             THEN 3
         ELSE 4
       END,
       created_at DESC
     LIMIT 50`,
    [tenantId]
  );
  // Para 'confirmed': filtra no JS para garantir que há itens create_new reais
  return rows.filter((r) => {
    if (r.status !== 'confirmed') return true;
    return (r.matched_items || []).some((m) => m.action === 'create_new');
  });
}

/**
 * Contagem de pendências para badge no Sidebar (awaiting + extraction_failed ativos).
 */
async function countPending(tenantId) {
  const { rows } = await db.query(
    `SELECT COUNT(*) AS total
     FROM pending_receipts
     WHERE tenant_id = $1
       AND (
         (status = 'awaiting_confirmation'
          AND (expires_at IS NULL OR expires_at > NOW()))
         OR
         (status = 'extraction_failed'
          AND created_at > NOW() - INTERVAL '7 days')
       )`,
    [tenantId]
  );
  return parseInt(rows[0]?.total ?? 0, 10);
}

// ── Resolve item create_new ───────────────────────────────────────

/**
 * Resolve um item create_new de uma nota já confirmada.
 * Altera apenas estoque — o financeiro já foi lançado na confirmação original.
 *
 * @param {string} tenantId
 * @param {string} receiptId  — pending_receipts.id
 * @param {number} itemIdx    — índice do item em matched_items
 * @param {{ mode, insumo_id?, name?, unit?, qty, unit_cost }} body
 * @param {string|null} userId
 *
 * mode='create': cria insumo novo, lança estoque, insumo_movement
 * mode='match':  usa insumo existente, lança estoque, insumo_movement
 */
async function resolveItem(tenantId, receiptId, itemIdx, body, userId = null) {
  const { mode, insumo_id, name, unit = 'un', qty, unit_cost } = body;

  // ── Validações de entrada ─────────────────────────────────────
  if (!['create', 'match'].includes(mode)) {
    throw new AppError('mode deve ser "create" ou "match"', 400);
  }
  if (mode === 'match' && !insumo_id) {
    throw new AppError('insumo_id é obrigatório quando mode=match', 400);
  }
  if (mode === 'create' && !name?.trim()) {
    throw new AppError('name é obrigatório quando mode=create', 400);
  }
  const parsedQty  = parseFloat(qty);
  const parsedCost = parseFloat(unit_cost ?? 0);
  if (!parsedQty || parsedQty <= 0)  throw new AppError('qty deve ser maior que zero', 400);
  if (parsedCost < 0)                throw new AppError('unit_cost não pode ser negativo', 400);

  // ── Carrega a nota ────────────────────────────────────────────
  const pending = await getById(tenantId, receiptId);

  // Permite resolver itens de notas confirmed (e também awaiting, caso o dono queira adiantar)
  if (!['confirmed', 'awaiting_confirmation'].includes(pending.status)) {
    throw new AppError(
      `Não é possível resolver itens de uma nota com status "${pending.status}"`,
      400
    );
  }

  const matched = Array.isArray(pending.matched_items) ? pending.matched_items : [];
  const idx     = parseInt(itemIdx, 10);

  if (isNaN(idx) || idx < 0 || idx >= matched.length) {
    throw new AppError(`Índice de item inválido: ${itemIdx}`, 400);
  }

  const item = matched[idx];

  // Impede resolver item que já foi resolvido (action !== 'create_new')
  if (item.action !== 'create_new') {
    throw new AppError(
      `Item já está resolvido (action="${item.action}") — não é possível resolver novamente`,
      409
    );
  }

  // ── Transação ─────────────────────────────────────────────────
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    let resolvedInsumoId;
    let resolvedInsumoName;

    if (mode === 'create') {
      // Cria o insumo
      const { rows: [newInsumo] } = await client.query(
        `INSERT INTO insumos (tenant_id, name, unit, qty_in_stock, cost_per_unit)
         VALUES ($1, $2, $3, 0, $4)
         RETURNING id, name, unit, qty_in_stock`,
        [tenantId, name.trim(), unit, parsedCost]
      );
      resolvedInsumoId   = newInsumo.id;
      resolvedInsumoName = newInsumo.name;

      logger.info('insumo criado via resolveItem', {
        tenantId, insumoId: resolvedInsumoId, name: resolvedInsumoName,
      });
    } else {
      // Valida que o insumo pertence ao tenant
      const { rows: [existing] } = await client.query(
        `SELECT id, name, unit FROM insumos WHERE id = $1 AND tenant_id = $2`,
        [insumo_id, tenantId]
      );
      if (!existing) throw new AppError('Insumo não encontrado', 404);
      resolvedInsumoId   = existing.id;
      resolvedInsumoName = existing.name;
    }

    // Captura estoque atual antes de incrementar
    const { rows: [before] } = await client.query(
      `SELECT qty_in_stock FROM insumos WHERE id = $1 AND tenant_id = $2`,
      [resolvedInsumoId, tenantId]
    );
    const qtyBefore = parseFloat(before?.qty_in_stock ?? 0);
    const qtyAfter  = parseFloat((qtyBefore + parsedQty).toFixed(3));

    // Incrementa estoque
    await client.query(
      `UPDATE insumos
       SET qty_in_stock  = $1,
           cost_per_unit = CASE WHEN $2 > 0 THEN $2 ELSE cost_per_unit END,
           updated_at    = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [qtyAfter, parsedCost, resolvedInsumoId, tenantId]
    );

    // Cria insumo_movement tipo 'purchase' (compra via nota fiscal)
    await client.query(
      `INSERT INTO insumo_movements
         (tenant_id, insumo_id, type, qty, qty_before, qty_after,
          reason, reference_type, created_by)
       VALUES ($1, $2, 'purchase', $3, $4, $5, $6, 'receipt', $7)`,
      [
        tenantId, resolvedInsumoId, parsedQty, qtyBefore, qtyAfter,
        `Lançamento retroativo via nota fiscal (receipt ${receiptId}, item ${idx})`,
        userId,
      ]
    );

    // Atualiza matched_items[idx]: marca como resolvido
    const updatedMatched = matched.map((m, i) => {
      if (i !== idx) return m;
      return {
        ...m,
        action:     'auto',        // resolvido — não aparece mais como pendente
        match_type: 'insumo',
        match_id:   resolvedInsumoId,
        match_name: resolvedInsumoName,
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
        resolved_mode: mode,
      };
    });

    const { rows: [updatedPending] } = await client.query(
      `UPDATE pending_receipts
       SET matched_items = $2::jsonb, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $3
       RETURNING id, status, short_code, matched_items, raw_extraction, confirmed_at`,
      [receiptId, JSON.stringify(updatedMatched), tenantId]
    );

    await client.query('COMMIT');

    logger.info('item create_new resolvido', {
      tenantId, receiptId, itemIdx: idx, mode,
      insumoId: resolvedInsumoId, qty: parsedQty,
    });

    return {
      item:     updatedMatched[idx],
      insumo:   { id: resolvedInsumoId, name: resolvedInsumoName, qty_after: qtyAfter },
      pending:  updatedPending,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('falha em resolveItem — rollback', { tenantId, receiptId, itemIdx, error: err.message });
    throw err;
  } finally {
    client.release();
  }
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
  listForRevisar,
  countPending,
  resolveItem,
};
