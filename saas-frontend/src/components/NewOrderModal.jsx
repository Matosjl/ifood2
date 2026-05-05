import { useState, useEffect, useCallback } from 'react';
import { getProducts, createOrder } from '../api/orders';

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

// ── Component ─────────────────────────────────────────────────

export default function NewOrderModal({ onClose, onCreated }) {
  const [products,  setProducts]  = useState([]);
  const [search,    setSearch]    = useState('');
  const [cart,      setCart]      = useState(emptyCart());
  const [name,      setName]      = useState('');
  const [phone,     setPhone]     = useState('');
  const [notes,     setNotes]     = useState('');
  const [loading,   setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error,     setError]     = useState(null);

  // Fetch products on mount
  useEffect(() => {
    getProducts({ active: true, limit: 200 })
      .then(({ data }) => setProducts(data.data ?? []))
      .catch(() => setError('Erro ao carregar produtos.'))
      .finally(() => setLoading(false));
  }, []);

  // ESC to close
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const cartEntries = Object.values(cart);
  const total       = cartTotal(cart);

  const setQty = (id, qty) =>
    setCart((c) => ({ ...c, [id]: { ...c[id], qty: Math.max(1, parseInt(qty) || 1) } }));

  const setWeight = (id, w) =>
    setCart((c) => ({ ...c, [id]: { ...c[id], weightKg: w } }));

  const handleSubmit = async () => {
    if (cartEntries.length === 0) return setError('Adicione pelo menos 1 item.');
    setError(null);
    setSubmitting(true);

    const items = cartEntries.map(({ product, qty, weightKg }) => ({
      productId: product.id,
      ...(product.sale_type === 'kg'
        ? { weightKg: parseFloat(weightKg) }
        : { quantity: qty }),
    }));

    try {
      const { data } = await createOrder({
        customerName:  name  || undefined,
        customerPhone: phone || undefined,
        notes:         notes || undefined,
        items,
      });
      onCreated?.(data.data);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Erro ao criar pedido.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-3xl max-h-[90vh] bg-gray-900 rounded-2xl shadow-2xl flex flex-col border border-white/10 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-black text-white">Novo Pedido</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex flex-1 min-h-0 divide-x divide-white/10">

          {/* LEFT — product catalog */}
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
            <ul className="col-scroll flex-1 px-3 pb-3 space-y-1">
              {loading && (
                <li className="text-gray-500 text-sm text-center py-8">Carregando...</li>
              )}
              {!loading && filtered.length === 0 && (
                <li className="text-gray-500 text-sm text-center py-8">Nenhum produto</li>
              )}
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setCart((c) => addToCart(c, p))}
                    disabled={p.stock_qty <= 0}
                    className={[
                      'w-full text-left px-3 py-2 rounded-lg transition-colors',
                      'flex items-center justify-between gap-2',
                      p.stock_qty <= 0
                        ? 'opacity-40 cursor-not-allowed bg-gray-800/40'
                        : 'bg-gray-800/60 hover:bg-gray-700/80 cursor-pointer',
                      cart[p.id] ? 'ring-1 ring-blue-500/60' : '',
                    ].join(' ')}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-200 truncate">{p.name}</p>
                      <p className="text-xs text-gray-500">
                        Estoque: {p.stock_qty} {p.sale_type === 'kg' ? 'kg' : 'un'} ·{' '}
                        {fmt(p.sale_price)}/{p.sale_type === 'kg' ? 'kg' : 'un'}
                      </p>
                    </div>
                    <span className="text-green-400 font-bold text-sm shrink-0">{fmt(p.sale_price)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* RIGHT — cart */}
          <div className="flex flex-col w-1/2 min-h-0">
            <div className="col-scroll flex-1 p-3 space-y-2">
              {cartEntries.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-600 text-sm italic">
                  Clique em um produto para adicionar
                </div>
              ) : (
                cartEntries.map(({ product: p, qty, weightKg }) => (
                  <div key={p.id} className="bg-gray-800/60 rounded-xl p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-200 leading-tight">{p.name}</p>
                      <button
                        onClick={() => setCart((c) => removeFromCart(c, p.id))}
                        className="text-gray-600 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    {p.sale_type === 'kg' ? (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-400 shrink-0">Peso (kg)</label>
                        <input
                          type="number" min="0.1" step="0.1"
                          value={weightKg}
                          onChange={(e) => setWeight(p.id, e.target.value)}
                          className="input w-24 text-sm"
                          placeholder="0.0"
                        />
                        {weightKg && (
                          <span className="text-xs text-green-400 font-semibold ml-auto">
                            {fmt(parseFloat(p.sale_price) * parseFloat(weightKg))}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button onClick={() => setQty(p.id, qty - 1)} className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-bold text-base flex items-center justify-center">−</button>
                        <span className="w-8 text-center text-sm font-bold text-white tabular-nums">{qty}</span>
                        <button onClick={() => setQty(p.id, qty + 1)} className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-bold text-base flex items-center justify-center">+</button>
                        <span className="text-xs text-green-400 font-semibold ml-auto">
                          {fmt(parseFloat(p.sale_price) * qty)}
                        </span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Customer + total */}
            <div className="p-3 border-t border-white/10 space-y-2 shrink-0">
              <input type="text" placeholder="Nome do cliente (opcional)" value={name} onChange={(e) => setName(e.target.value)} className="input w-full text-sm" />
              <input type="tel"  placeholder="Telefone (opcional)"        value={phone} onChange={(e) => setPhone(e.target.value)} className="input w-full text-sm" />
              <input type="text" placeholder="Observações (opcional)"     value={notes} onChange={(e) => setNotes(e.target.value)} className="input w-full text-sm" />

              {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex items-center justify-between pt-1">
                <span className="text-xl font-black text-white">{fmt(total)}</span>
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
        </div>
      </div>
    </div>
  );
}
