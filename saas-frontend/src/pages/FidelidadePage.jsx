import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

const fmtBRL = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2).replace('.', ',')}`;

const STAR_COLORS = { 5: 'text-yellow-400', 4: 'text-yellow-400', 3: 'text-gray-400', 2: 'text-red-400', 1: 'text-red-500' };

function StarDisplay({ stars, size = 'sm' }) {
  const sz = size === 'lg' ? 'text-2xl' : 'text-sm';
  return (
    <span className={sz}>
      {[1,2,3,4,5].map(s => (
        <span key={s} className={s <= stars ? (STAR_COLORS[Math.round(stars)] || 'text-yellow-400') : 'text-gray-600'}>★</span>
      ))}
    </span>
  );
}

function CashbackConfigCard({ onSaved }) {
  const [config,   setConfig]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [enabled,  setEnabled]  = useState(false);
  const [rate,     setRate]     = useState('5');
  const [minOrder, setMinOrder] = useState('10');
  const [msg,      setMsg]      = useState(null);

  useEffect(() => {
    api.get('/tenant/cashback')
      .then(({ data }) => {
        const d = data.data;
        setConfig(d);
        setEnabled(d.cashback_enabled);
        setRate(String(d.cashback_rate ?? 5));
        setMinOrder(String(d.cashback_min_order ?? 10));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.put('/tenant/cashback', {
        cashback_enabled:   enabled,
        cashback_rate:      parseFloat(rate)    || 5,
        cashback_min_order: parseFloat(minOrder) || 0,
      });
      setMsg({ type: 'success', text: 'Configurações salvas!' });
      onSaved?.();
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.message ?? 'Erro ao salvar.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="bg-gray-800 rounded-2xl p-6 animate-pulse h-48" />;

  return (
    <div className="bg-gray-800 rounded-2xl p-6 space-y-5 border border-white/10">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold text-base">Programa de Cashback</h3>
          <p className="text-gray-400 text-xs mt-0.5">Clientes ganham crédito em cada pedido</p>
        </div>
        <button
          onClick={() => setEnabled(v => !v)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-green-500' : 'bg-gray-600'}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {enabled && (
        <div className="space-y-4 pt-2 border-t border-white/10">
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">
              % de cashback por pedido
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number" min="0" max="50" step="0.5"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-24 bg-gray-700 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <span className="text-gray-400 text-sm">% do valor do pedido</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Ex: pedido de R$ 50 → cliente ganha {fmtBRL(50 * parseFloat(rate || 0) / 100)} de cashback
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">
              Valor mínimo para ganhar cashback
            </label>
            <div className="flex items-center gap-3">
              <span className="text-gray-400 text-sm">R$</span>
              <input
                type="number" min="0" step="1"
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value)}
                className="w-24 bg-gray-700 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Pedidos abaixo desse valor não geram cashback. Use 0 para sem mínimo.
            </p>
          </div>
        </div>
      )}

      {msg && (
        <div className={`text-sm px-4 py-2.5 rounded-xl font-medium ${msg.type === 'success' ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'}`}>
          {msg.text}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
        {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Salvando...</> : 'Salvar configurações'}
      </button>
    </div>
  );
}

