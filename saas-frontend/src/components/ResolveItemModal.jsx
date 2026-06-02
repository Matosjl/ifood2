import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { resolveReceiptItem } from '../api/receipts';
import { listInsumos } from '../api/insumos';

const fmtBRL = (v) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const UNITS = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct'];

// ── Busca de insumo existente ─────────────────────────────────────
function InsumoSearch({ tenantId, onSelect }) {
  const [query,    setQuery]    = useState('');
  const [insumos,  setInsumos]  = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    listInsumos()
      .then(r => { setInsumos(Array.isArray(r.data?.data) ? r.data.data : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const q = query.toLowerCase().trim();
    setFiltered(
      q.length < 1
        ? insumos.slice(0, 8)
        : insumos.filter(i => i.name.toLowerCase().includes(q)).slice(0, 8)
    );
  }, [query, insumos]);

  if (loading) return <p className="text-xs text-gray-400">Carregando insumos...</p>;

  return (
    <div className="space-y-2">
      <input
        className="w-full bg-gray-700 border border-white/10 rounded-lg px-3 py-2 text-sm
                   text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
        placeholder="Buscar insumo..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        autoFocus
      />
      {filtered.length === 0 && (
        <p className="text-xs text-gray-500">Nenhum insumo encontrado.</p>
      )}
      <div className="max-h-48 overflow-y-auto space-y-1">
        {filtered.map(ins => (
          <button
            key={ins.id}
            type="button"
            onClick={() => onSelect(ins)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg
                       bg-gray-700 hover:bg-gray-600 text-left transition-colors"
          >
            <span className="text-sm text-white truncate">{ins.name}</span>
            <span className="text-xs text-gray-400 ml-2 shrink-0">
              {Number(ins.qty_in_stock ?? 0).toFixed(2)} {ins.unit}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Modal principal ───────────────────────────────────────────────
export default function ResolveItemModal({ receiptId, item, itemIdx, onClose, onResolved }) {
  const [mode,      setMode]      = useState('create'); // 'create' | 'match'
  const [name,      setName]      = useState(item.raw?.descricao ?? item.descricao ?? '');
  const [unit,      setUnit]      = useState(item.raw?.unidade ?? item.unidade ?? 'un');
  const [qty,       setQty]       = useState(String(item.raw?.quantidade ?? item.quantidade ?? 1));
  const [unitCost,  setUnitCost]  = useState(String(item.raw?.valor_unit ?? item.valor_unit ?? 0));
  const [matchedInsumo, setMatchedInsumo] = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState('');

  const totalEstimado = (parseFloat(qty) || 0) * (parseFloat(unitCost) || 0);

  const handleSelectInsumo = (ins) => {
    setMatchedInsumo(ins);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr(''); setSaving(true);
    try {
      const body = {
        mode,
        qty:       parseFloat(qty),
        unit_cost: parseFloat(unitCost) || 0,
        ...(mode === 'create'
          ? { name: name.trim(), unit }
          : { insumo_id: matchedInsumo?.id }),
      };
      if (mode === 'match' && !matchedInsumo) {
        setErr('Selecione um insumo existente.'); setSaving(false); return;
      }
      const { data } = await resolveReceiptItem(receiptId, itemIdx, body);
      onResolved(data.data);
      onClose();
    } catch (ex) {
      setErr(ex?.response?.data?.message ?? ex.message ?? 'Erro ao resolver item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -8 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{    opacity: 0, scale: 0.96, y: -8 }}
        transition={{ type: 'spring', damping: 30, stiffness: 340 }}
        className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="text-sm font-bold text-white">🆕 Resolver item</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
              {item.raw?.descricao ?? item.descricao ?? 'Item sem nome'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* Aviso: financeiro já lançado */}
          <div className="flex gap-2 bg-blue-500/10 border border-blue-500/25 rounded-xl px-3 py-2.5">
            <span className="text-blue-400 shrink-0">ℹ️</span>
            <p className="text-xs text-blue-300">
              O valor já foi lançado no financeiro. Esta ação apenas atualiza o estoque.
            </p>
          </div>

          {/* Modo */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('create')}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                mode === 'create'
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                  : 'bg-gray-800 text-gray-400 border-white/5 hover:border-white/20'
              }`}
            >
              ✨ Criar novo insumo
            </button>
            <button
              type="button"
              onClick={() => setMode('match')}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                mode === 'match'
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                  : 'bg-gray-800 text-gray-400 border-white/5 hover:border-white/20'
              }`}
            >
              🔗 Casar com existente
            </button>
          </div>

          {/* Campos modo criar */}
          {mode === 'create' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Nome do insumo</label>
                <input
                  required
                  className="mt-1 w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm
                             text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Arroz Branco 5kg"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Unidade</label>
                  <select
                    className="mt-1 w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm
                               text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                  >
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Quantidade</label>
                  <input
                    required type="number" min="0.001" step="0.001"
                    className="mt-1 w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm
                               text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500"
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Custo unit.</label>
                  <input
                    required type="number" min="0" step="0.01"
                    className="mt-1 w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm
                               text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500"
                    value={unitCost}
                    onChange={e => setUnitCost(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Campos modo casar */}
          {mode === 'match' && (
            <div className="space-y-3">
              {matchedInsumo ? (
                <div className="flex items-center justify-between bg-green-500/10 border border-green-500/25
                                rounded-xl px-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-white">{matchedInsumo.name}</p>
                    <p className="text-xs text-gray-400">
                      Estoque atual: {Number(matchedInsumo.qty_in_stock ?? 0).toFixed(2)} {matchedInsumo.unit}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMatchedInsumo(null)}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors ml-3"
                  >
                    Trocar
                  </button>
                </div>
              ) : (
                <InsumoSearch onSelect={handleSelectInsumo} />
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Quantidade</label>
                  <input
                    required type="number" min="0.001" step="0.001"
                    className="mt-1 w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm
                               text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500"
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Custo unit.</label>
                  <input
                    required type="number" min="0" step="0.01"
                    className="mt-1 w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm
                               text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500"
                    value={unitCost}
                    onChange={e => setUnitCost(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Resumo */}
          {(parseFloat(qty) > 0) && (
            <div className="bg-gray-800 rounded-xl px-3 py-2.5 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {qty} {mode === 'create' ? unit : (matchedInsumo?.unit ?? 'un')} x {fmtBRL(parseFloat(unitCost) || 0)} =
              </span>
              <span className="text-sm font-bold text-white tabular-nums">{fmtBRL(totalEstimado)}</span>
            </div>
          )}

          {/* Erro */}
          {err && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2">
              {err}
            </p>
          )}

          {/* Footer */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl text-sm font-semibold bg-gray-800 text-gray-400
                         border border-white/5 hover:border-white/20 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || (mode === 'match' && !matchedInsumo)}
              className="flex-1 py-2 rounded-xl text-sm font-bold bg-orange-500 text-white
                         hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando...' : mode === 'create' ? '✨ Criar e lançar' : '🔗 Casar e lançar'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
