import { useState, useEffect, useCallback } from 'react';
import { getProducts, updateOrderStatus } from '../api/orders';
import { markOrderPaid as markOrderPaidApi } from '../api/orders';

const NEIGHBORHOODS = [
  { bairro: 'Itapeva',            taxa: 6  }, { bairro: 'Itapeva Norte',      taxa: 6  },
  { bairro: 'Tupinambá',          taxa: 8  }, { bairro: 'Praia Gaúcha',       taxa: 8  },
  { bairro: 'Praia Yara',         taxa: 8  }, { bairro: 'Praia Recreio',      taxa: 10 },
  { bairro: 'Praia Santa Helena', taxa: 10 }, { bairro: 'Praia Estrela',      taxa: 10 },
  { bairro: 'Praia Real',         taxa: 10 }, { bairro: 'Praia Paraíso',      taxa: 15 },
  { bairro: 'São Brás',           taxa: 15 }, { bairro: 'Campo Bonito',       taxa: 17 },
  { bairro: 'Torres',             taxa: 20 },
];

const PAY_OPTIONS = [
  { value: 'cash',    label: '💵 Dinheiro' }, { value: 'pix',     label: '📱 Pix'     },
  { value: 'credit',  label: '💳 Crédito'  }, { value: 'debit',   label: '💳 Débito'  },
  { value: 'voucher', label: '🎫 Vale'      }, { value: 'other',   label: '🔖 Outro'   },
  { value: 'pending', label: '⏳ A cobrar'  },
];

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

