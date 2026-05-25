import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

const fmt = (v) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Stars({ n }) {
  return (
    <span className="text-sm">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < n ? 'text-yellow-400' : 'text-gray-700'}>★</span>
      ))}
    </span>
  );
}

function SummaryBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-6 shrink-0 text-right">{label}</span>
      <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%`, transition: 'width 0.5s' }} />
      </div>
      <span className="text-xs text-gray-500 w-8 shrink-0">{count}</span>
    </div>
  );
}

export default function AvaliacoesPage() {
  const [summary,  setSummary]  = useState(null);
  const [ratings,  setRatings]  = useState([]);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        api.get('/ratings/summary'),
        api.get('/ratings?limit=100'),
      ]);
      setSummary(s.data.data ?? s.data);
      setRatings(r.data.data ?? r.data);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const avg    = Number(summary?.average ?? 0);
  const total  = Number(summary?.total ?? 0);
  const five   = Number(summary?.five_star  ?? 0);
  const four   = Number(summary?.four_star  ?? 0);
  const three  = Number(summary?.three_star ?? 0);
  const low    = Number(summary?.low_star   ?? 0);

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-white/[0.06]">
        <h1 className="text-xl font-black text-white">⭐ Avaliações</h1>
        <p className="text-xs text-gray-500 mt-0.5">Feedback dos clientes após entrega</p>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary card */}
          {summary && total > 0 && (
            <div className="bg-gray-800 rounded-2xl p-5 flex gap-6">
              {/* Average */}
              <div className="text-center shrink-0">
                <p className="text-5xl font-black text-yellow-400">{avg.toFixed(1)}</p>
                <Stars n={Math.round(avg)} />
                <p className="text-xs text-gray-500 mt-1">{total} avaliação{total !== 1 ? 'ões' : ''}</p>
              </div>

              {/* Bars */}
              <div className="flex-1 space-y-2">
                <SummaryBar label="5★" count={five}  total={total} color="bg-yellow-400" />
                <SummaryBar label="4★" count={four}  total={total} color="bg-green-400" />
                <SummaryBar label="3★" count={three} total={total} color="bg-blue-400" />
                <SummaryBar label="≤2" count={low}   total={total} color="bg-red-400" />
              </div>
            </div>
          )}

          {/* Empty state */}
          {(!total || ratings.length === 0) && !loading && (
            <div className="flex flex-col items-center justify-center h-48 text-gray-600 gap-3">
              <span className="text-5xl">⭐</span>
              <p className="text-base font-semibold">Nenhuma avaliação ainda</p>
              <p className="text-sm text-center max-w-xs">
                Quando um pedido for marcado como entregue, um link de avaliação é enviado automaticamente ao cliente via WhatsApp.
              </p>
            </div>
          )}

          {/* Ratings list */}
          {ratings.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Últimas avaliações</h2>
              {ratings.map((r, i) => (
                <div key={i} className="bg-gray-800 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-100">
                        {r.customer_name ?? 'Cliente'}
                        <span className="text-gray-500 font-normal ml-2 text-xs">
                          #{r.order_number}
                        </span>
                      </p>
                      <Stars n={r.stars} />
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-500">{new Date(r.created_at).toLocaleDateString('pt-BR')}</p>
                      {r.total > 0 && <p className="text-xs text-orange-400 font-semibold">{fmt(r.total)}</p>}
                    </div>
                  </div>
                  {r.comment && (
                    <p className="text-sm text-gray-400 italic border-l-2 border-white/10 pl-3">
                      "{r.comment}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
