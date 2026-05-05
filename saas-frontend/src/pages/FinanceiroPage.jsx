import { useState, useEffect, useCallback } from 'react';
import { getSummary } from '../api/financeiro';

// ── Formatters ────────────────────────────────────────────────

const fmtBRL = (n) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n ?? 0);

const fmtNum = (n) =>
  new Intl.NumberFormat('pt-BR').format(n ?? 0);

// ── Period config ─────────────────────────────────────────────

const PERIODS = [
  { id: 'today', label: 'Hoje' },
  { id: 'week',  label: '7 Dias' },
  { id: 'month', label: 'Este Mês' },
];

// ── Channel display ───────────────────────────────────────────

const CHANNEL_DISPLAY = {
  ifood:    { label: 'iFood',    emoji: '🛵', color: '#ef4444' },
  whatsapp: { label: 'WhatsApp', emoji: '💬', color: '#22c55e' },
  mesa:     { label: 'Mesa',     emoji: '🪑', color: '#3b82f6' },
  balcao:   { label: 'Balcão',   emoji: '🏪', color: '#a855f7' },
  telefone: { label: 'Telefone', emoji: '📞', color: '#f59e0b' },
  manual:   { label: 'Manual',   emoji: '✏️', color: '#6b7280' },
};
const getChannel = (ch) =>
  CHANNEL_DISPLAY[ch?.toLowerCase?.()] ?? { label: ch ?? '—', emoji: '📦', color: '#6b7280' };

// ── Bar chart (pure CSS) ──────────────────────────────────────

