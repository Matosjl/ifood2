import { useState, useEffect, useCallback } from 'react';
import {
  listProducts, createProduct, updateProduct, deleteProduct,
  listCategories, createCategory, deleteCategory,
} from '../api/products';

const fmt    = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2)}`;
const fmtPct = (n) => (n != null && n !== '' ? `${parseFloat(n).toFixed(1)}%` : '—');

// ─────────────────────────────────────────────────────────────
// Product modal (create / edit)
// ─────────────────────────────────────────────────────────────

function ProductModal({ product, categories, onClose, onSaved }) {
  const isEdit = !!product;

  const [form, setForm] = useState({
    name:           product?.name           ?? '',
    categoryId:     product?.category_id    ?? '',
    saleType:       product?.sale_type      ?? 'unit',
    costPrice:      product?.cost_price     ?? '',
    salePrice:      product?.sale_price     ?? '',
    stockQty:       '',          // only on create
    alertThreshold: product?.alert_threshold ?? '',
    description:    product?.description    ?? '',
    active:         product?.active         ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // ESC to close
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim())   return setError('Nome é obrigatório.');
    if (!form.salePrice)     return setError('Preço de venda é obrigatório.');
    setError(null);
    setSaving(true);

    try {
      const payload = {
        name:           form.name.trim(),
        categoryId:     form.categoryId  || undefined,
        saleType:       form.saleType,
        costPrice:      parseFloat(form.costPrice)      || 0,
        salePrice:      parseFloat(form.salePrice)      || 0,
        alertThreshold: parseFloat(form.alertThreshold) || 0,
        description:    form.description || undefined,
      };
      if (!isEdit) payload.stockQty = parseFloat(form.stockQty) || 0;
      else         payload.active   = form.active;

      const { data } = isEdit
        ? await updateProduct(product.id, payload)
        : await createProduct(payload);

      onSaved(data.data, isEdit);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao salvar produto.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-gray-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-base font-black text-white">
            {isEdit ? 'Editar Produto' : 'Novo Produto'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[80vh]">

          {/* Nome */}
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1 block">Nome *</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className="input w-full"
              placeholder="Ex: Hambúrguer Clássico"
              autoFocus
            />
          </div>

          {/* Categoria + Tipo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 font-semibold mb-1 block">Categoria</label>
              <select
                value={form.categoryId}
                onChange={(e) => set('categoryId', e.target.value)}
                className="input w-full"
              >
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 font-semibold mb-1 block">Tipo de Venda</label>
              <div className="flex rounded-xl overflow-hidden border border-white/10 h-[38px]">
                {['unit', 'kg'].map((t) => (
                  <button
                    key={t} type="button"
                    onClick={() => set('saleType', t)}
                    className={`flex-1 text-sm font-semibold transition-colors ${
                      form.saleType === t
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    {t === 'unit' ? 'Unidade' : 'Kg'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preços */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 font-semibold mb-1 block">Preço de Custo (R$)</label>
              <input
                type="number" min="0" step="0.01"
                value={form.costPrice}
                onChange={(e) => set('costPrice', e.target.value)}
                className="input w-full"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-semibold mb-1 block">Preço de Venda (R$) *</label>
              <input
                type="number" min="0" step="0.01"
                value={form.salePrice}
                onChange={(e) => set('salePrice', e.target.value)}
                className="input w-full"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Estoque / Alerta */}
          <div className="grid grid-cols-2 gap-3">
            {!isEdit && (
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">
                  Estoque Inicial ({form.saleType === 'kg' ? 'kg' : 'un'})
                </label>
                <input
                  type="number" min="0" step={form.saleType === 'kg' ? '0.1' : '1'}
                  value={form.stockQty}
                  onChange={(e) => set('stockQty', e.target.value)}
                  className="input w-full"
                  placeholder="0"
                />
              </div>
            )}
            <div>
              <label className="text-xs text-gray-400 font-semibold mb-1 block">
                Alerta de Estoque ({form.saleType === 'kg' ? 'kg' : 'un'})
              </label>
              <input
                type="number" min="0" step={form.saleType === 'kg' ? '0.1' : '1'}
                value={form.alertThreshold}
                onChange={(e) => set('alertThreshold', e.target.value)}
                className="input w-full"
                placeholder="0"
              />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1 block">Descrição (opcional)</label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className="input w-full h-16 resize-none"
              placeholder="Breve descrição do produto..."
            />
          </div>

          {/* Ativo — edit only */}
          {isEdit && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => set('active', e.target.checked)}
                className="w-4 h-4 accent-green-500 rounded"
              />
              <span className="text-sm text-gray-300">Produto ativo (aparece ao criar pedidos)</span>
            </label>
          )}

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
              {saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Produto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Category manager modal
// ─────────────────────────────────────────────────────────────

function CategoryModal({ categories, onClose, onAdded, onDeleted }) {
  const [name,   setName]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { data } = await createCategory(name.trim());
      onAdded(data.data);
      setName('');
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao criar categoria.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir esta categoria?')) return;
    try {
      await deleteCategory(id);
      onDeleted(id);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao excluir categoria.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-base font-black text-white">Categorias</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input flex-1 text-sm"
              placeholder="Nova categoria..."
              autoFocus
            />
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="btn-green px-4 disabled:opacity-50"
            >
              +
            </button>
          </form>

          {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

          <ul className="space-y-1 max-h-64 overflow-y-auto">
            {categories.length === 0 && (
              <li className="text-sm text-gray-600 text-center py-6 italic">Nenhuma categoria</li>
            )}
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-800/60">
                <span className="text-sm text-gray-300">{c.name}</span>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-400/10"
                  title="Excluir"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const [products,     setProducts]     = useState([]);
  const [categories,   setCategories]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [catFilter,    setCatFilter]    = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [modal,        setModal]        = useState(null); // null | {type:'product',product?} | {type:'category'}
  const [error,        setError]        = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, cRes] = await Promise.all([
        listProducts({ active: showInactive ? undefined : true, limit: 200 }),
        listCategories(),
      ]);
      setProducts(pRes.data.data ?? []);
      setCategories(cRes.data.data ?? []);
    } catch {
      setError('Erro ao carregar dados. Verifique a conexão.');
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (product, isEdit) => {
    if (isEdit) setProducts((prev) => prev.map((p) => p.id === product.id ? product : p));
    else        setProducts((prev) => [product, ...prev]);
  };

  const handleDelete = async (id) => {
    if (!confirm('Desativar este produto? Ele não aparecerá em novos pedidos.')) return;
    try {
      await deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert(err.response?.data?.message ?? 'Erro ao desativar produto.');
    }
  };

  // ── Filtered list ─────────────────────────────────────────
  const filtered = products.filter((p) => {
    if (catFilter && p.category_id !== catFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stockCls = (p) => {
    if (parseFloat(p.stock_qty) <= 0)          return 'text-red-400';
    if (p.alert_threshold > 0 && parseFloat(p.stock_qty) <= parseFloat(p.alert_threshold))
                                                return 'text-yellow-400';
    return 'text-green-400';
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">

      {/* ── Top bar ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-gray-900/80 backdrop-blur border-b border-white/5 shrink-0">
        <h1 className="text-lg font-black text-white shrink-0">📦 Produtos</h1>

        {/* Search */}
        <div className="flex-1 max-w-xs">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto..."
            className="input w-full text-sm"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {/* Mostrar inativos */}
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="accent-gray-500"
            />
            Inativos
          </label>

          {/* Categorias */}
          <button
            onClick={() => setModal({ type: 'category' })}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            Categorias
          </button>

          {/* Novo produto */}
          <button
            onClick={() => setModal({ type: 'product' })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Novo Produto
          </button>
        </div>
      </div>

      {/* ── Category filter pills ──────────────────────────────── */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 px-5 py-2 border-b border-white/[0.04] bg-gray-900/30 shrink-0 overflow-x-auto">
          <button
            onClick={() => setCatFilter('')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors shrink-0 ${
              !catFilter ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Todos
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCatFilter(catFilter === c.id ? '' : c.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors shrink-0 ${
                catFilter === c.id ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-4">
        {error && (
          <div className="text-center py-8 text-red-400 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-600">
            <span className="text-5xl">📦</span>
            <p className="text-sm italic">Nenhum produto encontrado</p>
            {!search && !catFilter && (
              <button
                onClick={() => setModal({ type: 'product' })}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                Criar primeiro produto →
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-white/[0.06]">
                <th className="pb-2.5 pr-4 font-semibold">Produto</th>
                <th className="pb-2.5 pr-4 font-semibold">Categoria</th>
                <th className="pb-2.5 pr-4 font-semibold">Tipo</th>
                <th className="pb-2.5 pr-4 font-semibold text-right">Custo</th>
                <th className="pb-2.5 pr-4 font-semibold text-right">Venda</th>
                <th className="pb-2.5 pr-4 font-semibold text-right">Margem</th>
                <th className="pb-2.5 pr-4 font-semibold text-right">Estoque</th>
                <th className="pb-2.5 pr-4 font-semibold">Status</th>
                <th className="pb-2.5 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">

                  {/* Nome */}
                  <td className="py-2.5 pr-4">
                    <p className="font-semibold text-gray-200 leading-tight">{p.name}</p>
                    {p.description && (
                      <p className="text-xs text-gray-500 truncate max-w-[200px] mt-0.5">{p.description}</p>
                    )}
                  </td>

                  {/* Categoria */}
                  <td className="py-2.5 pr-4 text-gray-400">{p.category_name || '—'}</td>

                  {/* Tipo */}
                  <td className="py-2.5 pr-4">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-700/60 text-gray-300">
                      {p.sale_type === 'kg' ? 'Kg' : 'Un'}
                    </span>
                  </td>

                  {/* Custo */}
                  <td className="py-2.5 pr-4 text-right text-gray-500 tabular-nums">{fmt(p.cost_price)}</td>

                  {/* Venda */}
                  <td className="py-2.5 pr-4 text-right text-gray-200 font-semibold tabular-nums">{fmt(p.sale_price)}</td>

                  {/* Margem */}
                  <td className={`py-2.5 pr-4 text-right tabular-nums font-semibold ${
                    parseFloat(p.margin_pct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {fmtPct(p.margin_pct)}
                  </td>

                  {/* Estoque */}
                  <td className={`py-2.5 pr-4 text-right tabular-nums font-semibold ${stockCls(p)}`}>
                    {parseFloat(p.stock_qty).toFixed(p.sale_type === 'kg' ? 2 : 0)}
                    <span className="text-xs text-gray-600 ml-0.5">{p.sale_type === 'kg' ? 'kg' : 'un'}</span>
                    {parseFloat(p.stock_qty) <= 0 && (
                      <span className="ml-1 text-[10px] bg-red-500/15 text-red-400 px-1 py-0.5 rounded">zerado</span>
                    )}
                    {parseFloat(p.alert_threshold) > 0 && parseFloat(p.stock_qty) > 0 && parseFloat(p.stock_qty) <= parseFloat(p.alert_threshold) && (
                      <span className="ml-1 text-[10px] bg-yellow-500/15 text-yellow-400 px-1 py-0.5 rounded">baixo</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="py-2.5 pr-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      p.active
                        ? 'bg-green-500/15 text-green-400'
                        : 'bg-gray-700/60 text-gray-500'
                    }`}>
                      {p.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>

                  {/* Ações */}
                  <td className="py-2.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setModal({ type: 'product', product: p })}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                        title="Editar"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {p.active && (
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                          title="Desativar"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────── */}
      {modal?.type === 'product' && (
        <ProductModal
          product={modal.product}
          categories={categories}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
      {modal?.type === 'category' && (
        <CategoryModal
          categories={categories}
          onClose={() => setModal(null)}
          onAdded={(cat) =>
            setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)))
          }
          onDeleted={(id) =>
            setCategories((prev) => prev.filter((c) => c.id !== id))
          }
        />
      )}
    </div>
  );
}