export default function FidelidadePage() {
  const [tab,         setTab]         = useState('ratings'); // 'ratings' | 'customers'
  const [ratings,     setRatings]     = useState([]);
  const [stats,       setStats]       = useState(null);
  const [customers,   setCustomers]   = useState([]);
  const [loadingR,    setLoadingR]    = useState(true);
  const [loadingC,    setLoadingC]    = useState(false);
  const [search,      setSearch]      = useState('');

  const loadRatings = useCallback(() => {
    setLoadingR(true);
    api.get('/tenant/ratings')
      .then(({ data }) => {
        setRatings(data.data.ratings ?? []);
        setStats(data.data.stats ?? null);
      })
      .catch(() => {})
      .finally(() => setLoadingR(false));
  }, []);

  const loadCustomers = useCallback(() => {
    setLoadingC(true);
    api.get('/tenant/loyalty-customers')
      .then(({ data }) => setCustomers(data.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingC(false));
  }, []);

  useEffect(() => { loadRatings(); }, [loadRatings]);
  useEffect(() => {
    if (tab === 'customers' && customers.length === 0) loadCustomers();
  }, [tab, customers.length, loadCustomers]);

  const filteredCustomers = customers.filter((c) => {
    const q = search.toLowerCase();
    return !q || (c.name ?? '').toLowerCase().includes(q) || (c.phone ?? '').includes(q);
  });

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-white">Fidelidade & Avaliações</h1>
          <p className="text-gray-400 text-sm mt-0.5">Cashback, pontos e feedback dos clientes</p>
        </div>
      </div>

      {/* Stats de avaliação */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 text-center">
            <p className="text-3xl font-black text-yellow-400">{stats.avg_stars ? parseFloat(stats.avg_stars).toFixed(1) : '—'}</p>
            <p className="text-xs text-gray-400 mt-1">Nota média</p>
            {stats.avg_stars > 0 && <StarDisplay stars={parseFloat(stats.avg_stars)} />}
          </div>
          <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 text-center">
            <p className="text-3xl font-black text-white">{stats.total ?? 0}</p>
            <p className="text-xs text-gray-400 mt-1">Total avaliações</p>
          </div>
          <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 text-center">
            <p className="text-3xl font-black text-green-400">{stats.five ?? 0}</p>
            <p className="text-xs text-gray-400 mt-1">⭐⭐⭐⭐⭐ 5 estrelas</p>
          </div>
          <div className="bg-gray-800 rounded-2xl p-4 border border-white/10 text-center">
            <p className="text-3xl font-black text-red-400">{stats.low ?? 0}</p>
            <p className="text-xs text-gray-400 mt-1">≤ 2 estrelas</p>
          </div>
        </div>
      )}

      {/* Layout: config + tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Config cashback */}
        <div className="lg:col-span-1">
          <CashbackConfigCard onSaved={loadCustomers} />
        </div>

        {/* Tabs: avaliações / clientes */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-2">
            {[
              { key: 'ratings',   label: '⭐ Avaliações' },
              { key: 'customers', label: '👥 Clientes Fidelidade' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${tab === key ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* ── Tab: Avaliações ── */}
          {tab === 'ratings' && (
            <div className="space-y-3">
              {loadingR ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <div key={i} className="bg-gray-800 rounded-2xl h-20 animate-pulse" />)}
                </div>
              ) : ratings.length === 0 ? (
                <div className="bg-gray-800 rounded-2xl p-8 text-center border border-white/10">
                  <div className="text-4xl mb-3">⭐</div>
                  <p className="text-gray-400">Nenhuma avaliação ainda.</p>
                  <p className="text-gray-500 text-sm mt-1">Quando clientes avaliarem seus pedidos, aparecem aqui.</p>
                </div>
              ) : (
                ratings.map((r) => (
                  <div key={r.id} className="bg-gray-800 rounded-2xl p-4 border border-white/10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StarDisplay stars={r.stars} />
                          <span className="text-gray-300 font-semibold text-sm">
                            {r.customer_name ?? 'Cliente'}
                          </span>
                          <span className="text-gray-500 text-xs">· Pedido #{r.order_number}</span>
                        </div>
                        {r.comment && (
                          <p className="text-gray-300 text-sm mt-2 leading-relaxed">"{r.comment}"</p>
                        )}
                        {r.customer_phone && (
                          <p className="text-gray-500 text-xs mt-1">{r.customer_phone}</p>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 shrink-0">
                        {new Date(r.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Tab: Clientes Fidelidade ── */}
          {tab === 'customers' && (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Buscar por nome ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />

              {loadingC ? (
                <div className="space-y-2">
                  {[1,2,3,4].map(i => <div key={i} className="bg-gray-800 rounded-2xl h-16 animate-pulse" />)}
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="bg-gray-800 rounded-2xl p-8 text-center border border-white/10">
                  <div className="text-4xl mb-3">👥</div>
                  <p className="text-gray-400">Nenhum cliente cadastrado ainda.</p>
                  <p className="text-gray-500 text-sm mt-1">Clientes que informam telefone no pedido aparecem aqui automaticamente.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 px-1">{filteredCustomers.length} clientes</p>
                  {filteredCustomers.map((c) => (
                    <div key={c.id} className="bg-gray-800 rounded-2xl px-4 py-3.5 border border-white/10 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-black text-sm shrink-0">
                        {(c.name ?? c.phone ?? '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm truncate">{c.name ?? '—'}</p>
                        <p className="text-xs text-gray-500">{c.phone}</p>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        <p className="text-sm font-black text-green-400">{fmtBRL(c.cashback_balance)}</p>
                        <p className="text-xs text-gray-500">cashback</p>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        <p className="text-sm font-bold text-white">{c.total_orders}</p>
                        <p className="text-xs text-gray-500">pedidos</p>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        <p className="text-sm font-bold text-orange-400">{fmtBRL(c.total_spent)}</p>
                        <p className="text-xs text-gray-500">gasto total</p>
                      </div>
                      {c.avg_rating && (
                        <div className="text-right shrink-0 space-y-0.5">
                          <p className="text-sm font-bold text-yellow-400">
                            {parseFloat(c.avg_rating).toFixed(1)} ⭐
                          </p>
                          <p className="text-xs text-gray-500">nota</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
