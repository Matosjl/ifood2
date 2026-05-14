import { useState } from 'react';
import KanbanColumn    from './KanbanColumn';
import EditOrderModal  from './EditOrderModal';
import { COLUMNS }     from '../hooks/useOrders';

// ── Channel columns ───────────────────────────────────────────

const CHANNEL_COLS = [
  { id: 'ifood',    label: 'iFood',    emoji: '🛵', color: 'red',    header: 'bg-red-500/10 border-red-500/30',     count: 'bg-red-500/20 text-red-300' },
  { id: 'whatsapp', label: 'WhatsApp', emoji: '💬', color: 'green',  header: 'bg-green-500/10 border-green-500/30', count: 'bg-green-500/20 text-green-300' },
  { id: 'mesa',     label: 'Mesa',     emoji: '🪑', color: 'blue',   header: 'bg-blue-500/10 border-blue-500/30',   count: 'bg-blue-500/20 text-blue-300' },
  { id: 'outros',   label: 'Outros',   emoji: '📱', color: 'yellow', header: 'bg-yellow-500/10 border-yellow-500/30', count: 'bg-yellow-500/20 text-yellow-300' },
];

const CHANNEL_BUCKET = (ch) => {
  const c = (ch ?? '').toLowerCase();
  if (c === 'ifood')                     return 'ifood';
  if (c === 'whatsapp')                  return 'whatsapp';
  if (c === 'mesa' || c === 'local')     return 'mesa';
  return 'outros';
};

// ── Status helpers ────────────────────────────────────────────

const STATUS_META = {
  pending:   { label: 'Pendente',   cls: 'bg-yellow-500/20 text-yellow-300' },
  confirmed: { label: 'Confirmado', cls: 'bg-yellow-500/20 text-yellow-300' },
  preparing: { label: 'Em Preparo', cls: 'bg-blue-500/20 text-blue-300' },
  ready:     { label: 'Pronto',     cls: 'bg-green-500/20 text-green-300' },
  delivered: { label: 'Entregue',   cls: 'bg-green-700/20 text-green-400' },
  cancelled: { label: 'Cancelado',  cls: 'bg-red-500/20 text-red-300' },
};

const NEXT_STATUS = {
  pending:   'preparing',
  confirmed: 'preparing',
  preparing: 'ready',
  ready:     'delivered',
};

const NEXT_LABEL = {
  pending:   'Iniciar Preparo',
  confirmed: 'Iniciar Preparo',
  preparing: 'Marcar Pronto',
  ready:     'Entregar',
};

const fmt = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2)}`;

// ── Elapsed time badge (static — refreshes on socket events) ─

function Elapsed({ createdAt }) {
  const mins = Math.floor((Date.now() - new Date(createdAt)) / 60_000);
  const cls  = mins >= 30 ? 'text-red-400 font-bold' : mins >= 15 ? 'text-yellow-400' : 'text-gray-500';
  return <span className={`text-xs tabular-nums ${cls}`}>{mins}m</span>;
}

// ── Compact card (dense — for Compacto mode) ──────────────────

function CompactCard({ order, onStatusChange }) {
  const next  = NEXT_STATUS[order.status];
  const meta  = STATUS_META[order.status] ?? { label: order.status, cls: 'bg-gray-700 text-gray-300' };
  const isEnd = ['delivered', 'cancelled'].includes(order.status);

  return (
    <div className="flex items-center gap-2 px-2.5 py-2 bg-gray-800/60 rounded-xl text-xs border border-white/[0.04] hover:border-white/[0.08] transition-colors">
      <span className="font-black text-white tabular-nums shrink-0 w-9">#{order.orderNumber}</span>
      <span className="flex-1 truncate text-gray-400">{order.customerName || <span className="text-gray-600 italic">—</span>}</span>
      <Elapsed createdAt={order.createdAt} />
      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${meta.cls}`}>
        {meta.label}
      </span>
      {!isEnd && next && (
        <button
          onClick={() => onStatusChange(order.id, next)}
          className="px-2 py-0.5 rounded-lg bg-blue-600/80 hover:bg-blue-500 text-white text-[10px] font-semibold transition-colors shrink-0"
        >
          ▶
        </button>
      )}
    </div>
  );
}

