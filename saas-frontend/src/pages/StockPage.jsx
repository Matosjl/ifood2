import { useState, useEffect, useCallback } from 'react';
import { listProducts, replenishStock, listAllMovements } from '../api/products';
import { listInsumos, createInsumo, updateInsumo, deleteInsumo, adjustInsumoStock } from '../api/insumos';

const fmt = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2)}`;
const fmtQty = (qty, type) =>
  `${parseFloat(qty ?? 0).toFixed(type === 'kg' ? 2 : 0)} ${type === 'kg' ? 'kg' : 'un'}`;
const fmtDate = (s) => {
  const d = new Date(s);
  return (
    d.toLocaleDateString('pt-BR') +
    ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
};

const MOVEMENT_META = {
  replenishment: { label: 'Reposição',  cls: 'bg-green-500/15 text-green-400',  sign: '+', signCls: 'text-green-400' },
  sale:          { label: 'Venda',      cls: 'bg-blue-500/15 text-blue-400',    sign: '−', signCls: 'text-red-400' },
  adjustment:    { label: 'Ajuste',     cls: 'bg-yellow-500/15 text-yellow-400',sign: '±', signCls: 'text-yellow-400' },
  waste:         { label: 'Descarte',   cls: 'bg-red-500/15 text-red-400',      sign: '−', signCls: 'text-red-400' },
};

// ─────────────────────────────────────────────────────────────
// Replenishment modal
// ─────────────────────────────────────────────────────────────

function ReplenishModal({ product, onClose, onDone }) {
  const [qty,    setQty]    = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const q = parseFloat(qty);
    if (!q || q <= 0) return setError('Quantidade deve ser maior que zero.');
    setError(null);
    setSaving(true);
    try {
      const { data } = await replenishStock(product.id, {
        quantity: q,
        reason: reason.trim() || undefined,
      });
      onDone(data.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao repor estoque.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-base font-black text-white">Repor Estoque</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Product info */}
          <div className="bg-gray-800/60 rounded-xl p-3">
            <p className="text-sm font-semibold text-white">{product.name}</p>
            <p className="text-xs text-gray-400 mt-1">
              Estoque atual:{' '}
              <span className="font-bold text-gray-200">
                {fmtQty(product.stock_qty, product.sale_type)}
              </span>
            </p>
          </div>

          {/* Qty */}
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1 block">
              Quantidade a adicionar ({product.sale_type === 'kg' ? 'kg' : 'unidades'}) *
            </label>
            <input
              type="number"
              min="0.01"
              step={product.sale_type === 'kg' ? '0.1' : '1'}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="input w-full"
              placeholder="0"
              autoFocus
            />
          </div>

          {/* Reason */}
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1 block">Motivo (opcional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input w-full"
              placeholder="Ex: Compra do fornecedor"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={saving}
              className="btn-green px-5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Salvando...' : 'Confirmar Reposição'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Stock card helpers
// ─────────────────────────────────────────────────────────────

function stockVariant(p) {
  const qty   = parseFloat(p.stock_qty ?? 0);
  const alert = parseFloat(p.alert_threshold ?? 0);
  if (qty <= 0)                          return 'red';
  if (alert > 0 && qty <= alert)         return 'yellow';
  return 'green';
}

const VARIANT_STYLES = {
  red:    { card: 'border-red-500/30 bg-red-500/5',       qty: 'text-red-400',    badge: 'bg-red-500/20 text-red-300',    label: 'Zerado' },
  yellow: { card: 'border-yellow-500/30 bg-yellow-500/5', qty: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-300', label: 'Baixo' },
  green:  { card: 'border-white/[0.06] bg-gray-800/40',   qty: 'text-white',      badge: 'bg-green-500/20 text-green-300',  label: 'OK' },
};

// ─────────────────────────────────────────────────────────────
// Insumos Tab — ingredient stock management
// ─────────────────────────────────────────────────────────────

const UNITS = ['un', 'g', 'kg', 'ml', 'l', 'cx', 'pct'];

function InsumoFormModal({ insumo, onClose, onSave }) {
  const isEdit = !!insumo;
  const [name,  setName]  = useState(insumo?.name  ?? '');
  const [unit,  setUnit]  = useState(insumo?.unit  ?? 'un');
  const [stock, setStock] = useState(insumo?.qty_in_stock  ?? '0');
  const [minQty,setMinQty]= useState(insumo?.min_qty       ?? '0');
  const [cost,  setCost]  = useState(insumo?.cost_per_unit ?? '0');
  const [saving,setSaving]= useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Nome é obrigatório.');
    setSaving(true); setError(null);
    try {
      const payload = { name: name.trim(), unit, qty_in_stock: parseFloat(stock) || 0, min_qty: parseFloat(minQty) || 0, cost_per_unit: parseFloat(cost) || 0 };
      const { data } = isEdit ? await updateInsumo(insumo.id, payload) : await createInsumo(payload);
      onSave(data.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao salvar.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-base font-bold text-white mb-4">{isEdit ? 'Editar Insumo' : 'Novo Insumo'}</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 font-semibold block mb-1">Nome *</label>
            <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ex: Farinha de trigo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 font-semibold block mb-1">Unidade</label>
              <select className="input w-full" value={unit} onChange={(e) => setUnit(e.target.value)}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 font-semibold block mb-1">Estoque atual</label>
              <input className="input w-full" type="number" min="0" step="0.001" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 font-semibold block mb-1">Alerta (mín.)</label>
              <input className="input w-full" type="number" min="0" step="0.001" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-semibold block mb-1">Custo/{unit}</label>
              <input className="input w-full" type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl bg-gray-800 text-gray-300 text-sm font-semibold hover:bg-gray-700">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdjustModal({ insumo, onClose, onDone }) {
  const [qty,    setQty]    = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const q = parseFloat(qty);
    if (isNaN(q) || q === 0) return setError('Informe uma quantidade (positiva = entrada, negativa = saída).');
    setSaving(true); setError(null);
    try {
      const { data } = await adjustInsumoStock(insumo.id, q, reason.trim() || undefined);
      onDone(data.data); onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao ajustar.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-base font-bold text-white mb-1">Ajustar Estoque</h3>
        <p className="text-sm text-gray-400 mb-4">{insumo.name} · atual: <span className="text-white font-semibold">{parseFloat(insumo.qty_in_stock).toFixed(3)} {insumo.unit}</span></p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 font-semibold block mb-1">Quantidade (+ entrada / − saída)</label>
            <input className="input w-full" type="number" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus placeholder="Ex: 500 ou -100" />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-semibold block mb-1">Motivo</label>
            <input className="input w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Opcional" />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl bg-gray-800 text-gray-300 text-sm font-semibold hover:bg-gray-700">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-500 disabled:opacity-50">
              {saving ? 'Salvando...' : 'Ajustar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InsumosTab() {
  const [insumos,  setInsumos]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [formItem, setFormItem] = useState(null);   // null = hidden, {} = new, obj = edit
  const [adjItem,  setAdjItem]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await listInsumos(); setInsumos(data.data ?? []); }
    catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = (saved) => {
    setInsumos((prev) => {
      const idx = prev.findIndex((i) => i.id === saved.id);
      return idx >= 0 ? prev.map((i) => i.id === saved.id ? saved : i) : [saved, ...prev];
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir este insumo?')) return;
    try {
      await deleteInsumo(id);
      setInsumos((prev) => prev.filter((i) => i.id !== id));
    } catch { alert('Erro ao excluir.'); }
  };

  const filtered = insumos.filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()));
  const lowStock = insumos.filter((i) => i.low_stock);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-1 py-3 shrink-0">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar insumo..." className="input flex-1 max-w-xs text-sm" />
        {lowStock.length > 0 && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-500/15 border border-red-500/20 text-red-400 text-xs font-semibold">
            ⚠️ {lowStock.length} com estoque baixo
          </span>
        )}
        <button onClick={() => setFormItem({})}
          className="ml-auto px-3 py-1.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 transition-colors">
          + Novo Insumo
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-600">
          <span className="text-5xl">🧂</span>
          <p className="text-sm italic">{search ? 'Nenhum resultado' : 'Nenhum insumo cadastrado'}</p>
          {!search && <button onClick={() => setFormItem({})} className="text-sm text-blue-400 hover:text-blue-300">+ Cadastrar primeiro insumo</button>}
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-950">
              <tr className="text-left text-xs text-gray-500 border-b border-white/[0.06]">
                <th className="pb-2.5 pr-3 font-semibold">Insumo</th>
                <th className="pb-2.5 pr-3 font-semibold text-center">Un.</th>
                <th className="pb-2.5 pr-3 font-semibold text-right">Estoque</th>
                <th className="pb-2.5 pr-3 font-semibold text-right">Mínimo</th>
                <th className="pb-2.5 pr-3 font-semibold text-right">Custo/un</th>
                <th className="pb-2.5 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.map((ins) => (
                <tr key={ins.id} className={`hover:bg-white/[0.02] transition-colors ${ins.low_stock ? 'bg-red-500/5' : ''}`}>
                  <td className="py-2.5 pr-3">
                    <span className="font-semibold text-gray-200">{ins.name}</span>
                    {ins.low_stock && <span className="ml-2 text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-bold">BAIXO</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-center text-gray-500">{ins.unit}</td>
                  <td className={`py-2.5 pr-3 text-right font-bold tabular-nums ${ins.low_stock ? 'text-red-400' : 'text-white'}`}>
                    {parseFloat(ins.qty_in_stock).toFixed(3)}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-gray-500 tabular-nums">{parseFloat(ins.min_qty).toFixed(3)}</td>
                  <td className="py-2.5 pr-3 text-right text-gray-500 tabular-nums">{fmt(ins.cost_per_unit)}</td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setAdjItem(ins)}
                        className="px-2 py-1 rounded-lg bg-orange-500/15 text-orange-400 text-xs font-semibold hover:bg-orange-500/30 transition-colors">
                        Ajustar
                      </button>
                      <button onClick={() => setFormItem(ins)}
                        className="px-2 py-1 rounded-lg bg-white/5 text-gray-400 text-xs font-semibold hover:bg-white/10 transition-colors">
                        Editar
                      </button>
                      <button onClick={() => handleDelete(ins.id)}
                        className="px-2 py-1 rounded-lg bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors">
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formItem !== null && (
        <InsumoFormModal
          insumo={formItem?.id ? formItem : null}
          onClose={() => setFormItem(null)}
          onSave={handleSave}
        />
      )}
      {adjItem && (
        <AdjustModal
          insumo={adjItem}
          onClose={() => setAdjItem(null)}
          onDone={(saved) => { handleSave(saved); setAdjItem(null); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function StockPage() {
  const [products,  setProducts]  = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [tab,       setTab]       = useState('stock'); // 'stock' | 'movements'
  const [repProduct, setRepProduct] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, mRes] = await Promise.all([
        listProducts({ active: true, limit: 200 }),
        listAllMovements({ limit: 100 }),
      ]);
      setProducts(pRes.data.data ?? []);
      setMovements(mRes.data.data ?? []);
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleReplenished = (updated) => {
    setProducts((prev) =>
      prev.map((p) => p.id === updated.id ? { ...p, stock_qty: updated.stock_qty } : p)
    );
    // Refresh movements silently
    listAllMovements({ limit: 100 })
      .then(({ data }) => setMovements(data.data ?? []))
      .catch(() => {});
  };

  // ── Stats ─────────────────────────────────────────────────
  const lowStock  = products.filter((p) => {
    const q = parseFloat(p.stock_qty ?? 0);
    const a = parseFloat(p.alert_threshold ?? 0);
    return a > 0 && q > 0 && q <= a;
  });
  const zeroStock = products.filter((p) => parseFloat(p.stock_qty ?? 0) <= 0);

  // ── Filtered products ─────────────────────────────────────
  const filtered = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-gray-900/80 backdrop-blur border-b border-white/5 shrink-0">
        <h1 className="text-lg font-black text-white shrink-0">📊 Estoque</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar produto..."
          className="input flex-1 max-w-xs text-sm"
        />
        <button
          onClick={load}
          title="Atualizar"
          className="ml-auto p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* ── Summary cards ────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b border-white/[0.04] shrink-0">
          <div className="bg-gray-800/60 rounded-xl px-4 py-3 border border-white/[0.06]">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Produtos</p>
            <p className="text-2xl font-black text-white mt-1">{products.length}</p>
          </div>
          <div className={`rounded-xl px-4 py-3 border transition-colors ${
            lowStock.length > 0
              ? 'bg-yellow-500/10 border-yellow-500/30'
              : 'bg-gray-800/60 border-white/[0.06]'
          }`}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${lowStock.length > 0 ? 'text-yellow-400' : 'text-gray-500'}`}>
              Estoque Baixo
            </p>
            <p className={`text-2xl font-black mt-1 ${lowStock.length > 0 ? 'text-yellow-300' : 'text-white'}`}>
              {lowStock.length}
            </p>
          </div>
          <div className={`rounded-xl px-4 py-3 border transition-colors ${
            zeroStock.length > 0
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-gray-800/60 border-white/[0.06]'
          }`}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${zeroStock.length > 0 ? 'text-red-400' : 'text-gray-500'}`}>
              Sem Estoque
            </p>
            <p className={`text-2xl font-black mt-1 ${zeroStock.length > 0 ? 'text-red-300' : 'text-white'}`}>
              {zeroStock.length}
            </p>
          </div>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="flex gap-1 px-5 py-2 border-b border-white/[0.04] bg-gray-900/30 shrink-0">
        {[
          ['stock',     '📦 Produtos'],
          ['movements', '📋 Movimentações'],
          ['insumos',   '🧂 Insumos'],
        ].map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
              tab === t ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-4">
        {tab === 'insumos' ? (
          <InsumosTab />
        ) : loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'stock' ? (
          /* Stock cards grid */
          filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-600">
              <span className="text-5xl">📦</span>
              <p className="text-sm italic">Nenhum produto encontrado</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filtered.map((p) => {
                const variant = stockVariant(p);
                const styles  = VARIANT_STYLES[variant];
                return (
                  <div key={p.id} className={`rounded-xl p-3.5 border flex flex-col gap-3 ${styles.card}`}>
                    {/* Name + category */}
                    <div>
                      <p className="text-sm font-semibold text-gray-200 leading-snug line-clamp-2">{p.name}</p>
                      {p.category_name && (
                        <p className="text-[11px] text-gray-500 mt-0.5">{p.category_name}</p>
                      )}
                    </div>

                    {/* Stock quantity */}
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Estoque</p>
                        <p className={`text-2xl font-black tabular-nums leading-tight ${styles.qty}`}>
                          {parseFloat(p.stock_qty ?? 0).toFixed(p.sale_type === 'kg' ? 2 : 0)}
                          <span className="text-xs text-gray-500 ml-1 font-normal">
                            {p.sale_type === 'kg' ? 'kg' : 'un'}
                          </span>
                        </p>
                        {parseFloat(p.alert_threshold ?? 0) > 0 && (
                          <p className="text-[10px] text-gray-600 mt-0.5">
                            alerta: {p.alert_threshold}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className={`block text-[10px] font-bold px-1.5 py-0.5 rounded-full ${styles.badge}`}>
                          {styles.label}
                        </span>
                        <p className="text-[10px] text-gray-600 mt-1">
                          {fmt(p.sale_price)}/{p.sale_type === 'kg' ? 'kg' : 'un'}
                        </p>
                      </div>
                    </div>

                    {/* Replenish button */}
                    <button
                      onClick={() => setRepProduct(p)}
                      className="w-full py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
                    >
                      + Repor Estoque
                    </button>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Movements table */
          movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-600">
              <span className="text-5xl">📋</span>
              <p className="text-sm italic">Nenhuma movimentação registrada</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-white/[0.06]">
                  <th className="pb-2.5 pr-4 font-semibold">Data</th>
                  <th className="pb-2.5 pr-4 font-semibold">Produto</th>
                  <th className="pb-2.5 pr-4 font-semibold">Tipo</th>
                  <th className="pb-2.5 pr-4 font-semibold text-right">Quantidade</th>
                  <th className="pb-2.5 font-semibold">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {movements.map((m) => {
                  const meta = MOVEMENT_META[m.type] ?? {
                    label: m.type, cls: 'bg-gray-700 text-gray-300', sign: '', signCls: 'text-gray-400',
                  };
                  return (
                    <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 pr-4 text-gray-500 text-xs tabular-nums whitespace-nowrap">
                        {fmtDate(m.created_at)}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-300 font-medium">{m.product_name}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${meta.cls}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className={`py-2.5 pr-4 text-right font-semibold tabular-nums ${meta.signCls}`}>
                        {meta.sign}{parseFloat(m.quantity).toFixed(2)}
                      </td>
                      <td className="py-2.5 text-gray-500 text-sm">{m.reason || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* ── Replenish modal ───────────────────────────────────── */}
      {repProduct && (
        <ReplenishModal
          product={repProduct}
          onClose={() => setRepProduct(null)}
          onDone={handleReplenished}
        />
      )}
    </div>
  );
}
