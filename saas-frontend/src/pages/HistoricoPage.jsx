import { useState, useEffect, useCallback } from 'react';
import { getOrders } from '../api/orders';
import { issueNfce, checkNfce } from '../api/nfce';
import { printOrder } from '../utils/print';

// ── Helpers ───────────────────────────────────────────────────

const fmtBRL  = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2)}`;
const fmtDate = (s) => {
  const d = new Date(s);
  return d.toLocaleDateString('pt-BR') + ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const STATUS_META = {
  pending:   { label: 'Pendente',   cls: 'bg-yellow-500/20 text-yellow-300' },
  confirmed: { label: 'Confirmado', cls: 'bg-yellow-500/20 text-yellow-300' },
  preparing: { label: 'Em Preparo', cls: 'bg-blue-500/20 text-blue-300' },
  ready:     { label: 'Pronto',     cls: 'bg-green-500/20 text-green-300' },
  delivered: { label: 'Entregue',   cls: 'bg-green-700/20 text-green-400' },
  cancelled: { label: 'Cancelado',  cls: 'bg-red-500/20 text-red-300' },
};

const STATUSES = ['', 'pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
const STATUS_LABELS = {
  '': 'Todos', pending: 'Pendente', confirmed: 'Confirmado',
  preparing: 'Em Preparo', ready: 'Pronto', delivered: 'Entregue', cancelled: 'Cancelado',
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const weekAgoISO = () => {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
};

// ── Order detail row ──────────────────────────────────────────

function NfceButton({ order, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState(null);

  const nfceStatus = order.nfce_status;
  const issued     = nfceStatus === 'Issued';

  const handleIssue = async () => {
    setBusy(true); setErr(null);
    try {
      const { data } = await issueNfce(order.id);
      onUpdate(order.id, data);
    } catch (e) {
      setErr(e?.response?.data?.message ?? 'Erro ao emitir NFC-e');
    } finally {
      setBusy(false);
    }
  };

  const handleCheck = async () => {
    setBusy(true); setErr(null);
    try {
      const { data } = await checkNfce(order.id);
      onUpdate(order.id, data);
    } catch (e) {
      setErr(e?.response?.data?.message ?? 'Erro ao consultar status');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      {!nfceStatus && (
        <button
          onClick={handleIssue}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 transition-colors disabled:opacity-50"
        >
          {busy ? '⏳ Emitindo...' : '🧾 Emitir NFC-e'}
        </button>
      )}
      {nfceStatus && (
        <>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
            issued ? 'bg-emerald-500/20 text-emerald-300' : 'bg-yellow-500/20 text-yellow-300'
          }`}>
            NF-e: {nfceStatus}
            {order.nfce_number && ` #${order.nfce_number}`}
          </span>
          {order.nfce_url && (
            <a
              href={order.nfce_url}
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 transition-colors"
            >
              📄 PDF
            </a>
          )}
          {!issued && (
            <button
              onClick={handleCheck}
              disabled={busy}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-700/60 hover:bg-gray-700 text-gray-300 border border-white/10 transition-colors disabled:opacity-50"
            >
              {busy ? '⏳' : '🔄 Atualizar status'}
            </button>
          )}
        </>
      )}
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}

