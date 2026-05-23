/**
 * AddonsPage — Gerenciamento de Grupos de Complementos / Adicionais
 * Manager can create groups (e.g., "Extras de proteína", "Ingredientes do hotdog")
 * and their items, then link groups to products.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  listAddonGroups, createAddonGroup, updateAddonGroup, deleteAddonGroup,
  createAddonItem, updateAddonItem, deleteAddonItem,
  getProductAddonGroups, setProductAddonGroups,
} from '../api/addons';
import { listProducts } from '../api/products';

// ── Group Form Modal ──────────────────────────────────────────

function GroupModal({ group, onClose, onSave }) {
  const isEdit = !!group;
  const [name,    setName]   = useState(group?.name        ?? '');
  const [desc,    setDesc]   = useState(group?.description ?? '');
  const [minQty,  setMinQty] = useState(group?.min_qty     ?? 0);
  const [maxQty,  setMaxQty] = useState(group?.max_qty     ?? '');
  const [saving,  setSaving] = useState(false);
  const [error,   setError]  = useState(null);

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
      const payload = { name: name.trim(), description: desc.trim() || undefined, min_qty: parseInt(minQty) || 0, max_qty: maxQty !== '' ? parseInt(maxQty) : null };
      const { data } = isEdit ? await updateAddonGroup(group.id, payload) : await createAddonGroup(payload);
      onSave(data.data); onClose();
    } catch (err) { setError(err.response?.data?.message ?? 'Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-base font-bold text-white mb-4">{isEdit ? 'Editar Grupo' : 'Novo Grupo de Complementos'}</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 font-semibold block mb-1">Nome do grupo *</label>
            <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ex: Extras de frango, Ingredientes do hotdog" />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-semibold block mb-1">Descrição (opcional)</label>
            <input className="input w-full" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrição curta..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 font-semibold block mb-1">Seleção mínima</label>
              <input className="input w-full" type="number" min="0" value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder="0 = opcional" />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-semibold block mb-1">Seleção máxima</label>
              <input className="input w-full" type="number" min="1" value={maxQty} onChange={(e) => setMaxQty(e.target.value)} placeholder="vazio = sem limite" />
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl bg-gray-800 text-gray-300 text-sm font-semibold hover:bg-gray-700">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-400 disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Item Form (inline row) ────────────────────────────────────

function NewItemRow({ groupId, tenantId, onSaved, onCancel }) {
  const [name,  setName]  = useState('');
  const [price, setPrice] = useState('0');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data } = await createAddonItem(groupId, { name: name.trim(), price: parseFloat(price) || 0 });
      onSaved(data.data);
      setName(''); setPrice('0');
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2">
      <input className="input flex-1 text-sm py-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do item (ex: Extra de frango)" autoFocus />
      <input className="input w-20 text-sm py-1" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="R$" />
      <button type="submit" disabled={saving || !name.trim()} className="px-3 py-1.5 rounded-xl bg-orange-500 text-white text-xs font-semibold hover:bg-orange-400 disabled:opacity-50">
        {saving ? '...' : 'Add'}
      </button>
      <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-xl bg-gray-700 text-gray-300 text-xs font-semibold hover:bg-gray-600">
        ✕
      </button>
    </form>
  );
}

// ── Link products modal ───────────────────────────────────────

function LinkProductsModal({ group, allProducts, onClose }) {
  const [linked,   setLinked]   = useState(new Set());
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [search,   setSearch]   = useState('');

  useEffect(() => {
    // Load products that already have this group
    Promise.all(
      allProducts.map((p) =>
        getProductAddonGroups(p.id).then(({ data }) => {
          const has = (data.data ?? []).some((g) => g.id === group.id);
          return has ? p.id : null;
        }).catch(() => null)
      )
    ).then((results) => {
      setLinked(new Set(results.filter(Boolean)));
      setLoading(false);
    });
  }, [group.id, allProducts]);

  const toggle = (productId) => {
    setLinked((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId); else next.add(productId);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // For each product, set its groups (add or remove this group)
      await Promise.all(
        allProducts.map(async (p) => {
          const { data } = await getProductAddonGroups(p.id);
          const currentGroups = data.data ?? [];
          const currentIds = currentGroups.map((g) => g.id);
          const wantsLinked = linked.has(p.id);
          const hasGroup = currentIds.includes(group.id);
          if (wantsLinked && !hasGroup) {
            await setProductAddonGroups(p.id, [...currentIds, group.id]);
          } else if (!wantsLinked && hasGroup) {
            await setProductAddonGroups(p.id, currentIds.filter((id) => id !== group.id));
          }
        })
      );
      onClose();
    } catch { /* non-fatal */ }
    finally { setSaving(false); }
  };

  const filtered = allProducts.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Vincular a Produtos</h3>
            <p className="text-xs text-gray-500">{group.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
        </div>
        <div className="p-4 border-b border-white/10">
          <input className="input w-full text-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto..." />
        </div>
        <div className="overflow-y-auto max-h-72 p-4 space-y-1">
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-4">Carregando...</p>
          ) : filtered.map((p) => (
            <button key={p.id} type="button" onClick={() => toggle(p.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-sm transition-all ${
                linked.has(p.id) ? 'bg-orange-500/15 border-orange-500/40 text-white' : 'bg-gray-800/40 border-white/[0.06] text-gray-300 hover:bg-gray-700/60'
              }`}>
              <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 text-[10px] font-black ${linked.has(p.id) ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-600'}`}>
                {linked.has(p.id) ? '✓' : ''}
              </span>
              <span className="font-medium truncate">{p.name}</span>
              {p.category_name && <span className="text-xs text-gray-500 ml-auto shrink-0">{p.category_name}</span>}
            </button>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-white/10 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 text-sm font-semibold hover:bg-gray-700">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-400 disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function AddonsPage() {
  const [groups,    setGroups]    = useState([]);
  const [products,  setProducts]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [groupForm, setGroupForm] = useState(null);    // null=hidden, {}=new, obj=edit
  const [linkModal, setLinkModal] = useState(null);    // group to link
  const [addingItemTo, setAddingItemTo] = useState(null); // group.id

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gRes, pRes] = await Promise.all([
        listAddonGroups(),
        listProducts({ active: true, limit: 200 }),
      ]);
      setGroups(gRes.data.data ?? []);
      setProducts(pRes.data.data ?? []);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleGroupSave = (saved) => {
    setGroups((prev) => {
      const idx = prev.findIndex((g) => g.id === saved.id);
      if (idx >= 0) return prev.map((g) => g.id === saved.id ? { ...g, ...saved } : g);
      return [{ ...saved, items: [] }, ...prev];
    });
  };

  const handleDeleteGroup = async (id) => {
    if (!window.confirm('Excluir este grupo? Os produtos vinculados perderão este grupo de complementos.')) return;
    try {
      await deleteAddonGroup(id);
      setGroups((prev) => prev.filter((g) => g.id !== id));
    } catch { alert('Erro ao excluir.'); }
  };

  const handleItemSaved = (groupId, item) => {
    setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, items: [...(g.items ?? []), item] } : g));
    setAddingItemTo(null);
  };

  const handleDeleteItem = async (groupId, itemId) => {
    try {
      await deleteAddonItem(itemId);
      setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, items: g.items.filter((i) => i.id !== itemId) } : g));
    } catch { alert('Erro ao excluir item.'); }
  };

  const handleToggleItem = async (groupId, item) => {
    try {
      const { data } = await updateAddonItem(item.id, { active: !item.active });
      setGroups((prev) => prev.map((g) => g.id === groupId ? {
        ...g, items: g.items.map((i) => i.id === item.id ? data.data : i)
      } : g));
    } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-gray-900/80 backdrop-blur border-b border-white/5 shrink-0">
        <h1 className="text-lg font-black text-white">🍟 Complementos</h1>
        <p className="text-sm text-gray-500 hidden sm:block">Grupos de extras e adicionais para produtos</p>
        <button onClick={load} className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors" title="Atualizar">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <button onClick={() => setGroupForm({})}
          className="ml-auto px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-400 transition-colors">
          + Novo Grupo
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-600">
            <span className="text-5xl">🍟</span>
            <p className="text-sm italic">Nenhum grupo de complementos cadastrado</p>
            <button onClick={() => setGroupForm({})} className="text-sm text-orange-400 hover:text-orange-300">
              + Criar primeiro grupo
            </button>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl">
            {groups.map((g) => (
              <div key={g.id} className="bg-gray-900 border border-white/10 rounded-2xl overflow-hidden">
                {/* Group header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-white">{g.name}</h3>
                      {g.min_qty > 0 && <span className="text-[10px] bg-orange-500/15 text-orange-400 px-1.5 py-0.5 rounded-full font-semibold">mín {g.min_qty}</span>}
                      {g.max_qty && <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full font-semibold">máx {g.max_qty}</span>}
                      <span className="text-xs text-gray-500">{(g.items ?? []).length} item{(g.items ?? []).length !== 1 ? 's' : ''}</span>
                    </div>
                    {g.description && <p className="text-xs text-gray-500 mt-0.5">{g.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setLinkModal(g)}
                      className="px-2.5 py-1.5 rounded-xl bg-blue-500/15 text-blue-400 text-xs font-semibold hover:bg-blue-500/30 transition-colors">
                      🔗 Vincular
                    </button>
                    <button onClick={() => setGroupForm(g)}
                      className="px-2.5 py-1.5 rounded-xl bg-white/5 text-gray-400 text-xs font-semibold hover:bg-white/10 transition-colors">
                      Editar
                    </button>
                    <button onClick={() => handleDeleteGroup(g.id)}
                      className="px-2.5 py-1.5 rounded-xl bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors">
                      ✕
                    </button>
                  </div>
                </div>

                {/* Items */}
                <div className="p-4 space-y-1.5">
                  {(g.items ?? []).map((item) => (
                    <div key={item.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${item.active !== false ? 'bg-gray-800/60' : 'bg-gray-800/20 opacity-50'}`}>
                      <button onClick={() => handleToggleItem(g.id, item)}
                        title={item.active !== false ? 'Desativar' : 'Ativar'}
                        className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${item.active !== false ? 'bg-orange-500 border-orange-500' : 'border-gray-600'}`}
                      />
                      <span className="flex-1 text-sm text-gray-200">{item.name}</span>
                      <span className="text-xs text-gray-500 tabular-nums">
                        {parseFloat(item.price) > 0 ? `+R$ ${parseFloat(item.price).toFixed(2)}` : 'gratuito'}
                      </span>
                      <button onClick={() => handleDeleteItem(g.id, item.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors text-xs ml-1">✕</button>
                    </div>
                  ))}

                  {addingItemTo === g.id ? (
                    <NewItemRow
                      groupId={g.id}
                      onSaved={(item) => handleItemSaved(g.id, item)}
                      onCancel={() => setAddingItemTo(null)}
                    />
                  ) : (
                    <button onClick={() => setAddingItemTo(g.id)}
                      className="w-full text-left px-3 py-1.5 rounded-xl border border-dashed border-white/10 text-xs text-gray-600 hover:text-gray-400 hover:border-white/20 transition-colors">
                      + Adicionar item
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {groupForm !== null && (
        <GroupModal
          group={groupForm?.id ? groupForm : null}
          onClose={() => setGroupForm(null)}
          onSave={handleGroupSave}
        />
      )}
      {linkModal && (
        <LinkProductsModal
          group={linkModal}
          allProducts={products}
          onClose={() => setLinkModal(null)}
        />
      )}
    </div>
  );
}
