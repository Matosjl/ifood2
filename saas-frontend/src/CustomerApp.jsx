import { useState, useEffect, useCallback } from 'react';
import { getPublicMenu, createPublicOrder, trackPublicOrder } from './api/public';

// ── Helpers ───────────────────────────────────────────────────

const fmtBRL = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2).replace('.', ',')}`;

const emptyCart = () => ({});

const addToCart = (cart, product) => {
  const prev = cart[product.id];
  if (prev) {
    return product.sale_type === 'kg'
      ? cart // kg items are not auto-incremented; user sets weight
      : { ...cart, [product.id]: { ...prev, qty: prev.qty + 1 } };
  }
  return { ...cart, [product.id]: { product, qty: 1, weightKg: '' } };
};

const removeFromCart = (cart, id) => {
  const next = { ...cart };
  delete next[id];
  return next;
};

const cartTotal = (cart) =>
  Object.values(cart).reduce((sum, { product, qty, weightKg }) => {
    const amount =
      product.sale_type === 'kg'
        ? parseFloat(product.sale_price) * parseFloat(weightKg || 0)
        : parseFloat(product.sale_price) * (qty || 0);
    return sum + amount;
  }, 0);

const cartCount = (cart) =>
  Object.values(cart).reduce((sum, { product, qty, weightKg }) => {
    return sum + (product.sale_type === 'kg' ? (parseFloat(weightKg) > 0 ? 1 : 0) : qty);
  }, 0);

// ── Status config ─────────────────────────────────────────────

const STATUS_STEPS = [
  { key: 'received',   label: 'Recebido',    icon: '📋' },
  { key: 'preparing',  label: 'Em Preparo',  icon: '👨‍🍳' },
  { key: 'ready',      label: 'Pronto',      icon: '✅' },
  { key: 'delivered',  label: 'Entregue/Retirado', icon: '🎉' },
];

const STATUS_INDEX = { received: 0, preparing: 1, ready: 2, delivered: 3 };

// ── Main Component ────────────────────────────────────────────

export default function CustomerApp({ slug }) {
  const [menuData,   setMenuData]   = useState(null);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [menuError,  setMenuError]  = useState(null);

  const [cart,       setCart]       = useState(emptyCart());
  const [cartOpen,   setCartOpen]   = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);

  const [page,       setPage]       = useState('menu'); // 'menu' | 'checkout' | 'tracking'

  // Checkout form
  const [customerName,    setCustomerName]    = useState('');
  const [customerPhone,   setCustomerPhone]   = useState('');
  const [deliveryType,    setDeliveryType]    = useState('pickup');
  const [customerAddress, setCustomerAddress] = useState('');
  const [notes,           setNotes]           = useState('');
  const [paymentMethod,   setPaymentMethod]   = useState('cash');
  const [submitting,      setSubmitting]      = useState(false);
  const [checkoutError,   setCheckoutError]   = useState(null);

  // Tracking
  const [order,      setOrder]      = useState(null);

  // ── Load menu ──────────────────────────────────────────────

  useEffect(() => {
    setLoadingMenu(true);
    getPublicMenu(slug)
      .then(({ data }) => {
        const d = data.data ?? data;
        setMenuData(d);
        if (d.categories?.length > 0) setActiveCategory(d.categories[0].name);
      })
      .catch(() => setMenuError('Não foi possível carregar o cardápio. Tente novamente.'))
      .finally(() => setLoadingMenu(false));
  }, [slug]);

  // ── Tracking poll ──────────────────────────────────────────

  useEffect(() => {
    if (page !== 'tracking' || !order?.id) return;
    const poll = () => {
      trackPublicOrder(order.id)
        .then(({ data }) => {
          const o = data.data ?? data;
          setOrder(o);
        })
        .catch(() => {}); // silent fail
    };
    const interval = setInterval(poll, 15_000);
    return () => clearInterval(interval);
  }, [page, order?.id]);

  // ── Cart helpers ───────────────────────────────────────────

  const setWeight = useCallback((id, w) =>
    setCart((c) => ({ ...c, [id]: { ...c[id], weightKg: w } })), []);

  const setQty = useCallback((id, qty) =>
    setCart((c) => ({ ...c, [id]: { ...c[id], qty: Math.max(1, parseInt(qty) || 1) } })), []);

  const cartEntries = Object.values(cart);
  const total       = cartTotal(cart);
  const count       = cartCount(cart);

  // ── Submit order ───────────────────────────────────────────

  const handleSubmit = async () => {
    if (!customerName.trim()) return setCheckoutError('Informe seu nome.');
    if (deliveryType === 'delivery' && !customerAddress.trim())
      return setCheckoutError('Informe o endereço de entrega.');
    if (cartEntries.length === 0) return setCheckoutError('Carrinho vazio.');

    setCheckoutError(null);
    setSubmitting(true);

    const items = cartEntries.map(({ product, qty, weightKg }) => ({
      productId: product.id,
      ...(product.sale_type === 'kg'
        ? { weightKg: parseFloat(weightKg) }
        : { quantity: qty }),
    }));

    try {
      const { data } = await createPublicOrder(slug, {
        customerName:    customerName.trim(),
        customerPhone:   customerPhone.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        deliveryType,
        paymentMethod,
        notes:           notes.trim() || undefined,
        items,
      });
      const created = data.data ?? data;
      setOrder(created);
      setCart(emptyCart());
      setPage('tracking');
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Erro ao criar pedido. Tente novamente.';
      setCheckoutError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render: loading / error ────────────────────────────────

  if (loadingMenu) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">Carregando cardápio...</p>
        </div>
      </div>
    );
  }

  if (menuError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">😕</div>
          <p className="text-red-500 font-semibold">{menuError}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-orange-500 text-white px-6 py-2 rounded-full font-semibold"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const tenant     = menuData?.tenant ?? {};
  const categories = menuData?.categories ?? [];

  // ── PAGE: TRACKING ─────────────────────────────────────────

  if (page === 'tracking') {
    const statusIdx = STATUS_INDEX[order?.status] ?? 0;

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-6 text-white text-center shadow-lg">
          <h1 className="text-xl font-black">{tenant.name ?? 'Restaurante'}</h1>
        </div>

        <div className="max-w-lg mx-auto p-4 space-y-6 pt-8">
          {/* Confirmation */}
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center space-y-2">
            <div className="text-5xl">✅</div>
            <h2 className="text-2xl font-black text-gray-900">
              Pedido #{order?.orderNumber ?? order?.id?.slice(0, 6) ?? '---'} confirmado!
            </h2>
            <p className="text-gray-500 text-sm">
              {order?.delivery_type === 'delivery' ? '🛵 Entrega' : '🏪 Retirada no local'}
            </p>
            {order?.payment_method && (
              <p className="text-gray-400 text-xs mt-1">
                {{ cash: '💵 Dinheiro', pix: '📱 Pix', credit: '💳 Cartão de Crédito', debit: '💳 Cartão de Débito', voucher: '🎫 Vale Refeição', other: '🔖 Outro' }[order.payment_method] ?? order.payment_method}
              </p>
            )}
          </div>

          {/* Status timeline */}
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Status do pedido</h3>
            <div className="space-y-3">
              {STATUS_STEPS.map((step, idx) => {
                const done    = idx < statusIdx;
                const current = idx === statusIdx;
                const future  = idx > statusIdx;
                return (
                  <div key={step.key} className="flex items-center gap-3">
                    {/* Circle */}
                    <div className={[
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all',
                      done    ? 'bg-green-100 text-green-600'
                      : current ? 'bg-orange-500 text-white shadow-md shadow-orange-300'
                      : 'bg-gray-100 text-gray-400',
                    ].join(' ')}>
                      {current ? (
                        <span className="animate-pulse">{step.icon}</span>
                      ) : done ? (
                        '✓'
                      ) : (
                        <span className="text-xs">{idx + 1}</span>
                      )}
                    </div>
                    {/* Label */}
                    <span className={[
                      'text-sm font-semibold',
                      done    ? 'text-green-600'
                      : current ? 'text-orange-600'
                      : 'text-gray-400',
                    ].join(' ')}>
                      {step.label}
                      {current && (
                        <span className="ml-2 inline-block w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 pt-2">Atualizado automaticamente a cada 15 segundos</p>
          </div>

          {/* New order */}
          <button
            onClick={() => { setPage('menu'); setOrder(null); }}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-2xl transition-colors shadow-md"
          >
            Fazer novo pedido
          </button>
        </div>
      </div>
    );
  }

  // ── PAGE: CHECKOUT ─────────────────────────────────────────

  if (page === 'checkout') {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-5 text-white shadow-lg">
          <button
            onClick={() => setPage('menu')}
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors mb-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">Voltar ao cardápio</span>
          </button>
          <h1 className="text-xl font-black">Finalizar Pedido</h1>
        </div>

        <div className="max-w-lg mx-auto p-4 space-y-4 pb-10">

          {/* Order summary */}
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <h3 className="font-bold text-gray-800">Resumo do pedido</h3>
            {cartEntries.map(({ product: p, qty, weightKg }) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-gray-700 flex-1 truncate">
                  {p.sale_type === 'kg'
                    ? `${p.name} (${parseFloat(weightKg || 0).toFixed(2)} kg)`
                    : `${p.name} × ${qty}`}
                </span>
                <span className="font-semibold text-gray-900 shrink-0">
                  {fmtBRL(
                    p.sale_type === 'kg'
                      ? parseFloat(p.sale_price) * parseFloat(weightKg || 0)
                      : parseFloat(p.sale_price) * qty
                  )}
                </span>
              </div>
            ))}
            <div className="border-t border-gray-100 pt-2 flex justify-between font-black text-base">
              <span>Total</span>
              <span className="text-orange-600">{fmtBRL(total)}</span>
            </div>
          </div>

          {/* Customer form */}
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <h3 className="font-bold text-gray-800">Seus dados</h3>

            <input
              type="text"
              placeholder="Seu nome *"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
              autoComplete="name"
            />
            <input
              type="tel"
              placeholder="Telefone / WhatsApp (opcional)"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
              autoComplete="tel"
            />

            {/* Delivery type toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeliveryType('pickup')}
                className={[
                  'flex-1 py-3 rounded-xl text-sm font-bold transition-all',
                  deliveryType === 'pickup'
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                ].join(' ')}
              >
                🏪 Retirar no local
              </button>
              <button
                type="button"
                onClick={() => setDeliveryType('delivery')}
                className={[
                  'flex-1 py-3 rounded-xl text-sm font-bold transition-all',
                  deliveryType === 'delivery'
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                ].join(' ')}
              >
                🛵 Receber em casa
              </button>
            </div>

            {deliveryType === 'delivery' && (
              <input
                type="text"
                placeholder="Endereço de entrega *"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              />
            )}

            {/* Forma de pagamento */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Forma de pagamento</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'cash',    label: '💵', name: 'Dinheiro' },
                  { value: 'pix',     label: '📱', name: 'Pix' },
                  { value: 'credit',  label: '💳', name: 'Crédito' },
                  { value: 'debit',   label: '💳', name: 'Débito' },
                  { value: 'voucher', label: '🎫', name: 'Vale Ref.' },
                  { value: 'other',   label: '🔖', name: 'Outro' },
                ].map(({ value, label, name }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPaymentMethod(value)}
                    className={[
                      'flex flex-col items-center gap-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all',
                      paymentMethod === value
                        ? 'border-orange-400 bg-orange-50 text-orange-700'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300',
                    ].join(' ')}
                  >
                    <span className="text-xl">{label}</span>
                    <span className="text-xs">{name}</span>
                  </button>
                ))}
              </div>
            </div>

            <textarea
              placeholder="Observações (opcional) — ex: sem cebola"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-none"
            />
          </div>

          {/* Error */}
          {checkoutError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">
              {checkoutError}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black py-4 rounded-2xl transition-colors shadow-md text-base flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Enviando...
              </>
            ) : (
              'Confirmar Pedido'
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── PAGE: MENU ─────────────────────────────────────────────

  const activeCat = categories.find((c) => c.name === activeCategory);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-6 text-white text-center shadow-lg">
        <h1 className="text-2xl font-black">{tenant.name ?? 'Restaurante'}</h1>
        <p className="text-orange-100 text-sm mt-1">🍽️ Cardápio</p>
      </div>

      {/* Category nav */}
      {categories.length > 1 && (
        <div className="sticky top-0 z-10 bg-white shadow-sm border-b border-gray-100">
          <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat.name}
                onClick={() => setActiveCategory(cat.name)}
                className={[
                  'shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors',
                  activeCategory === cat.name
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                ].join(' ')}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Products */}
      <div className="max-w-3xl mx-auto px-4 pt-4 pb-28">
        {categories.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-3">🍽️</div>
            <p>Cardápio em breve!</p>
          </div>
        )}

        {(activeCat ? [activeCat] : categories).map((cat) => (
          <div key={cat.name} className="mb-6">
            <h2 className="text-base font-black text-gray-700 uppercase tracking-wide mb-3 border-l-4 border-orange-500 pl-3">
              {cat.name}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(cat.items ?? []).map((product) => {
                const inCart = cart[product.id];
                const outOfStock = product.stock_qty <= 0;
                return (
                  <div
                    key={product.id}
                    className={[
                      'bg-white rounded-2xl shadow-sm border transition-all overflow-hidden',
                      outOfStock ? 'opacity-50' : 'hover:shadow-md',
                      inCart ? 'border-orange-300 ring-1 ring-orange-300' : 'border-gray-100',
                    ].join(' ')}
                  >
                    {/* Product image */}
                    {product.image_url && (
                      <div className="w-full h-28 overflow-hidden bg-gray-100">
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="p-3 space-y-2">
                      <div>
                        <p className="font-bold text-gray-900 text-sm leading-tight">{product.name}</p>
                        {product.description && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{product.description}</p>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-orange-600 font-black text-sm">
                          {fmtBRL(product.sale_price)}
                          {product.sale_type === 'kg' && <span className="text-xs font-semibold text-gray-400">/kg</span>}
                        </span>
                        {outOfStock && <span className="text-xs text-red-400 font-semibold">Esgotado</span>}
                      </div>

                      {!outOfStock && (
                        <>
                          {product.sale_type === 'kg' ? (
                            /* kg product: show weight input */
                            <div className="space-y-1.5">
                              <input
                                type="number"
                                min="0.1"
                                step="0.1"
                                placeholder="0.0 kg"
                                value={inCart?.weightKg ?? ''}
                                onChange={(e) => {
                                  if (!inCart) setCart((c) => addToCart(c, product));
                                  setWeight(product.id, e.target.value);
                                }}
                                onFocus={() => {
                                  if (!inCart) setCart((c) => addToCart(c, product));
                                }}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
                              />
                              {inCart && (
                                <button
                                  onClick={() => setCart((c) => removeFromCart(c, product.id))}
                                  className="w-full text-xs text-red-400 hover:text-red-600 transition-colors"
                                >
                                  Remover
                                </button>
                              )}
                            </div>
                          ) : (
                            /* unit product: +/- controls */
                            inCart ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => {
                                    if (inCart.qty <= 1) setCart((c) => removeFromCart(c, product.id));
                                    else setQty(product.id, inCart.qty - 1);
                                  }}
                                  className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 font-bold text-base flex items-center justify-center hover:bg-orange-200 transition-colors"
                                >
                                  −
                                </button>
                                <span className="flex-1 text-center font-bold text-sm text-gray-900 tabular-nums">
                                  {inCart.qty}
                                </span>
                                <button
                                  onClick={() => setQty(product.id, inCart.qty + 1)}
                                  className="w-7 h-7 rounded-lg bg-orange-500 text-white font-bold text-base flex items-center justify-center hover:bg-orange-600 transition-colors"
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setCart((c) => addToCart(c, product))}
                                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm py-1.5 rounded-xl transition-colors"
                              >
                                + Adicionar
                              </button>
                            )
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky bottom bar */}
      {count > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-gray-100 via-gray-50/90 to-transparent">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full max-w-3xl mx-auto flex items-center justify-between bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-4 rounded-2xl shadow-xl transition-colors"
          >
            <span className="bg-white/20 px-2 py-0.5 rounded-full text-sm">
              {count} {count === 1 ? 'item' : 'itens'}
            </span>
            <span>Ver Carrinho</span>
            <span className="font-black">{fmtBRL(total)} →</span>
          </button>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setCartOpen(false)}
          />
          {/* Drawer */}
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-black text-gray-900 text-lg">Seu Carrinho</h3>
              <button
                onClick={() => setCartOpen(false)}
                className="p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              {cartEntries.map(({ product: p, qty, weightKg }) => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">
                      {p.sale_type === 'kg'
                        ? `${parseFloat(weightKg || 0).toFixed(2)} kg × ${fmtBRL(p.sale_price)}/kg`
                        : `${qty} × ${fmtBRL(p.sale_price)}`}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-orange-600 shrink-0">
                    {fmtBRL(
                      p.sale_type === 'kg'
                        ? parseFloat(p.sale_price) * parseFloat(weightKg || 0)
                        : parseFloat(p.sale_price) * qty
                    )}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {p.sale_type !== 'kg' && (
                      <>
                        <button
                          onClick={() => {
                            if (qty <= 1) setCart((c) => removeFromCart(c, p.id));
                            else setQty(p.id, qty - 1);
                          }}
                          className="w-6 h-6 rounded-lg bg-gray-100 text-gray-600 font-bold text-sm flex items-center justify-center hover:bg-gray-200"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-bold text-gray-800 tabular-nums">{qty}</span>
                        <button
                          onClick={() => setQty(p.id, qty + 1)}
                          className="w-6 h-6 rounded-lg bg-orange-500 text-white font-bold text-sm flex items-center justify-center hover:bg-orange-600"
                        >
                          +
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setCart((c) => removeFromCart(c, p.id))}
                      className="w-6 h-6 rounded-lg bg-red-50 text-red-400 font-bold text-sm flex items-center justify-center hover:bg-red-100 ml-1"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Drawer footer */}
            <div className="px-5 py-4 border-t border-gray-100 space-y-3">
              <div className="flex justify-between font-black text-base">
                <span className="text-gray-700">Total</span>
                <span className="text-orange-600">{fmtBRL(total)}</span>
              </div>
              <button
                onClick={() => { setCartOpen(false); setPage('checkout'); }}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-black py-4 rounded-2xl transition-colors shadow-md"
              >
                Finalizar Pedido →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
