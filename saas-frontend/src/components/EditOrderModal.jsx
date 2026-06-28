import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getProducts, editOrderItems, updateOrderInfo, markOrderPaid as markOrderPaidApi } from '../api/orders';
import { NEIGHBORHOODS, PAY_OPTIONS, fmt } from '../constants/orders';
import { cartTotal, groupByCategory } from '../utils/cart';
import { listFiadoClientes, createFiadoCompra } from '../api/fiado';

// ── buildInitialCart usa item.id como chave para suportar o mesmo produto
//    múltiplas vezes com observações diferentes. Produtos removidos/inativos
//    são representados com um objeto sintético para exibição.
const buildInitialCart = (orderItems, catalogProducts) => {
  const productMap = Object.fromEntries(catalogProducts.map((p) => [p.id, p]));
  const cart = {};
  for (const item of orderItems) {
    const catalog = productMap[item.productId];
    const product = catalog ?? {
      id:         item.productId,
      name:       item.productName ?? 'Produto removido',
      sale_price: item.unitPrice ?? 0,
      sale_type:  item.weightKg != null ? 'kg' : 'unit',
      active:     false,
      _removed:   true,
    };
    const lineKey = item.id;
    cart[lineKey] = {
      product,
      qty:      item.quantity ?? 1,
      weightKg: item.weightKg != null ? String(item.weightKg) : '',
      notes:    item.notes ?? '',
    };
  }
  return cart;
};

const STATUS_LABEL = {
  pending:    '🟡 Pendente',
  confirmed:  '🔵 Confirmado',
  preparing:  '🟠 Preparando',
  ready:      '🟢 Pronto',
  delivering: '🚚 Entregando',
  delivered:  '✅ Entregue',
  cancelled:  '❌ Cancelado',
};

