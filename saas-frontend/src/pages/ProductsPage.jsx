import { useState, useEffect, useCallback, useRef } from 'react';
import {
  listProducts, createProduct, updateProduct, deleteProduct,
  listCategories, createCategory, deleteCategory,
  createVarGroup, updateVarGroup, deleteVarGroup,
  createVarOption, updateVarOption, deleteVarOption,
} from '../api/products';
import { uploadProductImage } from '../api/products_upload';
import { listInsumos, getProductInsumos, setProductInsumos } from '../api/insumos';
import {
  getCombo, addComboItem, removeComboItem,
  getOptionGroups, createOptionGroup, deleteOptionGroup, updateOptionGroup,
  addOptionItem, removeOptionItem,
} from '../api/combos';
import QuickRegisterModal from '../components/QuickRegisterModal';

const fmt    = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2)}`;
const fmtPct = (n) => (n != null && n !== '' ? `${parseFloat(n).toFixed(1)}%` : '—');

// ─────────────────────────────────────────────────────────────
// Combo Manager (usado dentro do ProductModal quando is_combo)
// ─────────────────────────────────────────────────────────────

function ComboManager({ productId, allProducts }) {
  const [combo,    setCombo]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [childId,  setChildId]  = useState('');
  const [qty,      setQty]      = useState('1');
  const [adding,   setAdding]   = useState(false);
  const [error,    setError]    = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getCombo(productId);
      setCombo(data.data);
    } catch (e) {
      setError(e.response?.data?.message ?? 'Erro ao carregar combo.');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { reload(); }, [reload]);

  const handleAdd = async () => {
    if (!childId || !qty || parseFloat(qty) <= 0) return;
    setAdding(true);
    setError(null);
    try {
      const { data } = await addComboItem(productId, { child_product_id: childId, qty: parseFloat(qty) });
      setCombo(data.data);
      setChildId('');
      setQty('1');
    } catch (e) {
      setError(e.response?.data?.message ?? 'Erro ao adicionar item.');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (itemId) => {
    setError(null);
    try {
      const { data } = await removeComboItem(productId, itemId);
      setCombo(data.data);
    } catch (e) {
      setError(e.response?.data?.message ?? 'Erro ao remover item.');
    }
  };

  // Produtos disponíveis: não é o próprio, não é combo, está ativo
  const available = (allProducts ?? []).filter(
    (p) => p.id !== productId && !p.is_combo && p.active
  );

  if (loading) return (
    <div className="flex justify-center py-4">
      <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        O combo debita o estoque dos filhos na venda. O custo é calculado automaticamente.
      </p>

      {/* Itens atuais */}
      {combo?.items?.length > 0 ? (
        <div className="space-y-1.5">
          {combo.items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 bg-gray-800/40 rounded-xl px-3 py-2 border border-white/[0.06]">
              <span className="flex-1 text-sm text-gray-200 truncate">{item.child_name}</span>
              <span className="text-xs text-gray-500 shrink-0">×{item.qty}</span>
              <span className="text-xs text-green-400 font-semibold shrink-0 tabular-nums">
                R$ {parseFloat(item.line_cost ?? 0).toFixed(2)}
              </span>
              <button type="button" onClick={() => handleRemove(item.id)}
                className="text-gray-600 hover:text-red-400 transition-colors text-sm shrink-0 ml-1">✕</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-600 italic">Nenhum item adicionado ainda.</p>
      )}

      {/* Resumo financeiro */}
      {combo && (
        <div className="grid grid-cols-3 gap-2 bg-gray-800/30 rounded-xl px-3 py-2 border border-white/[0.04]">
          <div className="text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Custo</p>
            <p className="text-sm font-bold text-red-400 tabular-nums">R$ {parseFloat(combo.estimated_cost ?? 0).toFixed(2)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Venda</p>
            <p className="text-sm font-bold text-gray-200 tabular-nums">R$ {parseFloat(combo.combo?.sale_price ?? 0).toFixed(2)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Margem</p>
            <p className={`text-sm font-bold tabular-nums ${(combo.margin_pct ?? 0) >= 20 ? 'text-green-400' : 'text-yellow-400'}`}>
              {combo.margin_pct != null ? `${combo.margin_pct}%` : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Adicionar item */}
      <div className="flex gap-2">
        <select value={childId} onChange={(e) => setChildId(e.target.value)} className="input flex-1 text-sm">
          <option value="">Selecionar produto...</option>
          {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="number" min="0.5" step="0.5" value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="input w-16 text-sm text-center" placeholder="Qtd" />
        <button type="button" onClick={handleAdd} disabled={adding || !childId}
          className="px-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold disabled:opacity-50 transition-colors shrink-0">
          {adding ? '...' : '+'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Option Group Manager — Grupos de Escolha (Combo V2)
// ─────────────────────────────────────────────────────────────

function OptionGroupManager({ productId, allProducts }) {
  const [groups,     setGroups]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [grpName,    setGrpName]    = useState('');
  const [grpMin,     setGrpMin]     = useState('1');
  const [grpMax,     setGrpMax]     = useState('1');
  const [addingGrp,  setAddingGrp]  = useState(false);
  const [newItem,    setNewItem]    = useState({});
  const [addingItem, setAddingItem] = useState({});

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getOptionGroups(productId);
      setGroups(data.data ?? []);
    } catch (e) { setError(e.response?.data?.message ?? 'Erro ao carregar grupos.'); }
    finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { reload(); }, [reload]);

  const handleAddGroup = async () => {
    if (!grpName.trim()) return;
    setAddingGrp(true); setError(null);
    try {
      await createOptionGroup(productId, { name: grpName.trim(), min_select: parseInt(grpMin)||1, max_select: parseInt(grpMax)||1 });
      setGrpName(''); setGrpMin('1'); setGrpMax('1');
      await reload();
    } catch (e) { setError(e.response?.data?.message ?? 'Erro ao criar grupo.'); }
    finally { setAddingGrp(false); }
  };

  const handleDeleteGroup = async (groupId) => {
    setError(null);
    try { await deleteOptionGroup(productId, groupId); await reload(); }
    catch (e) { setError(e.response?.data?.message ?? 'Erro ao remover grupo.'); }
  };

  const handleAddItem = async (groupId) => {
    const f = newItem[groupId] ?? {};
    if (!f.product_id) return;
    setAddingItem((p) => ({ ...p, [groupId]: true })); setError(null);
    try {
      await addOptionItem(productId, groupId, { product_id: f.product_id, extra_price: parseFloat(f.extra_price)||0 });
      setNewItem((p) => ({ ...p, [groupId]: { product_id: '', extra_price: '' } }));
      await reload();
    } catch (e) { setError(e.response?.data?.message ?? 'Erro ao adicionar opção.'); }
    finally { setAddingItem((p) => ({ ...p, [groupId]: false })); }
  };

  const handleRemoveItem = async (groupId, itemId) => {
    setError(null);
    try { await removeOptionItem(productId, groupId, itemId); await reload(); }
    catch (e) { setError(e.response?.data?.message ?? 'Erro ao remover opção.'); }
  };

  const available = (allProducts ?? []).filter((p) => p.id !== productId && !p.is_combo && p.active);

  if (loading) return <div className="flex justify-center py-3"><div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-3 mt-4 pt-4 border-t border-white/[0.06]">
      <p className="text-xs font-bold text-gray-300 uppercase tracking-wide">Grupos de Escolha</p>
      <p className="text-xs text-gray-500">O cliente escolhe entre as opções. Estoque e CMV baixam só do item escolhido.</p>

      {groups.length === 0 && <p className="text-xs text-gray-600 italic">Nenhum grupo criado ainda.</p>}

      {groups.map((group) => {
        const f = newItem[group.id] ?? {};
        const groupProductIds = group.items.map((i) => i.product_id);
        const availableForGroup = available.filter((p) => !groupProductIds.includes(p.id));
        return (
          <div key={group.id} className="bg-gray-800/40 rounded-xl border border-white/[0.06] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
              <span className="flex-1 text-sm font-semibold text-gray-200">{group.name}</span>
              <span className="text-[10px] text-gray-500 bg-gray-700/60 px-1.5 py-0.5 rounded">
                {group.min_select === group.max_select ? `Escolha ${group.max_select}` : `${group.min_select}–${group.max_select}`}
              </span>
              <button type="button" onClick={() => handleDeleteGroup(group.id)}
                className="text-gray-600 hover:text-red-400 text-xs transition-colors ml-1">✕</button>
            </div>
            <div className="px-3 py-2 space-y-1.5">
              {group.items.length === 0 && <p className="text-xs text-gray-600 italic">Sem opções.</p>}
              {group.items.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <span className="flex-1 text-xs text-gray-300 truncate">{item.product_name}</span>
                  {parseFloat(item.extra_price) > 0 && (
                    <span className="text-[10px] text-orange-400 font-semibold shrink-0">+R$ {parseFloat(item.extra_price).toFixed(2)}</span>
                  )}
                  <button type="button" onClick={() => handleRemoveItem(group.id, item.id)}
                    className="text-gray-600 hover:text-red-400 text-xs transition-colors">✕</button>
                </div>
              ))}
              <div className="flex gap-1.5 pt-1">
                <select value={f.product_id ?? ''} onChange={(e) => setNewItem((p) => ({ ...p, [group.id]: { ...f, product_id: e.target.value } }))} className="input flex-1 text-xs">
                  <option value="">Adicionar opção...</option>
                  {availableForGroup.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="number" min="0" step="0.5" placeholder="+R$"
                  value={f.extra_price ?? ''} onChange={(e) => setNewItem((p) => ({ ...p, [group.id]: { ...f, extra_price: e.target.value } }))}
                  className="input w-16 text-xs text-center" />
                <button type="button" onClick={() => handleAddItem(group.id)} disabled={addingItem[group.id] || !f.product_id}
                  className="px-2.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold disabled:opacity-50 transition-colors shrink-0">
                  {addingItem[group.id] ? '…' : '+'}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex gap-1.5 items-center flex-wrap">
        <input type="text" placeholder="Nome do grupo (ex: Refrigerante)" value={grpName} onChange={(e) => setGrpName(e.target.value)} className="input flex-1 text-sm min-w-[150px]" />
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-gray-500">Min</span>
          <input type="number" min="0" max="10" value={grpMin} onChange={(e) => setGrpMin(e.target.value)} className="input w-12 text-xs text-center" />
          <span className="text-xs text-gray-500">Max</span>
          <input type="number" min="1" max="10" value={grpMax} onChange={(e) => setGrpMax(e.target.value)} className="input w-12 text-xs text-center" />
        </div>
        <button type="button" onClick={handleAddGroup} disabled={addingGrp || !grpName.trim()}
          className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-50 transition-colors shrink-0">
          {addingGrp ? '…' : '+ Criar Grupo'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Product modal (create / edit)
// ─────────────────────────────────────────────────────────────

// ── Variation Manager (usado dentro do ProductModal) ──────────

function VariationManager({ productId }) {
  const [groups,    setGroups]    = useState([]);
  const [newGroup,  setNewGroup]  = useState('');
  const [addingGrp, setAddingGrp] = useState(false);
  // Per-group: { [groupId]: { name: '', price: '' } }
  const [newOpt,    setNewOpt]    = useState({});
  const [addingOpt, setAddingOpt] = useState({});

  // Fetch current variations from product
  const reload = useCallback(async () => {
    try {
      const { data } = await import('../api/products').then((m) => m.listProducts({ limit: 1 }));
      // Use getProduct instead
      const mod = await import('../api/products');
      const res = await mod.getProduct(productId);
      setGroups(res.data.data?.variations ?? []);
    } catch { /* non-fatal */ }
  }, [productId]);

  useEffect(() => { reload(); }, [reload]);

  const handleAddGroup = async () => {
    if (!newGroup.trim()) return;
    setAddingGrp(true);
    try {
      await createVarGroup(productId, { name: newGroup.trim(), required: true });
      setNewGroup('');
      await reload();
    } catch { /* non-fatal */ }
    finally { setAddingGrp(false); }
  };

  const handleDeleteGroup = async (gid) => {
    if (!confirm('Remover este grupo e todas as opções?')) return;
    try { await deleteVarGroup(gid); await reload(); } catch { /* non-fatal */ }
  };

  const handleAddOption = async (gid) => {
    const o = newOpt[gid] ?? {};
    if (!o.name?.trim() || o.price === '' || o.price === undefined) return;
    setAddingOpt((prev) => ({ ...prev, [gid]: true }));
    try {
      await createVarOption(gid, { name: o.name.trim(), price: parseFloat(o.price) || 0 });
      setNewOpt((prev) => ({ ...prev, [gid]: { name: '', price: '' } }));
      await reload();
    } catch { /* non-fatal */ }
    finally { setAddingOpt((prev) => ({ ...prev, [gid]: false })); }
  };

  const handleDeleteOption = async (oid) => {
    try { await deleteVarOption(oid); await reload(); } catch { /* non-fatal */ }
  };

  const handleToggleOption = async (oid, available) => {
    try { await updateVarOption(oid, { available: !available }); await reload(); } catch { /* non-fatal */ }
  };

  const fmt = (v) => `R$ ${parseFloat(v ?? 0).toFixed(2)}`;

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Variações obrigatórias (tamanho, sabor...) abrem um seletor ao adicionar o produto.
        O preço de cada opção <strong className="text-gray-300">substitui</strong> o preço base.
      </p>

      {/* Grupos existentes */}
      {groups.map((g) => (
        <div key={g.id} className="bg-gray-800/40 rounded-xl border border-white/[0.06] overflow-hidden">
          {/* Header do grupo */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.05]">
            <p className="text-xs font-bold text-gray-200">{g.name}
              <span className="ml-1.5 text-[10px] text-red-400 font-normal">obrigatório</span>
            </p>
            <button onClick={() => handleDeleteGroup(g.id)}
              className="text-gray-600 hover:text-red-400 transition-colors text-xs">✕</button>
          </div>

          {/* Opções */}
          <div className="divide-y divide-white/[0.04]">
            {(g.options ?? []).map((opt) => (
              <div key={opt.id} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleOption(opt.id, opt.available)}
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      opt.available ? 'border-green-500 bg-green-500' : 'border-gray-600'
                    }`}
                  >
                    {opt.available && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </button>
                  <span className={`text-xs font-semibold ${opt.available ? 'text-gray-200' : 'text-gray-600 line-through'}`}>
                    {opt.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-green-400 font-bold">{fmt(opt.price)}</span>
                  <button onClick={() => handleDeleteOption(opt.id)}
                    className="text-gray-600 hover:text-red-400 transition-colors text-xs">✕</button>
                </div>
              </div>
            ))}
          </div>

          {/* Adicionar opção */}
          <div className="flex gap-2 px-3 py-2 bg-gray-800/60 border-t border-white/[0.04]">
            <input
              type="text"
              placeholder="Nome (ex: Grande)"
              value={newOpt[g.id]?.name ?? ''}
              onChange={(e) => setNewOpt((prev) => ({ ...prev, [g.id]: { ...prev[g.id], name: e.target.value } }))}
              className="input flex-1 text-xs py-1"
              onKeyDown={(e) => e.key === 'Enter' && handleAddOption(g.id)}
            />
            <input
              type="number" min="0" step="0.50" placeholder="R$"
              value={newOpt[g.id]?.price ?? ''}
              onChange={(e) => setNewOpt((prev) => ({ ...prev, [g.id]: { ...prev[g.id], price: e.target.value } }))}
              className="input w-20 text-xs py-1"
              onKeyDown={(e) => e.key === 'Enter' && handleAddOption(g.id)}
            />
            <button
              onClick={() => handleAddOption(g.id)}
              disabled={addingOpt[g.id]}
              className="px-2 py-1 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold disabled:opacity-50 transition-colors shrink-0"
            >
              +
            </button>
          </div>
        </div>
      ))}

      {/* Adicionar grupo */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Nome do grupo (ex: Tamanho, Sabor)"
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
          className="input flex-1 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddGroup())}
        />
        <button
          type="button"
          onClick={handleAddGroup}
          disabled={addingGrp || !newGroup.trim()}
          className="px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-semibold disabled:opacity-50 transition-colors shrink-0"
        >
          {addingGrp ? '...' : '+ Grupo'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Ficha Técnica manager (recipe = product → insumos links)
// ─────────────────────────────────────────────────────────────

function FichaTecnicaManager({ productId }) {
  const [allInsumos,  setAllInsumos]  = useState([]);
  const [recipe,      setRecipe]      = useState([]);   // [{insumo_id, name, unit, qty_per_unit}]
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [addId,       setAddId]       = useState('');
  const [addQty,      setAddQty]      = useState('');
  const [dirty,       setDirty]       = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [insRes, recRes] = await Promise.all([
        listInsumos(),
        getProductInsumos(productId),
      ]);
      setAllInsumos(insRes.data.data ?? []);
      setRecipe(recRes.data.data ?? []);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { reload(); }, [reload]);

  const handleAdd = () => {
    if (!addId || !addQty || parseFloat(addQty) <= 0) return;
    const ins = allInsumos.find((i) => i.id === addId);
    if (!ins) return;
    if (recipe.some((r) => r.insumo_id === addId)) return; // already added
    setRecipe((prev) => [...prev, { insumo_id: addId, name: ins.name, unit: ins.unit, qty_per_unit: parseFloat(addQty) }]);
    setAddId('');
    setAddQty('');
    setDirty(true);
  };

  const handleRemove = (insumoId) => {
    setRecipe((prev) => prev.filter((r) => r.insumo_id !== insumoId));
    setDirty(true);
  };

  const handleQtyChange = (insumoId, val) => {
    setRecipe((prev) => prev.map((r) => r.insumo_id === insumoId ? { ...r, qty_per_unit: val } : r));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setProductInsumos(productId, recipe.map((r) => ({
        insumo_id:    r.insumo_id,
        qty_per_unit: parseFloat(r.qty_per_unit) || 1,
      })));
      setDirty(false);
    } catch { /* non-fatal */ }
    finally { setSaving(false); }
  };

  // Insumos not yet in recipe
  const available = allInsumos.filter((i) => !recipe.some((r) => r.insumo_id === i.id));

  if (loading) return (
    <div className="flex justify-center py-6">
      <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Defina os ingredientes consumidos por unidade deste produto.
        O estoque é deduzido automaticamente quando o pedido é confirmado.
      </p>

      {allInsumos.length === 0 ? (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2.5 text-xs text-yellow-300">
          Nenhum insumo cadastrado. Acesse <strong>Estoque → Insumos</strong> para adicionar ingredientes.
        </div>
      ) : (
        <>
          {/* Recipe list */}
          {recipe.length > 0 && (
            <div className="space-y-1.5">
              {recipe.map((r) => (
                <div key={r.insumo_id} className="flex items-center gap-2 bg-gray-800/40 rounded-xl px-3 py-2 border border-white/[0.06]">
                  <span className="flex-1 text-sm text-gray-200 truncate">{r.name}</span>
                  <span className="text-xs text-gray-500 shrink-0">{r.unit}</span>
                  <input
                    type="number" min="0.001" step="0.1"
                    value={r.qty_per_unit}
                    onChange={(e) => handleQtyChange(r.insumo_id, e.target.value)}
                    className="input w-20 text-xs py-1 text-right tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemove(r.insumo_id)}
                    className="text-gray-600 hover:text-red-400 transition-colors text-sm shrink-0 ml-1"
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Add ingredient row */}
          {available.length > 0 && (
            <div className="flex gap-2">
              <select
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
                className="input flex-1 text-sm"
              >
                <option value="">Selecionar ingrediente…</option>
                {available.map((i) => (
                  <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                ))}
              </select>
              <input
                type="number" min="0.001" step="0.1" placeholder="Qtd"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
                className="input w-20 text-sm"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={!addId || !addQty}
                className="px-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold disabled:opacity-40 transition-colors shrink-0"
              >+</button>
            </div>
          )}

          {/* Save button */}
          {dirty && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-bold disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando…' : '💾 Salvar Ficha Técnica'}
            </button>
          )}

          {!dirty && recipe.length > 0 && (
            <p className="text-xs text-green-500 text-center">✓ Ficha técnica salva</p>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Product modal (create / edit)
// ─────────────────────────────────────────────────────────────

function ProductModal({ product, categories, allProducts, onClose, onSaved }) {
  const isEdit = !!product;

  const [form, setForm] = useState({
    name:           product?.name            ?? '',
    displayName:    product?.display_name    ?? '',
    categoryId:     product?.category_id     ?? '',
    saleType:       product?.sale_type       ?? 'unit',
    costPrice:      product?.cost_price      ?? '',
    salePrice:      product?.sale_price      ?? '',
    stockQty:       '',          // only on create
    alertThreshold: product?.alert_threshold ?? '',
    description:    product?.description     ?? '',
    active:         product?.active          ?? true,
    featured:       product?.featured        ?? false,
    isCombo:        product?.is_combo        ?? false,
  });
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState(null);
  const [imgFile,    setImgFile]    = useState(null);
  const [imgPreview, setImgPreview] = useState(product?.image_url ?? null);
  const fileInputRef = useRef(null);

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
        displayName:    form.displayName?.trim() || undefined,
        categoryId:     form.categoryId  || undefined,
        saleType:       form.saleType,
        costPrice:      parseFloat(form.costPrice)      || 0,
        salePrice:      parseFloat(form.salePrice)      || 0,
        alertThreshold: parseFloat(form.alertThreshold) || 0,
        description:    form.description || undefined,
        featured:       form.featured,
        isCombo:        form.isCombo,
      };
      if (!isEdit) payload.stockQty = parseFloat(form.stockQty) || 0;
      else         payload.active   = form.active;

      const { data } = isEdit
        ? await updateProduct(product.id, payload)
        : await createProduct(payload);

      let savedProduct = data.data;

      // Upload image if one was selected
      if (imgFile) {
        try {
          const { data: imgData } = await uploadProductImage(savedProduct.id, imgFile);
          savedProduct = { ...savedProduct, image_url: imgData.data?.image_url ?? imgData.image_url };
        } catch (uploadErr) {
          setError(`Produto salvo, mas falha no upload da imagem: ${uploadErr.response?.data?.message ?? 'erro desconhecido'}. Tente editar e trocar a foto.`);
        }
      }

      onSaved(savedProduct, isEdit);
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

          {/* Nome interno */}
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1 block">Nome interno *</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className="input w-full"
              placeholder="Ex: Hambúrguer Clássico"
              autoFocus
            />
            <p className="text-[11px] text-gray-600 mt-1">
              Usado no estoque, relatórios e financeiro.
            </p>
          </div>

          {/* Nome no cardápio (display_name) */}
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1 block">
              Nome no cardápio digital
              <span className="ml-1 text-gray-600 font-normal">(opcional)</span>
            </label>
            <input
              value={form.displayName}
              onChange={(e) => set('displayName', e.target.value)}
              className="input w-full"
              placeholder={form.name || 'Igual ao nome interno se vazio'}
            />
            <p className="text-[11px] text-gray-600 mt-1">
              O que o cliente vê. Se vazio, usa o nome interno.
            </p>
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
                  type="number" min="0" step={form.saleType === 'kg' ? '0.001' : '1'}
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
                type="number" min="0" step={form.saleType === 'kg' ? '0.001' : '1'}
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

          {/* Imagem do produto */}
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-2 block">Foto do Produto (opcional)</label>
            <div className="flex items-center gap-3">
              {/* Preview */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-600 hover:border-blue-500 overflow-hidden bg-gray-800 flex items-center justify-center cursor-pointer transition-colors shrink-0"
              >
                {imgPreview ? (
                  <img src={imgPreview} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors"
                >
                  {imgPreview ? 'Trocar imagem' : 'Escolher imagem'}
                </button>
                {imgPreview && (
                  <button
                    type="button"
                    onClick={() => { setImgFile(null); setImgPreview(null); }}
                    className="ml-3 text-xs text-red-400 hover:text-red-300 font-semibold transition-colors"
                  >
                    Remover
                  </button>
                )}
                <p className="text-[11px] text-gray-600 mt-0.5">JPG, PNG ou WebP · máx 3MB</p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImgFile(file);
                const reader = new FileReader();
                reader.onload = (ev) => setImgPreview(ev.target.result);
                reader.readAsDataURL(file);
              }}
            />
          </div>

          {/* Destaque — aparece no carrossel do cardápio */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => set('featured', e.target.checked)}
              className="w-4 h-4 accent-yellow-500 rounded"
            />
            <span className="text-sm text-gray-300">⭐ Produto em destaque <span className="text-gray-600 text-xs">(aparece no carrossel do cardápio)</span></span>
          </label>

          {/* Combo */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.isCombo}
              onChange={(e) => set('isCombo', e.target.checked)}
              className="w-4 h-4 accent-orange-500 rounded"
            />
            <span className="text-sm text-gray-300">🎁 Este produto é um combo <span className="text-gray-600 text-xs">(agrupa produtos filhos)</span></span>
          </label>

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

          {/* Itens do Combo — só aparece quando já salvo com is_combo = true no banco */}
          {isEdit && product?.is_combo && (
            <div className="pt-4 border-t border-white/[0.06]">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">🎁 Itens do Combo</p>
              <ComboManager productId={product.id} allProducts={allProducts} />
              <OptionGroupManager productId={product.id} allProducts={allProducts} />
            </div>
          )}

          {/* Aviso: marcou combo mas ainda não salvou */}
          {isEdit && form.isCombo && !product?.is_combo && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2.5 text-xs text-orange-300">
              💡 Clique em <strong>Salvar Alterações</strong> primeiro. Os itens do combo serão configurados depois.
            </div>
          )}

          {/* Aviso: salve primeiro para gerenciar itens */}
          {!isEdit && form.isCombo && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2.5 text-xs text-orange-300">
              💡 Salve o produto primeiro. Os itens do combo serão configurados na edição.
            </div>
          )}

          {/* Variações — somente na edição */}
          {isEdit && (
            <div className="pt-4 border-t border-white/[0.06]">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">🎛️ Variações</p>
              <VariationManager productId={product.id} />
            </div>
          )}

          {/* Ficha Técnica — somente na edição */}
          {isEdit && (
            <div className="pt-4 border-t border-white/[0.06]">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">🧪 Ficha Técnica (Ingredientes)</p>
              <FichaTecnicaManager productId={product.id} />
            </div>
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
  const [modal,        setModal]        = useState(null); // null | {type:'product',product?} | {type:'category'} | {type:'quickRegister'}
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

  const isBelowCost = (p) =>
    parseFloat(p.cost_price) > 0 && parseFloat(p.sale_price) < parseFloat(p.cost_price);

  const belowCostCount = products.filter(isBelowCost).length;

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

          {/* Quick Register */}
          <button
            onClick={() => setModal({ type: 'quickRegister' })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold transition-colors"
          >
            ⚡ Rápido
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

      {/* ── Alerta: produtos abaixo do custo ──────────────────── */}
      {belowCostCount > 0 && (
        <div className="mx-4 mt-3 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-sm shrink-0">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span>
            <strong>{belowCostCount}</strong> {belowCostCount === 1 ? 'produto está sendo vendido' : 'produtos estão sendo vendidos'} abaixo do custo — verifique preço ou custo cadastrado.
          </span>
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
                    <div className="flex items-center gap-2.5">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name}
                          className="w-9 h-9 rounded-lg object-cover shrink-0 bg-gray-800" />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-gray-600 shrink-0">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5 leading-tight">
                          <p className="font-semibold text-gray-200">{p.name}</p>
                          {isBelowCost(p) && (
                            <span className="text-[10px] bg-red-500/15 text-red-400 px-1 py-0.5 rounded font-semibold shrink-0">
                              ⚠ custo
                            </span>
                          )}
                        </div>
                        {p.description && (
                          <p className="text-xs text-gray-500 truncate max-w-[180px] mt-0.5">{p.description}</p>
                        )}
                      </div>
                    </div>
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
          allProducts={products}
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
      {modal?.type === 'quickRegister' && (
        <QuickRegisterModal
          onClose={() => setModal(null)}
          onSaved={(created) => {
            setProducts((prev) => [created, ...prev]);
          }}
          onComplete={(productId) => {
            // Open full product modal — either with existing product or blank
            if (productId) {
              const existing = products.find((p) => p.id === productId);
              setModal({ type: 'product', product: existing ?? { id: productId } });
            } else {
              setModal({ type: 'product' });
            }
          }}
        />
      )}
    </div>
  );
}