// ── Channel card (for Por Canal mode) ────────────────────────

function ChannelCard({ order, onStatusChange }) {
  const next  = NEXT_STATUS[order.status];
  const meta  = STATUS_META[order.status] ?? { label: order.status, cls: 'bg-gray-700 text-gray-300' };
  const isEnd = ['delivered', 'cancelled'].includes(order.status);

  return (
    <div className="p-2.5 bg-gray-800/50 rounded-xl border border-white/[0.05] hover:border-white/[0.09] transition-colors space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-black text-white tabular-nums">#{order.orderNumber}</span>
        <div className="flex items-center gap-1.5">
          <Elapsed createdAt={order.createdAt} />
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${meta.cls}`}>
            {meta.label}
          </span>
        </div>
      </div>
      {order.customerName && (
        <p className="text-xs text-gray-400 truncate">{order.customerName}</p>
      )}
      <p className="text-xs text-gray-500">
        {order.items.length} {order.items.length === 1 ? 'item' : 'itens'}
      </p>
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-xs text-green-400 font-semibold">{fmt(order.total)}</span>
        {!isEnd && next && (
          <button
            onClick={() => onStatusChange(order.id, next)}
            className="px-2.5 py-1 rounded-lg bg-blue-600/80 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
          >
            {NEXT_LABEL[order.status]}
          </button>
        )}
      </div>
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────

function ListView({ orders, onStatusChange }) {
  const sorted = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (sorted.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-600">
        <span className="text-5xl">🍽️</span>
        <p className="text-sm italic">Nenhum pedido no momento</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-white/[0.06]">
            <th className="pb-2.5 pr-4 font-semibold">#</th>
            <th className="pb-2.5 pr-4 font-semibold">Canal</th>
            <th className="pb-2.5 pr-4 font-semibold">Cliente</th>
            <th className="pb-2.5 pr-4 font-semibold">Itens</th>
            <th className="pb-2.5 pr-4 font-semibold text-right">Total</th>
            <th className="pb-2.5 pr-4 font-semibold">Status</th>
            <th className="pb-2.5 pr-4 font-semibold">Tempo</th>
            <th className="pb-2.5 font-semibold">Ação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {sorted.map((o) => {
            const meta  = STATUS_META[o.status] ?? { label: o.status, cls: 'bg-gray-700 text-gray-300' };
            const next  = NEXT_STATUS[o.status];
            const isEnd = ['delivered', 'cancelled'].includes(o.status);
            return (
              <tr key={o.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="py-2.5 pr-4 font-black text-white tabular-nums">#{o.orderNumber}</td>
                <td className="py-2.5 pr-4 text-gray-400 capitalize">{o.channel ?? '—'}</td>
                <td className="py-2.5 pr-4 text-gray-300">{o.customerName || <span className="text-gray-600 italic">—</span>}</td>
                <td className="py-2.5 pr-4 text-gray-400">{o.items.length} item{o.items.length !== 1 ? 's' : ''}</td>
                <td className="py-2.5 pr-4 text-right text-green-400 font-semibold tabular-nums">{fmt(o.total)}</td>
                <td className="py-2.5 pr-4">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${meta.cls}`}>
                    {meta.label}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <Elapsed createdAt={o.createdAt} />
                </td>
                <td className="py-2.5">
                  {!isEnd && next && (
                    <button
                      onClick={() => onStatusChange(o.id, next)}
                      className="px-3 py-1 rounded-lg bg-blue-600/80 hover:bg-blue-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                      {NEXT_LABEL[o.status]}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Loading spinner ───────────────────────────────────────────

function Loading() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 text-sm">Carregando pedidos...</p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

const DOT_COLOR = { yellow: 'bg-yellow-400', blue: 'bg-blue-400', green: 'bg-green-400', red: 'bg-red-400' };

export default function OrdersBoard({
  loading, orders = [], getColumnOrders,
  changeStatus, doCancel, acknowledgeOrder,
  markPaid, editItems,
  drivers, onAssign,
  viewMode = 'default',
}) {
  const [editingOrder, setEditingOrder] = useState(null);

  const handleStatus = (id, status) => {
    if (status === 'cancelled') doCancel(id);
    else changeStatus(id, status);
  };

  if (loading) return <Loading />;

  // ── Default: classic 4-column Kanban ─────────────────────────
  if (viewMode === 'default') {
    return (
      <>
        <div className="flex-1 grid grid-cols-4 gap-3 p-4 min-h-0 overflow-hidden">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              orders={getColumnOrders(col.statuses)}
              onStatusChange={handleStatus}
              onAcknowledge={acknowledgeOrder}
              onMarkPaid={markPaid}
              onEditItems={setEditingOrder}
              drivers={drivers}
              onAssign={onAssign}
            />
          ))}
        </div>
        {editingOrder && (
          <EditOrderModal
            order={editingOrder}
            onClose={() => setEditingOrder(null)}
            onSave={async (id, items) => { await editItems(id, items); setEditingOrder(null); }}
          />
        )}
      </>
    );
  }

  // ── Compact: 4-column with dense cards ───────────────────────
  if (viewMode === 'compact') {
    return (
      <div className="flex-1 grid grid-cols-4 gap-3 p-4 min-h-0 overflow-hidden">
        {COLUMNS.map((col) => {
          const colOrders = getColumnOrders(col.statuses);
          return (
            <div key={col.id} className="flex flex-col min-w-0 h-full">
              {/* Column header */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl border border-b-0 ${col.header} shrink-0`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${DOT_COLOR[col.color]}`} />
                  <h2 className="text-xs font-black tracking-widest text-gray-200 uppercase">{col.label}</h2>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.count}`}>
                  {colOrders.length}
                </span>
              </div>
              {/* Cards */}
              <div className="col-scroll flex-1 p-2 space-y-1 rounded-b-xl border border-t-0 bg-gray-900/60 border-gray-700/30">
                {colOrders.length === 0 ? (
                  <div className="flex items-center justify-center h-16 text-gray-600 text-xs italic select-none">
                    Sem pedidos
                  </div>
                ) : (
                  colOrders.map((order) => (
                    <CompactCard key={order.id} order={order} onStatusChange={handleStatus} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Channel: grouped by origin channel ───────────────────────
  if (viewMode === 'channel') {
    const active = orders.filter((o) => !['cancelled', 'delivered'].includes(o.status));
    const byChannel = (id) =>
      active
        .filter((o) => CHANNEL_BUCKET(o.channel) === id)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    return (
      <div className="flex-1 grid grid-cols-4 gap-3 p-4 min-h-0 overflow-hidden">
        {CHANNEL_COLS.map((col) => {
          const colOrders = byChannel(col.id);
          return (
            <div key={col.id} className="flex flex-col min-w-0 h-full">
              <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl border border-b-0 ${col.header} shrink-0`}>
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{col.emoji}</span>
                  <h2 className="text-sm font-black tracking-widest text-gray-200 uppercase">{col.label}</h2>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.count}`}>
                  {colOrders.length}
                </span>
              </div>
              <div className="col-scroll flex-1 p-2 space-y-2 rounded-b-xl border border-t-0 bg-gray-900/60 border-gray-700/30">
                {colOrders.length === 0 ? (
                  <div className="flex items-center justify-center h-24 text-gray-600 text-sm italic select-none">
                    Sem pedidos ativos
                  </div>
                ) : (
                  colOrders.map((order) => (
                    <ChannelCard key={order.id} order={order} onStatusChange={handleStatus} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── List: flat table ─────────────────────────────────────────
  if (viewMode === 'list') {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <ListView orders={orders} onStatusChange={handleStatus} />
      </div>
    );
  }

  return null;
}
