/**
 * KdsPage — Kitchen Display System
 * Tela exclusiva para a cozinha: mostra pedidos confirmados e em preparo.
 * Atualiza em tempo real via Socket.io.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence }           from 'framer-motion';
import api                                   from '../api/axios';

// ── Helpers ───────────────────────────────────────────────────

function elapsed(createdAt) {
  const ms  = Date.now() - new Date(createdAt).getTime();
  const m   = Math.floor(ms / 60000);
  const s   = Math.floor((ms % 60000) / 1000);
  if (m > 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  if (m > 0)  return `${m}m ${s}s`;
  return `${s}s`;
}

function elapsedColor(createdAt) {
  const m = (Date.now() - new Date(createdAt).getTime()) / 60000;
  if (m > 20) return 'text-red-400';
  if (m > 10) return 'text-yellow-400';
  return 'text-green-400';
}

// ── Order card ────────────────────────────────────────────────

function OrderCard({ order, onAction, actionLabel, actionColor, disabled }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  const items = Array.isArray(order.items)
    ? order.items.filter((i) => i && i.product_name)
    : [];

  const urgency = (Date.now() - new Date(order.created_at).getTime()) / 60000;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', damping: 24, stiffness: 280 }}
      className={[
        'bg-gray-900 rounded-2xl border overflow-hidden flex flex-col',
        urgency > 20 ? 'border-red-500/40 shadow-lg shadow-red-500/10' :
        urgency > 10 ? 'border-yellow-500/30' : 'border-white/10',
      ].join(' ')}
    >
      {/* Header */}
      <div className={[
        'px-4 py-3 flex items-center justify-between',
        urgency > 20 ? 'bg-red-500/10' :
        urgency > 10 ? 'bg-yellow-500/5' : 'bg-gray-800/60',
      ].join(' ')}>
        <div>
          <p className="text-base font-black text-white">#{order.order_number ?? order.id.slice(0,8)}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {order.delivery_type === 'delivery' ? '🛵 Entrega' : '🏪 Retirada'}
            {order.customer_name && ` · ${order.customer_name.split(' ')[0]}`}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-lg font-black tabular-nums ${elapsedColor(order.created_at)}`}>
            {elapsed(order.created_at)}
          </p>
          <p className="text-[10px] text-gray-600">aguardando</p>
        </div>
      </div>

      {/* Items */}
      <div className="px-4 py-3 flex-1 space-y-1.5">
        {items.length === 0 ? (
          <p className="text-xs text-gray-600 italic">Sem itens</p>
        ) : items.map((item, i) => (
          <div key={i} className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <span className="text-sm font-black text-orange-400 shrink-0 tabular-nums w-5 text-right">
                {item.quantity ?? 1}×
              </span>
              <div>
                <p className="text-sm font-semibold text-white leading-tight">{item.product_name}</p>
                {item.notes && (
                  <p className="text-[11px] text-amber-400 mt-0.5">⚠ {item.notes}</p>
                )}
                {Array.isArray(item.addons) && item.addons.length > 0 && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    + {item.addons.map((a) => a.addon_name).join(', ')}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="px-4 pb-2">
          <p className="text-xs text-amber-400 bg-amber-500/10 rounded-lg px-2.5 py-1.5">
            💬 {order.notes}
          </p>
        </div>
      )}

      {/* Action */}
      <div className="px-4 pb-4">
        <button
          onClick={() => onAction(order.id)}
          disabled={disabled}
          className={[
            'w-full py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50',
            actionColor === 'orange' ? 'bg-orange-500 hover:bg-orange-400 text-white' :
            actionColor === 'green'  ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white',
          ].join(' ')}
        >
          {actionLabel}
        </button>
      </div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────

export default function KdsPage() {
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState({});
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    try {
      const [confRes, prepRes] = await Promise.all([
        api.get('/orders?status=confirmed&limit=50'),
        api.get('/orders?status=preparing&limit=50'),
      ]);
      const all = [
        ...(confRes.data.data ?? []),
        ...(prepRes.data.data ?? []),
      ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      setOrders(all);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao carregar pedidos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000); // refresh a cada 15s
    return () => clearInterval(interval);
  }, [load]);

  // Real-time via Socket.io (mesmo socket já conectado no app principal)
  useEffect(() => {
    const onOrderUpdate = (order) => {
      setOrders((prev) => {
        const filtered = prev.filter((o) => o.id !== order.id);
        if (['confirmed', 'preparing'].includes(order.status)) {
          return [...filtered, order].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        }
        return filtered;
      });
    };
    const onOrderCreate = (order) => {
      if (['confirmed', 'preparing'].includes(order.status)) {
        setOrders((prev) => [...prev, order].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
      }
    };

    window.addEventListener('kds:order-updated', (e) => onOrderUpdate(e.detail));
    window.addEventListener('kds:order-created', (e) => onOrderCreate(e.detail));
    return () => {
      window.removeEventListener('kds:order-updated', onOrderUpdate);
      window.removeEventListener('kds:order-created', onOrderCreate);
    };
  }, []);

  const handleAction = useCallback(async (orderId, currentStatus) => {
    const nextStatus = currentStatus === 'confirmed' ? 'preparing' : 'ready';
    setActing((a) => ({ ...a, [orderId]: true }));
    try {
      await api.patch(`/orders/${orderId}/status`, { status: nextStatus });
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (err) {
      alert(err.response?.data?.message ?? 'Erro ao atualizar pedido.');
    } finally {
      setActing((a) => ({ ...a, [orderId]: false }));
    }
  }, []);

  const confirmed  = orders.filter((o) => o.status === 'confirmed');
  const preparing  = orders.filter((o) => o.status === 'preparing');

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">

      {/* Header */}
      <div className="px-5 py-3 bg-gray-900/80 border-b border-white/5 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">👨‍🍳</span>
          <div>
            <h1 className="text-lg font-black text-white leading-none">KDS — Cozinha</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {orders.length} pedido{orders.length !== 1 ? 's' : ''} ativo{orders.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Atualizar"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex gap-0">

          {/* Confirmados */}
          <div className="flex-1 flex flex-col border-r border-white/[0.06] overflow-hidden">
            <div className="px-4 py-3 shrink-0 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
                <p className="text-sm font-bold text-blue-300">
                  CONFIRMADOS
                  <span className="ml-2 text-xs font-semibold bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full">
                    {confirmed.length}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {confirmed.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-700">
                  <span className="text-4xl">✅</span>
                  <p className="text-sm italic">Nenhum pedido aguardando</p>
                </div>
              ) : (
                <AnimatePresence>
                  {confirmed.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      actionLabel="▶ Iniciar Preparo"
                      actionColor="orange"
                      disabled={!!acting[order.id]}
                      onAction={(id) => handleAction(id, 'confirmed')}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* Em Preparo */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 shrink-0 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse shrink-0" />
                <p className="text-sm font-bold text-orange-300">
                  EM PREPARO
                  <span className="ml-2 text-xs font-semibold bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded-full">
                    {preparing.length}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {preparing.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-700">
                  <span className="text-4xl">🍳</span>
                  <p className="text-sm italic">Nada em preparo</p>
                </div>
              ) : (
                <AnimatePresence>
                  {preparing.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      actionLabel="✅ Marcar como Pronto"
                      actionColor="green"
                      disabled={!!acting[order.id]}
                      onAction={(id) => handleAction(id, 'preparing')}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
