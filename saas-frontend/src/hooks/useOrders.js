import { useState, useCallback, useRef, useEffect } from 'react';
import useSocket from './useSocket';
import { playAlert, unlockAudio } from '../utils/sound';
import { printOrder, printKitchen } from '../utils/print';
import { getOrders, updateOrderStatus, cancelOrder,
         markOrderPaid as markOrderPaidApi,
         editOrderItems as editOrderItemsApi } from '../api/orders';
import { getApiError } from '../utils/apiError';

// ── Column definitions ────────────────────────────────────────

export const COLUMNS = [
  {
    id:       'pending',
    label:    'PENDENTE',
    statuses: ['pending', 'confirmed'],
    color:    'yellow',
    ring:     'ring-yellow-500/40',
    header:   'bg-yellow-500/10 border-yellow-500/30',
    count:    'bg-yellow-500/20 text-yellow-300',
  },
  {
    id:       'preparing',
    label:    'EM PREPARO',
    statuses: ['preparing'],
    color:    'blue',
    ring:     'ring-blue-500/40',
    header:   'bg-blue-500/10 border-blue-500/30',
    count:    'bg-blue-500/20 text-blue-300',
  },
  {
    id:       'completed',
    label:    'CONCLUIDO',
    statuses: ['ready', 'delivered'],
    color:    'green',
    ring:     'ring-green-500/40',
    header:   'bg-green-500/10 border-green-500/30',
    count:    'bg-green-500/20 text-green-300',
  },
  {
    id:       'cancelled',
    label:    'CANCELADO',
    statuses: ['cancelled'],
    color:    'red',
    ring:     'ring-red-500/40',
    header:   'bg-red-500/10 border-red-500/30',
    count:    'bg-red-500/20 text-red-300',
  },
];

// ── Normalise order from either socket (camelCase) or REST (snake_case) ──

const norm = (o) => ({
  id:           o.id,
  orderNumber:  o.orderNumber  ?? o.order_number,
  status:       o.status,
  channel:      o.channel      ?? 'manual',
  total:        parseFloat(o.total ?? 0),
  notes:        o.notes        ?? null,
  deliveryType:  o.deliveryType  ?? o.delivery_type  ?? 'pickup',
  paymentMethod: o.paymentMethod ?? o.payment_method ?? 'cash',
  customerAddress: o.customerAddress ?? o.customer_address ?? null,
  customerName:  o.customerName  ?? o.customer_name  ?? null,
  customerPhone: o.customerPhone ?? o.customer_phone ?? null,
  items: (o.items ?? []).map((i) => ({
    id:          i.id,
    productId:   i.productId   ?? i.product_id,
    productName: i.productName ?? i.product_name,
    quantity:    i.quantity,
    weightKg:    i.weightKg    ?? i.weight_kg ?? null,
    unitPrice:   parseFloat(i.unitPrice ?? i.unit_price ?? 0),
    total:       parseFloat(i.total ?? 0),
    notes:       i.notes ?? null,
  })),
  deliveryFee:  parseFloat(o.deliveryFee ?? o.delivery_fee ?? 0),
  neighborhood: o.neighborhood ?? null,
  paidAt:    o.paidAt    ?? o.paid_at    ?? null,
  createdAt: o.createdAt ?? o.created_at,
  updatedAt: o.updatedAt ?? o.updated_at,
});

// ── Hook ──────────────────────────────────────────────────────

