import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axios';
import PrecificadorTab from '../components/PrecificadorTab';
import { listProducts, replenishStock, listAllMovements, createProduct, listCategories } from '../api/products';
import BarcodeModal from '../components/BarcodeModal';
import {
  listInsumos, createInsumo, updateInsumo, deleteInsumo, adjustInsumoStock,
  getProductInsumos, setProductInsumos,
  listBatches, createBatch, getDayReport,
  listWasteLogs, logWaste,
  getShoppingList, simulateProduction, getProfitRanking,
} from '../api/insumos';
import { listProducts as listProductsApi } from '../api/products';

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
// Ficha Técnica Tab — recipe editor (product → insumos)
// ─────────────────────────────────────────────────────────────

function FichaTecnicaTab({ insumos: allInsumos }) {
  const [products,    setProducts]    = useState([]);
  const [selProduct,  setSelProduct]  = useState(null);
  const [recipe,      setRecipe]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [msg,         setMsg]         = useState(null);
  const [addInsumoId, setAddInsumoId] = useState('');
  const [addQty,      setAddQty]      = useState('');

  useEffect(() => {
    listProducts({ active: true, limit: 200 })
      .then(({ data }) => setProducts(data.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSelectProduct = async (product) => {
    setSelProduct(product);
    setMsg(null);
    try {
      const { data } = await getProductInsumos(product.id);
      setRecipe(data.data ?? []);
    } catch { setRecipe([]); }
  };

  const handleAddItem = () => {
    if (!addInsumoId || !addQty) return;
    const ins = allInsumos.find((i) => i.id === addInsumoId);
    if (!ins) return;
    setRecipe((prev) => {
      const exists = prev.find((r) => r.insumo_id === addInsumoId);
      if (exists) return prev.map((r) => r.insumo_id === addInsumoId
        ? { ...r, qty_per_unit: parseFloat(addQty) } : r);
      return [...prev, { insumo_id: addInsumoId, name: ins.name, unit: ins.unit, qty_per_unit: parseFloat(addQty) }];
    });
    setAddInsumoId('');
    setAddQty('');
  };

  const handleRemove = (insumoId) => setRecipe((prev) => prev.filter((r) => r.insumo_id !== insumoId));

  const handleSave = async () => {
    if (!selProduct) return;
    setSaving(true); setMsg(null);
    try {
      await setProductInsumos(selProduct.id, recipe.map((r) => ({ insumo_id: r.insumo_id, qty_per_unit: r.qty_per_unit })));
      setMsg({ ok: true, text: 'Ficha técnica salva com sucesso!' });
    } catch { setMsg({ ok: false, text: 'Erro ao salvar.' }); }
    finally { setSaving(false); }
  };

  const unusedInsumos = allInsumos.filter((i) => !recipe.find((r) => r.insumo_id === i.id));

  return (
    <div className="space-y-4">
      {/* Produto seletor */}
      <div>
        <p className="text-xs text-gray-400 font-semibold mb-1">Selecionar produto</p>
        {loading ? (
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        ) : (
          <select
            className="input w-full max-w-sm"
            value={selProduct?.id ?? ''}
            onChange={(e) => {
              const p = products.find((x) => x.id === e.target.value);
              if (p) handleSelectProduct(p);
            }}
          >
            <option value="">— escolha um produto —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {selProduct && (
        <>
          {/* Receita atual */}
          <div className="bg-gray-800/50 rounded-xl border border-white/[0.06] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
              <p className="text-sm font-bold text-white">📋 Receita: {selProduct.name}</p>
              <p className="text-xs text-gray-500">{recipe.length} insumo{recipe.length !== 1 ? 's' : ''}</p>
            </div>
            {recipe.length === 0 ? (
              <p className="px-4 py-4 text-sm text-gray-600 italic">Nenhum insumo na receita ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-white/[0.04]">
                    <th className="px-4 py-2 text-left font-semibold">Insumo</th>
                    <th className="px-4 py-2 text-right font-semibold">Qtd / unidade vendida</th>
                    <th className="px-4 py-2 text-right font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {recipe.map((r) => (
                    <tr key={r.insumo_id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 text-gray-200 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 text-right">
                        <input
                          type="number" min="0.001" step="0.001"
                          value={r.qty_per_unit}
                          onChange={(e) => setRecipe((prev) => prev.map((x) =>
                            x.insumo_id === r.insumo_id ? { ...x, qty_per_unit: parseFloat(e.target.value) || 0 } : x
                          ))}
                          className="w-24 bg-gray-700 text-white text-xs rounded-lg px-2 py-1 text-right border border-white/10 focus:outline-none focus:border-orange-500/50"
                        />
                        <span className="text-gray-500 text-xs ml-1">{r.unit}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => handleRemove(r.insumo_id)}
                          className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-lg hover:bg-red-500/10">
                          remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Adicionar insumo */}
          {unusedInsumos.length > 0 && (
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 font-semibold mb-1">Adicionar insumo</p>
                <select className="input w-full" value={addInsumoId} onChange={(e) => setAddInsumoId(e.target.value)}>
                  <option value="">— selecionar —</option>
                  {unusedInsumos.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                </select>
              </div>
              <div className="w-28 shrink-0">
                <p className="text-xs text-gray-400 font-semibold mb-1">Qtd por unidade</p>
                <input type="number" min="0.001" step="0.001" placeholder="0" value={addQty}
                  onChange={(e) => setAddQty(e.target.value)} className="input w-full" />
              </div>
              <button onClick={handleAddItem}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 transition-colors shrink-0">
                + Add
              </button>
            </div>
          )}

          {msg && (
            <p className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              {msg.text}
            </p>
          )}

          <div className="flex justify-end">
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm transition-colors disabled:opacity-50">
              {saving ? 'Salvando...' : '💾 Salvar Ficha Técnica'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Produção Tab — daily production batches
// ─────────────────────────────────────────────────────────────

function ProducaoTab({ insumos: allInsumos }) {
  const today = new Date().toISOString().split('T')[0];
  const [date,     setDate]     = useState(today);
  const [batches,  setBatches]  = useState([]);
  const [report,   setReport]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  // Form state
  const [fInsumoId,  setFInsumoId]  = useState('');
  const [fRaw,       setFRaw]       = useState('');
  const [fCooked,    setFCooked]    = useState('');
  const [fNotes,     setFNotes]     = useState('');
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState(null);

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const [bRes, rRes] = await Promise.all([listBatches(d), getDayReport(d)]);
      setBatches(bRes.data.data ?? []);
      setReport(rRes.data.data ?? null);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    if (!fInsumoId) return setFormError('Selecione um insumo.');
    if (!fRaw || parseFloat(fRaw) <= 0) return setFormError('Informe a quantidade bruta.');
    if (!fCooked || parseFloat(fCooked) <= 0) return setFormError('Informe a quantidade preparada.');
    setSaving(true); setFormError(null);
    try {
      await createBatch({ insumo_id: fInsumoId, raw_quantity: fRaw, cooked_quantity: fCooked, produced_at: date, notes: fNotes.trim() || undefined });
      setShowForm(false);
      setFInsumoId(''); setFRaw(''); setFCooked(''); setFNotes('');
      load(date);
    } catch (err) {
      setFormError(err.response?.data?.message ?? 'Erro ao registrar produção.');
    } finally { setSaving(false); }
  };

  // Calcula rendimento ao preencher quantidades
  const yieldPct = fRaw && fCooked && parseFloat(fRaw) > 0
    ? ((parseFloat(fCooked) / parseFloat(fRaw)) * 100).toFixed(0)
    : null;

  const selInsumo = allInsumos.find((i) => i.id === fInsumoId);

  return (
    <div className="space-y-4">
      {/* Cabeçalho com data e botão */}
      <div className="flex items-center gap-3">
        <div>
          <p className="text-xs text-gray-400 font-semibold mb-1">Data</p>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="input text-sm" />
        </div>
        <div className="flex-1" />
        <button onClick={() => setShowForm((v) => !v)}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
            showForm ? 'bg-gray-700 text-gray-300' : 'bg-orange-500 hover:bg-orange-400 text-white'
          }`}>
          {showForm ? 'Cancelar' : '🍳 Registrar Produção'}
        </button>
      </div>

      {/* Formulário de produção */}
      {showForm && (
        <form onSubmit={handleCreateBatch}
          className="bg-gray-800/60 border border-white/[0.08] rounded-2xl p-4 space-y-3">
          <p className="text-sm font-bold text-white">Novo Lote de Produção</p>
          <div>
            <p className="text-xs text-gray-400 font-semibold mb-1">Insumo preparado</p>
            <select className="input w-full" value={fInsumoId} onChange={(e) => setFInsumoId(e.target.value)}>
              <option value="">— selecione o insumo —</option>
              {allInsumos.map((i) => <option key={i.id} value={i.id}>{i.name} (estoque: {parseFloat(i.qty_in_stock).toFixed(3)} {i.unit})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400 font-semibold mb-1">
                Qtd bruta usada{selInsumo ? ` (${selInsumo.unit})` : ''}
              </p>
              <input type="number" min="0.001" step="0.001" placeholder="Ex: 10" value={fRaw}
                onChange={(e) => setFRaw(e.target.value)} className="input w-full" />
              <p className="text-[10px] text-gray-600 mt-0.5">Debita do estoque bruto</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-semibold mb-1">
                Qtd preparada{selInsumo ? ` (${selInsumo.unit})` : ''}
              </p>
              <input type="number" min="0.001" step="0.001" placeholder="Ex: 25" value={fCooked}
                onChange={(e) => setFCooked(e.target.value)} className="input w-full" />
              {yieldPct && (
                <p className="text-[10px] text-orange-400 mt-0.5 font-semibold">
                  Rendimento: {yieldPct}%
                </p>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold mb-1">Observação (opcional)</p>
            <input type="text" placeholder="Ex: turno da manhã" value={fNotes}
              onChange={(e) => setFNotes(e.target.value)} className="input w-full" />
          </div>
          {formError && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{formError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/10">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold disabled:opacity-50">
              {saving ? 'Salvando...' : 'Confirmar Produção'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Lotes do dia */}
          {batches.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-600">
              <span className="text-4xl">🍳</span>
              <p className="text-sm italic">Nenhuma produção registrada para {date === today ? 'hoje' : date}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
                Lotes do dia — {batches.length} registro{batches.length !== 1 ? 's' : ''}
              </p>
              {batches.map((b) => {
                const consumedPct = parseFloat(b.cooked_quantity) > 0
                  ? (parseFloat(b.consumed_qty) / parseFloat(b.cooked_quantity) * 100).toFixed(0)
                  : 0;
                return (
                  <div key={b.id} className="bg-gray-800/50 border border-white/[0.06] rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">{b.insumo_name}</p>
                        {b.notes && <p className="text-xs text-gray-500 mt-0.5">{b.notes}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-500">Custo matéria-prima</p>
                        <p className="text-sm font-bold text-gray-300">R$ {parseFloat(b.raw_cost).toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      {[
                        { label: 'Bruto usado',  value: `${parseFloat(b.raw_quantity).toFixed(3)} ${b.unit}`,  cls: 'text-gray-400' },
                        { label: 'Preparado',    value: `${parseFloat(b.cooked_quantity).toFixed(3)} ${b.unit}`, cls: 'text-blue-400' },
                        { label: 'Consumido',    value: `${parseFloat(b.consumed_qty ?? 0).toFixed(3)} ${b.unit}`, cls: 'text-orange-400' },
                        { label: 'Restante',     value: `${parseFloat(b.remaining_qty).toFixed(3)} ${b.unit}`, cls: parseFloat(b.remaining_qty) > 0 ? 'text-green-400' : 'text-red-400' },
                      ].map(({ label, value, cls }) => (
                        <div key={label} className="bg-gray-900/60 rounded-lg p-2 text-center">
                          <p className="text-[10px] text-gray-600 font-semibold uppercase">{label}</p>
                          <p className={`text-sm font-bold tabular-nums mt-0.5 ${cls}`}>{value}</p>
                        </div>
                      ))}
                    </div>
                    {/* Barra de progresso consumo */}
                    <div className="mt-3">
                      <div className="flex justify-between text-[10px] text-gray-600 mb-1">
                        <span>Consumo do dia</span>
                        <span>{consumedPct}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 rounded-full transition-all"
                          style={{ width: `${Math.min(100, consumedPct)}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Relatório do dia */}
          {report && report.batches?.length > 0 && (
            <div className="mt-4 bg-gray-800/40 border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
                <span className="text-base">📊</span>
                <p className="text-sm font-black text-white">Relatório do Dia</p>
                <span className="text-xs text-gray-500">{date === today ? 'Hoje' : date}</span>
              </div>
              <div className="p-4 space-y-3">
                {report.batches.map((r, i) => (
                  <div key={i} className="grid grid-cols-5 gap-2 text-xs items-center py-2 border-b border-white/[0.04] last:border-0">
                    <div className="col-span-1 font-semibold text-gray-300 truncate">{r.insumo_name}</div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-600">Preparado</p>
                      <p className="font-bold text-white">{parseFloat(r.total_cooked).toFixed(2)} {r.unit}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-600">Consumido</p>
                      <p className="font-bold text-orange-400">{parseFloat(r.total_consumed ?? 0).toFixed(2)} {r.unit}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-600">Restante</p>
                      <p className={`font-bold ${parseFloat(r.total_remaining) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {parseFloat(r.total_remaining).toFixed(2)} {r.unit}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-600">% consumo</p>
                      <p className={`font-bold ${parseFloat(r.consumption_pct) >= 80 ? 'text-green-400' : parseFloat(r.consumption_pct) >= 50 ? 'text-yellow-400' : 'text-gray-500'}`}>
                        {parseFloat(r.consumption_pct ?? 0).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-gray-500">Custo total de matéria-prima</p>
                  <p className="text-sm font-black text-white">R$ {parseFloat(report.totalRawCost ?? 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Perdas Tab — waste log
// ─────────────────────────────────────────────────────────────

const WASTE_REASONS = [
  { value: 'operational', label: '⚙️ Operacional',   cls: 'bg-gray-500/20 text-gray-300' },
  { value: 'burned',      label: '🔥 Queimado',       cls: 'bg-orange-500/20 text-orange-300' },
  { value: 'expired',     label: '🗑️ Vencido',        cls: 'bg-red-500/20 text-red-300' },
  { value: 'broken',      label: '💔 Quebrado',       cls: 'bg-yellow-500/20 text-yellow-300' },
  { value: 'other',       label: '📦 Outro',          cls: 'bg-blue-500/20 text-blue-300' },
];

function PerdasTab({ insumos: allInsumos }) {
  const [logs,     setLogs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [fInsumo,  setFInsumo]  = useState('');
  const [fQty,     setFQty]     = useState('');
  const [fReason,  setFReason]  = useState('operational');
  const [fNotes,   setFNotes]   = useState('');
  const [saving,   setSaving]   = useState(false);
  const [formErr,  setFormErr]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await listWasteLogs({ limit: 100 }); setLogs(data.data ?? []); }
    catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalCost = logs.reduce((s, l) => s + parseFloat(l.cost ?? 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fInsumo) return setFormErr('Selecione um insumo.');
    if (!fQty || parseFloat(fQty) <= 0) return setFormErr('Informe a quantidade.');
    setSaving(true); setFormErr(null);
    try {
      await logWaste({ insumo_id: fInsumo, quantity: fQty, reason_type: fReason, notes: fNotes.trim() || undefined });
      setShowForm(false); setFInsumo(''); setFQty(''); setFReason('operational'); setFNotes('');
      load();
    } catch (err) { setFormErr(err.response?.data?.message ?? 'Erro ao registrar.'); }
    finally { setSaving(false); }
  };

  const selIns = allInsumos.find((i) => i.id === fInsumo);
  const estCost = selIns && fQty ? parseFloat((parseFloat(fQty) * parseFloat(selIns.cost_per_unit)).toFixed(2)) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex gap-3">
          {[{ label: 'Total registrado', value: `${logs.length}`, cls: 'text-white' },
            { label: 'Custo perdido', value: `R$ ${totalCost.toFixed(2)}`, cls: 'text-red-400' }]
            .map(({ label, value, cls }) => (
              <div key={label} className="bg-gray-800/60 border border-white/[0.06] rounded-xl px-4 py-2">
                <p className="text-[10px] text-gray-500 font-semibold uppercase">{label}</p>
                <p className={`text-lg font-black tabular-nums mt-0.5 ${cls}`}>{value}</p>
              </div>
            ))}
        </div>
        <div className="flex-1" />
        <button onClick={() => setShowForm((v) => !v)}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${showForm ? 'bg-gray-700 text-gray-300' : 'bg-red-600 hover:bg-red-500 text-white'}`}>
          {showForm ? 'Cancelar' : '📋 Registrar Perda'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-800/60 border border-white/[0.08] rounded-2xl p-4 space-y-3">
          <p className="text-sm font-bold text-white">Nova Perda Operacional</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400 font-semibold mb-1">Insumo</p>
              <select className="input w-full" value={fInsumo} onChange={(e) => setFInsumo(e.target.value)}>
                <option value="">— selecione —</option>
                {allInsumos.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-semibold mb-1">
                Quantidade{selIns ? ` (${selIns.unit})` : ''}
              </p>
              <input type="number" min="0.001" step="0.001" value={fQty} onChange={(e) => setFQty(e.target.value)}
                className="input w-full" placeholder="0" />
              {estCost !== null && (
                <p className="text-[10px] text-red-400 mt-0.5 font-semibold">
                  Custo estimado: R$ {estCost.toFixed(2)}
                </p>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold mb-1">Motivo</p>
            <div className="flex flex-wrap gap-2">
              {WASTE_REASONS.map((r) => (
                <button key={r.value} type="button"
                  onClick={() => setFReason(r.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                    fReason === r.value ? r.cls + ' border-current' : 'bg-gray-800 text-gray-500 border-white/10 hover:text-gray-300'
                  }`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold mb-1">Observação</p>
            <input type="text" value={fNotes} onChange={(e) => setFNotes(e.target.value)}
              className="input w-full" placeholder="Opcional" />
          </div>
          {formErr && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{formErr}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/10">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold disabled:opacity-50">
              {saving ? 'Salvando...' : 'Confirmar Perda'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-7 h-7 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-600">
          <span className="text-4xl">✅</span>
          <p className="text-sm italic">Nenhuma perda registrada</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-white/[0.06]">
              <th className="pb-2 text-left font-semibold">Data</th>
              <th className="pb-2 text-left font-semibold">Insumo</th>
              <th className="pb-2 text-center font-semibold">Tipo</th>
              <th className="pb-2 text-right font-semibold">Quantidade</th>
              <th className="pb-2 text-right font-semibold">Custo</th>
              <th className="pb-2 text-left font-semibold pl-3">Obs.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {logs.map((l) => {
              const r = WASTE_REASONS.find((x) => x.value === l.reason_type) ?? WASTE_REASONS[0];
              return (
                <tr key={l.id} className="hover:bg-white/[0.02]">
                  <td className="py-2.5 pr-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(l.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="py-2.5 pr-3 font-medium text-gray-300">{l.insumo_name}</td>
                  <td className="py-2.5 pr-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.cls}`}>{r.label}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-white">
                    {parseFloat(l.quantity).toFixed(3)} {l.unit}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-red-400 font-semibold tabular-nums">
                    R$ {parseFloat(l.cost).toFixed(2)}
                  </td>
                  <td className="py-2.5 pl-3 text-gray-500 text-xs">{l.notes || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Inteligência Tab — lista de compras + simulador + ranking
// ─────────────────────────────────────────────────────────────

function InteligenciaTab({ insumos: allInsumos }) {
  const [subTab,        setSubTab]        = useState('compras');
  // Lista de compras
  const [shopping,      setShopping]      = useState(null);
  const [shLoading,     setShLoading]     = useState(false);
  const [coverDays,     setCoverDays]     = useState(3);
  // Simulador
  const [products,      setProducts]      = useState([]);
  const [simProduct,    setSimProduct]    = useState('');
  const [simQty,        setSimQty]        = useState('');
  const [simResult,     setSimResult]     = useState(null);
  const [simLoading,    setSimLoading]    = useState(false);
  // Ranking
  const [ranking,       setRanking]       = useState([]);
  const [rankDays,      setRankDays]      = useState(30);
  const [rankLoading,   setRankLoading]   = useState(false);

  useEffect(() => {
    listProductsApi({ active: true, limit: 200 }).then(({ data }) => setProducts(data.data ?? [])).catch(() => {});
  }, []);

  const loadShopping = async () => {
    setShLoading(true);
    try { const { data } = await getShoppingList({ cover_days: coverDays }); setShopping(data.data); }
    catch { /* non-fatal */ }
    finally { setShLoading(false); }
  };

  const loadRanking = async (days) => {
    setRankLoading(true);
    try { const { data } = await getProfitRanking(days); setRanking(data.data ?? []); }
    catch { /* non-fatal */ }
    finally { setRankLoading(false); }
  };

  useEffect(() => { if (subTab === 'compras') loadShopping(); }, [subTab]);
  useEffect(() => { if (subTab === 'ranking') loadRanking(rankDays); }, [subTab, rankDays]);

  const handleSimulate = async () => {
    if (!simProduct || !simQty || parseFloat(simQty) <= 0) return;
    setSimLoading(true);
    try { const { data } = await simulateProduction(simProduct, simQty); setSimResult(data.data); }
    catch { /* non-fatal */ }
    finally { setSimLoading(false); }
  };

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1">
        {[['compras','🛒 Lista de Compras'],['simulador','🧮 Simulador'],['ranking','🏆 Ranking Lucro']].map(([t,l]) => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${subTab === t ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── Lista de compras ── */}
      {subTab === 'compras' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-400 font-semibold">Cobrir</p>
              {[1,2,3,5,7].map((d) => (
                <button key={d} onClick={() => setCoverDays(d)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${coverDays === d ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                  {d}d
                </button>
              ))}
            </div>
            <button onClick={loadShopping} disabled={shLoading}
              className="ml-auto px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50">
              {shLoading ? '⏳' : '🔄 Calcular'}
            </button>
          </div>

          {shopping && (
            <>
              {shopping.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-24 gap-2 text-gray-600">
                  <span className="text-3xl">✅</span>
                  <p className="text-sm italic">Estoque suficiente para {coverDays} dias</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">
                      Baseado nos últimos {shopping.lookbackDays} dias · cobertura {shopping.coverDays}d
                    </p>
                    <p className="text-sm font-bold text-white">
                      Total estimado: <span className="text-orange-400">R$ {parseFloat(shopping.totalEstimatedCost).toFixed(2)}</span>
                    </p>
                  </div>
                  <div className="space-y-2">
                    {shopping.items.map((item) => {
                      const urgency = parseFloat(item.days_remaining ?? 99);
                      const cls = urgency <= 0 ? 'border-red-500/40 bg-red-500/5'
                                : urgency <= 1 ? 'border-yellow-500/40 bg-yellow-500/5'
                                : 'border-white/[0.06] bg-gray-800/40';
                      return (
                        <div key={item.id} className={`border rounded-xl p-3 flex items-center gap-4 ${cls}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-white">{item.name}</p>
                              {urgency <= 0 && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 rounded-full font-bold">SEM ESTOQUE</span>}
                              {urgency > 0 && urgency <= 1 && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 rounded-full font-bold">⚠️ {urgency}d</span>}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Estoque: {parseFloat(item.qty_in_stock).toFixed(3)} {item.unit} · média {parseFloat(item.avg_daily_usage).toFixed(2)}/dia
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-black text-orange-400 tabular-nums">
                              +{parseFloat(item.qty_to_buy).toFixed(3)} {item.unit}
                            </p>
                            <p className="text-xs text-gray-500">
                              ≈ R$ {parseFloat(item.estimated_cost).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
          {!shopping && !shLoading && (
            <div className="flex flex-col items-center justify-center h-24 gap-2 text-gray-600">
              <p className="text-sm italic">Clique em Calcular para gerar a lista</p>
            </div>
          )}
        </div>
      )}

      {/* ── Simulador ── */}
      {subTab === 'simulador' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">Informe um produto e quantidade desejada para ver os ingredientes necessários.</p>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <p className="text-xs text-gray-400 font-semibold mb-1">Produto</p>
              <select className="input w-full" value={simProduct} onChange={(e) => setSimProduct(e.target.value)}>
                <option value="">— selecionar —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="w-28 shrink-0">
              <p className="text-xs text-gray-400 font-semibold mb-1">Quantidade</p>
              <input type="number" min="1" step="1" value={simQty} onChange={(e) => setSimQty(e.target.value)}
                className="input w-full" placeholder="Ex: 200" />
            </div>
            <button onClick={handleSimulate} disabled={simLoading || !simProduct || !simQty}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold disabled:opacity-50 shrink-0">
              {simLoading ? '⏳' : '🧮 Calcular'}
            </button>
          </div>

          {simResult && (
            <div className="bg-gray-800/50 border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className={`px-4 py-3 border-b border-white/[0.06] flex items-center gap-3 ${simResult.feasible ? 'bg-green-500/5' : 'bg-red-500/5'}`}>
                <span className="text-lg">{simResult.feasible ? '✅' : '❌'}</span>
                <div>
                  <p className="text-sm font-black text-white">
                    {simResult.quantity} unidades — {simResult.feasible ? 'Possível produzir' : 'Ingredientes insuficientes'}
                  </p>
                  <p className="text-xs text-gray-400">Custo estimado: <span className="text-white font-bold">R$ {parseFloat(simResult.totalCost).toFixed(2)}</span></p>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-white/[0.04]">
                    <th className="px-4 py-2 text-left font-semibold">Insumo</th>
                    <th className="px-4 py-2 text-right font-semibold">Necessário</th>
                    <th className="px-4 py-2 text-right font-semibold">Disponível</th>
                    <th className="px-4 py-2 text-center font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {simResult.recipe.map((r) => (
                    <tr key={r.insumo_id} className={r.sufficient ? '' : 'bg-red-500/5'}>
                      <td className="px-4 py-2.5 font-medium text-gray-300">{r.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white font-semibold">
                        {r.needed.toFixed(3)} {r.unit}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className={r.sufficient ? 'text-green-400' : 'text-red-400'}>
                          {r.totalAvailable.toFixed(3)} {r.unit}
                        </span>
                        {r.inBatch > 0 && <span className="text-gray-600 text-xs ml-1">(lote: {r.inBatch.toFixed(2)})</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {r.sufficient ? (
                          <span className="text-xs bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full font-semibold">OK</span>
                        ) : (
                          <span className="text-xs bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full font-semibold">
                            Falta {r.missing.toFixed(3)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Ranking de lucro ── */}
      {subTab === 'ranking' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-400 font-semibold">Período:</p>
            {[7,14,30,60,90].map((d) => (
              <button key={d} onClick={() => setRankDays(d)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${rankDays === d ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                {d}d
              </button>
            ))}
            {rankLoading && <span className="text-xs text-gray-500 animate-pulse ml-2">Carregando...</span>}
          </div>

          {ranking.length === 0 && !rankLoading ? (
            <div className="flex flex-col items-center justify-center h-24 gap-2 text-gray-600">
              <p className="text-sm italic">Sem dados de CMV para o período (ficha técnica necessária)</p>
            </div>
          ) : (
            <div className="space-y-2">
              {ranking.map((r, i) => {
                const marginPct = parseFloat(r.margin_pct ?? 0);
                const marginCls = marginPct >= 60 ? 'text-green-400' : marginPct >= 40 ? 'text-yellow-400' : 'text-red-400';
                return (
                  <div key={r.product_name}
                    className="bg-gray-800/50 border border-white/[0.06] rounded-xl p-3 flex items-center gap-4">
                    <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center shrink-0">
                      <span className="text-xs font-black text-gray-400">#{i + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{r.product_name}</p>
                      <p className="text-xs text-gray-500">
                        {r.units_sold} vendas · ticket médio R$ {parseFloat(r.avg_price).toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right shrink-0 space-y-0.5">
                      <p className="text-sm font-black text-white tabular-nums">
                        R$ {parseFloat(r.gross_profit).toFixed(2)}
                      </p>
                      <div className="flex items-center justify-end gap-2 text-xs">
                        <span className="text-gray-600">CMV R$ {parseFloat(r.cmv).toFixed(2)}</span>
                        <span className={`font-bold ${marginCls}`}>{marginPct.toFixed(1)}% mg</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Motor de Decisões — analisa vendas × margem e sugere ações
// ─────────────────────────────────────────────────────────────

function MotorDecisoesTab() {
  const [decisions,  setDecisions]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [generated,  setGenerated]  = useState(false);
  const [aiAnswer,   setAiAnswer]   = useState(null);
  const [aiLoading,  setAiLoading]  = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      // Busca ranking de lucro (7 dias)
      const { data } = await getProfitRanking(7);
      const products = data.data ?? [];
      setDecisions(buildDecisions(products));
      setGenerated(true);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  const askAi = async (decision) => {
    setAiLoading(true);
    setAiAnswer(null);
    try {
      const { data } = await api.post('/ai/center/chat', {
        message: `Produto "${decision.name}": vendeu ${decision.qty} unidades nos últimos 7 dias com margem de ${decision.margin}%. ${decision.suggestion}. Qual ação concreta eu devo tomar? Me dê uma recomendação em 2-3 frases.`,
      });
      setAiAnswer(data.data?.response ?? data.response ?? '—');
    } catch { setAiAnswer('IA indisponível no momento.'); }
    finally { setAiLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-800/60 rounded-2xl border border-white/[0.06] p-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-black text-white">🎯 Motor de Decisões</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Analisa vendas × margem dos últimos 7 dias e sugere ações concretas de precificação
            </p>
          </div>
          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold disabled:opacity-50 transition-colors shrink-0"
          >
            {loading ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Analisando…</>
            ) : (
              <>{generated ? '🔄 Reanalisar' : '🚀 Analisar agora'}</>
            )}
          </button>
        </div>

        {!generated && !loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-600">
            <span className="text-5xl">🎯</span>
            <p className="text-sm text-center">
              Clique em "Analisar agora" para receber sugestões de preço<br />
              baseadas no desempenho real dos seus produtos
            </p>
          </div>
        )}

        {generated && decisions.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">
            Nenhum dado de vendas encontrado para os últimos 7 dias.
          </p>
        )}

        {decisions.length > 0 && (
          <div className="space-y-3">
            {decisions.map((d, i) => (
              <DecisionCard key={i} decision={d} onAsk={askAi} />
            ))}
          </div>
        )}
      </div>

      {/* AI detailed answer */}
      {(aiLoading || aiAnswer) && (
        <div className="bg-gray-800/60 rounded-2xl border border-orange-500/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🤖</span>
            <p className="text-sm font-black text-white">Análise da IA</p>
          </div>
          {aiLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-400">Consultando IA…</span>
            </div>
          ) : (
            <p className="text-sm text-gray-300 leading-relaxed">{aiAnswer}</p>
          )}
        </div>
      )}
    </div>
  );
}

function buildDecisions(products) {
  return products
    .filter((p) => (p.units_sold ?? p.total_qty ?? 0) > 0)
    .map((p) => {
      const qty    = parseInt(p.units_sold ?? p.total_qty ?? 0, 10);
      const margin = parseFloat(p.margin_pct ?? 0);
      const price  = parseFloat(p.avg_price ?? p.sale_price ?? 0);

      let action = 'neutral';
      let suggestion = '';
      let impact = '';

      if (margin < 20 && qty > 5) {
        action = 'raise_price';
        const suggested = (price * 1.10).toFixed(2);
        suggestion = `Margem baixa (${margin.toFixed(1)}%) mas alta demanda. Considere aumentar para R$ ${suggested}`;
        impact = `+R$ ${((parseFloat(suggested) - price) * qty).toFixed(2)} estimado/sem`;
      } else if (margin >= 40 && qty < 3) {
        action = 'lower_price';
        const suggested = (price * 0.90).toFixed(2);
        suggestion = `Alta margem (${margin.toFixed(1)}%) mas baixa procura. Tente R$ ${suggested} para estimular vendas`;
        impact = `Possível +${Math.round(qty * 1.5)} un/sem com preço menor`;
      } else if (margin >= 30 && qty >= 10) {
        action = 'star';
        suggestion = `Produto estrela! Margem ${margin.toFixed(1)}% com ${qty} vendas. Mantenha em destaque no cardápio`;
        impact = `Já rende bem — promova mais`;
      } else {
        suggestion = `Margem ${margin.toFixed(1)}% e ${qty} vendas. Sem ajuste urgente`;
        impact = 'Monitorar';
      }

      return { name: p.product_name ?? p.name, qty, margin, price, action, suggestion, impact };
    })
    .sort((a, b) => {
      const priority = { raise_price: 0, lower_price: 1, star: 2, neutral: 3 };
      return (priority[a.action] ?? 3) - (priority[b.action] ?? 3);
    });
}

function DecisionCard({ decision, onAsk }) {
  const cfg = {
    raise_price: { bg: 'bg-red-500/10 border-red-500/20',    badge: 'bg-red-500/20 text-red-300',    label: '↑ Aumentar preço',  icon: '📈' },
    lower_price: { bg: 'bg-blue-500/10 border-blue-500/20',   badge: 'bg-blue-500/20 text-blue-300',   label: '↓ Reduzir preço',   icon: '📉' },
    star:        { bg: 'bg-green-500/10 border-green-500/20', badge: 'bg-green-500/20 text-green-300', label: '⭐ Produto estrela', icon: '🌟' },
    neutral:     { bg: 'bg-gray-700/50 border-white/[0.06]',  badge: 'bg-gray-600/40 text-gray-400',   label: '→ Monitorar',       icon: '👁️' },
  };
  const c = cfg[decision.action] ?? cfg.neutral;

  return (
    <div className={`rounded-xl border p-3 ${c.bg}`}>
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0 mt-0.5">{c.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-black text-white truncate">{decision.name}</p>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${c.badge}`}>{c.label}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">{decision.suggestion}</p>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-3 text-[11px] text-gray-600">
              <span>{decision.qty} vendas/sem</span>
              <span>{decision.margin.toFixed(1)}% margem</span>
              <span className="text-orange-400 font-semibold">{decision.impact}</span>
            </div>
            {decision.action !== 'neutral' && (
              <button
                onClick={() => onAsk(decision)}
                className="text-[10px] font-bold text-gray-400 hover:text-white px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                Pedir análise IA →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Modal de cadastro rápido por código de barras
// ─────────────────────────────────────────────────────────────

function BarcodeQuickCreateModal({ preset, onClose, onSaved }) {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    name:        preset?.name     || '',
    barcode:     preset?.barcode  || '',
    categoryId:  '',
    saleType:    'unit',
    costPrice:   '',
    salePrice:   '',
    stockQty:    '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  useEffect(() => {
    listCategories().then(r => setCategories(r.data.data ?? [])).catch(() => {});
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim())  return setError('Nome é obrigatório.');
    if (!form.salePrice)    return setError('Preço de venda é obrigatório.');
    setSaving(true);
    setError(null);
    try {
      const { data } = await createProduct({
        name:           form.name.trim(),
        barcode:        form.barcode.trim() || undefined,
        categoryId:     form.categoryId    || undefined,
        saleType:       form.saleType,
        costPrice:      parseFloat(form.costPrice)  || 0,
        salePrice:      parseFloat(form.salePrice)  || 0,
        stockQty:       parseFloat(form.stockQty)   || 0,
      });
      onSaved(data.data);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao salvar produto.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-gray-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="text-base font-black text-white">Cadastrar Produto</h2>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">{form.barcode || 'Código manual'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3 overflow-y-auto max-h-[80vh]">
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1 block">Nome *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className="input w-full" placeholder="Nome do produto" autoFocus />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1 block">Código de barras</label>
            <input value={form.barcode} onChange={e => set('barcode', e.target.value)}
              className="input w-full font-mono" placeholder="Código de barras" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 font-semibold mb-1 block">Categoria</label>
              <select value={form.categoryId} onChange={e => set('categoryId', e.target.value)} className="input w-full">
                <option value="">Sem categoria</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 font-semibold mb-1 block">Tipo</label>
              <div className="flex rounded-xl overflow-hidden border border-white/10 h-[38px]">
                {['unit','kg'].map(t => (
                  <button key={t} type="button" onClick={() => set('saleType', t)}
                    className={`flex-1 text-sm font-semibold transition-colors ${form.saleType === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                    {t === 'unit' ? 'Unidade' : 'Kg'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-400 font-semibold mb-1 block">Custo (R$)</label>
              <input type="number" min="0" step="0.01" value={form.costPrice}
                onChange={e => set('costPrice', e.target.value)} className="input w-full" placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-semibold mb-1 block">Venda (R$) *</label>
              <input type="number" min="0" step="0.01" value={form.salePrice}
                onChange={e => set('salePrice', e.target.value)} className="input w-full" placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-semibold mb-1 block">Estoque</label>
              <input type="number" min="0" step={form.saleType === 'kg' ? '0.1' : '1'} value={form.stockQty}
                onChange={e => set('stockQty', e.target.value)} className="input w-full" placeholder="0" />
            </div>
          </div>
          {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 btn-green disabled:opacity-50">
              {saving ? 'Salvando...' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function StockPage() {
  const [products,  setProducts]  = useState([]);
  const [movements, setMovements] = useState([]);
  const [insumos,   setInsumos]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [tab,       setTab]       = useState('stock'); // 'stock' | 'movements' | 'insumos' | 'producao' | 'ficha'
  const [repProduct,    setRepProduct]    = useState(null);
  const [barcodeOpen,   setBarcodeOpen]   = useState(false);
  const [barcodePreset, setBarcodePreset] = useState(null); // { name, barcode, ... } para pré-preencher

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, mRes, iRes] = await Promise.all([
        listProducts({ active: true, limit: 200 }),
        listAllMovements({ limit: 100 }),
        listInsumos(),
      ]);
      setProducts(pRes.data.data ?? []);
      setMovements(mRes.data.data ?? []);
      setInsumos(iRes.data.data ?? []);
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
          onClick={() => setBarcodeOpen(true)}
          title="Leitor de código de barras"
          className="ml-auto btn-green px-3 py-2 text-sm flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 4h1v16H3V4zm3 0h1v16H6V4zm3 0h2v16H9V4zm4 0h1v16h-1V4zm3 0h1v16h-1V4zm3 0h1v16h-1V4z" />
          </svg>
          Leitor
        </button>
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
      <div className="flex gap-1 px-5 py-2 border-b border-white/[0.04] bg-gray-900/30 shrink-0 overflow-x-auto">
        {[
          ['stock',     '📦 Produtos'],
          ['movements', '📋 Movimentações'],
          ['insumos',   '🧂 Insumos'],
          ['producao',    '🍳 Produção'],
          ['ficha',       '📋 Ficha Técnica'],
          ['perdas',      '🔥 Perdas'],
          ['inteligencia','🧠 Inteligência'],
          ['precificador','🏷️ Precificador'],
          ['decisoes',    '🎯 Decisões'],
        ].map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
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
        ) : tab === 'producao' ? (
          <ProducaoTab insumos={insumos} />
        ) : tab === 'ficha' ? (
          <FichaTecnicaTab insumos={insumos} />
        ) : tab === 'perdas' ? (
          <PerdasTab insumos={insumos} />
        ) : tab === 'inteligencia' ? (
          <InteligenciaTab insumos={insumos} />
        ) : tab === 'precificador' ? (
          <PrecificadorTab />
        ) : tab === 'decisoes' ? (
          <MotorDecisoesTab />
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

      {/* ── Barcode modal ─────────────────────────────────────── */}
      {barcodeOpen && (
        <BarcodeModal
          onClose={() => setBarcodeOpen(false)}
          onFoundProduct={(product) => {
            setBarcodeOpen(false);
            setRepProduct(product);
          }}
          onNewProduct={(prefill) => {
            setBarcodePreset(prefill);
            setBarcodeOpen(false);
          }}
        />
      )}

      {/* ── Cadastro rápido por barcode ───────────────────────── */}
      {barcodePreset && (
        <BarcodeQuickCreateModal
          preset={barcodePreset}
          onClose={() => setBarcodePreset(null)}
          onSaved={(p) => {
            setProducts((prev) => [p, ...prev]);
            setBarcodePreset(null);
          }}
        />
      )}
    </div>
  );
}
