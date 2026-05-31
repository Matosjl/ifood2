import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { listProducts, listCategories } from '../api/products';
import { listTables } from '../api/users';
import { createOrder } from '../api/orders';

// ── Helpers ───────────────────────────────────────────────────

const fmt = (v) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PAYMENT_OPTIONS = [
  { value: 'cash',   label: '💵 Dinheiro' },
  { value: 'pix',    label: '📱 PIX' },
  { value: 'credit', label: '💳 Crédito' },
  { value: 'debit',  label: '💳 Débito' },
  { value: 'pending', label: '🕐 Fechar depois' },
];

// ── Cart state helpers ────────────────────────────────────────

const EMPTY_CART = {};

function cartAdd(cart, product) {
  const key = product.id;
  return { ...cart, [key]: { product, qty: (cart[key]?.qty ?? 0) + 1 } };
}

function cartRemove(cart, productId) {
  const entry = cart[productId];
  if (!entry) return cart;
  if (entry.qty <= 1) {
    const next = { ...cart };
    delete next[productId];
    return next;
  }
  return { ...cart, [productId]: { ...entry, qty: entry.qty - 1 } };
}

function cartItems(cart) {
  return Object.values(cart);
}

function cartTotal(cart) {
  return cartItems(cart).reduce((sum, { product, qty }) => sum + Number(product.price) * qty, 0);
}

function cartCount(cart) {
  return cartItems(cart).reduce((sum, { qty }) => sum + qty, 0);
}

// ── Product Card ──────────────────────────────────────────────

