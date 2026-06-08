'use strict';
/**
 * orderStatus.js — Fonte única de verdade para o ciclo de vida do pedido.
 *
 * Regra de negócio ratificada (07/06/2026):
 *   - Pedido FATURADO (entra em receita) = status 'ready' OU 'delivered'.
 *     'ready' conta porque o item já foi produzido/está pronto p/ retirada/entrega.
 *   - 'pending' | 'confirmed' | 'preparing'  → em aberto, NÃO é receita ainda.
 *   - 'cancelled'                            → NUNCA entra em receita (métrica própria).
 *
 * Use BILLABLE_SQL em interpolação de query (valores literais fixos, sem input
 * de usuário → seguro contra SQL injection).
 */

const BILLABLE_STATUSES = ['ready', 'delivered'];

// Fragmento pronto para `... o.status IN ${BILLABLE_SQL} ...`
const BILLABLE_SQL = `('ready','delivered')`;

module.exports = { BILLABLE_STATUSES, BILLABLE_SQL };
