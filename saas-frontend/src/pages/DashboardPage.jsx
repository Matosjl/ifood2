import { useState, useEffect, useRef, useCallback } from 'react';
import Header           from '../components/Header';
import OrdersBoard      from '../components/OrdersBoard';
import NewOrderModal    from '../components/NewOrderModal';
import Toast            from '../components/Toast';
import SetupChecklist   from '../components/SetupChecklist';
import HealthWidget     from '../components/HealthWidget';
import IncidentsBanner  from '../components/IncidentsBanner';
import useOrders        from '../hooks/useOrders';
import api              from '../api/axios';

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

export default function DashboardPage({ onNavigate }) {
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

  // ── KPI bar: live today stats ─────────────────────────────
  const [caixaOpen, setCaixaOpen] = useState(null); // null=loading, true/false

  useEffect(() => {
    api.get('/caixa/current').then(({ data }) => {
      setCaixaOpen(!!(data.data?.id));
    }).catch(() => setCaixaOpen(false));
  }, []);

  const todayOrders = orders.filter((o) => {
    const d = new Date(o.createdAt ?? o.created_at);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth()    === now.getMonth()    &&
           d.getDate()     === now.getDate();
  });
  const todayRevenue = todayOrders
    .filter((o) => ['ready','delivering','delivered'].includes(o.status))
    .reduce((sum, o) => sum + parseFloat(o.total ?? 0), 0);
  const todayCount   = todayOrders.length;
  const fmtBRL = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n ?? 0);

  // Forgotten orders: pending/confirmed older than 10 min
  const forgottenOrders = orders.filter((o) => {
    if (!['pending', 'confirmed'].includes(o.status)) return false;
    const mins = (Date.now() - new Date(o.createdAt ?? o.created_at).getTime()) / 60_000;
    return mins >= 10;
  });

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

      {/* ── KPI Bar ───────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-gray-900/60 border-b border-white/[0.04] shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-sm">💰</span>
          <span className="text-xs font-bold text-white tabular-nums">{fmtBRL(todayRevenue)}</span>
          <span className="text-[10px] text-gray-600">hoje</span>
        </div>
        <div className="w-px h-4 bg-white/10" />
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-sm">🧾</span>
          <span className="text-xs font-bold text-white tabular-nums">{todayCount}</span>
          <span className="text-[10px] text-gray-600">pedido{todayCount !== 1 ? 's' : ''}</span>
        </div>
        <div className="w-px h-4 bg-white/10" />
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-2 h-2 rounded-full ${caixaOpen ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className={`text-xs font-bold ${caixaOpen ? 'text-green-400' : 'text-red-400'}`}>
            Caixa {caixaOpen === null ? '…' : caixaOpen ? 'aberto' : 'fechado'}
          </span>
        </div>
        {pendingCount > 0 && (
          <>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              <span className="text-xs font-bold text-yellow-400">{pendingCount} aguardando</span>
            </div>
          </>
        )}
        {forgottenOrders.length > 0 && (
          <>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-1.5 shrink-0 bg-red-500/15 px-2 py-0.5 rounded-lg border border-red-500/30">
              <span className="text-sm animate-pulse">🚨</span>
              <span className="text-xs font-black text-red-400">
                {forgottenOrders.length} pedido{forgottenOrders.length > 1 ? 's' : ''} esquecido{forgottenOrders.length > 1 ? 's' : ''}!
              </span>
            </div>
          </>
        )}
      </div>

      <div className="shrink-0"><HealthWidget /></div>
      <div className="shrink-0"><IncidentsBanner /></div>

      {onNavigate && <SetupChecklist onNavigate={onNavigate} />}

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
