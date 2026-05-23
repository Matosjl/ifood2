import { useState, useEffect, useRef, useCallback } from 'react';
import Header        from '../components/Header';
import OrdersBoard   from '../components/OrdersBoard';
import NewOrderModal from '../components/NewOrderModal';
import Toast         from '../components/Toast';
import useOrders     from '../hooks/useOrders';
import api           from '../api/axios';

const VIEW_MODES = [
  { id: 'default', label: 'Padrão',    icon: '⊞' },
  { id: 'compact', label: 'Compacto',  icon: '⊟' },
  { id: 'channel', label: 'Por Canal', icon: '◫' },
  { id: 'list',    label: 'Lista',     icon: '☰' },
];

const BASE_TITLE = 'Painel da Cozinha';

// Ask for browser notification permission once
function useNotificationPermission() {
  useEffect(() => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      // Small delay so it doesn't appear immediately on load
      const t = setTimeout(() => {
        Notification.requestPermission();
      }, 3_000);
      return () => clearTimeout(t);
    }
  }, []);
}

// Update document.title with pending order count badge
function useTitleBadge(pendingCount) {
  useEffect(() => {
    if (pendingCount > 0) {
      document.title = `(${pendingCount}) ${BASE_TITLE}`;
      // Favicon pulse: switch between 🔴 and normal by updating link
      const link = document.querySelector("link[rel~='icon']");
      if (link) link.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%23ef4444'/><text y='.9em' font-size='60' x='8'>${pendingCount > 9 ? '9+' : pendingCount}</text></svg>`;
    } else {
      document.title = BASE_TITLE;
      const link = document.querySelector("link[rel~='icon']");
      if (link) link.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%23f97316'/><text y='.9em' font-size='80' x='10'>🍽</text></svg>`;
    }
    return () => { document.title = BASE_TITLE; };
  }, [pendingCount]);
}

export default function DashboardPage() {
  const [showModal, setShowModal] = useState(false);
  const [viewMode,  setViewMode]  = useState('default');

  const {
    orders, loading, socketConnected,
    statusError, setStatusError,
    soundEnabled, setSoundEnabled,
    autoPrint, setAutoPrint,
    autoPrintKitchen, setAutoPrintKitchen,
    autoConfirmDelay, setAutoConfirmDelay, AUTO_CONFIRM_OPTIONS,
    changeStatus, doCancel,
    acknowledgeOrder, getColumnOrders,
    addOrder, markPaid, editItems,
  } = useOrders();

  // ── Motoboys conectados ──────────────────────────────────────
  const [drivers, setDrivers] = useState([]);

  const loadDrivers = useCallback(async () => {
    try {
      const { data } = await api.get('/driver/restaurant/drivers');
      setDrivers(data.data ?? []);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    loadDrivers();
    const id = setInterval(loadDrivers, 30_000);
    return () => clearInterval(id);
  }, [loadDrivers]);

  const handleAssignDriver = useCallback(async (orderId, driverId) => {
    try {
      await api.post('/driver/restaurant/assign', { orderId, driverId });
      // O socket vai atualizar o status do pedido automaticamente;
      // se não estiver conectado, o polling de 15s vai buscar
    } catch (e) {
      setStatusError(e?.response?.data?.message ?? 'Erro ao atribuir motoboy.');
    }
  }, [setStatusError]);

  // Count pending (non-confirmed yet) orders for badge
  const pendingCount = orders.filter((o) =>
    o.status === 'pending' || o.status === 'confirmed'
  ).length;

  useNotificationPermission();
  useTitleBadge(pendingCount);

  const handleCreated = (order) => {
    if (order) addOrder(order);
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">

      {statusError && (
        <Toast
          msg={statusError}
          type="error"
          position="top-center"
          duration={4_000}
          onDone={() => setStatusError(null)}
        />
      )}

      <Header
        connected={socketConnected}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        autoPrint={autoPrint}
        setAutoPrint={setAutoPrint}
        autoPrintKitchen={autoPrintKitchen}
        setAutoPrintKitchen={setAutoPrintKitchen}
        autoConfirmDelay={autoConfirmDelay}
        setAutoConfirmDelay={setAutoConfirmDelay}
        autoConfirmOptions={AUTO_CONFIRM_OPTIONS}
        onNewOrder={() => setShowModal(true)}
        viewMode={viewMode}
        setViewMode={setViewMode}
        viewModes={VIEW_MODES}
        pendingCount={pendingCount}
      />

      <OrdersBoard
        loading={loading}
        orders={orders}
        getColumnOrders={getColumnOrders}
        changeStatus={changeStatus}
        doCancel={doCancel}
        acknowledgeOrder={acknowledgeOrder}
        markPaid={markPaid}
        editItems={editItems}
        drivers={drivers}
        onAssign={handleAssignDriver}
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