export default function useOrders() {
  const [orders,       setOrders]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [statusError,  setStatusError]  = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoPrint,    setAutoPrintState] = useState(
    () => localStorage.getItem('autoPrint') !== 'false'
  );
  const [autoPrintKitchen, setAutoPrintKitchenState] = useState(
    () => localStorage.getItem('autoPrintKitchen') === 'true'
  );

  // Refs mantidos sincronizados a cada render para uso em callbacks e intervals
  // (mesmo padrão de soundRef e autoPrintRef — evita recriação de closures)
  const autoPrintRef = useRef(autoPrint);
  autoPrintRef.current = autoPrint;

  const autoPrintKitchenRef = useRef(autoPrintKitchen);
  autoPrintKitchenRef.current = autoPrintKitchen;

  const setAutoPrint = useCallback((val) => {
    setAutoPrintState(val);
    localStorage.setItem('autoPrint', String(val));
  }, []);

  const setAutoPrintKitchen = useCallback((val) => {
    setAutoPrintKitchenState(val);
    localStorage.setItem('autoPrintKitchen', String(val));
  }, []);

  // ── Auto-confirmação ─────────────────────────────────────────
  // Delay em segundos: 0 = desligado. Opções: 0 | 30 | 60 | 120 | 300
  const AUTO_CONFIRM_OPTIONS = [0, 30, 60, 120, 300];
  const [autoConfirmDelay, setAutoConfirmDelayState] = useState(
    () => parseInt(localStorage.getItem('autoConfirmDelay') ?? '0', 10) || 0
  );
  const autoConfirmDelayRef = useRef(autoConfirmDelay);
  autoConfirmDelayRef.current = autoConfirmDelay;

  // Mapa de pedidos aguardando auto-confirmação: orderId → timeoutId
  const autoConfirmTimersRef = useRef(new Map());

  const setAutoConfirmDelay = useCallback((val) => {
    setAutoConfirmDelayState(val);
    localStorage.setItem('autoConfirmDelay', String(val));
  }, []);

  // Cancela timer de auto-confirmação de um pedido (se existir)
  const clearAutoConfirmTimer = useCallback((id) => {
    const tid = autoConfirmTimersRef.current.get(id);
    if (tid != null) {
      clearTimeout(tid);
      autoConfirmTimersRef.current.delete(id);
    }
  }, []);

  const unackRef   = useRef(new Set()); // pedidos aguardando reconhecimento
  const alertRef   = useRef(null);      // intervalo do alerta contínuo
  const soundRef   = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  // ── Continuous alert ────────────────────────────────────────

  const startAlert = useCallback(() => {
    if (alertRef.current) return;
    alertRef.current = setInterval(() => {
      if (unackRef.current.size > 0 && soundRef.current) {
        playAlert();
      } else {
        clearInterval(alertRef.current);
        alertRef.current = null;
      }
    }, 4_000);
  }, []);

  const acknowledgeOrder = useCallback((id) => {
    unackRef.current.delete(id);
  }, []);

  // ── Socket handlers ────────────────────────────────────────

  const TERMINAL = new Set(['delivered', 'cancelled']);

  const handleActiveOrders = useCallback((list) => {
    const active = list.map(norm);
    const activeIds = new Set(active.map((o) => o.id));
    setOrders((prev) => {
      if (active.length === 0 && prev.length > 0) return prev;
      // Pedidos que o frontend já conhece como terminais (delivered/cancelled)
      // não podem ser sobrescritos pelo snapshot do socket (cache Redis pode estar stale)
      const terminalIds = new Set(prev.filter((o) => TERMINAL.has(o.status)).map((o) => o.id));
      const safeActive = active.filter((o) => !terminalIds.has(o.id));
      const preserved  = prev.filter((o) => !activeIds.has(o.id));
      return [...safeActive, ...preserved];
    });
    setLoading(false);
  }, []);

  const handleOrderCreated = useCallback((order) => {
    unlockAudio();
    const o = norm(order);
    setOrders((prev) => prev.find((p) => p.id === o.id) ? prev : [o, ...prev]);
    if (soundRef.current) playAlert();
    if (autoPrintRef.current)        printOrder(o);
    if (autoPrintKitchenRef.current) printKitchen(o);
    // Agenda auto-confirmação se configurado e pedido em pending
    if (autoConfirmDelayRef.current > 0 && o.status === 'pending') {
      const tid = setTimeout(() => {
        autoConfirmTimersRef.current.delete(o.id);
        // Só confirma se ainda estiver pending (não foi cancelado/confirmado manualmente)
        setOrders((prev) => {
          const cur = prev.find((p) => p.id === o.id);
          if (cur?.status === 'pending') {
            updateOrderStatus(o.id, 'confirmed').catch(() => {});
            return prev.map((p) => p.id === o.id ? { ...p, status: 'confirmed' } : p);
          }
          return prev;
        });
      }, autoConfirmDelayRef.current * 1_000);
      autoConfirmTimersRef.current.set(o.id, tid);
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`🍽️ Pedido #${o.orderNumber}`, {
        body: `${o.channel !== 'manual' ? o.channel.toUpperCase() + ' · ' : ''}${o.items?.length ?? 0} item(s) · R$ ${o.total.toFixed(2)}`,
        tag: `order-${o.id}`,
        renotify: true,
      });
    }
    unackRef.current.add(o.id);
    startAlert();
  }, [startAlert]);

  const handleOrderUpdated = useCallback((order) => {
    const o = norm(order);
    setOrders((prev) => prev.map((p) => p.id === o.id ? o : p));
    acknowledgeOrder(o.id);
  }, [acknowledgeOrder]);

  const handleOrderDeleted = useCallback((id) => {
    setOrders((prev) => prev.filter((p) => p.id !== id));
    unackRef.current.delete(id);
  }, []);

  // ── Carga inicial de todos os pedidos do dia ─────────────────
  // Declarado ANTES do useSocket para que onReconnect possa referenciar fetchToday.
  // isFetchingRef evita fetches paralelos (inflight lock).

  // Guarda contra double-click: IDs de pedidos com request em voo
  const pendingStatusRef = useRef(new Set());

  const isFetchingRef = useRef(false);

  const fetchToday = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data } = await getOrders({ limit: 500, startDate: today.toISOString() });
      setOrders((data.data ?? []).map(norm));
    } catch {
      // non-fatal — socket continua entregando pedidos ativos
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  const socketConnected = useSocket({
    onActiveOrders: handleActiveOrders,
    onOrderCreated: handleOrderCreated,
    onOrderUpdated: handleOrderUpdated,
    onOrderDeleted: handleOrderDeleted,
    onReconnect:    fetchToday,   // re-fetch ao reconectar para não perder pedidos
  });

  // Ref para usar socketConnected dentro do interval sem recriar o effect
  const socketConnectedRef = useRef(false);
  socketConnectedRef.current = socketConnected;

  // Carga inicial: chama fetchToday e libera o spinner.
  // O flag `alive` impede setLoading(false) se o componente desmontar antes do fetch terminar.
  useEffect(() => {
    let alive = true;
    fetchToday().then(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fetchToday]);

  // Polling de fallback: ativa apenas quando o WebSocket está desconectado.
  // Intervalo de 15s — menor que o timeout padrão da API (15s), evitando sobreposição.
  useEffect(() => {
    const id = setInterval(() => {
      if (!socketConnectedRef.current) fetchToday();
    }, 15_000);
    return () => clearInterval(id);
  }, [fetchToday]);

  // ── Actions (optimistic) ────────────────────────────────────

  const changeStatus = useCallback(async (id, status) => {
    const snapshot = orders.find((o) => o.id === id);
    // Guarda 1: mesmo status = no-op silencioso
    if (snapshot?.status === status) return;
    // Guarda 2: request já em voo para este pedido (double-click antes do otimistic commit)
    if (pendingStatusRef.current.has(id)) return;

    clearAutoConfirmTimer(id); // cancela auto-confirmação pendente
    pendingStatusRef.current.add(id);
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status } : o));
    acknowledgeOrder(id);
    try {
      await updateOrderStatus(id, status);
    } catch (err) {
      if (snapshot) setOrders((prev) => prev.map((o) => o.id === id ? snapshot : o));
      setStatusError(`Pedido #${snapshot?.orderNumber ?? ''}: ${getApiError(err, 'Erro ao atualizar pedido')}`);
    } finally {
      pendingStatusRef.current.delete(id);
    }
  }, [orders, acknowledgeOrder]);

  const doCancel = useCallback(async (id) => {
    clearAutoConfirmTimer(id); // cancela auto-confirmação pendente
    const snapshot = orders.find((o) => o.id === id);
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status: 'cancelled' } : o));
    acknowledgeOrder(id);
    try {
      await cancelOrder(id);
    } catch (err) {
      if (snapshot) setOrders((prev) => prev.map((o) => o.id === id ? snapshot : o));
      setStatusError(`Pedido #${snapshot?.orderNumber ?? ''}: ${getApiError(err, 'Erro ao cancelar pedido')}`);
    }
  }, [orders, acknowledgeOrder]);

  const addOrder = useCallback((order) => {
    const o = norm(order);
    setOrders((prev) => prev.find((p) => p.id === o.id) ? prev : [o, ...prev]);
  }, []);

  // ── Pagamento ────────────────────────────────────────────────

  const markPaid = useCallback(async (id, paymentMethod) => {
    const snapshot = orders.find((o) => o.id === id);
    // Optimistic: marca como pago imediatamente
    setOrders((prev) => prev.map((o) =>
      o.id === id ? { ...o, paymentMethod, paidAt: new Date().toISOString() } : o
    ));
    try {
      const { data } = await markOrderPaidApi(id, paymentMethod);
      if (data.data) setOrders((prev) => prev.map((o) => o.id === id ? norm(data.data) : o));
    } catch (err) {
      if (snapshot) setOrders((prev) => prev.map((o) => o.id === id ? snapshot : o));
      setStatusError(`Pedido #${snapshot?.orderNumber ?? ''}: ${getApiError(err, 'Erro ao registrar pagamento')}`);
    }
  }, [orders]);

  // ── Edição de itens ──────────────────────────────────────────

  const editItems = useCallback(async (id, items) => {
    try {
      const { data } = await editOrderItemsApi(id, items);
      if (data.data) setOrders((prev) => prev.map((o) => o.id === id ? norm(data.data) : o));
    } catch (err) {
      const snapshot = orders.find((o) => o.id === id);
      setStatusError(`Pedido #${snapshot?.orderNumber ?? ''}: ${getApiError(err, 'Erro ao editar itens')}`);
      throw err; // re-throw para o modal exibir o erro
    }
  }, [orders]);

  // ── Column helper ────────────────────────────────────────────

  const getColumnOrders = useCallback((statuses) =>
    orders
      .filter((o) => statuses.includes(o.status))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [orders]
  );

  return {
    orders, loading, socketConnected,
    statusError, setStatusError,
    soundEnabled, setSoundEnabled,
    autoPrint, setAutoPrint,
    autoPrintKitchen, setAutoPrintKitchen,
    autoConfirmDelay, setAutoConfirmDelay, AUTO_CONFIRM_OPTIONS,
    changeStatus, doCancel, addOrder,
    acknowledgeOrder, getColumnOrders,
    markPaid, editItems,
  };
}
