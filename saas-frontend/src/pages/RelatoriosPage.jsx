import { useState, useEffect, useCallback } from 'react';
import { getSummary } from '../api/financeiro';
import { getOrders, getHourlyStats } from '../api/orders';

// ── Formatters ────────────────────────────────────────────────

const fmtBRL = (n) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n ?? 0);

const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('pt-BR') + ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const fmtShortDate = (s) => {
  if (!s) return '—';
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

// ── Constants ─────────────────────────────────────────────────

const PERIODS = [
  { id: 'today', label: 'Hoje' },
  { id: 'week',  label: '7 Dias' },
  { id: 'month', label: 'Este Mês' },
];

const TABS = [
  { id: 'demand',   label: 'Demanda',  icon: '📈' },
  { id: 'products', label: 'Produtos', icon: '🥇' },
  { id: 'history',  label: 'Histórico', icon: '📋' },
  { id: 'horarios', label: 'Horários', icon: '🕐' },
];

const STATUS_META = {
  pending:   { label: 'Pendente',   cls: 'bg-yellow-500/20 text-yellow-300' },
  confirmed: { label: 'Confirmado', cls: 'bg-yellow-500/20 text-yellow-300' },
  preparing: { label: 'Em Preparo', cls: 'bg-blue-500/20 text-blue-300' },
  ready:     { label: 'Pronto',     cls: 'bg-green-500/20 text-green-300' },
  delivered: { label: 'Entregue',   cls: 'bg-green-700/20 text-green-400' },
  cancelled: { label: 'Cancelado',  cls: 'bg-red-500/20 text-red-300' },
};

const CHANNEL_COLOR = {
  ifood:    '#ef4444',
  whatsapp: '#22c55e',
  mesa:     '#3b82f6',
  manual:   '#f97316',
  telefone: '#f59e0b',
  online:   '#06b6d4',
};
const getChannelColor = (ch) => CHANNEL_COLOR[(ch ?? '').toLowerCase()] ?? '#6b7280';

// ── Pure-CSS bar chart ────────────────────────────────────────

/**
 * Vertical bar chart — no external dependency.
 * @param {Array<{label, value, color?}>} data
 * @param {string}  unit      – shown in tooltip (e.g. 'pedidos', 'un.')
 * @param {string}  barColor  – default bar fill (Tailwind bg class or hex via style)
 * @param {number}  height    – chart area height in px
 */
function BarChart({ data = [], unit = '', barColor = '#3b82f6', height = 160 }) {
  if (!data.length) return (
    <div className="flex items-center justify-center text-gray-600 text-sm italic" style={{ height }}>
      Sem dados para exibir
    </div>
  );

  const maxVal  = Math.max(...data.map((d) => d.value), 1);
  // Y-axis: 4 gridlines at 25%, 50%, 75%, 100%
  const gridLines = [1, 0.75, 0.5, 0.25];

  return (
    <div className="relative select-none" style={{ height: height + 36 }}>
      {/* Gridlines + Y labels */}
      {gridLines.map((pct) => {
        const topPx = (1 - pct) * height;
        return (
          <div key={pct} className="absolute left-0 right-0 flex items-center pointer-events-none" style={{ top: topPx }}>
            <span className="text-[10px] text-gray-600 w-8 shrink-0 text-right pr-1.5 tabular-nums leading-none">
              {pct === 1 ? maxVal : Math.round(maxVal * pct)}
            </span>
            <div className="flex-1 border-t border-white/[0.05]" />
          </div>
        );
      })}

      {/* Bars area */}
      <div className="absolute left-9 right-0 flex items-end gap-0.5" style={{ height, bottom: 36 }}>
        {data.map((d, i) => {
          const pct       = maxVal > 0 ? (d.value / maxVal) * 100 : 0;
          const color     = d.color ?? barColor;
          const isHex     = color.startsWith('#');
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end group"
              title={`${d.label}: ${d.value} ${unit}`}
            >
              {/* Value label on hover */}
              {d.value > 0 && (
                <span className="text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity mb-0.5 tabular-nums">
                  {d.value}
                </span>
              )}
              <div
                className="w-full rounded-t-sm transition-all duration-500"
                style={{
                  height:      `${pct}%`,
                  minHeight:   d.value > 0 ? 2 : 0,
                  background:  isHex ? color : undefined,
                  backgroundColor: !isHex ? color : undefined,
                  opacity: d.value === 0 ? 0.15 : 0.85,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* X labels */}
      <div className="absolute left-9 right-0 flex items-start gap-0.5" style={{ top: height + 4 }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[9px] text-gray-500 leading-tight block truncate px-0.5">
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Horizontal bar (ranking items) ───────────────────────────

function HBarChart({ data = [], maxValue }) {
  if (!data.length) return (
    <p className="text-gray-600 text-sm italic text-center py-6">Sem dados</p>
  );

  const max = maxValue ?? Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3 group">
          {/* Rank */}
          <span className="text-xs font-black text-gray-500 w-5 shrink-0 text-right tabular-nums">
            {i + 1}
          </span>
          {/* Label */}
          <span className="text-sm text-gray-300 w-36 shrink-0 truncate" title={d.label}>
            {d.label}
          </span>
          {/* Bar */}
          <div className="flex-1 bg-gray-800/60 rounded-full h-3 relative overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width:      `${max > 0 ? (d.value / max) * 100 : 0}%`,
                background: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : '#3b82f6',
              }}
            />
          </div>
          {/* Values */}
          <div className="text-right shrink-0 w-28">
            <span className="text-xs font-bold text-white tabular-nums">{d.qty} un.</span>
            <span className="text-xs text-gray-500 ml-2 tabular-nums">{fmtBRL(d.revenue)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue:   'bg-blue-500/10   border-blue-500/20   text-blue-400',
    green:  'bg-green-500/10  border-green-500/20  text-green-400',
    orange: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
    purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[color]}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold opacity-70 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-black text-white mt-1 leading-tight tabular-nums">{value}</p>
          {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}

// ── History detail row ────────────────────────────────────────

function HistoryDetail({ order }) {
  return (
    <tr>
      <td colSpan={8} className="px-4 pb-3 pt-0">
        <div className="bg-gray-800/50 rounded-xl p-3 border border-white/[0.05] ml-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Itens</p>
              <ul className="space-y-0.5">
                {(order.items ?? []).map((item, i) => (
                  <li key={i} className="flex justify-between text-sm">
                    <span className="text-gray-300">
                      {item.weight_kg ? `${item.weight_kg}kg` : `${item.quantity}×`} {item.product_name}
                    </span>
                    <span className="text-gray-500 ml-4 tabular-nums">{fmtBRL(item.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-1 text-sm">
              {order.customer_name  && <p className="text-gray-300"><span className="text-gray-500">Cliente: </span>{order.customer_name}</p>}
              {order.customer_phone && <p className="text-gray-300"><span className="text-gray-500">Tel: </span>{order.customer_phone}</p>}
              {order.notes          && <p className="text-gray-400 italic"><span className="not-italic text-gray-500">Obs: </span>{order.notes}</p>}
              <p className="text-gray-500 text-xs mt-2">
                {order.delivery_type === 'delivery' ? '🛵 Entrega' : '🏪 Retirada'}
                {' · '}
                {{cash:'💵 Dinheiro',pix:'📱 Pix',credit:'💳 Crédito',debit:'💳 Débito',voucher:'🎫 Vale',pending:'⏳ A cobrar'}[order.payment_method] ?? order.payment_method}
              </p>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Heatmap (hourly grid) ─────────────────────────────────────

/**
 * Renders a 24-cell heatmap row. Each cell = 1 hour of the day.
 * Intensity driven by `orders` count.
 */
function HeatmapGrid({ data = [], metric = 'orders' }) {
  if (!data.length) return (
    <p className="text-gray-600 text-sm italic text-center py-8">Sem dados para exibir</p>
  );

  const maxVal = Math.max(...data.map((d) => d[metric]), 1);

  const fmtHour = (h) => `${String(h).padStart(2, '0')}h`;
  const fmtRevenue = (n) =>
    n >= 1000 ? `R$${(n / 1000).toFixed(1)}k` : `R$${n.toFixed(0)}`;

  // Color: cool → warm (blue → orange → red)
  const getColor = (val) => {
    const pct = maxVal > 0 ? val / maxVal : 0;
    if (pct === 0) return 'bg-gray-800/60';
    if (pct < 0.2)  return 'bg-blue-500/20';
    if (pct < 0.4)  return 'bg-blue-500/40';
    if (pct < 0.6)  return 'bg-orange-400/50';
    if (pct < 0.8)  return 'bg-orange-500/70';
    return 'bg-red-500/80';
  };

  const getTextColor = (val) => {
    const pct = maxVal > 0 ? val / maxVal : 0;
    if (pct === 0) return 'text-gray-700';
    if (pct < 0.4)  return 'text-blue-300';
    return 'text-white';
  };

  // Split into rows: 0-5 (madrugada), 6-11 (manhã), 12-17 (tarde), 18-23 (noite)
  const periods = [
    { label: '🌙 Madrugada', hours: data.slice(0, 6) },
    { label: '🌅 Manhã',    hours: data.slice(6, 12) },
    { label: '☀️ Tarde',    hours: data.slice(12, 18) },
    { label: '🌆 Noite',    hours: data.slice(18, 24) },
  ];

  return (
    <div className="space-y-3">
      {periods.map(({ label, hours }) => (
        <div key={label} className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-28 shrink-0 font-semibold">{label}</span>
          <div className="flex-1 grid grid-cols-6 gap-1">
            {hours.map((d) => (
              <div
                key={d.hour}
                className={`relative rounded-lg p-2 text-center transition-all group cursor-default ${getColor(d[metric])}`}
                title={`${fmtHour(d.hour)}: ${d.orders} pedidos · ${fmtRevenue(d.revenue)}`}
              >
                <div className={`text-[10px] font-bold ${getTextColor(d[metric])}`}>
                  {d[metric] > 0 ? (metric === 'orders' ? d.orders : fmtRevenue(d.revenue)) : '·'}
                </div>
                <div className="text-[9px] text-gray-500 mt-0.5">{fmtHour(d.hour)}</div>
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-10 pointer-events-none">
                  <div className="bg-gray-800 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] whitespace-nowrap shadow-xl">
                    <p className="text-white font-bold">{fmtHour(d.hour)}</p>
                    <p className="text-blue-400">{d.orders} pedidos</p>
                    <p className="text-green-400">{fmtRevenue(d.revenue)}</p>
                    {d.orders > 0 && <p className="text-gray-400">Ticket: {fmtRevenue(d.avg_ticket)}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Legend */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[10px] text-gray-600">Menos</span>
        {['bg-gray-800/60', 'bg-blue-500/20', 'bg-blue-500/40', 'bg-orange-400/50', 'bg-orange-500/70', 'bg-red-500/80'].map((cls, i) => (
          <div key={i} className={`w-4 h-4 rounded ${cls}`} />
        ))}
        <span className="text-[10px] text-gray-600">Mais</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

const PAGE_SIZE = 100;

export default function RelatoriosPage() {
  const [period,       setPeriod]       = useState('today');
  const [activeTab,    setActiveTab]    = useState('demand');
  const [summary,      setSummary]      = useState(null);
  const [orders,       setOrders]       = useState([]);
  const [hourlyData,   setHourlyData]   = useState([]);
  const [heatMetric,   setHeatMetric]   = useState('orders');
  const [loadingSum,   setLoadingSum]   = useState(true);
  const [loadingHist,  setLoadingHist]  = useState(true);
  const [loadingHeat,  setLoadingHeat]  = useState(false);
  const [expanded,     setExpanded]     = useState(null);

  // ── Fetch summary (charts + KPIs) ────────────────────────────
  const fetchSummary = useCallback(async () => {
    setLoadingSum(true);
    try {
      const { data } = await getSummary(period);
      setSummary(data.data);
    } catch { /* non-fatal */ }
    finally { setLoadingSum(false); }
  }, [period]);

  // ── Fetch orders for history tab ─────────────────────────────
  const fetchOrders = useCallback(async () => {
    setLoadingHist(true);
    try {
      const startDate = (() => {
        const now = new Date();
        if (period === 'today') return now.toISOString().slice(0, 10);
        if (period === 'week') {
          const d = new Date(); d.setDate(d.getDate() - 6);
          return d.toISOString().slice(0, 10);
        }
        return `${now.toISOString().slice(0, 7)}-01`;
      })();
      const { data } = await getOrders({ limit: PAGE_SIZE, startDate });
      setOrders(data.data ?? []);
    } catch { /* non-fatal */ }
    finally { setLoadingHist(false); }
  }, [period]);

  // ── Fetch hourly heatmap (always last 30 days for full picture) ──
  const fetchHourly = useCallback(async () => {
    setLoadingHeat(true);
    try {
      const endDate   = new Date().toISOString().slice(0, 10);
      const startDate = (() => {
        const d = new Date();
        if (period === 'today') return d.toISOString().slice(0, 10);
        if (period === 'week')  { d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); }
        return `${d.toISOString().slice(0, 7)}-01`;
      })();
      const { data } = await getHourlyStats({ startDate, endDate });
      setHourlyData(data.data ?? []);
    } catch { /* non-fatal */ }
    finally { setLoadingHeat(false); }
  }, [period]);

  useEffect(() => {
    fetchSummary();
    fetchOrders();
    fetchHourly();
  }, [fetchSummary, fetchOrders, fetchHourly]);

  // ── Derived data ──────────────────────────────────────────────

  const isToday = period === 'today';

  // Time series data for bar chart
  const timeSeriesData = (summary?.timeSeries ?? []).map((d) => ({
    label: isToday
      ? `${String(d.hour ?? 0).padStart(2, '0')}h`
      : fmtShortDate(d.date),
    value: d.count,
    revenue: d.revenue,
  }));

  // Only show hours 6h–23h for today (less noise)
  const visibleTimeSeries = isToday
    ? timeSeriesData.slice(6)
    : timeSeriesData;

  // Revenue time series
  const revenueSeriesData = (summary?.timeSeries ?? [])
    .slice(isToday ? 6 : 0)
    .map((d) => ({
      label: isToday
        ? `${String(d.hour ?? 0).padStart(2, '0')}h`
        : fmtShortDate(d.date),
      value: Math.round(d.revenue),
      color: '#22c55e',
    }));

  // Top products
  const topProducts = (summary?.topProducts ?? []).map((p) => ({
    label:   p.product_name,
    qty:     Math.round(p.total_qty),
    revenue: p.revenue,
    value:   Math.round(p.total_qty),
  }));

  // By channel
  const byChannel = (summary?.byChannel ?? []).map((c) => ({
    label: c.channel ?? 'manual',
    value: c.count,
    revenue: c.revenue,
    color: getChannelColor(c.channel),
  }));

  // KPIs
  const revenue    = summary?.revenue    ?? 0;
  const orderCount = summary?.order_count ?? 0;
  const avgTicket  = summary?.avg_ticket  ?? 0;
  const topProduct = topProducts[0]?.label ?? '—';

  // History stats
  const cancelledCount = orders.filter((o) => o.status === 'cancelled').length;
  const pendingCount   = orders.filter((o) => ['pending','confirmed','preparing','ready'].includes(o.status)).length;

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────── */}
      <div className="px-5 py-3.5 bg-gray-900/80 backdrop-blur border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-black text-white">📊 Relatórios</h1>

          {/* Period selector */}
          <div className="flex gap-1 bg-gray-800/60 rounded-xl p-1 border border-white/[0.06]">
            {PERIODS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setPeriod(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  period === id
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={() => { fetchSummary(); fetchOrders(); fetchHourly(); }}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Atualizar"
          >
            <svg className={`w-4 h-4 ${loadingSum ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-4 space-y-4 max-w-7xl mx-auto">

          {/* ── KPI Cards ──────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              icon="💰" color="green" label="Total em Vendas"
              value={loadingSum ? '…' : fmtBRL(revenue)}
              sub={`${orderCount} pedido${orderCount !== 1 ? 's' : ''} faturado${orderCount !== 1 ? 's' : ''}`}
            />
            <KpiCard
              icon="🧾" color="blue" label="Ticket Médio"
              value={loadingSum ? '…' : fmtBRL(avgTicket)}
              sub={orderCount > 0 ? `Maior: ${fmtBRL(Math.max(...orders.filter(o=>['ready','delivered'].includes(o.status)).map(o=>parseFloat(o.total??0)),0))}` : '—'}
            />
            <KpiCard
              icon="📦" color="orange" label="Pedidos Ativos"
              value={loadingHist ? '…' : pendingCount}
              sub={cancelledCount > 0 ? `${cancelledCount} cancelado${cancelledCount>1?'s':''}` : 'Nenhum cancelado'}
            />
            <KpiCard
              icon="🏆" color="purple" label="Mais Vendido"
              value={loadingSum ? '…' : (topProduct.length > 14 ? topProduct.slice(0, 13) + '…' : topProduct)}
              sub={topProducts[0] ? `${topProducts[0].qty} un · ${fmtBRL(topProducts[0].revenue)}` : '—'}
            />
          </div>

          {/* ── Sub-tabs ──────────────────────────────────── */}
          <div className="flex gap-1 border-b border-white/[0.06] pb-0">
            {TABS.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px ${
                  activeTab === id
                    ? 'border-orange-500 text-orange-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                <span>{icon}</span> {label}
              </button>
            ))}
          </div>

          {/* ════════════════════════════════════════════════ */}
          {/* TAB: DEMANDA                                     */}
          {/* ════════════════════════════════════════════════ */}
          {activeTab === 'demand' && (
            <div className="space-y-4">

              {/* Pedidos por hora/dia */}
              <div className="bg-gray-900/60 rounded-2xl border border-white/[0.06] p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-black text-white">
                      {isToday ? 'Pedidos por Hora (hoje)' : 'Pedidos por Dia'}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {isToday ? 'Quantidade de pedidos entregues/prontos por hora' : 'Pedidos concluídos no período'}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 px-2 py-1 rounded-lg">
                    {orderCount} pedido{orderCount !== 1 ? 's' : ''}
                  </span>
                </div>
                {loadingSum ? (
                  <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <BarChart
                    data={visibleTimeSeries}
                    unit="pedidos"
                    barColor="#3b82f6"
                    height={160}
                  />
                )}
              </div>

              {/* Faturamento por hora/dia */}
              <div className="bg-gray-900/60 rounded-2xl border border-white/[0.06] p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-black text-white">
                      {isToday ? 'Faturamento por Hora' : 'Faturamento por Dia'}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">Valor total (pedidos prontos/entregues)</p>
                  </div>
                  <span className="text-xs font-semibold text-green-400 bg-green-500/10 px-2 py-1 rounded-lg">
                    {fmtBRL(revenue)}
                  </span>
                </div>
                {loadingSum ? (
                  <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <BarChart
                    data={revenueSeriesData}
                    unit="R$"
                    barColor="#22c55e"
                    height={140}
                  />
                )}
              </div>

              {/* Por canal */}
              {byChannel.length > 0 && (
                <div className="bg-gray-900/60 rounded-2xl border border-white/[0.06] p-4">
                  <h2 className="text-sm font-black text-white mb-4">Pedidos por Canal de Venda</h2>
                  <div className="flex gap-3 flex-wrap">
                    {byChannel.map((c) => (
                      <div
                        key={c.label}
                        className="flex-1 min-w-32 rounded-xl border border-white/[0.07] p-3 space-y-1"
                        style={{ borderLeftColor: c.color, borderLeftWidth: 3 }}
                      >
                        <p className="text-xs font-semibold text-gray-300 capitalize">{c.label}</p>
                        <p className="text-lg font-black text-white">{c.value}</p>
                        <p className="text-xs text-gray-500">{fmtBRL(c.revenue)}</p>
                      </div>
                    ))}
                  </div>
                  {/* Canal bar chart */}
                  <div className="mt-4">
                    <BarChart
                      data={byChannel}
                      unit="pedidos"
                      height={120}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════ */}
          {/* TAB: PRODUTOS                                    */}
          {/* ════════════════════════════════════════════════ */}
          {activeTab === 'products' && (
            <div className="space-y-4">

              {/* Bar chart horizontal */}
              <div className="bg-gray-900/60 rounded-2xl border border-white/[0.06] p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-black text-white">Ranking de Produtos Mais Vendidos</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Por quantidade vendida (pedidos concluídos)</p>
                  </div>
                  <span className="text-xs text-gray-500">{topProducts.length} produto{topProducts.length !== 1 ? 's' : ''}</span>
                </div>
                {loadingSum ? (
                  <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : topProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-600">
                    <span className="text-4xl">📦</span>
                    <p className="text-sm italic">Nenhum produto vendido neste período</p>
                  </div>
                ) : (
                  <HBarChart data={topProducts} />
                )}
              </div>

              {/* Bar chart vertical (top 10 qty) */}
              {topProducts.length > 0 && (
                <div className="bg-gray-900/60 rounded-2xl border border-white/[0.06] p-4">
                  <h2 className="text-sm font-black text-white mb-4">Gráfico — Unidades Vendidas</h2>
                  <BarChart
                    data={topProducts.map((p) => ({
                      label: p.label.split(' ').slice(0, 2).join(' '),
                      value: p.qty,
                      color: '#f97316',
                    }))}
                    unit="un."
                    barColor="#f97316"
                    height={180}
                  />
                </div>
              )}

              {/* Table */}
              {topProducts.length > 0 && (
                <div className="bg-gray-900/60 rounded-2xl border border-white/[0.06] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-white/[0.06] bg-gray-900/40">
                        <th className="px-4 py-3 font-semibold">#</th>
                        <th className="px-4 py-3 font-semibold">Produto</th>
                        <th className="px-4 py-3 font-semibold text-right">Qtd Vendida</th>
                        <th className="px-4 py-3 font-semibold text-right">Faturamento</th>
                        <th className="px-4 py-3 font-semibold text-right">Ticket Médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((p, i) => (
                        <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3">
                            <span className={`text-xs font-black ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-700' : 'text-gray-600'}`}>
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-200">{p.label}</td>
                          <td className="px-4 py-3 text-right font-black text-white tabular-nums">{p.qty}</td>
                          <td className="px-4 py-3 text-right text-green-400 font-semibold tabular-nums">{fmtBRL(p.revenue)}</td>
                          <td className="px-4 py-3 text-right text-gray-400 tabular-nums">
                            {p.qty > 0 ? fmtBRL(p.revenue / p.qty) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-900/40 border-t border-white/[0.06]">
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3 text-xs font-semibold text-gray-500">TOTAL</td>
                        <td className="px-4 py-3 text-right font-black text-white tabular-nums">
                          {topProducts.reduce((s, p) => s + p.qty, 0)}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-green-400 tabular-nums">
                          {fmtBRL(topProducts.reduce((s, p) => s + p.revenue, 0))}
                        </td>
                        <td className="px-4 py-3" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════ */}
          {/* TAB: HISTÓRICO                                   */}
          {/* ════════════════════════════════════════════════ */}
          {activeTab === 'history' && (
            <div className="space-y-4">

              {/* Summary strip */}
              {!loadingHist && orders.length > 0 && (
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {Object.entries(
                    orders.reduce((acc, o) => {
                      acc[o.status] = (acc[o.status] ?? 0) + 1;
                      return acc;
                    }, {})
                  ).map(([status, count]) => {
                    const meta = STATUS_META[status] ?? { label: status, cls: 'bg-gray-700/20 text-gray-400' };
                    return (
                      <div key={status} className={`rounded-xl px-3 py-2 text-center ${meta.cls} bg-opacity-20`}>
                        <p className="text-lg font-black">{count}</p>
                        <p className="text-xs opacity-70">{meta.label}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Table */}
              <div className="bg-gray-900/60 rounded-2xl border border-white/[0.06] overflow-hidden">
                {loadingHist && orders.length === 0 ? (
                  <div className="flex justify-center py-16">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
                    <span className="text-5xl">📋</span>
                    <p className="text-sm italic">Nenhum pedido neste período</p>
                  </div>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 border-b border-white/[0.06] bg-gray-900/40">
                          <th className="px-4 py-3 font-semibold w-6" />
                          <th className="px-4 py-3 font-semibold">#</th>
                          <th className="px-4 py-3 font-semibold">Canal</th>
                          <th className="px-4 py-3 font-semibold">Cliente</th>
                          <th className="px-4 py-3 font-semibold">Itens</th>
                          <th className="px-4 py-3 font-semibold text-right">Total</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 font-semibold">Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => {
                          const meta      = STATUS_META[o.status] ?? { label: o.status, cls: 'bg-gray-700 text-gray-300' };
                          const isOpen    = expanded === o.id;
                          const isRevenue = ['ready', 'delivered'].includes(o.status);
                          return [
                            <tr
                              key={o.id}
                              onClick={() => setExpanded(isOpen ? null : o.id)}
                              className="hover:bg-white/[0.02] cursor-pointer transition-colors border-b border-white/[0.03]"
                            >
                              <td className="px-4 py-2.5">
                                <svg className={`w-3 h-3 text-gray-600 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </td>
                              <td className="px-4 py-2.5 font-black text-white tabular-nums">#{o.order_number}</td>
                              <td className="px-4 py-2.5 text-gray-400 capitalize">{o.channel ?? '—'}</td>
                              <td className="px-4 py-2.5 text-gray-300">{o.customer_name || <span className="text-gray-600 italic">—</span>}</td>
                              <td className="px-4 py-2.5 text-gray-400">{(o.items ?? []).length} item{(o.items ?? []).length !== 1 ? 's' : ''}</td>
                              <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${isRevenue ? 'text-green-400' : 'text-gray-500'}`}>
                                {fmtBRL(o.total)}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
                              </td>
                              <td className="px-4 py-2.5 text-gray-500 text-xs tabular-nums whitespace-nowrap">
                                {fmtDate(o.created_at)}
                              </td>
                            </tr>,
                            isOpen && <HistoryDetail key={`${o.id}-d`} order={o} />,
                          ];
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Revenue footer */}
              {orders.length > 0 && !loadingHist && (
                <div className="flex items-center justify-between px-4 py-3 bg-gray-900/40 rounded-xl border border-white/[0.06] text-sm">
                  <span className="text-gray-500">{orders.length} pedido{orders.length !== 1 ? 's' : ''} no período</span>
                  <span className="text-green-400 font-black">
                    {fmtBRL(orders.filter((o) => ['ready','delivered'].includes(o.status)).reduce((s,o) => s + parseFloat(o.total??0), 0))} faturado
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════ */}
          {/* TAB: HORÁRIOS (HEATMAP)                          */}
          {/* ════════════════════════════════════════════════ */}
          {activeTab === 'horarios' && (
            <div className="space-y-4">

              {/* Peak hours summary */}
              {hourlyData.length > 0 && (() => {
                const topHour = [...hourlyData].sort((a, b) => b.orders - a.orders)[0];
                const topRev  = [...hourlyData].sort((a, b) => b.revenue - a.revenue)[0];
                const totalOrders = hourlyData.reduce((s, d) => s + d.orders, 0);
                return (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
                      <p className="text-xs text-blue-400 font-semibold uppercase tracking-wide">Horário de Pico</p>
                      <p className="text-2xl font-black text-white mt-1">
                        {String(topHour.hour).padStart(2,'0')}h
                      </p>
                      <p className="text-xs text-blue-300/70 mt-0.5">{topHour.orders} pedidos</p>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4">
                      <p className="text-xs text-green-400 font-semibold uppercase tracking-wide">Maior Receita</p>
                      <p className="text-2xl font-black text-white mt-1">
                        {String(topRev.hour).padStart(2,'0')}h
                      </p>
                      <p className="text-xs text-green-300/70 mt-0.5">
                        {fmtBRL(topRev.revenue)}
                      </p>
                    </div>
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
                      <p className="text-xs text-orange-400 font-semibold uppercase tracking-wide">Total do Período</p>
                      <p className="text-2xl font-black text-white mt-1">{totalOrders}</p>
                      <p className="text-xs text-orange-300/70 mt-0.5">pedidos analisados</p>
                    </div>
                  </div>
                );
              })()}

              {/* Heatmap grid */}
              <div className="bg-gray-900/60 rounded-2xl border border-white/[0.06] p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-black text-white">🕐 Mapa de Calor por Hora</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Intensidade de pedidos em cada hora do dia no período selecionado
                    </p>
                  </div>
                  {/* Metric toggle */}
                  <div className="flex gap-1 bg-gray-800/60 rounded-lg p-0.5 border border-white/[0.06]">
                    {[{ id: 'orders', label: 'Pedidos' }, { id: 'revenue', label: 'Receita' }].map(({ id, label }) => (
                      <button
                        key={id}
                        onClick={() => setHeatMetric(id)}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                          heatMetric === id ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {loadingHeat ? (
                  <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <HeatmapGrid data={hourlyData} metric={heatMetric} />
                )}
              </div>

              {/* Hourly table */}
              {!loadingHeat && hourlyData.filter((d) => d.orders > 0).length > 0 && (
                <div className="bg-gray-900/60 rounded-2xl border border-white/[0.06] overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/[0.06]">
                    <h2 className="text-sm font-black text-white">Detalhamento por Hora</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.05]">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Hora</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Pedidos</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Faturamento</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ticket Médio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.03]">
                        {hourlyData
                          .filter((d) => d.orders > 0)
                          .sort((a, b) => b.orders - a.orders)
                          .map((d) => (
                            <tr key={d.hour} className="hover:bg-white/[0.02] transition-colors">
                              <td className="px-4 py-2.5 font-bold text-white tabular-nums">
                                {String(d.hour).padStart(2,'0')}:00 – {String(d.hour).padStart(2,'0')}:59
                              </td>
                              <td className="px-4 py-2.5 text-right text-blue-400 font-semibold tabular-nums">{d.orders}</td>
                              <td className="px-4 py-2.5 text-right text-green-400 font-semibold tabular-nums">{fmtBRL(d.revenue)}</td>
                              <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums">{fmtBRL(d.avg_ticket)}</td>
                            </tr>
                          ))
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