function ProductCard({ product, qty, onAdd, onRemove }) {
  const hasImage    = Boolean(product.imageUrl || product.image_url);
  const imgSrc      = product.imageUrl || product.image_url;
  const price       = Number(product.price ?? product.sale_price ?? 0);
  const isIncomplete = !hasImage || price <= 0 || !product.description;

  return (
    <div className={`bg-gray-800 rounded-2xl overflow-hidden flex flex-col border active:scale-[0.98] transition-transform ${
      isIncomplete ? 'border-yellow-500/40' : 'border-white/[0.06]'
    }`}>
      {/* Image / placeholder */}
      <div className="relative w-full aspect-square bg-gray-700 flex items-center justify-center overflow-hidden shrink-0">
        {hasImage ? (
          <img src={imgSrc} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl select-none">🍽️</span>
        )}
        {/* Badge produto incompleto */}
        {isIncomplete && (
          <div className="absolute bottom-1 left-1 bg-yellow-500/90 text-black text-[9px] font-black px-1.5 py-0.5 rounded-full leading-tight">
            ⚠ incompleto
          </div>
        )}
        {qty > 0 && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-black flex items-center justify-center shadow-lg">
            {qty}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-sm font-semibold text-gray-100 leading-tight line-clamp-2 flex-1">
          {product.name}
        </p>
        {product.description && (
          <p className="text-xs text-gray-500 line-clamp-1">{product.description}</p>
        )}
        <p className="text-base font-black text-orange-400">{fmt(product.price)}</p>

        {/* Add / remove */}
        {qty === 0 ? (
          <button
            onClick={() => onAdd(product)}
            className="w-full py-2 rounded-xl bg-orange-500/20 text-orange-400 text-sm font-bold hover:bg-orange-500/30 active:bg-orange-500/40 transition-colors"
          >
            + Adicionar
          </button>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => onRemove(product.id)}
              className="w-9 h-9 rounded-xl bg-gray-700 text-gray-300 text-xl font-bold flex items-center justify-center hover:bg-gray-600 active:bg-gray-500 transition-colors"
            >
              −
            </button>
            <span className="text-lg font-black text-orange-400">{qty}</span>
            <button
              onClick={() => onAdd(product)}
              className="w-9 h-9 rounded-xl bg-orange-500 text-white text-xl font-bold flex items-center justify-center hover:bg-orange-600 active:bg-orange-700 transition-colors"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cart Sheet ────────────────────────────────────────────────

function CartSheet({ cart, tables, onAdd, onRemove, onSubmit, onClose, submitting }) {
  const [tableId,   setTableId]   = useState('');
  const [payment,   setPayment]   = useState('pending');
  const [notes,     setNotes]     = useState('');
  const [customer,  setCustomer]  = useState('');

  const items = cartItems(cart);
  const total = cartTotal(cart);

  const handleSubmit = () => {
    onSubmit({ tableId, payment, notes, customer });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.7)' }}>
      {/* Tap outside to close */}
      <div className="flex-1" onClick={onClose} />

      {/* Sheet */}
      <div className="bg-gray-900 rounded-t-3xl flex flex-col max-h-[90vh]">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-700" />
        </div>

        <div className="px-4 pb-2 shrink-0 flex items-center justify-between">
          <h2 className="text-lg font-black text-white">🛒 Pedido</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-2xl leading-none">×</button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-4">
          {/* Items */}
          <div className="space-y-2">
            {items.map(({ product, qty }) => (
              <div key={product.id} className="flex items-center gap-3 bg-gray-800 rounded-xl p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-100 truncate">{product.name}</p>
                  <p className="text-xs text-gray-400">{fmt(product.price)} × {qty}</p>
                </div>
                <p className="text-sm font-black text-orange-400 shrink-0">
                  {fmt(Number(product.price) * qty)}
                </p>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onRemove(product.id)}
                    className="w-7 h-7 rounded-lg bg-gray-700 text-gray-300 flex items-center justify-center hover:bg-gray-600 text-base font-bold"
                  >−</button>
                  <span className="w-5 text-center text-sm font-bold text-white">{qty}</span>
                  <button
                    onClick={() => onAdd(product)}
                    className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 text-base font-bold"
                  >+</button>
                </div>
              </div>
            ))}
          </div>

          {/* Mesa */}
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Mesa</label>
            <select
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
            >
              <option value="">— Balcão / sem mesa —</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  Mesa {t.number}{t.label ? ` — ${t.label}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Cliente */}
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Nome do cliente (opcional)</label>
            <input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Ex: João Silva"
              className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Pagamento */}
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Pagamento</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPayment(opt.value)}
                  className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    payment === opt.value
                      ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                      : 'bg-gray-800 border-white/10 text-gray-400 hover:border-white/20'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Sem cebola, ponto da carne..."
              rows={2}
              className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-orange-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 pt-3 pb-6 border-t border-white/[0.06] bg-gray-900">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-400">Total</span>
            <span className="text-xl font-black text-orange-400">{fmt(total)}</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || items.length === 0}
            className="w-full py-3.5 rounded-2xl bg-orange-500 text-white text-base font-black hover:bg-orange-600 active:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Enviando...' : `Confirmar pedido • ${fmt(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────

export default function GarcomPage() {
  const [categories,  setCategories]  = useState([]);
  const [products,    setProducts]    = useState([]);
  const [tables,      setTables]      = useState([]);
  const [activeCat,   setActiveCat]   = useState('all');
  const [cart,        setCart]        = useState(EMPTY_CART);
  const [showCart,    setShowCart]    = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [search,      setSearch]      = useState('');
  const [toast,       setToast]       = useState(null); // { msg, type }
  const catBarRef = useRef(null);

  const tenant = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('tenant') || '{}'); } catch { return {}; }
  }, []);

  // ── Load data ──────────────────────────────────────────────
  useEffect(() => {
    listCategories().then(({ data }) => setCategories(data.data ?? data)).catch(() => {});
    listTables().then(({ data }) => setTables(data.data ?? data)).catch(() => {});
    listProducts({ limit: 500, available: true })
      .then(({ data }) => setProducts(data.data?.products ?? data.data ?? data))
      .catch(() => {});
  }, []);

  // Categorias que não fazem sentido no app garçom (adicionais são modifiers, não produtos)
  const ADDON_CATEGORY_KEYWORDS = ['adicional', 'complemento', 'topping', 'extra'];
  const isAddonCategory = (name = '') =>
    ADDON_CATEGORY_KEYWORDS.some((kw) => name.toLowerCase().includes(kw));

  // IDs das categorias de adicionais — filtra da barra e dos produtos
  const addonCatIds = useMemo(
    () => new Set(categories.filter((c) => isAddonCategory(c.name)).map((c) => c.id)),
    [categories]
  );

  // Categorias visíveis na barra (sem as de adicionais)
  const visibleCategories = useMemo(
    () => categories.filter((c) => !isAddonCategory(c.name)),
    [categories]
  );

  // ── Filtered products ──────────────────────────────────────
  const filtered = useMemo(() => {
    let list = products.filter((p) => {
      if (p.available === false || p.isActive === false) return false;
      // Exclui produtos sem preço (adicionais R$0,00)
      if (Number(p.price ?? p.sale_price ?? 0) <= 0) return false;
      // Exclui produtos da categoria "Adicionais / Complementos"
      const catId = p.categoryId ?? p.category_id;
      if (catId && addonCatIds.has(catId)) return false;
      // Exclui produtos cujo nome começa com "Adicional:"
      if (/^adicional\s*:/i.test(p.name)) return false;
      return true;
    });
    if (activeCat !== 'all') list = list.filter((p) => p.categoryId === activeCat || p.category_id === activeCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [products, activeCat, search, addonCatIds]);

  // ── Cart actions ───────────────────────────────────────────
  const handleAdd    = useCallback((product) => setCart((c) => cartAdd(c, product)), []);
  const handleRemove = useCallback((productId) => setCart((c) => cartRemove(c, productId)), []);

  // ── Show toast ─────────────────────────────────────────────
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Submit order ───────────────────────────────────────────
  const handleSubmit = useCallback(async ({ tableId, payment, notes, customer }) => {
    const items = cartItems(cart);
    if (items.length === 0) return;

    setSubmitting(true);
    try {
      const table = tableId ? tables.find((t) => t.id === tableId) : null;

      const payload = {
        deliveryType: 'dine_in',
        paymentMethod: payment,
        channel: 'waiter',
        notes: notes || undefined,
        tableNumber: table?.number ?? undefined,
        customerName: customer || undefined,
        items: items.map(({ product, qty }) => ({
          productId: product.id,
          quantity:  qty,
        })),
      };

      await createOrder(payload);
      setCart(EMPTY_CART);
      setShowCart(false);
      showToast('✅ Pedido enviado para a cozinha!');
    } catch (err) {
      const msg = err?.response?.data?.message ?? err.message ?? 'Erro ao criar pedido';
      showToast(`❌ ${msg}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }, [cart, tables, showToast]);

  const count = cartCount(cart);
  const total = cartTotal(cart);

  // ── Category scroll helper ─────────────────────────────────
  const handleCatClick = (key) => {
    setActiveCat(key);
    // Scroll to button in category bar
    const bar = catBarRef.current;
    if (!bar) return;
    const btn = bar.querySelector(`[data-cat="${key}"]`);
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">

      {/* ── Header ── */}
      <header className="shrink-0 bg-gray-900 border-b border-white/[0.06] px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-orange-500/20 flex items-center justify-center text-lg shrink-0">
          🍽️
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white truncate leading-tight">{tenant.name ?? 'Restaurante'}</p>
          <p className="text-[10px] text-gray-500">App Garçom</p>
        </div>

        {/* Cart button */}
        <button
          onClick={() => count > 0 && setShowCart(true)}
          disabled={count === 0}
          className="relative flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-500/20 text-orange-400 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-orange-500/30 active:bg-orange-500/40 transition-colors"
        >
          <span className="text-lg">🛒</span>
          {count > 0 && (
            <>
              <span className="text-sm font-black">{fmt(total)}</span>
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-black flex items-center justify-center">
                {count}
              </span>
            </>
          )}
        </button>
      </header>

      {/* ── Search bar ── */}
      <div className="shrink-0 px-4 pt-3 pb-2 bg-gray-950">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full bg-gray-800 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-orange-500"
          />
        </div>
      </div>

      {/* ── Category tabs ── */}
      <div
        ref={catBarRef}
        className="shrink-0 flex items-center gap-2 px-4 pb-2 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none' }}
      >
        <button
          data-cat="all"
          onClick={() => handleCatClick('all')}
          className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
            activeCat === 'all'
              ? 'bg-orange-500 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Todos
        </button>
        {visibleCategories.map((cat) => (
          <button
            key={cat.id}
            data-cat={cat.id}
            onClick={() => handleCatClick(cat.id)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              activeCat === cat.id
                ? 'bg-orange-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* ── Product grid ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-600 gap-2">
            <span className="text-4xl">🔍</span>
            <p className="text-sm">Nenhum produto encontrado</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pt-1 pb-4">
            {filtered.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                qty={cart[product.id]?.qty ?? 0}
                onAdd={handleAdd}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Floating cart bar ── */}
      {count > 0 && !showCart && (
        <div className="fixed bottom-4 left-4 right-4 z-40">
          <button
            onClick={() => setShowCart(true)}
            className="w-full py-4 px-6 rounded-2xl bg-orange-500 text-white font-black text-base shadow-2xl shadow-orange-500/30 hover:bg-orange-600 active:bg-orange-700 transition-colors flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-white/20 text-xs font-black flex items-center justify-center">
                {count}
              </span>
              Ver pedido
            </span>
            <span>{fmt(total)}</span>
          </button>
        </div>
      )}

      {/* ── Cart sheet ── */}
      {showCart && (
        <CartSheet
          cart={cart}
          tables={tables}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onSubmit={handleSubmit}
          onClose={() => setShowCart(false)}
          submitting={submitting}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed top-4 left-4 right-4 z-[100] px-4 py-3 rounded-2xl text-sm font-semibold text-center shadow-2xl transition-all ${
            toast.type === 'error'
              ? 'bg-red-500/20 border border-red-500/30 text-red-400'
              : 'bg-green-500/20 border border-green-500/30 text-green-400'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
