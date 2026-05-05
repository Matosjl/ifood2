import { useState } from 'react';
import Header        from '../components/Header';
import OrdersBoard   from '../components/OrdersBoard';
import NewOrderModal from '../components/NewOrderModal';
import useOrders     from '../hooks/useOrders';

const VIEW_MODES = [
  { id: 'default', label: 'Padrão',    icon: '⊞' },
  { id: 'compact', label: 'Compacto',  icon: '⊟' },
  { id: 'channel', label: 'Por Canal', icon: '◫' },
  { id: 'list',    label: 'Lista',     icon: '☰' },
];

export default function DashboardPage() {
  const [showModal, setShowModal] = useState(false);
  const [viewMode,  setViewMode]  = useState('default');

  const {
    orders, loading, socketConnected,
    soundEnabled, setSoundEnabled,
    changeStatus, doCancel,
    acknowledgeOrder, getColumnOrders,
    addOrder,
  } = useOrders();

  const handleCreated = (order) => {
    if (order) addOrder(order);
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">
      <Header
        connected={socketConnected}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        onNewOrder={() => setShowModal(true)}
        viewMode={viewMode}
        setViewMode={setViewMode}
        viewModes={VIEW_MODES}
      />

      <OrdersBoard
        loading={loading}
        orders={orders}
        getColumnOrders={getColumnOrders}
        changeStatus={changeStatus}
        doCancel={doCancel}
        acknowledgeOrder={acknowledgeOrder}
        viewMode={viewMode}
      />

      {showModal && (
        <NewOrderModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