export default function EditOrderModal({ order, onClose, onSave, onOrderChanged }) {
  const [tab,        setTab]        = useState('items'); // 'items' | 'order'
  const [products,   setProducts]   = useState([]);
  const [cart,       setCart]       = useState({});
  const [search,     setSearch]     = useState('');
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);

  // Aba "Pedido" — campos editáveis
  const [deliveryType,  setDeliveryType]  = useState(order.deliveryType ?? 'pickup');
  const [neighborhood,  setNeighborhood]  = useState(order.neighborhood ?? '');
  const [address,       setAddress]       = useState(order.customerAddress ?? '');
  const [deliveryFee,   setDeliveryFee]   = useState(String(order.deliveryFee ?? 0));
  const [payMethod,     setPayMethod]     = useState(order.paymentMethod ?? 'cash');
  const [adjType,       setAdjType]       = useState('discount'); // 'discount' | 'surcharge'
  const [adjValue,      setAdjValue]      = useState('');
  const [adjReason,     setAdjReason]     = useState('');

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

  // ── Submit itens ─────────────────────────────────────────────
  const handleSubmit = async () => {
    if (cartEntries.length === 0) return setError('Adicione pelo menos 1 item.');
    const items = cartEntries.map(({ product, qty, weightKg }) => ({
      productId: product.id,
      ...(product.sale_type === 'kg' ? { weightKg: parseFloat(weightKg) } : { quantity: qty }),
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

  // ── Submit informações do pedido ─────────────────────────────
  const handleSaveOrder = async () => {
    setError(null);
    setSubmitting(true);
    try {
      // 1. Atualiza tipo de entrega (muda de pickup → delivery ou vice-versa)
      // A API só aceita transições de status; para delivery_type usamos a rota de update info
      // Por enquanto: chama onOrderChanged com os novos dados para o pai atualizar o estado local
      const updates = {
        deliveryType,
        neighborhood: neighborhood || null,
        customerAddress: address || null,
        deliveryFee: parseFloat(deliveryFee) || 0,
      };

      // 2. Atualiza pagamento se mudou
      if (payMethod !== order.paymentMethod) {
        await markOrderPaidApi(order.id, payMethod);
      }

      // 3. Ajuste de valor (desconto/acréscimo) — adiciona nas observações como registro
      let adjNote = '';
      if (parseFloat(adjValue) > 0) {
        const sign  = adjType === 'discount' ? '-' : '+';
        adjNote = `[${adjType === 'discount' ? 'Desconto' : 'Acréscimo'}: ${sign}R$${parseFloat(adjValue).toFixed(2)}${adjReason ? ' — ' + adjReason : ''}]`;
      }

      onOrderChanged?.({ ...order, ...updates, _adjNote: adjNote });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao salvar alterações.');
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
            <p className="text-xs text-gray-500 mt-0.5">Altere itens, entrega, pagamento ou aplique desconto</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 shrink-0">
          {[{ id: 'items', label: '🛒 Itens' }, { id: 'order', label: '⚙️ Pedido' }].map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
                tab === id ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── ABA PEDIDO ─────────────────────────────────────── */}
        {tab === 'order' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* Tipo de entrega */}
            <div>
              <label className="text-xs text-gray-400 font-semibold mb-1.5 block">Tipo de pedido</label>
              <div className="flex gap-2">
                {[{ v: 'pickup', label: '🏪 Retirada' }, { v: 'delivery', label: '🛵 Entrega' }].map(({ v, label }) => (
                  <button key={v} type="button" onClick={() => setDeliveryType(v)}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                      deliveryType === v ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/40' : 'bg-gray-800/60 text-gray-400 hover:bg-gray-700/60'
                    }`}>{label}</button>
                ))}
              </div>
            </div>

            {deliveryType === 'delivery' && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Bairro</label>
                  <select value={neighborhood}
                    onChange={(e) => {
                      const b = e.target.value;
                      setNeighborhood(b);
                      const f = NEIGHBORHOODS.find((n) => n.bairro === b);
                      if (f) setDeliveryFee(String(f.taxa));
                    }}
                    className="input w-full text-sm">
                    <option value="">— Selecione —</option>
                    {NEIGHBORHOODS.map(({ bairro, taxa }) => (
                      <option key={bairro} value={bairro}>{bairro} — R$ {taxa.toFixed(2)}</option>
                    ))}
                    <option value="outro">Outro</option>
                  </select>
                </div>
                <input type="text" placeholder="Endereço completo..." value={address}
                  onChange={(e) => setAddress(e.target.value)} className="input w-full text-sm" />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400 shrink-0">Taxa (R$)</label>
                  <input type="number" min="0" step="0.5" value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)} className="input flex-1 text-sm text-right" />
                </div>
              </div>
            )}

            {/* Forma de pagamento */}
            <div>
              <label className="text-xs text-gray-400 font-semibold mb-1.5 block">Forma de pagamento</label>
              <div className="grid grid-cols-4 gap-1.5">
                {PAY_OPTIONS.map(({ value, label }) => (
                  <button key={value} type="button" onClick={() => setPayMethod(value)}
                    className={`py-2 px-1 rounded-lg text-xs font-semibold transition-all ${
                      payMethod === value ? 'bg-green-500/20 text-green-300 ring-1 ring-green-500/40' : 'bg-gray-800/60 text-gray-400 hover:bg-gray-700/60'
                    }`}>{label}</button>
                ))}
              </div>
            </div>

            {/* Desconto / Acréscimo */}
            <div className="bg-gray-800/40 rounded-xl p-3 space-y-2">
              <label className="text-xs text-gray-400 font-semibold block">Ajuste de valor</label>
              <div className="flex gap-2">
                {[{ v: 'discount', l: '🔻 Desconto' }, { v: 'surcharge', l: '🔺 Acréscimo' }].map(({ v, l }) => (
                  <button key={v} type="button" onClick={() => setAdjType(v)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      adjType === v ? v === 'discount' ? 'bg-green-500/20 text-green-300 ring-1 ring-green-500/30' : 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30'
                      : 'bg-gray-700/60 text-gray-500 hover:bg-gray-700'
                    }`}>{l}</button>
                ))}
              </div>
              <input type="number" min="0" step="0.01" placeholder="Valor (R$)"
                value={adjValue} onChange={(e) => setAdjValue(e.target.value)} className="input w-full text-sm" />
              <input type="text" placeholder="Motivo (ex: cortesia, frete errado...)"
                value={adjReason} onChange={(e) => setAdjReason(e.target.value)} className="input w-full text-sm" />
              {parseFloat(adjValue) > 0 && (
                <p className="text-xs text-gray-400 bg-gray-700/40 rounded px-2 py-1">
                  {adjType === 'discount' ? '🔻 Desconto' : '🔺 Acréscimo'} de <b>R$ {parseFloat(adjValue).toFixed(2)}</b> será registrado nas observações
                </p>
              )}
            </div>

            {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

            <button onClick={handleSaveOrder} disabled={submitting}
              className="w-full btn-green py-2.5 disabled:opacity-50">
              {submitting ? 'Salvando...' : '✓ Salvar Alterações do Pedido'}
            </button>
          </div>
        )}

        {tab === 'items' && <div className="flex flex-1 min-h-0 divide-x divide-white/10">

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
        </div>}

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