// ── Componente principal ──────────────────────────────────────
export default function EditOrderModal({ order, onClose, onSave, onOrderChanged }) {
  const isPaid = !!(order.paidAt);

  // Catálogo
  const [products,     setProducts]     = useState([]);
  const [loadingProds, setLoadingProds] = useState(true);
  const [search,       setSearch]       = useState('');
  const [activeCategory, setActiveCategory] = useState(null);

  // Carrinho: { [lineKey]: { product, qty, weightKg, notes } }
  const [cart, setCart] = useState({});

  // Pedido
  const [deliveryType,  setDeliveryType]  = useState(order.deliveryType ?? 'pickup');
  const [neighborhood,  setNeighborhood]  = useState(order.neighborhood ?? '');
  const [address,       setAddress]       = useState(order.customerAddress ?? '');
  const [deliveryFee,   setDeliveryFee]   = useState(String(order.deliveryFee ?? 0));
  const [payMethod,     setPayMethod]     = useState(order.paymentMethod ?? 'cash');

  // Ajuste — pré-populado do pedido existente
  const [adjType,   setAdjType]   = useState(order.adjustmentType ?? 'discount');
  const [adjValue,  setAdjValue]  = useState(
    order.adjustmentValue != null && order.adjustmentValue > 0
      ? String(order.adjustmentValue)
      : ''
  );
  const [adjReason, setAdjReason] = useState(order.adjustmentReason ?? '');
  const [orderNotes, setOrderNotes] = useState(order.notes ?? '');

  // Fiado
  const [fiadoClienteId, setFiadoClienteId] = useState('');
  const [fiadoClientes,  setFiadoClientes]  = useState([]);
  const [fiadoSearch,    setFiadoSearch]    = useState('');

  // Estado geral
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);
  const [saved,      setSaved]      = useState(false);

  const searchRef = useRef(null);

  // ── Carrega produtos ────────────────────────────────────────
  useEffect(() => {
    getProducts({ active: true, limit: 200 })
      .then(({ data }) => {
        const prods = data.data ?? [];
        setProducts(prods);
        setCart(buildInitialCart(order.items ?? [], prods));
      })
      .catch(() => setError('Erro ao carregar produtos.'))
      .finally(() => setLoadingProds(false));
  }, [order]);

  // ── Carrega clientes fiado ──────────────────────────────────
  useEffect(() => {
    if (payMethod !== 'fiado') return;
    listFiadoClientes({})
      .then(({ data }) => setFiadoClientes((data.data ?? []).filter((c) => !c.bloqueado)))
      .catch(() => setFiadoClientes([]));
  }, [payMethod]);

  // ── Atalhos de teclado ──────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveAll();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, deliveryType, neighborhood, address, deliveryFee, payMethod,
      adjType, adjValue, adjReason, orderNotes, fiadoClienteId]);

  // ── Catálogo: filtros ───────────────────────────────────────
  const categories = useMemo(() => groupByCategory(products), [products]);

  const filteredProducts = useMemo(() => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return products.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (activeCategory) {
      return categories.find((c) => c.name === activeCategory)?.items ?? [];
    }
    return products;
  }, [products, search, activeCategory, categories]);

  // ── Handlers do cart (usam lineKey, não product.id) ────────
  const handleAdd = useCallback((product) => {
    setCart((c) => {
      // Produto kg sempre cria nova linha
      if (product.sale_type === 'kg') {
        const lineKey = `new_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        return { ...c, [lineKey]: { product, qty: 1, weightKg: '', notes: '' } };
      }
      // Produto unitário: incrementa linha existente sem obs, caso contrário cria nova
      const existingKey = Object.keys(c).find(
        (k) => c[k].product.id === product.id && !c[k].notes
      );
      if (existingKey) {
        return { ...c, [existingKey]: { ...c[existingKey], qty: c[existingKey].qty + 1 } };
      }
      const lineKey = `new_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      return { ...c, [lineKey]: { product, qty: 1, weightKg: '', notes: '' } };
    });
  }, []);

  const handleQty = useCallback((lineKey, qty) => {
    if (qty <= 0) {
      setCart((c) => { const n = { ...c }; delete n[lineKey]; return n; });
    } else {
      setCart((c) => ({ ...c, [lineKey]: { ...c[lineKey], qty } }));
    }
  }, []);

  const handleWeight = useCallback((lineKey, w) =>
    setCart((c) => ({ ...c, [lineKey]: { ...c[lineKey], weightKg: w } })), []);

  const handleNotes = useCallback((lineKey, n) =>
    setCart((c) => ({ ...c, [lineKey]: { ...c[lineKey], notes: n } })), []);

  const handleRemove = useCallback((lineKey) =>
    setCart((c) => { const n = { ...c }; delete n[lineKey]; return n; }), []);

  // Duplica uma linha com qty=1 e obs em branco (para anotar obs diferente)
  const handleSplit = useCallback((lineKey) => {
    setCart((c) => {
      const entry = c[lineKey];
      if (!entry) return c;
      const newKey = `split_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      return { ...c, [newKey]: { ...entry, qty: 1, notes: '' } };
    });
  }, []);

  const cartEntries = Object.entries(cart); // [[lineKey, entry], ...]
  const hasRemovedProducts = cartEntries.some(([, e]) => e.product._removed);

  // Total com ajuste
  const subtotal = cartTotal(cart);
  const adj      = parseFloat(adjValue) || 0;
  const fee      = deliveryType === 'delivery' ? (parseFloat(deliveryFee) || 0) : 0;
  const total    = adjType === 'discount'
    ? Math.max(0, subtotal - adj) + fee
    : subtotal + adj + fee;

  // ── Salvar tudo de uma vez ──────────────────────────────────
  const handleSaveAll = async () => {
    if (isPaid) {
      setError('Este pedido já está pago. Não é possível editar.');
      return;
    }
    if (cartEntries.length === 0) { setError('Adicione pelo menos 1 item.'); return; }
    if (hasRemovedProducts) {
      setError('Remova os produtos indisponíveis (marcados em vermelho) antes de salvar.');
      return;
    }
    if (adj > 0 && !adjReason.trim()) {
      setError('Motivo é obrigatório para desconto ou acréscimo.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // 1. Itens
      const items = cartEntries.map(([, { product, qty, weightKg, notes }]) => ({
        productId: product.id,
        notes:     notes || null,
        ...(product.sale_type === 'kg'
          ? { weightKg: parseFloat(weightKg) }
          : { quantity: qty }),
      }));
      await editOrderItems(order.id, items, {
        deliveryType,
        deliveryFee: parseFloat(deliveryFee) || 0,
      });

      // 2. Forma de pagamento (se mudou e pedido não está pago)
      if (payMethod !== order.paymentMethod) {
        await markOrderPaidApi(order.id, payMethod);
        if (payMethod === 'fiado' && fiadoClienteId) {
          await createFiadoCompra({
            cliente_id: fiadoClienteId,
            order_id:   order.id,
            descricao:  `Pedido #${order.orderNumber}`,
            valor:      order.total,
          }).catch(() => {});
        }
      }

      // 3. Informações de entrega + ajuste + notes
      // Envia adjustmentValue sempre que há ajuste ativo ou quando havia antes (para zerar)
      const hadPreviousAdj = order.adjustmentValue != null && order.adjustmentValue > 0;
      const { data: updated } = await updateOrderInfo(order.id, {
        deliveryType,
        neighborhood:    neighborhood || null,
        customerAddress: address      || null,
        deliveryFee:     parseFloat(deliveryFee) || 0,
        notes:           orderNotes   || null,
        ...(adj > 0 || hadPreviousAdj ? {
          adjustmentType:   adjType,
          adjustmentValue:  adj,
          adjustmentReason: adj > 0 ? adjReason.trim() : null,
        } : {}),
      });

      onOrderChanged?.(updated);
      setSaved(true);
      setTimeout(() => onClose(), 600);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao salvar. Verifique os dados.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 overflow-hidden">

      {/* ── HEADER FIXO ──────────────────────────────────────── */}
      <header className="flex items-center gap-4 px-5 py-3 bg-gray-900 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <h1 className="text-lg font-black text-white shrink-0">
            ✏️ Editar Pedido <span className="text-orange-400">#{order.orderNumber}</span>
          </h1>
          <span className="hidden sm:inline text-[11px] px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 shrink-0">
            {STATUS_LABEL[order.status] ?? order.status}
          </span>
          {isPaid && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 shrink-0 font-bold">
              💳 PAGO
            </span>
          )}
          {order.customerName && (
            <span className="text-sm text-gray-400 truncate hidden md:inline">
              👤 {order.customerName}
              {order.customerPhone && <span className="text-gray-600 ml-1">· {order.customerPhone}</span>}
            </span>
          )}
          <span className="text-xs text-gray-600 shrink-0 hidden lg:inline">
            {order.deliveryType === 'delivery' ? '🛵 Entrega' : '🏪 Retirada'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-xs text-gray-500">
          <kbd className="hidden lg:inline px-1.5 py-0.5 rounded bg-gray-800 border border-white/10">ESC</kbd>
          <span className="hidden lg:inline">fecha</span>
          <kbd className="hidden lg:inline px-1.5 py-0.5 rounded bg-gray-800 border border-white/10">Ctrl+S</kbd>
          <span className="hidden lg:inline">salva</span>
        </div>
        <button onClick={onClose}
          className="p-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      {/* Aviso pedido pago */}
      {isPaid && (
        <div className="px-5 py-2 bg-yellow-500/10 border-b border-yellow-500/20 text-xs text-yellow-300 shrink-0">
          ⚠️ Este pedido já está pago — edição de itens e valores está bloqueada.
        </div>
      )}

      {/* ── BODY 3 COLUNAS ───────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 divide-x divide-white/[0.07]">

        {/* ══ COL 1 — CATÁLOGO (30%) ═══════════════════════════ */}
        <div className="flex flex-col w-[30%] min-h-0 bg-gray-900/50">

          {/* Busca */}
          <div className="p-3 shrink-0">
            <input
              ref={searchRef}
              type="text"
              placeholder="🔍 Buscar produto..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setActiveCategory(null); }}
              className="input w-full text-sm"
              autoFocus
              disabled={isPaid}
            />
          </div>

          {/* Chips de categoria */}
          {!search && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
              <button
                onClick={() => setActiveCategory(null)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                  !activeCategory
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}>
                Todos
              </button>
              {categories.map(({ name: cat, items }) => {
                const count = items.filter((p) =>
                  cartEntries.some(([, e]) => e.product.id === p.id)
                ).length;
                return (
                  <button key={cat}
                    onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all relative ${
                      activeCategory === cat
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}>
                    {cat ?? 'Sem categoria'}
                    {count > 0 && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-orange-500 text-white text-[8px] rounded-full flex items-center justify-center font-black">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Lista de produtos */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5 min-h-0">
            {loadingProds && (
              <div className="flex items-center justify-center h-32 text-gray-600 text-sm">
                Carregando produtos...
              </div>
            )}
            {!loadingProds && filteredProducts.length === 0 && (
              <div className="flex items-center justify-center h-32 text-gray-600 text-sm italic">
                Nenhum produto encontrado
              </div>
            )}
            {!loadingProds && filteredProducts.map((p) => {
              const inCartQty = cartEntries
                .filter(([, e]) => e.product.id === p.id)
                .reduce((s, [, e]) => s + (e.qty || 0), 0);
              return (
                <button key={p.id} onClick={() => !isPaid && handleAdd(p)}
                  disabled={isPaid}
                  className={[
                    'w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between gap-2',
                    'transition-all duration-100',
                    isPaid ? 'opacity-50 cursor-not-allowed' : '',
                    inCartQty > 0
                      ? 'bg-blue-500/15 ring-1 ring-blue-500/40 hover:bg-blue-500/20'
                      : 'bg-gray-800/50 hover:bg-gray-700/70',
                  ].join(' ')}>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold truncate leading-tight ${inCartQty > 0 ? 'text-white' : 'text-gray-200'}`}>
                      {p.name}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {fmt(p.sale_price)}{p.sale_type === 'kg' ? '/kg' : '/un'}
                    </p>
                  </div>
                  {inCartQty > 0 ? (
                    <span className="shrink-0 text-[11px] font-black text-blue-300 bg-blue-500/20 px-2 py-0.5 rounded-full tabular-nums">
                      {inCartQty}×
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
                      + add
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ══ COL 2 — ITENS DO PEDIDO (40%) ════════════════════ */}
        <div className="flex flex-col w-[40%] min-h-0 bg-gray-900/30">

          {/* Header da coluna */}
          <div className="px-4 py-3 border-b border-white/[0.07] shrink-0 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-gray-200">🛒 Itens do Pedido</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {cartEntries.length === 0
                  ? 'Nenhum item — adicione pelo catálogo'
                  : `${cartEntries.length} ${cartEntries.length === 1 ? 'item' : 'itens'}`}
              </p>
            </div>
            {cartEntries.length > 0 && !isPaid && (
              <span className="text-xs text-gray-500">
                ✂️ Separar = duplica linha com obs diferente
              </span>
            )}
          </div>

          {/* Lista de itens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {cartEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-600">
                <span className="text-5xl opacity-30">🛒</span>
                <p className="text-sm italic">Selecione produtos no catálogo</p>
              </div>
            ) : (
              cartEntries.map(([lineKey, { product: p, qty, weightKg, notes }]) => (
                <div key={lineKey}
                  className={[
                    'rounded-2xl p-3.5 space-y-2.5 border transition-colors',
                    p._removed
                      ? 'bg-red-900/20 border-red-500/40'
                      : 'bg-gray-800/60 border-white/[0.06] hover:border-white/[0.12]',
                  ].join(' ')}>

                  {/* Nome + botões */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold leading-snug truncate ${p._removed ? 'text-red-300' : 'text-white'}`}>
                        {p._removed && <span className="text-[10px] mr-1 text-red-400 font-normal">[indisponível]</span>}
                        {p.name}
                      </p>
                      <p className="text-[11px] text-gray-500">{fmt(p.sale_price)}{p.sale_type === 'kg' ? '/kg' : '/un'}</p>
                    </div>
                    {!isPaid && (
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Separar: duplica linha com obs vazia */}
                        {!p._removed && p.sale_type !== 'kg' && (
                          <button
                            onClick={() => handleSplit(lineKey)}
                            title="Separar — criar linha igual para obs diferente"
                            className="p-1 rounded-lg text-gray-600 hover:text-blue-400 hover:bg-blue-400/10 transition-colors text-[11px] font-bold">
                            ✂️
                          </button>
                        )}
                        <button onClick={() => handleRemove(lineKey)}
                          className="p-1 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Qty / Peso */}
                  <div className="flex items-center justify-between gap-2">
                    {p.sale_type === 'kg' ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="0.001" step="0.001"
                          value={weightKg}
                          onChange={(e) => handleWeight(lineKey, e.target.value)}
                          className="input w-20 text-sm py-1.5 text-center"
                          placeholder="0.000"
                          disabled={isPaid}
                        />
                        <span className="text-xs text-gray-500">kg</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => !isPaid && handleQty(lineKey, qty - 1)}
                          disabled={isPaid}
                          className="w-8 h-8 rounded-xl bg-gray-700 hover:bg-red-500/30 hover:text-red-300 text-white font-black flex items-center justify-center text-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                          −
                        </button>
                        <span className="w-8 text-center text-base font-black text-white tabular-nums">{qty}</span>
                        <button
                          onClick={() => !isPaid && handleQty(lineKey, qty + 1)}
                          disabled={isPaid}
                          className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black flex items-center justify-center text-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                          +
                        </button>
                      </div>
                    )}
                    <span className="text-base font-black text-green-400 tabular-nums">
                      {p.sale_type === 'kg' && weightKg
                        ? fmt(parseFloat(p.sale_price) * parseFloat(weightKg))
                        : fmt(parseFloat(p.sale_price) * qty)}
                    </span>
                  </div>

                  {/* Observação do item */}
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => handleNotes(lineKey, e.target.value)}
                    placeholder="Obs: sem cebola, bem passado..."
                    disabled={isPaid}
                    className="w-full bg-gray-900/60 border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-orange-500/40 transition-colors disabled:opacity-50"
                  />
                </div>
              ))
            )}
          </div>

          {/* Obs do pedido */}
          <div className="px-4 pb-3 shrink-0">
            <textarea
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="Observação do pedido (opcional)..."
              rows={2}
              className="w-full bg-gray-800/60 border border-white/[0.07] rounded-xl px-3 py-2 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500/30 resize-none transition-colors"
            />
          </div>
        </div>

        {/* ══ COL 3 — RESUMO + CONFIGURAÇÃO (30%) ═════════════ */}
        <div className="flex flex-col w-[30%] min-h-0 bg-gray-900/50 overflow-y-auto">
          <div className="p-4 space-y-4">

            {/* ── Total ──────────────────────────────────────── */}
            <div className="bg-gray-800/80 rounded-2xl p-4 border border-white/[0.07] space-y-2">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Resumo</h3>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm text-gray-300">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{fmt(subtotal)}</span>
                </div>
                {deliveryType === 'delivery' && fee > 0 && (
                  <div className="flex justify-between text-sm text-gray-300">
                    <span>Taxa entrega</span>
                    <span className="tabular-nums text-yellow-400">{fmt(fee)}</span>
                  </div>
                )}
                {adj > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className={adjType === 'discount' ? 'text-green-400' : 'text-red-400'}>
                      {adjType === 'discount' ? '🔻 Desconto' : '🔺 Acréscimo'}
                      {adjReason && <span className="text-gray-500 ml-1 text-[11px]">({adjReason})</span>}
                    </span>
                    <span className={`tabular-nums ${adjType === 'discount' ? 'text-green-400' : 'text-red-400'}`}>
                      {adjType === 'discount' ? '−' : '+'}{fmt(adj)}
                    </span>
                  </div>
                )}
                <div className="border-t border-white/10 pt-2 flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-200">TOTAL</span>
                  <span className="text-2xl font-black text-green-400 tabular-nums">{fmt(total)}</span>
                </div>
              </div>
            </div>

            {/* ── Tipo de entrega ────────────────────────────── */}
            <div>
              <label className="text-xs text-gray-400 font-bold mb-2 block uppercase tracking-wide">Tipo</label>
              <div className="grid grid-cols-2 gap-2">
                {[{ v: 'pickup', label: '🏪 Retirada' }, { v: 'delivery', label: '🛵 Entrega' }].map(({ v, label }) => (
                  <button key={v} onClick={() => setDeliveryType(v)}
                    className={`py-2 rounded-xl text-sm font-bold transition-all ${
                      deliveryType === v
                        ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/50'
                        : 'bg-gray-800/60 text-gray-500 hover:bg-gray-700/60'
                    }`}>{label}</button>
                ))}
              </div>
            </div>

            {/* Campos de entrega */}
            {deliveryType === 'delivery' && (
              <div className="space-y-2">
                <select value={neighborhood}
                  onChange={(e) => {
                    const b = e.target.value;
                    setNeighborhood(b);
                    const f = NEIGHBORHOODS.find((n) => n.bairro === b);
                    if (f) setDeliveryFee(String(f.taxa));
                  }}
                  className="input w-full text-sm">
                  <option value="">— Bairro —</option>
                  {NEIGHBORHOODS.map(({ bairro, taxa }) => (
                    <option key={bairro} value={bairro}>{bairro} — R$ {taxa.toFixed(2)}</option>
                  ))}
                  <option value="outro">Outro</option>
                </select>
                <input type="text" placeholder="Endereço completo..."
                  value={address} onChange={(e) => setAddress(e.target.value)}
                  className="input w-full text-sm" />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 shrink-0">Taxa (R$)</label>
                  <input type="number" min="0" step="0.5" value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)}
                    className="input flex-1 text-sm text-right" />
                </div>
              </div>
            )}

            {/* ── Pagamento ──────────────────────────────────── */}
            <div>
              <label className="text-xs text-gray-400 font-bold mb-2 block uppercase tracking-wide">Pagamento</label>
              <div className="grid grid-cols-2 gap-1.5">
                {PAY_OPTIONS.map(({ value, label }) => (
                  <button key={value} onClick={() => setPayMethod(value)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all ${
                      payMethod === value
                        ? value === 'fiado'
                          ? 'bg-purple-500/25 text-purple-300 ring-1 ring-purple-500/50'
                          : 'bg-green-500/20 text-green-300 ring-1 ring-green-500/40'
                        : 'bg-gray-800/60 text-gray-500 hover:bg-gray-700/60'
                    }`}>{label}</button>
                ))}
              </div>
              {payMethod === 'fiado' && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[11px] text-purple-400 font-bold">Cliente do fiado:</p>
                  <input type="text" placeholder="Buscar cliente..." value={fiadoSearch}
                    onChange={(e) => setFiadoSearch(e.target.value)}
                    className="w-full bg-gray-800 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50" />
                  <div className="max-h-28 overflow-y-auto rounded-xl border border-white/[0.06] bg-gray-800/60 divide-y divide-white/[0.04]">
                    {fiadoClientes
                      .filter((c) => !fiadoSearch || c.name.toLowerCase().includes(fiadoSearch.toLowerCase()))
                      .map((c) => (
                        <button key={c.id} onClick={() => setFiadoClienteId(c.id)}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                            fiadoClienteId === c.id ? 'bg-purple-500/20 text-purple-300' : 'text-gray-300 hover:bg-gray-700'
                          }`}>
                          {c.name}
                          {parseFloat(c.total_aberto) > 0 && (
                            <span className="ml-2 text-yellow-400 text-[10px]">Deve R${parseFloat(c.total_aberto).toFixed(2)}</span>
                          )}
                        </button>
                      ))}
                    {fiadoClientes.length === 0 && (
                      <p className="text-xs text-gray-600 italic px-3 py-2">Nenhum cliente.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Ajuste de valor ────────────────────────────── */}
            {!isPaid && (
              <div className="bg-gray-800/40 rounded-2xl p-3.5 space-y-2.5 border border-white/[0.05]">
                <label className="text-xs text-gray-400 font-bold block uppercase tracking-wide">Ajuste de valor</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ v: 'discount', l: '🔻 Desconto' }, { v: 'surcharge', l: '🔺 Acréscimo' }].map(({ v, l }) => (
                    <button key={v} onClick={() => setAdjType(v)}
                      className={`py-1.5 rounded-xl text-xs font-bold transition-all ${
                        adjType === v
                          ? v === 'discount'
                            ? 'bg-green-500/20 text-green-300 ring-1 ring-green-500/30'
                            : 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30'
                          : 'bg-gray-700/60 text-gray-500 hover:bg-gray-700'
                      }`}>{l}</button>
                  ))}
                </div>
                <input type="number" min="0" step="0.01" placeholder="Valor R$"
                  value={adjValue} onChange={(e) => setAdjValue(e.target.value)}
                  className="input w-full text-sm" />
                {adj > 0 && (
                  <div className="space-y-1">
                    <input type="text" placeholder="Motivo obrigatório (cortesia, frete errado...)"
                      value={adjReason} onChange={(e) => setAdjReason(e.target.value)}
                      className={`input w-full text-sm ${!adjReason.trim() ? 'border-orange-500/40 focus:border-orange-500/70' : ''}`} />
                    {!adjReason.trim() && (
                      <p className="text-[10px] text-orange-400">⚠️ Motivo obrigatório para salvar</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Info do cliente ────────────────────────────── */}
            {(order.customerName || order.customerPhone || order.customerAddress) && (
              <div className="bg-gray-800/30 rounded-2xl p-3.5 border border-white/[0.05] space-y-1.5">
                <label className="text-xs text-gray-400 font-bold uppercase tracking-wide">Cliente</label>
                {order.customerName  && <p className="text-sm text-gray-200">👤 {order.customerName}</p>}
                {order.customerPhone && <p className="text-xs text-gray-400">📞 {order.customerPhone}</p>}
                {order.customerAddress && <p className="text-xs text-gray-400">📍 {order.customerAddress}</p>}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── FOOTER FIXO ──────────────────────────────────────── */}
      <footer className="flex items-center justify-between gap-3 px-5 py-3.5 bg-gray-900 border-t border-white/10 shrink-0">
        <div className="flex-1 min-w-0">
          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 rounded-xl px-3 py-2 truncate">
              ⚠️ {error}
            </p>
          )}
          {saved && (
            <p className="text-sm text-green-400 bg-green-400/10 rounded-xl px-3 py-2">
              ✅ Salvo com sucesso!
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSaveAll}
            disabled={submitting || cartEntries.length === 0 || isPaid}
            className="px-6 py-2.5 rounded-xl text-sm font-black text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed
              bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 shadow-lg shadow-green-900/30">
            {isPaid
              ? '🔒 Pedido Pago'
              : submitting
                ? '⏳ Salvando...'
                : saved
                  ? '✅ Salvo!'
                  : `✓ Salvar Alterações · ${fmt(total)}`}
          </button>
        </div>
      </footer>
    </div>
  );
}
