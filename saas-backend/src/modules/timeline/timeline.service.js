'use strict';
const db = require('../../config/database');

/**
 * Builds a unified chronological event feed from existing tables.
 * All events are ordered by occurred_at DESC.
 */
const getTimeline = async (tenantId, { hours = 24, limit = 100 } = {}) => {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  const { rows } = await db.query(
    `
    -- Orders created
    SELECT
      o.created_at          AS occurred_at,
      'order_created'       AS type,
      o.id                  AS ref_id,
      o.order_number::text  AS ref_number,
      o.customer_name       AS actor,
      o.delivery_type       AS meta1,
      o.total::text         AS meta2,
      o.status              AS meta3,
      NULL::text            AS meta4
    FROM orders o
    WHERE o.tenant_id = $1 AND o.created_at >= $2

    UNION ALL

    -- Order status changes
    SELECT
      o.updated_at,
      'order_status',
      o.id,
      o.order_number::text,
      COALESCE(o.customer_name, 'Cliente'),
      o.delivery_type,
      o.total::text,
      o.status,
      NULL::text
    FROM orders o
    WHERE o.tenant_id = $1
      AND o.updated_at >= $2
      AND o.status NOT IN ('pending', 'cancelled')
      AND o.updated_at <> o.created_at

    UNION ALL

    -- Cash register open
    SELECT
      cr.opened_at,
      'cash_open',
      cr.id,
      NULL::text,
      'Sistema'::text,
      'open',
      cr.opening_balance::text,
      cr.status,
      NULL::text
    FROM cash_registers cr
    WHERE cr.tenant_id = $1 AND cr.opened_at >= $2

    UNION ALL

    -- Cash register close
    SELECT
      cr.closed_at,
      'cash_close',
      cr.id,
      NULL::text,
      'Sistema'::text,
      'close',
      cr.closing_balance::text,
      cr.status,
      cr.total_revenue::text
    FROM cash_registers cr
    WHERE cr.tenant_id = $1
      AND cr.closed_at IS NOT NULL
      AND cr.closed_at >= $2

    UNION ALL

    -- Expenses (despesas pagas)
    SELECT
      COALESCE(e.paid_at, e.due_date::timestamptz),
      'expense',
      e.id,
      NULL::text,
      e.name,
      e.category,
      e.amount::text,
      e.status,
      NULL::text
    FROM expenses e
    WHERE e.tenant_id = $1
      AND e.status = 'paid'
      AND COALESCE(e.paid_at, e.due_date::timestamptz) >= $2

    UNION ALL

    -- Low stock alerts (insumos with stock <= min_stock)
    SELECT
      i.updated_at,
      'low_stock',
      i.id,
      NULL::text,
      i.name,
      i.unit,
      i.stock_quantity::text,
      i.min_stock::text,
      NULL::text
    FROM insumos i
    WHERE i.tenant_id = $1
      AND i.updated_at >= $2
      AND i.stock_quantity <= COALESCE(i.min_stock, 0)

    ORDER BY occurred_at DESC
    LIMIT $3
    `,
    [tenantId, since, limit]
  );

  return rows.map((r) => formatEvent(r));
};

function formatEvent(row) {
  const base = {
    id:         row.ref_id,
    occurredAt: row.occurred_at,
    type:       row.type,
    refNumber:  row.ref_number,
    actor:      row.actor,
  };

  switch (row.type) {
    case 'order_created':
      return {
        ...base,
        icon:     '🛒',
        color:    'blue',
        title:    `Pedido #${row.ref_number ?? row.ref_id?.slice(0, 6)} recebido`,
        subtitle: `${row.actor ?? 'Cliente'} · ${deliveryLabel(row.meta1)} · R$ ${fmtR$(row.meta2)}`,
      };
    case 'order_status':
      return {
        ...base,
        icon:     statusIcon(row.meta3),
        color:    statusColor(row.meta3),
        title:    `Pedido #${row.ref_number ?? row.ref_id?.slice(0, 6)} → ${statusLabel(row.meta3)}`,
        subtitle: `${row.actor ?? 'Cliente'} · R$ ${fmtR$(row.meta2)}`,
      };
    case 'cash_open':
      return {
        ...base,
        icon:     '💰',
        color:    'green',
        title:    'Caixa aberto',
        subtitle: `Saldo inicial: R$ ${fmtR$(row.meta2)}`,
      };
    case 'cash_close':
      return {
        ...base,
        icon:     '🔒',
        color:    'gray',
        title:    'Caixa fechado',
        subtitle: `Total em vendas: R$ ${fmtR$(row.meta4)}`,
      };
    case 'expense':
      return {
        ...base,
        icon:     '📉',
        color:    'red',
        title:    `Despesa paga: ${row.actor}`,
        subtitle: `R$ ${fmtR$(row.meta2)} · ${categoryLabel(row.meta1)}`,
      };
    case 'low_stock':
      return {
        ...base,
        icon:     '⚠️',
        color:    'orange',
        title:    `Estoque baixo: ${row.actor}`,
        subtitle: `${parseFloat(row.meta2 ?? 0).toFixed(2)} ${row.meta1} (mín: ${parseFloat(row.meta3 ?? 0).toFixed(2)})`,
      };
    default:
      return { ...base, icon: '📌', color: 'gray', title: row.type, subtitle: '' };
  }
}

const fmtR$ = (v) => parseFloat(v ?? 0).toFixed(2);
const deliveryLabel = (t) =>
  t === 'delivery' ? '🛵 Entrega' : t === 'local' ? '🪑 Mesa' : '🏪 Retirada';
const statusIcon  = (s) => ({ confirmed: '✅', preparing: '👨‍🍳', ready: '🔔', delivering: '🛵', delivered: '🎉', cancelled: '❌' }[s] ?? '📋');
const statusColor = (s) => ({ confirmed: 'blue', preparing: 'orange', ready: 'green', delivering: 'purple', delivered: 'green', cancelled: 'red' }[s] ?? 'gray');
const statusLabel = (s) => ({ confirmed: 'Confirmado', preparing: 'Em Preparo', ready: 'Pronto', delivering: 'Saiu p/ Entrega', delivered: 'Entregue', cancelled: 'Cancelado' }[s] ?? s);
const categoryLabel = (c) => ({ rent: 'Aluguel', utilities: 'Contas', food_supplier: 'Fornecedor', staff: 'Funcionários', marketing: 'Marketing', tax: 'Impostos', maintenance: 'Manutenção', other: 'Outros' }[c] ?? c ?? '');

module.exports = { getTimeline };
