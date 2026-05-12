import { useState, useEffect, useCallback } from 'react';
import { getProducts } from '../api/orders';

const fmt = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2)}`;

// ── Cart helpers (mesma lógica do NewOrderModal) ──────────────

const addToCart = (cart, product) => {
  const prev = cart[product.id];
  if (prev) return { ...cart, [product.id]: { ...prev, qty: (prev.qty ?? 1) + 1 } };
  return { ...cart, [product.id]: { product, qty: 1, weightKg: '' } };
};

const removeFromCart = (cart, id) => {
  const next = { ...cart };
  delete next[id];
  return next;
};

const cartTotal = (cart) =>
  Object.values(cart).reduce((sum, { product, qty, weightKg }) => {
    const amount = product.sale_type === 'kg'
      ? parseFloat(product.sale_price) * parseFloat(weightKg || 0)
      : parseFloat(product.sale_price) * (qty || 0);
    return sum + amount;
  }, 0);

// ── Monta o cart inicial a partir dos itens do pedido existente ─

const buildInitialCart = (orderItems, products) => {
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const cart = {};
  for (const item of orderItems) {
    const product = productMap[item.productId];
    if (!product) continue; // produto pode ter sido desativado
    cart[product.id] = {
      product,
      qty:      item.quantity ?? 1,
      weightKg: item.weightKg ? String(item.weightKg) : '',
    };
  }
  return cart;
};

// ── Main component ────────────────────────────────────────────

export default function EditOrderModal({ order, onClose, onSave }) {
  const [products,   setProducts]   = useState([]);
  const [cart,       setCart]       = useState({});
  const [search,     setSearch]     = useState('');
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);

  // Carrega produtos e pré-monta o cart com os itens atuais
  useEffect(() => {
    getProducts({ active: true, limit: 200 })
      .then(({ data }) => {
        const prods = data.data ?? [];
        setProducts(prods);
        setCart(buildInitialCart(order.items ?? [], prods));
      })
      .catch(() => setError('Erro ao carregar produtos.'))
      .finally(() => setLoading(false));
  }, [order]);

  // ESC para fechar
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // ── Agrupamento por categoria ────────────────────────────────
  const categories = (() => {
    const map = {};
    for (const p of products) {
      const cat = p.category_name ?? 'Sem categoria';
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    }
    return Object.entries(map).map(([name, items]) => ({ name, items }));
  })();

  const searchResults = search
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : null;

  // ── Handlers do cart ─────────────────────────────────────────
  const handleAdd    = useCallback((p) => setCart((c) => addToCart(c, p)), []);
  const handleQty    = useCallback((id, qty) => {
    if (qty <= 0) setCart((c) => removeFromCart(c, id));
    else setCart((c) => ({ ...c, [id]: { ...c[id], qty } }));
  }, []);
  const handleWeight = useCallback((id, w) => setCart((c) => ({ ...c, [id]: { ...c[id], weightKg: w } })), []);
  const handleRemove = useCallback((id) => setCart((c) => removeFromCart(c, id)), []);

  const cartEntries = Object.values(cart);
  const total       = cartTotal(cart);

  // ── Submit ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (cartEntries.length === 0) return setError('Adicione pelo menos 1 item.');

    const items = cartEntries.map(({ product, qty, weightKg }) => ({
      productId: product.id,
      ...(product.sale_type === 'kg'
        ? { weightKg: parseFloat(weightKg) }
        : { quantity: qty }),
    }));

    setError(null);
    setSubmitting(true);
    try {
      await onSave(order.id, items);
      onClose();
    } catch {
      setError('Erro ao salvar. Verifique o estoque disponível.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[92vh] bg-gray-900 rounded-2xl shadow-2xl flex flex-col border border-white/10 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-lg font-black text-white">Editar Pedido #{order.orderNumber}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Altere os itens — o estoque será reconciliado automaticamente</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 min-h-0 divide-x divide-white/10">

          {/* ── LEFT — Catálogo ───────────────────────────── */}
          <div className="flex flex-col w-1/2 min-h-0">
            <div className="p-3 shrink-0">
              <input
                type="text"
                placeholder="Buscar produto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input w-full"
                autoFocus
              />
            </div>

            <div className="col-scroll flex-1 px-3 pb-3 space-y-1.5">
              {loading && <p className="text-gray-500 text-sm text-center py-8">Carregando...</p>}

              {/* Busca — lista plana */}
              {searchResults && (
                searchResults.length === 0
                  ? <p className="text-gray-500 text-sm text-center py-8">Nenhum produto encontrado</p>
                  : searchResults.map((p) => {
                      const inCart = cart[p.id];
                      return (
                        <button
                          key={p.id}
                          onClick={() => p.stock_qty > 0 && handleAdd(p)}
                          disabled={p.stock_qty <= 0}
                          className={[
                            'w-full text-left px-3 py-2 rounded-lg flex items-center justify-between gap-2 transition-colors',
                            p.stock_qty <= 0 ? 'opacity-40 cursor-not-allowed bg-gray-800/40' : 'bg-gray-800/60 hover:bg-gray-700/80',
                            inCart ? 'ring-1 ring-blue-500/60' : '',
                          ].join(' ')}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-200 truncate">{p.name}</p>
                            <p className="text-xs text-gray-500">{fmt(p.sale_price)}/{p.sale_type === 'kg' ? 'kg' : 'un'}</p>
                          </div>
                          {inCart && <span className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full shrink-0">{inCart.qty}×</span>}
                          <span className="text-green-400 font-bold text-sm shrink-0">{fmt(p.sale_price)}</span>
                        </button>
                      );
                    })
              )}

              {/* Categorias accordion */}
              {!searchResults && !loading && categories.map(({ name: catName, items }) => (
                <CategoryAccordion
                  key={catName}
                  name={catName}
                  items={items}
                  cart={cart}
                  onAdd={handleAdd}
                  onQty={handleQty}
                  onWeight={handleWeight}
                />
              ))}
            </div>
          </div>

          {/* ── RIGHT — Carrinho ─────────────────────────── */}
          <div className="flex flex-col w-1/2 min-h-0">
            <div className="col-scroll flex-1 p-3 space-y-2">
              {cartEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-600">
                  <span className="text-3xl">🛒</span>
                  <p className="text-sm italic">Selecione produtos no catálogo</p>
                </div>
              ) : (
                cartEntries.map(({ product: p, qty, weightKg }) => (
                  <div key={p.id} className="bg-gray-800/60 rounded-xl p-2.5 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-200 leading-tight flex-1 min-w-0 truncate">{p.name}</p>
                      <button onClick={() => handleRemove(p.id)} className="text-gray-600 hover:text-red-400 shrink-0 mt-0.5 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {p.sale_type === 'kg' ? (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-400 shrink-0">Peso (kg)</label>
                        <input
                          type="number" min="0.1" step="0.1" value={weightKg}
                          onChange={(e) => handleWeight(p.id, e.target.value)}
                          className="input w-20 text-sm" placeholder="0.0"
                        />
                        {weightKg && <span className="text-xs text-green-400 font-semibold ml-auto">{fmt(parseFloat(p.sale_price) * parseFloat(weightKg))}</span>}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleQty(p.id, qty - 1)} className="w-6 h-6 rounded-md bg-gray-700 hover:bg-gray-600 text-white font-bold flex items-center justify-center">−</button>
                        <span className="w-7 text-center text-sm font-bold text-white tabular-nums">{qty}</span>
                        <button onClick={() => handleQty(p.id, qty + 1)} className="w-6 h-6 rounded-md bg-gray-700 hover:bg-gray-600 text-white font-bold flex items-center justify-center">+</button>
                        <span className="text-xs text-green-400 font-semibold ml-auto">{fmt(parseFloat(p.sale_price) * qty)}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-white/10 space-y-2 shrink-0">
              {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex items-center justify-between">
                <span className="text-xl font-black text-white">{fmt(total)}</span>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || cartEntries.length === 0}
                  className="btn-green px-6 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CategoryAccordion (igual ao NewOrderModal) ────────────────

function CategoryAccordion({ name, items, cart, onAdd, onQty, onWeight }) {
  const [open, setOpen] = useState(false);
  const inCartCount = items.filter((p) => cart[p.id]).length;

  return (
    <div className="border border-white/[0.07] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-800/70 hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg
            className={`w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-semibold text-gray-200 truncate">{name ?? 'Sem categoria'}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {inCartCount > 0 && (
            <span className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full font-semibold">
              {inCartCount}
            </span>
          )}
          <span className="text-xs text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        </div>
      </button>

      {open && (
        <ul className="divide-y divide-white/[0.04]">
          {items.map((p) => {
            const inCart = cart[p.id];
            return (
              <li key={p.id} className="px-3 py-2 bg-gray-900/40 hover:bg-gray-800/40 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${inCart ? 'text-white' : 'text-gray-300'}`}>{p.name}</p>
                    <p className="text-xs text-gray-500">
                      {fmt(p.sale_price)}/{p.sale_type === 'kg' ? 'kg' : 'un'}
                      {p.stock_qty <= 0 && <span className="text-red-400 ml-1">· Sem estoque</span>}
                    </p>
                  </div>

                  {p.stock_qty <= 0 ? (
                    <span className="text-xs text-red-400/60 italic shrink-0">Esgotado</span>
                  ) : p.sale_type === 'kg' ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number" min="0.1" step="0.1" placeholder="kg"
                        value={inCart?.weightKg ?? ''}
                        onChange={(e) => {
                          if (!inCart) onAdd(p);
                          onWeight(p.id, e.target.value);
                        }}
                        className="input w-16 text-xs py-1 text-center"
                      />
                    </div>
                  ) : inCart ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => inCart.qty <= 1 ? onQty(p.id, 0) : onQty(p.id, inCart.qty - 1)}
                        className="w-6 h-6 rounded-md bg-gray-700 hover:bg-gray-600 text-white font-bold text-sm flex items-center justify-center"
                      >−</button>
                      <span className="w-6 text-center text-sm font-bold text-white tabular-nums">{inCart.qty}</span>
                      <button
                        onClick={() => onQty(p.id, inCart.qty + 1)}
                        className="w-6 h-6 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center justify-center"
                      >+</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onAdd(p)}
                      className="text-xs font-bold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1 rounded-lg transition-colors shrink-0"
                    >
                      + Add
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
