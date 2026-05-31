'use strict';
/**
 * financeLog.js — auditoria de operações financeiras
 *
 * Registra: quem, o quê, quando, antes, depois, IP.
 * Fire-and-forget — nunca propaga erro (não bloqueia a operação principal).
 *
 * Uso:
 *   await financeLog(db, {
 *     tenantId, userId, action: 'expense_paid',
 *     tableName: 'expenses', recordId: expense.id,
 *     beforeData: { status: 'pending' },
 *     afterData:  { status: 'paid' },
 *     amount: expense.amount, ip,
 *   });
 */
const db = require('../config/database');

async function financeLog({
  tenantId, userId = null, action, tableName,
  recordId = null, beforeData = null, afterData = null,
  amount = null, ip = null,
} = {}) {
  try {
    await db.query(
      `INSERT INTO finance_logs
         (tenant_id, user_id, action, table_name, record_id, before_data, after_data, amount, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        tenantId, userId || null, action, tableName, recordId || null,
        beforeData ? JSON.stringify(beforeData) : null,
        afterData  ? JSON.stringify(afterData)  : null,
        amount     ? parseFloat(amount)         : null,
        ip         || null,
      ]
    );
  } catch {
    // Auditoria nunca bloqueia a operação principal
  }
}

module.exports = financeLog;