function DetailRow({ order, onNfceUpdate }) {
  return (
    <tr>
      <td colSpan={8} className="px-4 pb-3">
        <div className="bg-gray-800/60 rounded-xl p-3 border border-white/[0.05]">
          <div className="grid grid-cols-2 gap-4">
            {/* Items */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Itens</p>
              <ul className="space-y-1">
                {(order.items ?? []).map((item, i) => (
                  <li key={i} className="flex justify-between text-sm">
                    <span className="text-gray-300">
                      {item.weight_kg ? `${item.weight_kg}kg` : `${item.quantity}×`} {item.product_name}
                    </span>
                    <span className="text-gray-500 ml-4">{fmtBRL(item.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
            {/* Info + ações */}
            <div className="space-y-1 text-sm">
              {order.customer_name  && <p className="text-gray-300"><span className="text-gray-500">Cliente: </span>{order.customer_name}</p>}
              {order.customer_phone && <p className="text-gray-300"><span className="text-gray-500">Tel: </span>{order.customer_phone}</p>}
              {order.notes          && <p className="text-gray-300"><span className="text-gray-500">Obs: </span>{order.notes}</p>}
              <p className="text-gray-400 text-xs mt-2">Criado: {fmtDate(order.created_at)}</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => printOrder({
                    ...order,
                    orderNumber:     order.order_number,
                    customerName:    order.customer_name,
                    customerPhone:   order.customer_phone,
                    customerAddress: order.customer_address,
                    deliveryType:    order.delivery_type,
                    deliveryFee:     order.delivery_fee,
                    paymentMethod:   order.payment_method,
                    // normaliza itens: snake_case → camelCase para printOrder
                    items: (order.items ?? []).filter(i => i && i.id).map(i => ({
                      ...i,
                      productName:  i.productName  ?? i.product_name,
                      weightKg:     i.weightKg     ?? i.weight_kg ?? null,
                      printerTarget: i.printerTarget ?? i.printer_target ?? 'kitchen',
                      addons:  Array.isArray(i.addons)  ? i.addons  : [],
                      choices: Array.isArray(i.choices) ? i.choices : [],
                    })),
                  })}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-700/60 hover:bg-gray-700 text-gray-300 border border-white/10 transition-colors"
                >
                  🖨️ Reimprimir
                </button>
              </div>
            </div>
          </div>
          {/* NFC-e */}
          <NfceButton order={order} onUpdate={onNfceUpdate} />
        </div>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function HistoricoPage() {
  const [orders,    setOrders]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [page,      setPage]      = useState(1);
  const [hasMore,   setHasMore]   = useState(false);
  const [expanded,  setExpanded]  = useState(null);

  const handleNfceUpdate = useCallback((orderId, nfceData) => {
    setOrders((prev) => prev.map((o) =>
      o.id === orderId
        ? { ...o, nfce_status: nfceData.status, nfce_number: nfceData.number, nfce_url: nfceData.pdfUrl }
        : o
    ));
  }, []);

  // Filters
  const [status,    setStatus]    = useState('');
  const [channel,   setChannel]   = useState('');
  const [startDate, setStartDate] = useState(weekAgoISO());
  const [endDate,   setEndDate]   = useState(todayISO());

  const load = useCallback(async (pg = 1, append = false) => {
    setLoading(true);
    try {
      const params = {
        page: pg, limit: PAGE_SIZE,
        ...(status    && { status }),
        ...(channel   && { channel }),
        ...(startDate && { startDate }),
        ...(endDate   && { endDate }),
      };
      const { data } = await getOrders(params);
      const list = data.data ?? [];
      setOrders(append ? (prev) => [...prev, ...list] : list);
      setHasMore(list.length === PAGE_SIZE);
      setPage(pg);
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, [status, channel, startDate, endDate]);

  // Reload when filters change
  useEffect(() => { load(1, false); }, [load]);

  const loadMore = () => load(page + 1, true);

  const totalRevenue = orders
    .filter((o) => ['ready', 'delivered'].includes(o.status))
    .reduce((s, o) => s + parseFloat(o.total ?? 0), 0);

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="px-5 py-3.5 bg-gray-900/80 backdrop-blur border-b border-white/5 shrink-0 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-black text-white">📋 Histórico de Pedidos</h1>
          <button
            onClick={() => load(1, false)}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Atualizar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Date range */}
          <div className="flex items-center gap-1.5 bg-gray-800/60 rounded-xl px-3 py-1.5 border border-white/[0.06]">
            <span className="text-xs text-gray-500">De</span>
            <input
              type="date" value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-xs text-gray-300 outline-none w-28"
            />
            <span className="text-xs text-gray-500">até</span>
            <input
              type="date" value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-xs text-gray-300 outline-none w-28"
            />
          </div>

          {/* Status */}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="input text-sm py-1.5"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>

          {/* Channel */}
          <input
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder="Canal (ifood, mesa…)"
            className="input text-sm py-1.5 w-40"
          />

          {/* Summary */}
          {!loading && (
            <div className="ml-auto flex items-center gap-4 text-xs text-gray-500">
              <span>{orders.length} pedido{orders.length !== 1 ? 's' : ''}</span>
              <span className="text-green-400 font-semibold">{fmtBRL(totalRevenue)} em vendas</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-4">
        {loading && orders.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-600">
            <span className="text-5xl">📋</span>
            <p className="text-sm italic">Nenhum pedido encontrado neste período</p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-white/[0.06]">
                  <th className="pb-2.5 pr-3 font-semibold w-6"></th>
                  <th className="pb-2.5 pr-4 font-semibold">#</th>
                  <th className="pb-2.5 pr-4 font-semibold">Canal</th>
                  <th className="pb-2.5 pr-4 font-semibold">Cliente</th>
                  <th className="pb-2.5 pr-4 font-semibold">Itens</th>
                  <th className="pb-2.5 pr-4 font-semibold text-right">Total</th>
                  <th className="pb-2.5 pr-4 font-semibold">Status</th>
                  <th className="pb-2.5 font-semibold">Data</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const meta     = STATUS_META[o.status] ?? { label: o.status, cls: 'bg-gray-700 text-gray-300' };
                  const isOpen   = expanded === o.id;
                  const isRevenue = ['ready', 'delivered'].includes(o.status);
                  return [
                    <tr
                      key={o.id}
                      onClick={() => setExpanded(isOpen ? null : o.id)}
                      className="hover:bg-white/[0.02] cursor-pointer transition-colors border-b border-white/[0.03]"
                    >
                      <td className="py-2.5 pr-3">
                        <svg
                          className={`w-3 h-3 text-gray-600 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </td>
                      <td className="py-2.5 pr-4 font-black text-white tabular-nums">#{o.order_number}</td>
                      <td className="py-2.5 pr-4 text-gray-400 capitalize">{o.channel ?? '—'}</td>
                      <td className="py-2.5 pr-4 text-gray-300">{o.customer_name || <span className="text-gray-600 italic">—</span>}</td>
                      <td className="py-2.5 pr-4 text-gray-400">{(o.items ?? []).length} item{(o.items ?? []).length !== 1 ? 's' : ''}</td>
                      <td className={`py-2.5 pr-4 text-right font-semibold tabular-nums ${isRevenue ? 'text-green-400' : 'text-gray-500'}`}>
                        {fmtBRL(o.total)}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${meta.cls}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-2.5 text-gray-500 text-xs tabular-nums whitespace-nowrap">
                        {fmtDate(o.created_at)}
                      </td>
                    </tr>,
                    isOpen && <DetailRow key={`${o.id}-detail`} order={o} onNfceUpdate={handleNfceUpdate} />,
                  ];
                })}
              </tbody>
            </table>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-6 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 font-semibold transition-colors disabled:opacity-50"
                >
                  {loading ? 'Carregando...' : 'Carregar mais'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
