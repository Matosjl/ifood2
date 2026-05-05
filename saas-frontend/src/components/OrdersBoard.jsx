import KanbanColumn from './KanbanColumn';
import { COLUMNS } from '../hooks/useOrders';

export default function OrdersBoard({ getColumnOrders, changeStatus, doCancel, acknowledgeOrder, loading }) {
  const handleStatus = (id, status) => {
    if (status === 'cancelled') doCancel(id);
    else changeStatus(id, status);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">Carregando pedidos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 grid grid-cols-4 gap-3 p-4 min-h-0 overflow-hidden">
      {COLUMNS.map((col) => (
        <KanbanColumn
          key={col.id}
          column={col}
          orders={getColumnOrders(col.statuses)}
          onStatusChange={handleStatus}
          onAcknowledge={acknowledgeOrder}
        />
      ))}
    </div>
  );
}
