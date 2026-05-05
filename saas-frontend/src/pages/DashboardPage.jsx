import { useState } from 'react';
import Header from '../components/Header';
import OrdersBoard from '../components/OrdersBoard';
import NewOrderModal from '../components/NewOrderModal';
import useOrders from '../hooks/useOrders';

export default function DashboardPage({ onLogout }) {
  const [showModal, setShowModal] = useState(false);

  const {
    loading, socketConnected,
    soundEnabled, setSoundEnabled,
    changeStatus, doCancel,
    acknowledgeOrder, getColumnOrders,
    addOrder,
  } = useOrders();

  const handleCreated = (order) => {
    if (order) addOrder(order);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 overflow-hidden">
      <Header
        connected={socketConnected}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        onNewOrder={() => setShowModal(true)}
        onLogout={onLogout}
      />

      <OrdersBoard
        loading={loading}
        getColumnOrders={getColumnOrders}
        changeStatus={changeStatus}
        doCancel={doCancel}
        acknowledgeOrder={acknowledgeOrder}
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
