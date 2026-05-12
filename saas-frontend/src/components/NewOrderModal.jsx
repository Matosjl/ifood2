import { useState, useEffect, useRef, useCallback } from 'react';
import { getProducts, createOrder, searchCustomers } from '../api/orders';
import { getCurrentCaixa } from '../api/caixa';
import { listFiadoClientes, createFiadoCompra } from '../api/fiado';

const fmt = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2)}`;

// ── Cart helpers ──────────────────────────────────────────────

const emptyCart = () => ({});

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

// ── Category accordion item ───────────────────────────────────

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
                        onClick={() => inCart.qty <= 1
                          ? onQty(p.id, 0)   // trigger remove via qty=0
                          : onQty(p.id, inCart.qty - 1)
                        }
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

// ── Main component ────────────────────────────────────────────

export default function NewOrderModal({ onClose, onCreated }) {
  const [products,    setProducts]    = useState([]);
  const [search,      setSearch]      = useState('');
  const [openCats,    setOpenCats]    = useState({});  // track which cats are open during search
  const [cart,        setCart]        = useState(emptyCart());
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState(null);

  // ── Caixa check ──────────────────────────────────────────────
  const [caixaOpen,   setCaixaOpen]   = useState(null); // null=checking, true=open, false=closed

  // Customer
  const [name,        setName]        = useState('');
  const [phone,       setPhone]       = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSug,     setShowSug]     = useState(false);
  const sugTimer                      = useRef(null);

  // Order options
  const [channel,       setChannel]       = useState('manual');
  const [deliveryType,  setDeliveryType]  = useState('pickup');
  const [address,       setAddress]       = useState('');
  const [deliveryFee,   setDeliveryFee]   = useState(
    () => localStorage.getItem('defaultDeliveryFee') ?? ''
  );
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [needsChange,   setNeedsChange]   = useState(false);
  const [changeFor,     setChangeFor]     = useState('');
  const [notes,         setNotes]         = useState('');
  const [fiadoClientes,    setFiadoClientes]    = useState([]);
  const [fiadoClienteId,   setFiadoClienteId]   = useState('');
  const [fiadoClienteSearch, setFiadoClienteSearch] = useState('');

  // ── Load products + check caixa ─────────────────────────────
  useEffect(() => {
    getProducts({ active: true, limit: 200 })
      .then(({ data }) => setProducts(data.data ?? []))
      .catch(() => setError('Erro ao carregar produtos.'))
      .finally(() => setLoading(false));

    getCurrentCaixa()
      .then(({ data }) => setCaixaOpen(!!data.data))
      .catch(() => setCaixaOpen(true)); // fail-open: don't block if API is down
  }, []);

  useEffect(() => {
    if (paymentMethod !== 'fiado') return;
    listFiadoClientes({ search: fiadoClienteSearch })
      .then(({ data }) => setFiadoClientes(data.data ?? []))
      .catch(() => {});
  }, [paymentMethod, fiadoClienteSearch]);

  // ESC to close
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // ── Group products by category ───────────────────────────────
  const categories = (() => {
    const map = {};
    for (const p of products) {
      const cat = p.category_name ?? 'Sem categoria';
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    }
    return Object.entries(map).map(([name, items]) => ({ name, items }));
  })();

  // ── Filtered search (flat list) ──────────────────────────────
  const searchResults = search
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : null;

  // ── Cart helpers ─────────────────────────────────────────────
  const handleAdd    = useCallback((p) => setCart((c) => addToCart(c, p)), []);
  const handleQty    = useCallback((id, qty) => {
    if (qty <= 0) setCart((c) => removeFromCart(c, id));
    else setCart((c) => ({ ...c, [id]: { ...c[id], qty } }));
  }, []);
  const handleWeight = useCallback((id, w) => setCart((c) => ({ ...c, [id]: { ...c[id], weightKg: w } })), []);
  const handleRemove = useCallback((id) => setCart((c) => removeFromCart(c, id)), []);

  const cartEntries = Object.values(cart);
  const total       = cartTotal(cart);

  // ── Customer autocomplete ────────────────────────────────────
  const fetchSuggestions = useCallback((q) => {
    clearTimeout(sugTimer.current);
    if (!q || q.length < 2) { setSuggestions([]); return; }
    sugTimer.current = setTimeout(async () => {
      try {
        const { data } = await searchCustomers(q);
        setSuggestions(data.data ?? []);
        setShowSug(true);
      } catch { /* non-fatal */ }
    }, 300);
  }, []);

  const applySuggestion = (s) => {
    setName(s.customer_name ?? '');
    setPhone(s.customer_phone ?? '');
    if (s.customer_address) setAddress(s.customer_address);
    setShowSug(false);
    setSuggestions([]);
  };

  // ── Submit ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!name.trim())                                       return setError('Nome do cliente é obrigatório.');
    if (cartEntries.length === 0)                           return setError('Adicione pelo menos 1 item.');
    if (deliveryType === 'delivery' && !address.trim())     return setError('Informe o endereço de entrega.');
    if (paymentMethod === 'fiado' && !fiadoClienteId)       return setError('Selecione o cliente do fiado.');

    setError(null);
    setSubmitting(true);

    const items = cartEntries.map(({ product, qty, weightKg }) => ({
      productId: product.id,
      ...(product.sale_type === 'kg'
        ? { weightKg: parseFloat(weightKg) }
        : { quantity: qty }),
    }));

    const fullNotes = [
      notes.trim(),
      needsChange && changeFor ? `Troco para R$ ${changeFor}` : needsChange ? 'Precisa de troco' : '',
    ].filter(Boolean).join(' | ');

    try {
      const fee = deliveryType === 'delivery' ? parseFloat(deliveryFee) || 0 : 0;
      const { data } = await createOrder({
        customerName:    name.trim(),
        customerPhone:   phone.trim()   || undefined,
        customerAddress: address.trim() || undefined,
        deliveryType,
        paymentMethod,
        deliveryFee:     fee,
        channel,
        notes: fullNotes || undefined,
        items,
      });
      if (paymentMethod === 'fiado' && data.data?.id) {
        const cliente = fiadoClientes.find((c) => c.id === fiadoClienteId);
        await createFiadoCompra({
          cliente_id: fiadoClienteId,
          order_id:   data.data.id,
          descricao:  `Pedido #${data.data.order_number ?? data.data.id}`,
          valor:      total,
        }).catch(() => {});
      }
      onCreated?.(data.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao criar pedido.');
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
          <h2 className="text-lg font-black text-white">Novo Pedido</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Caixa fechado — blocker */}
        {caixaOpen === false && (
          <div className="flex flex-col items-center justify-center gap-4 py-16 px-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <span className="text-4xl">🔒</span>
            </div>
            <div>
              <p className="text-lg font-black text-white mb-1">Caixa Fechado</p>
              <p className="text-sm text-gray-400">
                Não é possível lançar pedidos com o caixa fechado.<br />
                Vá em <span className="text-orange-400 font-semibold">Financeiro → Caixa</span> e abra o caixa primeiro.
              </p>
            </div>
            <button onClick={onClose} className="btn-primary px-8">Entendido</button>
          </div>
        )}

        {caixaOpen !== false && <div className="flex flex-1 min-h-0 divide-x divide-white/10">

          {/* ── LEFT — Catalog ─────────────────────────────── */}
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

              {/* Search results — flat list */}
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

              {/* Category accordion */}
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

          {/* ── RIGHT — Cart + Customer ─────────────────────── */}
          <div className="flex flex-col w-1/2 min-h-0">

            {/* Cart items */}
            <div className="col-scroll flex-1 p-3 space-y-2">
              {cartEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-600">
                  <span className="text-3xl">🛒</span>
                  <p className="text-sm italic">Selecione uma categoria e adicione itens</p>
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

            {/* Customer + Options */}
            <div className="p-3 border-t border-white/10 space-y-2 shrink-0">

              {/* Canal */}
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className="input w-full text-sm">
                <option value="manual">Balcão / Manual</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="ifood">iFood</option>
                <option value="mesa">Mesa</option>
                <option value="telefone">Telefone</option>
              </select>

              {/* Entrega / Retirada */}
              <div className="flex gap-2">
                {[
                  { v: 'pickup',   label: '🏪 Retirada', cls: 'orange' },
                  { v: 'delivery', label: '🛵 Entrega',  cls: 'blue'   },
                ].map(({ v, label, cls }) => (
                  <button
                    key={v} type="button" onClick={() => setDeliveryType(v)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      deliveryType === v
                        ? cls === 'orange' ? 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40'
                                           : 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/40'
                        : 'bg-gray-800/60 text-gray-400 hover:bg-gray-700/60'
                    }`}
                  >{label}</button>
                ))}
              </div>
              {deliveryType === 'delivery' && (
                <>
                  <input type="text" placeholder="Endereço de entrega *" value={address}
                    onChange={(e) => setAddress(e.target.value)} className="input w-full text-sm" />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 whitespace-nowrap shrink-0">Taxa de entrega (R$)</label>
                    <input
                      type="number" min="0" step="0.50" placeholder="0,00"
                      value={deliveryFee}
                      onChange={(e) => setDeliveryFee(e.target.value)}
                      className="input flex-1 text-sm text-right"
                    />
                  </div>
                </>
              )}

              {/* Pagamento */}
              <div className="grid grid-cols-3 gap-1">
                {[
                  { value: 'cash',    label: '💵 Dinheiro' },
                  { value: 'pix',     label: '📱 Pix'      },
                  { value: 'credit',  label: '💳 Crédito'  },
                  { value: 'debit',   label: '💳 Débito'   },
                  { value: 'voucher', label: '🎫 Vale'     },
                  { value: 'fiado',   label: '🤝 Fiado'    },
                  { value: 'other',   label: '🔖 Outro'    },
                  { value: 'pending', label: '⏳ A cobrar' },
                ].map(({ value, label }) => (
                  <button key={value} type="button" onClick={() => { setPaymentMethod(value); setFiadoClienteId(''); setFiadoClienteSearch(''); }}
                    className={`py-1.5 px-1 rounded-lg text-xs font-semibold transition-colors ${
                      paymentMethod === value
                        ? value === 'fiado'
                          ? 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/40'
                          : value === 'pending'
                          ? 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40'
                          : 'bg-green-500/20 text-green-300 ring-1 ring-green-500/40'
                        : 'bg-gray-800/60 text-gray-400 hover:bg-gray-700/60'
                    }`}
                  >{label}</button>
                ))}
              </div>

              {/* Fiado — seleção de cliente */}
              {paymentMethod === 'fiado' && (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    placeholder="Buscar cliente do fiado..."
                    value={fiadoClienteSearch}
                    onChange={(e) => { setFiadoClienteSearch(e.target.value); setFiadoClienteId(''); }}
                    className="input w-full text-sm"
                  />
                  {fiadoClientes.length > 0 && (
                    <div className="max-h-32 overflow-y-auto rounded-xl border border-white/10 bg-gray-800 divide-y divide-white/[0.04]">
                      {fiadoClientes.filter((c) => !c.bloqueado).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setFiadoClienteId(c.id); setFiadoClienteSearch(c.name); }}
                          className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                            fiadoClienteId === c.id
                              ? 'bg-purple-500/20 text-purple-300'
                              : 'text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          <span className="font-semibold">{c.name}</span>
                          {parseFloat(c.total_aberto) > 0 && (
                            <span className="ml-2 text-yellow-400">
                              Deve R$ {parseFloat(c.total_aberto).toFixed(2)}
                            </span>
                          )}
                        </button>
                      ))}
                      {fiadoClientes.every((c) => c.bloqueado) && (
                        <p className="px-3 py-2 text-xs text-gray-500">Nenhum cliente disponível.</p>
                      )}
                    </div>
                  )}
                  {fiadoClienteId && (
                    <p className="text-xs text-purple-400 font-semibold">
                      ✓ {fiadoClientes.find((c) => c.id === fiadoClienteId)?.name ?? 'Cliente selecionado'}
                    </p>
                  )}
                </div>
              )}

              {/* Troco — só para dinheiro */}
              {paymentMethod === 'cash' && (
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox" checked={needsChange} onChange={(e) => setNeedsChange(e.target.checked)}
                      className="w-4 h-4 rounded accent-orange-500"
                    />
                    <span className="text-xs text-gray-400">Precisa de troco?</span>
                  </label>
                  {needsChange && (
                    <input
                      type="number" min="0" step="0.01"
                      placeholder="Troco para R$..."
                      value={changeFor}
                      onChange={(e) => setChangeFor(e.target.value)}
                      className="input w-full text-sm"
                    />
                  )}
                </div>
              )}

              {/* Nome (obrigatório) com autocomplete */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Nome do cliente *"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    fetchSuggestions(e.target.value);
                  }}
                  onBlur={() => setTimeout(() => setShowSug(false), 150)}
                  onFocus={() => suggestions.length > 0 && setShowSug(true)}
                  className="input w-full text-sm"
                />
                {showSug && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        onMouseDown={() => applySuggestion(s)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors"
                      >
                        <p className="text-sm text-gray-200 font-medium">{s.customer_name}</p>
                        {s.customer_phone && <p className="text-xs text-gray-500">{s.customer_phone}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input type="tel" placeholder="Telefone (opcional)" value={phone}
                onChange={(e) => { setPhone(e.target.value); fetchSuggestions(e.target.value); }}
                className="input w-full text-sm" />

              <input type="text" placeholder="Observações (opcional)" value={notes}
                onChange={(e) => setNotes(e.target.value)} className="input w-full text-sm" />

              {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex items-center justify-between pt-1">
                <div>
                  <span className="text-xl font-black text-white">
                    {fmt(total + (deliveryType === 'delivery' ? parseFloat(deliveryFee) || 0 : 0))}
                  </span>
                  {deliveryType === 'delivery' && parseFloat(deliveryFee) > 0 && (
                    <p className="text-[10px] text-gray-500">
                      itens {fmt(total)} + frete {fmt(parseFloat(deliveryFee))}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || cartEntries.length === 0}
                  className="btn-green px-6 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Enviando...' : 'Confirmar Pedido'}
                </button>
              </div>
            </div>
          </div>
        </div>}
      </div>
    </div>
  );
}
