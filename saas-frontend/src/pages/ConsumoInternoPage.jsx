import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSugestoes, registrarConsumo, getHistoricoConsumo } from '../api/consumo';

const fmt = (v) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDt = (s) => {
  if (!s) return '—';
  try {
    const d = new Date(s);
    return d.toLocaleDateString('pt-BR') + ' ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return s; }
};

const TIPOS = [
  { value: 'funcionario', emoji: '👨‍🍳', label: 'Funcionário'  },
  { value: 'familia',     emoji: '👨‍👩‍👦', label: 'Família'     },
  { value: 'brinde',      emoji: '🎁',  label: 'Brinde'       },
  { value: 'degustacao',  emoji: '🧪',  label: 'Degustação'   },
  { value: 'perda',       emoji: '🗑',  label: 'Perda'        },
];

const TIPO_LABELS = Object.fromEntries(TIPOS.map(t => [t.value, `${t.emoji} ${t.label}`]));

// ── Modal de confirmação rápida ───────────────────────────────

function ConfirmModal({ item, onConfirm, onClose }) {
  const [tipo,     setTipo]     = useState('funcionario');
  const [qty,      setQty]      = useState('1');
  const [notes,    setNotes]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [erro,     setErro]     = useState(null);
  const qtyRef = useRef(null);

  useEffect(() => {
    qtyRef.current?.select();
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleConfirm = async () => {
    const q = parseFloat(qty);
    if (!q || q <= 0) { setErro('Quantidade inválida.'); return; }
    setLoading(true);
    setErro(null);
    try {
      await onConfirm({ tipo, qty: q, notes });
    } catch (err) {
      setErro(err?.response?.data?.message || 'Erro ao registrar.');
    } finally {
      setLoading(false);
    }
  };

  const unitLabel = item.unit === 'kg' ? 'kg' : 'un';
  const custo = parseFloat(item.unit_cost || 0) * (parseFloat(qty) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full max-w-sm bg-gray-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <p className="text-base font-black text-white truncate">{item.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {fmt(item.unit_cost)}/{unitLabel}
            </p>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Tipo de consumo */}
          <div>
            <p className="text-xs text-gray-400 font-semibold mb-2">Tipo</p>
            <div className="grid grid-cols-5 gap-1.5">
              {TIPOS.map(t => (
                <button key={t.value} type="button"
                  onClick={() => setTipo(t.value)}
                  className={[
                    'flex flex-col items-center gap-1 py-2 rounded-xl border text-center transition-all',
                    tipo === t.value
                      ? 'bg-orange-500/20 border-orange-500/50 scale-105'
                      : 'bg-gray-800/60 border-white/[0.07] hover:bg-gray-700/60'
                  ].join(' ')}
                >
                  <span className="text-lg">{t.emoji}</span>
                  <span className="text-[9px] text-gray-300 leading-tight">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quantidade */}
          <div>
            <p className="text-xs text-gray-400 font-semibold mb-1.5">
              Quantidade ({unitLabel})
            </p>
            <div className="flex items-center gap-2">
              <button type="button"
                onClick={() => setQty(v => String(Math.max(0.1, parseFloat(v || 1) - 1)))}
                className="w-10 h-10 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg flex items-center justify-center shrink-0">
                −
              </button>
              <input
                ref={qtyRef}
                type="number" min="0.1" step="0.1"
                value={qty}
                onChange={e => setQty(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConfirm()}
                className="flex-1 text-center text-xl font-bold bg-gray-800 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-orange-500/50"
              />
              <button type="button"
                onClick={() => setQty(v => String(parseFloat(v || 0) + 1))}
                className="w-10 h-10 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg flex items-center justify-center shrink-0">
                +
              </button>
            </div>
            {parseFloat(qty) > 0 && parseFloat(item.unit_cost) > 0 && (
              <p className="text-xs text-orange-400 mt-1.5 text-center font-semibold">
                Custo estimado: {fmt(custo)}
              </p>
            )}
          </div>

          {/* Obs — opcional */}
          <div>
            <input type="text" placeholder="Observação (opcional)..."
              value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
            />
          </div>

          {erro && (
            <p className="text-xs text-red-400 bg-red-400/10 rounded-xl px-3 py-2 text-center">{erro}</p>
          )}

          <button onClick={handleConfirm} disabled={loading}
            className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-black text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Registrando...
              </span>
            ) : '✓ Confirmar consumo'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Card de item ──────────────────────────────────────────────

function ItemCard({ item, onSelect }) {
  return (
    <button type="button" onClick={() => onSelect(item)}
      className="flex items-center gap-3 bg-gray-800/60 hover:bg-gray-700/70 border border-white/[0.07] hover:border-white/20 rounded-xl px-3 py-3 transition-all active:scale-95 text-left group w-full">
      <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center text-base shrink-0 font-bold text-orange-300">
        {item.name?.charAt(0)?.toUpperCase() || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-200 group-hover:text-white truncate">{item.name}</p>
        <p className="text-[11px] text-gray-500">
          {item.unit_cost > 0 ? fmt(item.unit_cost) + '/' + (item.unit || 'un') : 'sem custo'}
          {item.vezes ? ` · ${item.vezes}× usado` : ''}
        </p>
      </div>
      <svg className="w-4 h-4 text-gray-600 group-hover:text-orange-400 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

// ── Página principal ──────────────────────────────────────────

export default function ConsumoInternoPage() {
  const [sugestoes,  setSugestoes]  = useState(null);
  const [historico,  setHistorico]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [selected,   setSelected]   = useState(null); // item para o modal
  const [tab,        setTab]        = useState('sugestoes'); // 'sugestoes' | 'historico'
  const [toast,      setToast]      = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sug, hist] = await Promise.all([
        getSugestoes(),
        getHistoricoConsumo({ limit: 30 }),
      ]);
      setSugestoes(sug.data.data);
      setHistorico(hist.data.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleConfirm = useCallback(async ({ tipo, qty, notes }) => {
    const payload = {
      quantity:         qty,
      consumption_type: tipo,
      notes:            notes || undefined,
    };
    if (selected.insumo_id)  payload.insumo_id  = selected.insumo_id;
    else if (selected.product_id) payload.product_id = selected.product_id;
    else if (selected.type === 'insumo') payload.insumo_id  = selected.id;
    else                               payload.product_id = selected.id;

    await registrarConsumo(payload);
    setSelected(null);
    showToast(`✓ ${selected.name} registrado`);
    load();
  }, [selected, load]);

  // Itens de busca: mescla insumos + produtos mais vendidos
  const searchItems = () => {
    if (!sugestoes) return [];
    const q = search.toLowerCase().trim();
    const insumos = (sugestoes.insumos || []).map(i => ({ ...i, type: 'insumo', insumo_id: i.id }));
    const prods   = (sugestoes.vendidos || []).map(p => ({ ...p, type: 'produto', product_id: p.product_id }));
    const all = [...insumos, ...prods];
    if (!q) return all.slice(0, 20);
    return all.filter(i => i.name?.toLowerCase().includes(q)).slice(0, 15);
  };

  // Sugestões: mais usados (se existem) OU mais vendidos
  const sugestoesList = () => {
    if (!sugestoes) return [];
    const usados = sugestoes.usados || [];
    if (usados.length >= 3) return usados;
    // Cold start: mais vendidos
    return (sugestoes.vendidos || []).map(p => ({
      ...p,
      name: p.name,
      unit_cost: p.unit_cost,
      unit: p.unit,
      product_id: p.product_id,
    }));
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 min-h-0">

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-green-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de confirmação */}
      <AnimatePresence>
        {selected && (
          <ConfirmModal
            item={selected}
            onConfirm={handleConfirm}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-black text-white">🍽 Consumo Interno</h1>
            <p className="text-xs text-gray-500 mt-0.5">Registre saídas em até 3 toques</p>
          </div>
        </div>

        {/* Busca */}
        <input
          type="text"
          placeholder="Buscar produto ou insumo..."
          value={search}
          onChange={e => { setSearch(e.target.value); setTab('sugestoes'); }}
          className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
        />

        {/* Tabs */}
        {!search && (
          <div className="flex gap-1 mt-3">
            {[['sugestoes', '⚡ Sugestões'], ['historico', '📋 Histórico']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setTab(v)}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  tab === v
                    ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                    : 'text-gray-500 hover:text-gray-300'
                ].join(' ')}>
                {l}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && search && (
          <>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest mb-2">
              Resultados para "{search}"
            </p>
            {searchItems().length === 0 ? (
              <p className="text-sm text-gray-600 italic text-center py-8">Nenhum item encontrado.</p>
            ) : searchItems().map((item, i) => (
              <ItemCard key={item.id || item.product_id || i} item={item} onSelect={setSelected} />
            ))}
          </>
        )}

        {!loading && !search && tab === 'sugestoes' && (
          <>
            {sugestoesList().length === 0 ? (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">🍽</p>
                <p className="text-sm font-semibold text-gray-400">Nenhuma sugestão ainda</p>
                <p className="text-xs text-gray-600 mt-1">Use a busca para encontrar um produto ou insumo</p>
              </div>
            ) : (
              <>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">
                  {(sugestoes?.usados || []).length >= 3 ? 'Mais consumidos' : 'Mais vendidos (sugestão inicial)'}
                </p>
                <div className="space-y-2">
                  {sugestoesList().map((item, i) => (
                    <ItemCard key={item.id || item.product_id || i} item={item} onSelect={setSelected} />
                  ))}
                </div>

                {/* Insumos completos */}
                {(sugestoes?.insumos || []).length > 0 && (
                  <div className="mt-5">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">
                      Todos os insumos
                    </p>
                    <div className="space-y-2">
                      {(sugestoes.insumos || []).slice(0, 20).map(item => (
                        <ItemCard key={item.id}
                          item={{ ...item, insumo_id: item.id, type: 'insumo' }}
                          onSelect={setSelected}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {!loading && !search && tab === 'historico' && (
          <>
            {historico.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">📋</p>
                <p className="text-sm font-semibold text-gray-400">Nenhum registro ainda</p>
                <p className="text-xs text-gray-600 mt-1">Os consumos registrados aparecem aqui</p>
              </div>
            ) : (
              <div className="space-y-2">
                {historico.map(r => (
                  <div key={r.id}
                    className="bg-gray-800/60 border border-white/[0.07] rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{TIPOS.find(t => t.value === r.consumption_type)?.emoji || '🍽'}</span>
                          <p className="text-sm font-semibold text-white truncate">{r.item_name}</p>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {r.quantity} {r.unit} · {TIPOS.find(t => t.value === r.consumption_type)?.label || r.consumption_type}
                          {r.notes && <span className="text-gray-600"> · {r.notes}</span>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-orange-400">{fmt(r.total_cost)}</p>
                        <p className="text-[10px] text-gray-600">{fmtDt(r.created_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
