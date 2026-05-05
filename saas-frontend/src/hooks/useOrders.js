import { useState, useCallback, useRef, useEffect } from 'react';
import useSocket from './useSocket';
import { playAlert, unlockAudio } from '../utils/sound';
import { printOrder } from '../utils/print';
import { getOrders, updateOrderStatus, cancelOrder } from '../api/orders';

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
  createdAt: o.createdAt ?? o.created_at,
  updatedAt: o.updatedAt ?? o.updated_at,
});

// ── Hook ──────────────────────────────────────────────────────

export default function useOrders() {
  const [orders,       setOrders]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoPrint,    setAutoPrintState] = useState(
    () => localStorage.getItem('autoPrint') !== 'false'  // padrão: ligado
  );

  const autoPrintRef = useRef(autoPrint);
  autoPrintRef.current = autoPrint;

  const setAutoPrint = useCallback((val) => {
    setAutoPrintState(val);
    localStorage.setItem('autoPrint', String(val));
  }, []);

  const unackRef     = useRef(new Set()); // orders waiting for acknowledgement
  const alertRef     = useRef(null);      // continuous-alert interval
  const soundRef     = useRef(soundEnabled);
  soundRef.current   = soundEnabled;

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

  const handleActiveOrders = useCallback((list) => {
    setOrders(list.map(norm));
    setLoading(false);
  }, []);

  const handleOrderCreated = useCallback((order) => {
    unlockAudio();
    const o = norm(order);
    setOrders((prev) => prev.find((p) => p.id === o.id) ? prev : [o, ...prev]);
    if (soundRef.current) { playAlert(); }
    if (autoPrintRef.current) { printOrder(o); }
    // Browser notification (works even if tab is in background)
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

  const socketConnected = useSocket({
    onActiveOrders: handleActiveOrders,
    onOrderCreated: handleOrderCreated,
    onOrderUpdated: handleOrderUpdated,
    onOrderDeleted: handleOrderDeleted,
  });

  // ── Fallback REST fetch (if socket snapshot never arrives) ──

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!loading) return;
      try {
        const { data } = await getOrders({ limit: 100 });
        setOrders((data.data ?? []).map(norm));
      } catch {
        // non-fatal
      } finally {
        setLoading(false);
      }
    }, 4_000);
    return () => clearTimeout(t);
  }, [loading]);

  // ── Fetch today's completed/cancelled orders (not in socket cache) ──
  // The Redis cache only keeps active orders. After F5, delivered/cancelled
  // orders disappear from the board. We fix this by fetching today's
  // terminal orders once on mount and merging them.

  useEffect(() => {
    const fetchCompleted = async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const { data } = await getOrders({
          limit: 200,
          startDate: today.toISOString(),
        });
        const terminal = (data.data ?? [])
          .filter((o) => ['delivered', 'cancelled', 'ready'].includes(o.status))
          .map(norm);
        if (terminal.length === 0) return;
        setOrders((prev) => {
          const existing = new Set(prev.map((o) => o.id));
          const newOnes  = terminal.filter((o) => !existing.has(o.id));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
      } catch {
        // non-fatal
      }
    };
    // Run after socket has had time to deliver its snapshot
    const t = setTimeout(fetchCompleted, 2_000);
    return () => clearTimeout(t);
  }, []);

  // ── Actions (optimistic) ────────────────────────────────────

  const changeStatus = useCallback(async (id, status) => {
    const snapshot = orders.find((o) => o.id === id);
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status } : o));
    acknowledgeOrder(id);
    try {
      await updateOrderStatus(id, status);
    } catch {
      if (snapshot) setOrders((prev) => prev.map((o) => o.id === id ? snapshot : o));
    }
  }, [orders, acknowledgeOrder]);

  const doCancel = useCallback(async (id) => {
    const snapshot = orders.find((o) => o.id === id);
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status: 'cancelled' } : o));
    acknowledgeOrder(id);
    try {
      await cancelOrder(id);
    } catch {
      if (snapshot) setOrders((prev) => prev.map((o) => o.id === id ? snapshot : o));
    }
  }, [orders, acknowledgeOrder]);

  const addOrder = useCallback((order) => {
    const o = norm(order);
    setOrders((prev) => prev.find((p) => p.id === o.id) ? prev : [o, ...prev]);
  }, []);

  // ── Column helper ────────────────────────────────────────────

  const getColumnOrders = useCallback((statuses) =>
    orders
      .filter((o) => statuses.includes(o.status))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [orders]
  );

  return {
    orders, loading, socketConnected,
    soundEnabled, setSoundEnabled,
    autoPrint, setAutoPrint,
    changeStatus, doCancel, addOrder,
    acknowledgeOrder, getColumnOrders,
  };
}
