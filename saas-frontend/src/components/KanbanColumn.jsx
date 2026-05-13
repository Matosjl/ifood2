import OrderCard from './OrderCard';

const DOT = {
  yellow: 'bg-yellow-400',
  blue:   'bg-blue-400',
  green:  'bg-green-400',
  red:    'bg-red-400',
};

export default function KanbanColumn({ column, orders, onStatusChange, onAcknowledge, onMarkPaid, onEditItems }) {
  const { label, color, header, count } = column;
  // Contador ativo: exclui entregues e cancelados (pedidos já finalizados)
  const activeCount = orders.filter((o) => !['delivered','cancelled'].includes(o.status)).length;

  return (
    <div className="flex flex-col min-w-0 h-full">
      {/* Column header */}
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl border border-b-0 ${header} shrink-0`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${DOT[color]}`} />
          <h2 className="text-sm font-black tracking-widest text-gray-200 uppercase">
            {label}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {activeCount > 0 && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${count}`}>
              {activeCount}
            </span>
          )}
          {orders.length !== activeCount && (
            <span className="text-[10px] text-gray-600 px-1">({orders.length})</span>
          )}
        </div>
      </div>

      {/* Cards — scroll vertical quando há muitos pedidos */}
      <div className={`col-scroll flex-1 p-2 space-y-2 rounded-b-xl border border-t-0 bg-gray-900/60 ${header.replace('bg-', 'border-').split(' ')[0]}`}>
        {orders.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-600 text-sm italic select-none">
            Sem pedidos
          </div>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onStatusChange={onStatusChange}
              onAcknowledge={onAcknowledge}
              onMarkPaid={onMarkPaid}
              onEditItems={onEditItems}
            />
          ))
        )}
      </div>
    </div>
  );
}
