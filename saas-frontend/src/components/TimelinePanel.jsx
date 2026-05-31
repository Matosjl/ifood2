/**
 * TimelinePanel — painel lateral flutuante com histórico operacional em tempo real.
 * Pode ser aberto de qualquer página via botão flutuante.
 * Auto-refresh a cada 2 minutos quando aberto.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

const EVENT_CONFIG = {
  order_created:       { dot: 'bg-blue-500',   icon: '🛍️', label: 'Pedido criado' },
  order_confirmed:     { dot: 'bg-indigo-500',  icon: '✅', label: 'Pedido confirmado' },
  order_preparing:     { dot: 'bg-yellow-500',  icon: '👨‍🍳', label: 'Em preparo' },
  order_ready:         { dot: 'bg-green-400',   icon: '🔔', label: 'Pronto' },
  order_delivering:    { dot: 'bg-orange-500',  icon: '🛵', label: 'Saiu p/ entrega' },
  order_delivered:     { dot: 'bg-green-600',   icon: '✔️', label: 'Entregue' },
  order_cancelled:     { dot: 'bg-red-500',     icon: '❌', label: 'Cancelado' },
  caixa_open:          { dot: 'bg-green-500',   icon: '💰', label: 'Caixa aberto' },
  caixa_close:         { dot: 'bg-gray-500',    icon: '🔒', label: 'Caixa fechado' },
  expense_paid:        { dot: 'bg-red-400',     icon: '💸', label: 'Despesa lançada' },
  low_stock:           { dot: 'bg-orange-500',  icon: '📦', label: 'Estoque baixo' },
};

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return 'Hoje';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function groupByDate(events) {
  const groups = {};
  for (const e of events) {
    const key = fmtDate(e.occurred_at ?? e.time ?? e.created_at);
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  return groups;
}

export default function TimelinePanel() {
  const [open,   setOpen]   = useState(false);
  const [hours,  setHours]  = useState(24);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);

  const fetch = useCallback(async (h = hours) => {
    setLoading(true);
    try {
      const { data } = await api.get('/timeline', { params: { hours: h, limit: 300 } });
      setEvents(data.data ?? []);
      setLastFetch(new Date());
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [hours]);

  // Auto-refresh when open
  useEffect(() => {
    if (!open) return;
    fetch(hours);
    const id = setInterval(() => fetch(hours), 120_000); // 2 min
    return () => clearInterval(id);
  }, [open, hours, fetch]);

  const groups = groupByDate(events);
  const dateKeys = Object.keys(groups);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 w-12 h-12 bg-gray-800 border border-white/10 rounded-2xl shadow-2xl flex items-center justify-center text-xl hover:bg-gray-700 transition-colors"
        title="Timeline Operacional"
      >
        ⏱️
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />

          {/* Drawer */}
          <div className="relative w-full max-w-sm bg-gray-900 border-l border-white/[0.07] shadow-2xl flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/[0.07] shrink-0">
              <div>
                <p className="text-base font-black text-white">⏱️ Timeline Operacional</p>
                {lastFetch && (
                  <p className="text-[10px] text-gray-600 mt-0.5">
                    Atualizado às {fmtTime(lastFetch.toISOString())}
                  </p>
                )}
              </div>
              <button onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Period filter */}
            <div className="flex gap-2 px-4 py-2.5 border-b border-white/[0.05] shrink-0">
              {[
                { h: 6,   label: '6h'   },
                { h: 24,  label: 'Hoje' },
                { h: 72,  label: '3 dias' },
                { h: 168, label: '7 dias' },
              ].map(({ h, label }) => (
                <button key={h} onClick={() => { setHours(h); fetch(h); }}
                  className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-colors ${hours === h ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}>
                  {label}
                </button>
              ))}
              <button onClick={() => fetch(hours)}
                className="px-2 text-gray-500 hover:text-gray-300 transition-colors" title="Atualizar">
                {loading ? <span className="inline-block w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" /> : '🔄'}
              </button>
            </div>

            {/* Events list */}
            <div className="flex-1 overflow-y-auto">
              {loading && events.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2">
                  <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-gray-600">Carregando eventos...</p>
                </div>
              ) : events.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                  <p className="text-2xl mb-2">📭</p>
                  <p className="text-sm text-gray-500">Sem eventos neste período</p>
                </div>
              ) : (
                <div className="px-4 py-3">
                  {dateKeys.map((dateKey) => (
                    <div key={dateKey}>
                      {/* Date separator */}
                      <div className="flex items-center gap-2 mb-2 mt-3 first:mt-0">
                        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">{dateKey}</span>
                        <div className="flex-1 h-px bg-white/[0.05]" />
                        <span className="text-[10px] text-gray-700">{groups[dateKey].length} eventos</span>
                      </div>

                      {/* Events */}
                      <div className="relative">
                        {/* Vertical line */}
                        <div className="absolute left-2 top-2 bottom-2 w-px bg-white/[0.06]" />

                        <div className="space-y-1 ml-6">
                          {groups[dateKey].map((ev, i) => {
                            const cfg = EVENT_CONFIG[ev.type] ?? { dot: 'bg-gray-500', icon: '📌', label: ev.type };
                            return (
                              <div key={i} className="relative flex items-start gap-2.5 py-1.5">
                                {/* Dot on timeline */}
                                <div className={`absolute -left-6 top-2 w-3 h-3 rounded-full border-2 border-gray-900 ${cfg.dot} shrink-0`} />

                                {/* Time */}
                                <span className="text-[10px] text-gray-600 shrink-0 mt-0.5 w-10 tabular-nums">
                                  {fmtTime(ev.occurred_at ?? ev.time ?? ev.created_at)}
                                </span>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm leading-none">{cfg.icon}</span>
                                    <p className="text-xs font-semibold text-white truncate">{ev.title ?? cfg.label}</p>
                                  </div>
                                  {ev.description && (
                                    <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{ev.description}</p>
                                  )}
                                  {ev.amount != null && ev.amount !== 0 && (
                                    <p className={`text-[10px] font-bold mt-0.5 ${ev.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                      {ev.amount > 0 ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ev.amount)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer stats */}
            {events.length > 0 && (
              <div className="border-t border-white/[0.06] px-4 py-3 shrink-0">
                <div className="flex items-center justify-around">
                  <div className="text-center">
                    <p className="text-xs font-black text-white">{events.filter(e => e.type?.startsWith('order_created')).length}</p>
                    <p className="text-[10px] text-gray-600">pedidos</p>
                  </div>
                  <div className="w-px h-8 bg-white/[0.06]" />
                  <div className="text-center">
                    <p className="text-xs font-black text-red-400">{events.filter(e => e.type === 'order_cancelled').length}</p>
                    <p className="text-[10px] text-gray-600">cancelados</p>
                  </div>
                  <div className="w-px h-8 bg-white/[0.06]" />
                  <div className="text-center">
                    <p className="text-xs font-black text-orange-400">{events.filter(e => e.type === 'low_stock').length}</p>
                    <p className="text-[10px] text-gray-600">alertas estoque</p>
                  </div>
                  <div className="w-px h-8 bg-white/[0.06]" />
                  <div className="text-center">
                    <p className="text-xs font-black text-white">{events.length}</p>
                    <p className="text-[10px] text-gray-600">total</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
