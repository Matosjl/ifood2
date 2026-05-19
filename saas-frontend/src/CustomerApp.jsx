import { useState, useEffect, useCallback, useRef } from 'react';
import { getPublicMenu, createPublicOrder, trackPublicOrder } from './api/public';

// ── Helpers ───────────────────────────────────────────────────

const fmtBRL = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2).replace('.', ',')}`;

const emptyCart = () => ({});

const addToCart = (cart, product) => {
  const prev = cart[product.id];
  if (prev) {
    return product.sale_type === 'kg' ? cart
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
    const amount = product.sale_type === 'kg'
      ? parseFloat(product.sale_price) * parseFloat(weightKg || 0)
      : parseFloat(product.sale_price) * (qty || 0);
    return sum + amount;
  }, 0);

const cartCount = (cart) =>
  Object.values(cart).reduce((sum, { product, qty, weightKg }) =>
    sum + (product.sale_type === 'kg' ? (parseFloat(weightKg) > 0 ? 1 : 0) : qty), 0);

// ── Status config ─────────────────────────────────────────────

const STATUS_STEPS = [
  { key: 'received',  label: 'Pedido Recebido', icon: '📋', desc: 'Aguardando confirmação do restaurante' },
  { key: 'preparing', label: 'Em Preparo',       icon: '👨‍🍳', desc: 'Seu pedido está sendo preparado com carinho' },
  { key: 'ready',     label: 'Pronto!',           icon: '✅', desc: 'Pronto para retirada ou saiu para entrega' },
  { key: 'delivered', label: 'Concluído',         icon: '🎉', desc: 'Pedido entregue. Aproveite sua refeição!' },
];

const STATUS_INDEX = {
  pending: 0, confirmed: 0, preparing: 1,
  ready: 2, delivered: 3, cancelled: -1,
};

// ── Storage helpers ───────────────────────────────────────────
const STORAGE_KEY = (slug) => `last_order_${slug}`;

const saveOrder = (slug, order) => {
  try { localStorage.setItem(STORAGE_KEY(slug), JSON.stringify({ id: order.id, number: order.order_number ?? order.orderNumber, ts: Date.now() })); } catch {}
};

const loadOrder = (slug) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Expire after 24h
    if (Date.now() - parsed.ts > 86_400_000) { localStorage.removeItem(STORAGE_KEY(slug)); return null; }
    return parsed;
  } catch { return null; }
};

// ── Icons ─────────────────────────────────────────────────────

const IconCart = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const IconBack = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const IconWhatsApp = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

// ── Tracking Page ─────────────────────────────────────────────

function TrackingPage({ order, tenant, onNewOrder, onRefresh }) {
  const statusIdx  = STATUS_INDEX[order?.status] ?? 0;
  const cancelled  = order?.status === 'cancelled';
  const delivered  = order?.status === 'delivered';
  const isDelivery = order?.delivery_type === 'delivery';
  const whatsapp   = tenant?.whatsapp_number;
  const pct        = Math.round(((statusIdx + 1) / STATUS_STEPS.length) * 100);

  const PAYMENT_MAP = {
    cash: '💵 Dinheiro', pix: '📱 Pix',
    credit: '💳 Crédito', debit: '💳 Débito',
    voucher: '🎫 Vale Refeição', other: '🔖 Outro',
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className={`relative text-white overflow-hidden ${cancelled ? 'bg-red-500' : delivered ? 'bg-green-600' : 'bg-gradient-to-br from-orange-500 via-orange-500 to-amber-500'}`}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 0%, transparent 60%), radial-gradient(circle at 80% 20%, white 0%, transparent 50%)' }} />
        <div className="relative px-5 pt-6 pb-8 text-center">
          <p className="text-xs font-bold opacity-75 uppercase tracking-widest mb-2">{tenant?.name ?? 'Restaurante'}</p>
          <div className="text-5xl mb-3">
            {cancelled ? '❌' : delivered ? '🎉' : '🍽️'}
          </div>
          <h1 className="text-2xl font-black leading-tight">
            {cancelled ? 'Pedido Cancelado'
              : delivered ? 'Pedido Entregue!'
              : `Pedido #${order?.order_number ?? order?.orderNumber ?? '---'}`}
          </h1>
          <p className="text-sm opacity-80 mt-2">
            {isDelivery ? '🛵 Entrega' : '🏪 Retirada no local'}
            {order?.payment_method ? ` · ${PAYMENT_MAP[order.payment_method] ?? order.payment_method}` : ''}
          </p>
        </div>
      </div>

      <div className="flex-1 max-w-lg w-full mx-auto px-4 py-5 space-y-4 pb-10">

        {/* Cancelled */}
        {cancelled && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
            <p className="text-red-700 font-bold">Seu pedido foi cancelado</p>
            <p className="text-red-500 text-sm mt-1">Entre em contato com o restaurante para mais informações.</p>
          </div>
        )}

        {/* Status timeline */}
        {!cancelled && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* Progress bar */}
            <div className="h-1.5 bg-gray-100">
              <div
                className={`h-full transition-all duration-1000 ${delivered ? 'bg-green-500' : 'bg-gradient-to-r from-orange-400 to-amber-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="p-5">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-5">Acompanhe seu pedido</p>
              <div className="space-y-0">
                {STATUS_STEPS.map((step, idx) => {
                  const done    = idx < statusIdx;
                  const current = idx === statusIdx;
                  const future  = idx > statusIdx;
                  return (
                    <div key={step.key} className="flex items-start gap-4">
                      {/* Timeline */}
                      <div className="flex flex-col items-center shrink-0" style={{ width: 40 }}>
                        <div className={[
                          'w-10 h-10 rounded-full flex items-center justify-center text-base font-bold transition-all duration-500 shadow-sm',
                          done    ? 'bg-green-500 text-white'
                          : current ? 'bg-orange-500 text-white shadow-orange-200 shadow-md scale-110'
                          : 'bg-gray-100 text-gray-300',
                        ].join(' ')}>
                          {done ? '✓' : step.icon}
                        </div>
                        {idx < STATUS_STEPS.length - 1 && (
                          <div className={`w-0.5 my-1 rounded-full transition-all duration-500 ${done ? 'h-8 bg-green-400' : 'h-8 bg-gray-200'}`} />
                        )}
                      </div>
                      {/* Text */}
                      <div className={`pb-6 flex-1 ${idx === STATUS_STEPS.length - 1 ? 'pb-2' : ''}`}>
                        <p className={[
                          'font-bold text-sm leading-tight mt-2',
                          done    ? 'text-green-600'
                          : current ? 'text-orange-600'
                          : 'text-gray-300',
                        ].join(' ')}>
                          {step.label}
                          {current && (
                            <span className="ml-2 inline-flex gap-0.5">
                              {[0,1,2].map(i => (
                                <span key={i} className="w-1 h-1 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                              ))}
                            </span>
                          )}
                        </p>
                        {(done || current) && (
                          <p className={`text-xs mt-0.5 ${current ? 'text-orange-400' : 'text-gray-400'}`}>
                            {step.desc}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {!delivered && !cancelled && (
              <div className="px-5 pb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
                <p className="text-[11px] text-gray-400">Atualizado automaticamente a cada 15 segundos</p>
                <button onClick={onRefresh} className="ml-auto text-[11px] text-orange-400 font-bold">Atualizar agora</button>
              </div>
            )}
          </div>
        )}

        {/* Order summary */}
        {order?.items?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Resumo do Pedido</p>
            </div>
            <div className="px-4 py-3 space-y-2">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <span className="text-gray-700">
                    <span className="font-semibold text-gray-900">
                      {item.weight_kg ? `${item.weight_kg}kg` : `${item.quantity}×`}
                    </span>{' '}
                    {item.product_name}
                  </span>
                  <span className="font-bold text-gray-900 shrink-0 ml-2">
                    {fmtBRL(item.total ?? 0)}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex justify-between font-black text-base">
              <span className="text-gray-700">Total</span>
              <span className="text-orange-600">{fmtBRL(order.total ?? 0)}</span>
            </div>
          </div>
        )}

        {/* Delivery address */}
        {isDelivery && order?.customer_address && (
          <div className="bg-white rounded-2xl shadow-sm px-4 py-3 flex gap-3">
            <span className="text-xl shrink-0">📍</span>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-0.5">Endereço de Entrega</p>
              <p className="text-sm text-gray-700">{order.customer_address}</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3 pt-1">
          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp.replace(/\D/g,'')}?text=${encodeURIComponent(`Olá! Tenho uma dúvida sobre o Pedido #${order?.order_number ?? order?.orderNumber ?? ''}`)}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2.5 w-full py-4 rounded-2xl bg-green-500 hover:bg-green-400 text-white font-bold text-sm transition-colors shadow-lg shadow-green-200 active:scale-95"
            >
              <IconWhatsApp />
              Falar com o restaurante
            </a>
          )}
          <button
            onClick={onNewOrder}
            className="w-full py-3.5 rounded-2xl border-2 border-orange-400 text-orange-600 font-bold text-sm hover:bg-orange-50 transition-colors active:scale-95"
          >
            ← Fazer novo pedido
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function CustomerApp({ slug }) {
  const [menuData,    setMenuData]    = useState(null);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [menuError,   setMenuError]   = useState(null);

  const [cart,           setCart]           = useState(emptyCart());
  const [cartOpen,       setCartOpen]       = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  const [featured,       setFeatured]       = useState([]);

  const [page,    setPage]    = useState('menu'); // 'menu' | 'checkout' | 'tracking'
  const [order,   setOrder]   = useState(null);

  // Checkout form
  const [customerName,    setCustomerName]    = useState('');
  const [customerPhone,   setCustomerPhone]   = useState('');
  const [deliveryType,    setDeliveryType]    = useState('pickup');
  const [customerAddress, setCustomerAddress] = useState('');
  const [notes,           setNotes]           = useState('');
  const [paymentMethod,   setPaymentMethod]   = useState('cash');
  const [trocoValue,      setTrocoValue]      = useState('');
  const [submitting,      setSubmitting]      = useState(false);
  const [checkoutError,   setCheckoutError]   = useState(null);

  // Search
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);

  // ── Load menu ──────────────────────────────────────────────

  useEffect(() => {
    setLoadingMenu(true);
    getPublicMenu(slug)
      .then(({ data }) => {
        const d = data.data ?? data;
        setMenuData(d);
        if (d.categories?.length > 0) setActiveCategory(d.categories[0].name);
        if (d.featured) setFeatured(d.featured);
        // Check if customer has a recent order to track
        const saved = loadOrder(slug);
        if (saved) {
          trackPublicOrder(saved.id)
            .then(({ data: od }) => {
              const o = od.data ?? od;
              if (['pending','confirmed','preparing','ready'].includes(o.status)) {
                setOrder(o);
                setPage('tracking');
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => setMenuError('Não foi possível carregar o cardápio. Tente novamente.'))
      .finally(() => setLoadingMenu(false));
  }, [slug]);

  // ── Tracking poll ──────────────────────────────────────────

  const refreshOrder = useCallback(() => {
    if (!order?.id) return;
    trackPublicOrder(order.id)
      .then(({ data }) => setOrder(data.data ?? data))
      .catch(() => {});
  }, [order?.id]);

  useEffect(() => {
    if (page !== 'tracking' || !order?.id) return;
    const interval = setInterval(refreshOrder, 15_000);
    return () => clearInterval(interval);
  }, [page, order?.id, refreshOrder]);

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

    // Append troco note
    let finalNotes = notes.trim();
    if (paymentMethod === 'cash' && trocoValue.trim()) {
      const extra = `Troco para: R$ ${trocoValue.trim()}`;
      finalNotes = finalNotes ? `${finalNotes} | ${extra}` : extra;
    }

    try {
      const { data } = await createPublicOrder(slug, {
        customerName:    customerName.trim(),
        customerPhone:   customerPhone.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        deliveryType,
        paymentMethod,
        notes:           finalNotes || undefined,
        items,
      });
      const created = data.data ?? data;
      saveOrder(slug, created);
      setOrder(created);
      setCart(emptyCart());
      setPage('tracking');
    } catch (err) {
      setCheckoutError(err.response?.data?.message ?? 'Erro ao criar pedido. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Search filter ──────────────────────────────────────────

  const searchLower = search.toLowerCase().trim();
  const filteredCategories = (menuData?.categories ?? []).map((cat) => ({
    ...cat,
    items: cat.items.filter((p) =>
      !searchLower ||
      p.name.toLowerCase().includes(searchLower) ||
      (p.description ?? '').toLowerCase().includes(searchLower)
    ),
  })).filter((cat) => cat.items.length > 0);

  // ── Render: loading / error ────────────────────────────────

  if (loadingMenu) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm font-medium">Carregando cardápio...</p>
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
          <button onClick={() => window.location.reload()}
            className="bg-orange-500 text-white px-6 py-2.5 rounded-full font-bold shadow-md">
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
    return (
      <TrackingPage
        order={order}
        tenant={tenant}
        onNewOrder={() => { setPage('menu'); setOrder(null); }}
        onRefresh={refreshOrder}
      />
    );
  }

  // ── PAGE: CHECKOUT ─────────────────────────────────────────

  if (page === 'checkout') {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-4 text-white shadow-lg sticky top-0 z-10">
          <button onClick={() => setPage('menu')}
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors mb-1">
            <IconBack /><span className="text-sm font-medium">Voltar ao cardápio</span>
          </button>
          <h1 className="text-xl font-black">Finalizar Pedido</h1>
        </div>

        <div className="max-w-lg mx-auto p-4 space-y-4 pb-10">

          {/* Order summary */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-orange-50 border-b border-orange-100">
              <p className="text-xs font-bold text-orange-600 uppercase tracking-widest">Seu pedido</p>
            </div>
            <div className="px-4 py-3 space-y-2">
              {cartEntries.map(({ product: p, qty, weightKg }) => (
                <div key={p.id} className="flex justify-between items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">
                      {p.sale_type === 'kg'
                        ? `${parseFloat(weightKg || 0).toFixed(2)} kg × ${fmtBRL(p.sale_price)}/kg`
                        : `${qty} × ${fmtBRL(p.sale_price)}`}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-orange-600 shrink-0">
                    {fmtBRL(p.sale_type === 'kg'
                      ? parseFloat(p.sale_price) * parseFloat(weightKg || 0)
                      : parseFloat(p.sale_price) * qty)}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {p.sale_type !== 'kg' && (
                      <>
                        <button onClick={() => { if (qty <= 1) setCart((c) => removeFromCart(c, p.id)); else setQty(p.id, qty - 1); }}
                          className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 font-bold flex items-center justify-center hover:bg-gray-200">−</button>
                        <span className="w-6 text-center text-sm font-bold text-gray-800">{qty}</span>
                        <button onClick={() => setQty(p.id, qty + 1)}
                          className="w-7 h-7 rounded-lg bg-orange-500 text-white font-bold flex items-center justify-center hover:bg-orange-600">+</button>
                      </>
                    )}
                    <button onClick={() => setCart((c) => removeFromCart(c, p.id))}
                      className="w-7 h-7 rounded-lg bg-red-50 text-red-400 font-bold flex items-center justify-center hover:bg-red-100 ml-1">×</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex justify-between font-black text-base">
              <span className="text-gray-700">Total</span>
              <span className="text-orange-600">{fmtBRL(total)}</span>
            </div>
          </div>

          {/* Customer form */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Seus dados</p>
            </div>
            <div className="px-4 py-4 space-y-3">
              <input type="text" placeholder="Seu nome completo *"
                value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                autoComplete="name" />
              <input type="tel" placeholder="WhatsApp / Telefone (opcional)"
                value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                autoComplete="tel" />
            </div>
          </div>

          {/* Delivery type */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Como quer receber?</p>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { v: 'pickup',   icon: '🏪', label: 'Retirar no Local' },
                  { v: 'delivery', icon: '🛵', label: 'Receber em Casa'  },
                ].map(({ v, icon, label }) => (
                  <button key={v} onClick={() => setDeliveryType(v)}
                    className={`flex flex-col items-center gap-1.5 py-4 rounded-xl font-bold text-sm border-2 transition-all ${
                      deliveryType === v
                        ? 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    <span className="text-2xl">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
              {deliveryType === 'delivery' && (
                <input type="text" placeholder="Endereço completo de entrega *"
                  value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
              )}
            </div>
          </div>

          {/* Payment method */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Forma de pagamento</p>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'cash',    emoji: '💵', name: 'Dinheiro' },
                  { value: 'pix',     emoji: '📱', name: 'Pix' },
                  { value: 'credit',  emoji: '💳', name: 'Crédito' },
                  { value: 'debit',   emoji: '💳', name: 'Débito' },
                  { value: 'voucher', emoji: '🎫', name: 'Vale Ref.' },
                  { value: 'other',   emoji: '🔖', name: 'Outro' },
                ].map(({ value, emoji, name }) => (
                  <button key={value} onClick={() => setPaymentMethod(value)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                      paymentMethod === value
                        ? 'border-orange-400 bg-orange-50 text-orange-700'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                    }`}>
                    <span className="text-xl">{emoji}</span>
                    <span className="text-xs">{name}</span>
                  </button>
                ))}
              </div>
              {/* Troco */}
              {paymentMethod === 'cash' && (
                <input type="text" placeholder="Troco para quanto? (ex: 50,00)"
                  value={trocoValue} onChange={(e) => setTrocoValue(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-2xl shadow-sm px-4 py-4">
            <textarea placeholder="Alguma observação? (ex: sem cebola, ponto da carne...)"
              value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-none" />
          </div>

          {/* Error */}
          {checkoutError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">
              ⚠️ {checkoutError}
            </div>
          )}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={submitting}
            className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white font-black py-4 rounded-2xl transition-colors shadow-lg shadow-green-200 text-base flex items-center justify-center gap-2 active:scale-95">
            {submitting ? (
              <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando...</>
            ) : `Confirmar Pedido · ${fmtBRL(total)}`}
          </button>
        </div>
      </div>
    );
  }

  // ── PAGE: MENU ─────────────────────────────────────────────

  // Helpers para placeholder visual
  const CATEGORY_GRADIENTS = [
    'from-orange-400 to-red-500',
    'from-purple-500 to-pink-500',
    'from-green-400 to-teal-500',
    'from-blue-400 to-indigo-500',
    'from-yellow-400 to-orange-500',
    'from-pink-400 to-rose-500',
  ];

  const getCategoryGradient = (name) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return CATEGORY_GRADIENTS[Math.abs(hash) % CATEGORY_GRADIENTS.length];
  };

  const getProductEmoji = (name) => {
    const n = name.toLowerCase();
    if (n.includes('burger') || n.includes('x-') || n.includes('hamb')) return '🍔';
    if (n.includes('pizza')) return '🍕';
    if (n.includes('frango')) return '🍗';
    if (n.includes('batata') || n.includes('fritas')) return '🍟';
    if (n.includes('salada')) return '🥗';
    if (n.includes('suco') || n.includes('vitamina')) return '🥤';
    if (n.includes('coca') || n.includes('refri') || n.includes('bebida') || n.includes('água')) return '🥤';
    if (n.includes('milk') || n.includes('shake')) return '🥛';
    if (n.includes('sorvete') || n.includes('açaí') || n.includes('acai')) return '🍨';
    if (n.includes('bolo') || n.includes('torta') || n.includes('brownie')) return '🎂';
    if (n.includes('peixe') || n.includes('salmão') || n.includes('atum')) return '🐟';
    if (n.includes('carne') || n.includes('steak') || n.includes('picanha')) return '🥩';
    if (n.includes('macarrão') || n.includes('massa') || n.includes('espaguete')) return '🍝';
    if (n.includes('marmita') || n.includes('quentinha')) return '🍱';
    if (n.includes('pastel') || n.includes('empanada') || n.includes('salgado')) return '🥟';
    if (n.includes('taco') || n.includes('burrito') || n.includes('wrap')) return '🌮';
    if (n.includes('camarão')) return '🦐';
    if (n.includes('churrasco') || n.includes('espeto')) return '🍢';
    if (n.includes('onion') || n.includes('cebola')) return '🧅';
    if (n.includes('chocolate')) return '🍫';
    if (n.includes('café') || n.includes('capuccino') || n.includes('latte')) return '☕';
    if (n.includes('cerveja') || n.includes('chopp')) return '🍺';
    if (n.includes('vinho')) return '🍷';
    return '🍽️';
  };

  const activeCat   = categories.find((c) => c.name === activeCategory);
  const displayCats = search ? filteredCategories : (activeCat ? [activeCat] : categories);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Hero header */}
      <div className="relative overflow-hidden" style={{ minHeight: 180 }}>
        {/* Cover image ou gradiente */}
        {tenant.cover_url
          ? <img src={tenant.cover_url} alt={tenant.name} className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-orange-500 to-amber-500" />
        }
        {/* Overlay escuro */}
        <div className="absolute inset-0 bg-black/40" />

        <div className="relative px-4 pt-8 pb-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-3xl mb-3 shadow-lg border border-white/20">
                🍽️
              </div>
              <h1 className="text-2xl font-black leading-tight drop-shadow">{tenant.name ?? 'Restaurante'}</h1>
              {tenant.description && (
                <p className="text-white/80 text-xs mt-1 leading-relaxed max-w-xs">{tenant.description}</p>
              )}
              {tenant.address && (
                <p className="text-white/70 text-xs mt-1 flex items-center gap-1">
                  <span>📍</span>{tenant.address}
                </p>
              )}
            </div>
            {/* Track existing order */}
            {order && (
              <button onClick={() => setPage('tracking')}
                className="shrink-0 bg-white/20 backdrop-blur border border-white/30 rounded-2xl px-3 py-2 text-center hover:bg-white/30 transition-colors">
                <p className="text-[10px] font-bold opacity-75">Meu Pedido</p>
                <p className="text-sm font-black">#{order.order_number ?? order.orderNumber}</p>
              </button>
            )}
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="flex items-center gap-1 bg-white/20 backdrop-blur rounded-full px-2.5 py-1 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Aberto agora
            </span>
            {tenant.whatsapp_number && (
              <a
                href={`https://wa.me/${tenant.whatsapp_number.replace(/\D/g,'')}?text=${encodeURIComponent(`Olá, vi o cardápio e gostaria de saber mais!`)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 bg-green-500/80 backdrop-blur rounded-full px-2.5 py-1 text-xs font-semibold hover:bg-green-500 transition-colors">
                <IconWhatsApp />
                WhatsApp
              </a>
            )}
          </div>
        </div>

        {/* Search bar */}
        <div className="relative px-4 pb-4">
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              placeholder="Buscar no cardápio..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white rounded-2xl pl-10 pr-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-300 shadow-lg"
            />
          </div>
        </div>
      </div>

      {/* Category tabs */}
      {!search && categories.length > 1 && (
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
          <div className="flex gap-1 overflow-x-auto px-3 py-2.5 scrollbar-none">
            {categories.map((cat) => (
              <button key={cat.name} onClick={() => setActiveCategory(cat.name)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                  activeCategory === cat.name
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Seção Destaques */}
      {featured.length > 0 && !search && (
        <div className="px-4 pt-4 pb-2">
          <h2 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-3">⭐ Destaques</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4">
            {featured.map(product => {
              const inCart = cart[product.id];
              const emoji  = getProductEmoji(product.name);
              const grad   = getCategoryGradient(product.category_name ?? product.name);
              return (
                <div key={product.id}
                  className="shrink-0 w-40 bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100 flex flex-col cursor-pointer active:scale-95 transition-transform"
                  onClick={() => !inCart && setCart(c => addToCart(c, product))}
                >
                  {/* Imagem ou gradiente */}
                  <div className={`h-28 relative ${!product.image_url ? `bg-gradient-to-br ${grad}` : ''}`}>
                    {product.image_url
                      ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                      : <div className="w-full h-full flex items-center justify-center text-5xl">{emoji}</div>
                    }
                    {inCart && (
                      <div className="absolute top-2 right-2 bg-orange-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center shadow">
                        {inCart.qty}
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="p-2.5 flex-1 flex flex-col justify-between">
                    <p className="text-xs font-bold text-gray-800 leading-tight line-clamp-2">{product.name}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-orange-600 font-black text-sm">{fmtBRL(product.sale_price)}</span>
                      {!inCart
                        ? <span className="text-orange-500 text-lg leading-none font-black">+</span>
                        : <span className="text-green-500 text-xs font-bold">✓</span>
                      }
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Products */}
      <div className="max-w-3xl mx-auto px-4 pt-4 pb-32">

        {/* Search empty */}
        {search && filteredCategories.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">🔍</div>
            <p className="font-semibold">Nenhum produto encontrado</p>
            <p className="text-sm mt-1">Tente buscar por outro nome</p>
          </div>
        )}

        {/* No products */}
        {!search && categories.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-3">🍽️</div>
            <p className="font-semibold">Cardápio em breve!</p>
          </div>
        )}

        {displayCats.map((cat) => (
          <div key={cat.name} className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-gray-200" />
              <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest px-2">{cat.name}</h2>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <div className="space-y-3">
              {(cat.items ?? []).map((product) => {
                const inCart     = cart[product.id];
                const outOfStock = product.stock_qty <= 0;
                return (
                  <div key={product.id}
                    className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all ${
                      outOfStock ? 'opacity-50' : 'hover:shadow-md'
                    } ${inCart ? 'border-orange-300 ring-2 ring-orange-200' : 'border-gray-100'}`}>
                    <div className="flex gap-3 p-3">
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-1 flex-wrap mb-0.5">
                          {product.featured && (
                            <span className="text-[10px] bg-yellow-100 text-yellow-700 font-bold px-1.5 py-0.5 rounded-full">⭐ Destaque</span>
                          )}
                          {outOfStock && (
                            <span className="text-[10px] bg-red-100 text-red-500 font-bold px-2 py-0.5 rounded-full">Esgotado</span>
                          )}
                        </div>
                        <p className="font-bold text-gray-900 text-sm leading-tight">{product.name}</p>
                        {product.description && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{product.description}</p>
                        )}
                        <div className="flex items-center justify-between mt-2 gap-2">
                          <span className="text-orange-600 font-black text-base">
                            {fmtBRL(product.sale_price)}
                            {product.sale_type === 'kg' && <span className="text-xs font-semibold text-gray-400">/kg</span>}
                          </span>
                          {!outOfStock && (
                            product.sale_type === 'kg' ? (
                              <input type="number" min="0.1" step="0.1" placeholder="0.0 kg"
                                value={inCart?.weightKg ?? ''}
                                onChange={(e) => {
                                  if (!inCart) setCart((c) => addToCart(c, product));
                                  setWeight(product.id, e.target.value);
                                }}
                                onFocus={() => { if (!inCart) setCart((c) => addToCart(c, product)); }}
                                className="w-24 border border-gray-200 rounded-xl px-2 py-1.5 text-sm text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-orange-400" />
                            ) : inCart ? (
                              <div className="flex items-center gap-2">
                                <button onClick={() => {
                                    if (inCart.qty <= 1) setCart((c) => removeFromCart(c, product.id));
                                    else setQty(product.id, inCart.qty - 1);
                                  }}
                                  className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 font-black text-lg flex items-center justify-center hover:bg-orange-200 transition-colors">−</button>
                                <span className="w-6 text-center font-black text-gray-900 text-sm tabular-nums">{inCart.qty}</span>
                                <button onClick={() => setQty(product.id, inCart.qty + 1)}
                                  className="w-8 h-8 rounded-xl bg-orange-500 text-white font-black text-lg flex items-center justify-center hover:bg-orange-600 transition-colors">+</button>
                              </div>
                            ) : (
                              <button onClick={() => setCart((c) => addToCart(c, product))}
                                className="flex items-center gap-1 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm px-3 py-1.5 rounded-xl transition-colors shadow-sm active:scale-95">
                                <span className="text-base leading-none">+</span>
                                Adicionar
                              </button>
                            )
                          )}
                        </div>
                      </div>
                      {/* Imagem ou placeholder colorido */}
                      <div className="w-24 h-24 rounded-xl overflow-hidden bg-gray-100 shrink-0 self-start">
                        {product.image_url
                          ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                          : <div className={`w-full h-full bg-gradient-to-br ${getCategoryGradient(product.category_name ?? product.name)} flex items-center justify-center text-4xl`}>
                              {getProductEmoji(product.name)}
                            </div>
                        }
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky cart bar */}
      {count > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 p-4 pointer-events-none">
          <button onClick={() => setCartOpen(true)}
            className="pointer-events-auto w-full max-w-lg mx-auto flex items-center justify-between bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-4 rounded-2xl shadow-2xl shadow-orange-300/50 transition-colors active:scale-95">
            <span className="bg-white/25 rounded-full w-7 h-7 flex items-center justify-center font-black text-sm">{count}</span>
            <span className="flex items-center gap-2">
              <IconCart />
              Ver Carrinho
            </span>
            <span className="font-black">{fmtBRL(total)}</span>
          </button>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col"
            style={{ animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-black text-gray-900 text-lg">Seu Carrinho</h3>
                <p className="text-xs text-gray-400">{count} {count === 1 ? 'item' : 'itens'} · {fmtBRL(total)}</p>
              </div>
              <button onClick={() => setCartOpen(false)}
                className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              {cartEntries.map(({ product: p, qty, weightKg }) => (
                <div key={p.id} className="flex items-center gap-3 py-1">
                  {p.image_url && (
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">
                      {p.sale_type === 'kg'
                        ? `${parseFloat(weightKg || 0).toFixed(2)} kg × ${fmtBRL(p.sale_price)}/kg`
                        : `${qty} × ${fmtBRL(p.sale_price)}`}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-orange-600 shrink-0">
                    {fmtBRL(p.sale_type === 'kg'
                      ? parseFloat(p.sale_price) * parseFloat(weightKg || 0)
                      : parseFloat(p.sale_price) * qty)}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {p.sale_type !== 'kg' && (
                      <>
                        <button onClick={() => { if (qty <= 1) setCart((c) => removeFromCart(c, p.id)); else setQty(p.id, qty - 1); }}
                          className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 font-bold text-sm flex items-center justify-center hover:bg-gray-200">−</button>
                        <span className="w-6 text-center text-sm font-bold text-gray-800 tabular-nums">{qty}</span>
                        <button onClick={() => setQty(p.id, qty + 1)}
                          className="w-7 h-7 rounded-lg bg-orange-500 text-white font-bold text-sm flex items-center justify-center hover:bg-orange-600">+</button>
                      </>
                    )}
                    <button onClick={() => setCart((c) => removeFromCart(c, p.id))}
                      className="w-7 h-7 rounded-lg bg-red-50 text-red-400 font-bold text-sm flex items-center justify-center hover:bg-red-100 ml-1">×</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 space-y-3">
              <div className="flex justify-between font-black text-lg">
                <span className="text-gray-700">Total</span>
                <span className="text-orange-600">{fmtBRL(total)}</span>
              </div>
              <button onClick={() => { setCartOpen(false); setPage('checkout'); }}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-black py-4 rounded-2xl transition-colors shadow-lg shadow-green-200 active:scale-95">
                Finalizar Pedido →
              </button>
            </div>
          </div>
          <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
        </div>
      )}
    </div>
  );
}