function BarChart({ data, formatX, formatTooltip, color = '#3b82f6' }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex items-end gap-[3px] h-32 w-full">
      {data.map((d, i) => {
        const pct = Math.max((d.value / max) * 100, d.value > 0 ? 3 : 0);
        return (
          <div
            key={i}
            className="flex flex-col items-center gap-0.5 flex-1 min-w-0 h-full justify-end group"
          >
            <div
              className="w-full rounded-t-sm transition-all duration-500 relative cursor-default"
              style={{ height: `${pct}%`, backgroundColor: color + 'aa' }}
              title={formatTooltip ? formatTooltip(d) : String(d.value)}
            >
              {/* Hover tooltip */}
              {d.value > 0 && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-gray-900 border border-white/10 rounded text-[10px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {formatTooltip ? formatTooltip(d) : d.value}
                </div>
              )}
            </div>
            <span className="text-[9px] text-gray-600 truncate w-full text-center leading-none mt-0.5">
              {formatX ? formatX(d) : d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Metric card ───────────────────────────────────────────────

function MetricCard({ label, value, sub, icon, color = 'blue' }) {
  const colors = {
    blue:   'bg-blue-500/10 border-blue-500/25 text-blue-400',
    green:  'bg-green-500/10 border-green-500/25 text-green-400',
    orange: 'bg-orange-500/10 border-orange-500/25 text-orange-400',
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[color]}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
          <p className="text-2xl font-black text-white mt-1 leading-tight">{value}</p>
          {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

export default function FinanceiroPage() {
  const [period,  setPeriod]  = useState('today');
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await getSummary(period);
      setData(res.data);
    } catch {
      setError('Erro ao carregar dados financeiros.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  // ── Chart data ──────────────────────────────────────────────

  const chartData = (() => {
    if (!data?.timeSeries) return [];
    if (period === 'today') {
      return data.timeSeries.map((r) => ({
        label: `${String(r.hour).padStart(2, '0')}h`,
        value: r.revenue,
        count: r.count,
      }));
    }
    return data.timeSeries.map((r) => {
      const d = new Date(r.date + 'T12:00:00');
      return {
        label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        value: r.revenue,
        count: r.count,
      };
    });
  })();

  // Max channel revenue for relative bar
  const maxChRevenue = Math.max(...(data?.byChannel ?? []).map((c) => c.revenue), 1);

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 bg-gray-900/80 backdrop-blur border-b border-white/5 shrink-0">
        <h1 className="text-lg font-black text-white">💰 Financeiro</h1>

        {/* Period selector */}
        <div className="flex items-center gap-1 bg-gray-800/70 rounded-xl p-1">
          {PERIODS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setPeriod(id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                period === id
                  ? 'bg-gray-700 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={load}
          title="Atualizar"
          className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-5 space-y-6">

        {error && (
          <div className="text-center py-12 text-red-400 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data && (
          <>
            {/* ── Metric cards ───────────────────────────────── */}
            <div className="grid grid-cols-3 gap-4">
              <MetricCard
                icon="💵"
                label="Receita"
                value={fmtBRL(data.revenue)}
                sub={`${fmtNum(data.order_count)} pedido${data.order_count !== 1 ? 's' : ''} concluído${data.order_count !== 1 ? 's' : ''}`}
                color="green"
              />
              <MetricCard
                icon="🧾"
                label="Pedidos Concluídos"
                value={fmtNum(data.order_count)}
                sub={period === 'today' ? 'hoje' : period === 'week' ? 'nos últimos 7 dias' : 'neste mês'}
                color="blue"
              />
              <MetricCard
                icon="🎯"
                label="Ticket Médio"
                value={fmtBRL(data.avg_ticket)}
                sub="por pedido"
                color="orange"
              />
            </div>

            {/* ── Revenue chart ───────────────────────────────── */}
            <div className="bg-gray-900/60 rounded-2xl border border-white/[0.06] p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-gray-300">
                  {period === 'today' ? 'Receita por Hora' : 'Receita por Dia'}
                </h2>
                <span className="text-xs text-gray-500">
                  Total: {fmtBRL(data.revenue)}
                </span>
              </div>

              {chartData.every((d) => d.value === 0) ? (
                <div className="h-32 flex items-center justify-center text-gray-600 text-sm italic">
                  Nenhuma venda neste período
                </div>
              ) : (
                <BarChart
                  data={chartData}
                  color="#3b82f6"
                  formatTooltip={(d) => `${d.label}: ${fmtBRL(d.value)} (${d.count} ped.)`}
                />
              )}
            </div>

            {/* ── Bottom grid: channel + top products ─────────── */}
            <div className="grid grid-cols-2 gap-4">

              {/* By channel */}
              <div className="bg-gray-900/60 rounded-2xl border border-white/[0.06] p-4">
                <h2 className="text-sm font-bold text-gray-300 mb-3">Por Canal</h2>
                {data.byChannel.length === 0 ? (
                  <p className="text-sm text-gray-600 italic">Sem dados</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.byChannel.map((ch) => {
                      const info = getChannel(ch.channel);
                      const pct  = (ch.revenue / maxChRevenue) * 100;
                      return (
                        <div key={ch.channel}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{info.emoji}</span>
                              <span className="text-sm text-gray-300 font-medium">{info.label}</span>
                              <span className="text-xs text-gray-500">({ch.count})</span>
                            </div>
                            <span className="text-sm font-semibold text-gray-200 tabular-nums">
                              {fmtBRL(ch.revenue)}
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, backgroundColor: info.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Top products */}
              <div className="bg-gray-900/60 rounded-2xl border border-white/[0.06] p-4">
                <h2 className="text-sm font-bold text-gray-300 mb-3">Top Produtos</h2>
                {data.topProducts.length === 0 ? (
                  <p className="text-sm text-gray-600 italic">Sem dados</p>
                ) : (
                  <div className="space-y-2">
                    {data.topProducts.map((p, i) => {
                      const maxRev = data.topProducts[0]?.revenue ?? 1;
                      const pct    = (p.revenue / maxRev) * 100;
                      return (
                        <div key={p.product_name} className="flex items-center gap-3">
                          <span className="text-xs font-black text-gray-600 w-4 shrink-0 tabular-nums">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <span className="text-xs text-gray-300 truncate font-medium">
                                {p.product_name}
                              </span>
                              <span className="text-xs text-gray-400 tabular-nums shrink-0">
                                {fmtBRL(p.revenue)}
                              </span>
                            </div>
                            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-orange-500/70 transition-all duration-700"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
