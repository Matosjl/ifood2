/**
 * NewOrderModal — wizard 4 passos com animações Framer Motion
 * Passo 1: Cliente   Passo 2: Itens   Passo 3: Entrega/Pag.   Passo 4: Revisão
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getProducts, createOrder, searchCustomers } from '../api/orders';
import { getCurrentCaixa } from '../api/caixa';
import { listFiadoClientes, createFiadoCompra } from '../api/fiado';
import { Map, MapMarker, MarkerContent, MapControls } from './ui/map';

// Reverse-geocode [lng, lat] → { road, suburb } via Nominatim
async function reverseGeocode(lng, lat) {
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    );
    const data = await res.json();
    return {
      road:   data.address?.road ?? data.address?.pedestrian ?? data.address?.path ?? '',
      suburb: data.address?.suburb ?? data.address?.neighbourhood ?? data.address?.quarter ?? '',
    };
  } catch { return { road: '', suburb: '' }; }
}

// ── Map address picker (overlay dentro do modal) ──────────────

const CITY_CENTER = [-49.7198, -29.3612]; // Itapeva, Torres RS

function MapAddressPicker({ initialStreet, onConfirm, onClose }) {
  const [markerPos, setMarkerPos] = useState(CITY_CENTER);
  const [loading,   setLoading]   = useState(false);
  const [preview,   setPreview]   = useState(initialStreet || '');
  const mapRef = useRef(null);

  const handleDragEnd = useCallback(async (lngLat) => {
    setMarkerPos([lngLat.lng, lngLat.lat]);
    setLoading(true);
    const { road } = await reverseGeocode(lngLat.lng, lngLat.lat);
    setPreview(road);
    setLoading(false);
  }, []);

  const handleConfirm = async () => {
    setLoading(true);
    const { road } = await reverseGeocode(markerPos[0], markerPos[1]);
    onConfirm({ street: road || preview, coords: markerPos });
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-gray-950 rounded-2xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-white/10 shrink-0">
        <div>
          <p className="text-sm font-black text-white">📍 Escolher localização</p>
          <p className="text-xs text-gray-400">Arraste o alfinete até o endereço do cliente</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10">✕</button>
      </div>

      {/* Map */}
      <div className="flex-1 relative min-h-0">
        <Map ref={mapRef} center={CITY_CENTER} zoom={14} theme="dark" className="h-full w-full">
          <MapControls position="top-right" showZoom showLocate
            onLocate={({ longitude, latitude }) => setMarkerPos([longitude, latitude])} />
          <MapMarker longitude={markerPos[0]} latitude={markerPos[1]} draggable
            onDragEnd={(e) => handleDragEnd(e.target.getLngLat())}>
            <MarkerContent>
              <div className="flex flex-col items-center -mt-8">
                <div className="bg-orange-500 text-white rounded-full px-2 py-1 text-xs font-black shadow-lg shadow-orange-500/40">
                  📍
                </div>
                <div className="w-0.5 h-3 bg-orange-500" />
              </div>
            </MarkerContent>
          </MapMarker>
        </Map>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-900 border-t border-white/10 shrink-0 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 mb-0.5">Rua identificada:</p>
          <p className="text-sm font-semibold text-white truncate">
            {loading ? <span className="animate-pulse text-gray-500">Identificando...</span> : (preview || '— arraste o alfinete —')}
          </p>
        </div>
        <button onClick={handleConfirm} disabled={loading}
          className="shrink-0 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm transition-colors disabled:opacity-50">
          Confirmar
        </button>
      </div>
    </div>
  );
}

const fmt = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2)}`;

// ── Cart helpers ──────────────────────────────────────────────

const emptyCart = () => ({});

const addToCart = (cart, product) => {
  const prev = cart[product.id];
  if (prev) return { ...cart, [product.id]: { ...prev, qty: prev.qty + 1 } };
  return { ...cart, [product.id]: { product, qty: 1, weightKg: '' } };
};

const removeFromCart = (cart, id) => { const n = { ...cart }; delete n[id]; return n; };

const cartTotal = (cart) =>
  Object.values(cart).reduce((sum, { product, qty, weightKg }) => {
    const amount = product.sale_type === 'kg'
      ? parseFloat(product.sale_price) * parseFloat(weightKg || 0)
      : parseFloat(product.sale_price) * (qty || 0);
    return sum + amount;
  }, 0);

// ── Animation variants ────────────────────────────────────────

const stepVariants = {
  enter: (dir) => ({ opacity: 0, x: dir > 0 ? 30 : -30 }),
  center: { opacity: 1, x: 0 },
  exit:  (dir) => ({ opacity: 0, x: dir > 0 ? -30 : 30 }),
};

const STEPS = [
  { id: 'customer', label: 'Cliente',    icon: '👤' },
  { id: 'items',    label: 'Itens',      icon: '🛒' },
  { id: 'payment',  label: 'Pagamento',  icon: '💳' },
  { id: 'review',   label: 'Revisão',    icon: '✅' },
];

// ── Bairros e taxas de entrega ────────────────────────────────

const NEIGHBORHOODS = [
  { bairro: 'Itapeva',              taxa: 6  },
  { bairro: 'Itapeva Norte',        taxa: 6  },
  { bairro: 'Tupinambá',            taxa: 8  },
  { bairro: 'Praia Gaúcha',         taxa: 8  },
  { bairro: 'Praia Yara',           taxa: 8  },
  { bairro: 'Praia Recreio',        taxa: 10 },
  { bairro: 'Praia Santa Helena',   taxa: 10 },
  { bairro: 'Praia Estrela',        taxa: 10 },
  { bairro: 'Praia Real',           taxa: 10 },
  { bairro: 'Praia Paraíso',        taxa: 15 },
  { bairro: 'São Brás',             taxa: 15 },
  { bairro: 'Campo Bonito',         taxa: 17 },
  { bairro: 'Torres',               taxa: 20 },
];

const PAY_OPTIONS = [
  { value: 'cash',    label: '💵 Dinheiro', color: 'green' },
  { value: 'pix',     label: '📱 Pix',     color: 'blue'  },
  { value: 'credit',  label: '💳 Crédito', color: 'purple' },
  { value: 'debit',   label: '💳 Débito',  color: 'indigo' },
  { value: 'voucher', label: '🎫 Vale',    color: 'yellow' },
  { value: 'fiado',   label: '🤝 Fiado',   color: 'purple' },
  { value: 'other',   label: '🔖 Outro',   color: 'gray'  },
  { value: 'pending', label: '⏳ A cobrar',color: 'orange' },
];

// ── Category accordion ────────────────────────────────────────

function CategoryAccordion({ name, items, cart, onAdd, onQty, onWeight }) {
  const [open, setOpen] = useState(false);
  const inCart = items.filter((p) => cart[p.id]).length;

  return (
    <div className="border border-white/[0.07] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-800/70 hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg className={`w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-semibold text-gray-200 truncate">{name ?? 'Sem categoria'}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {inCart > 0 && (
            <span className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full font-semibold">{inCart}</span>
          )}
          <span className="text-xs text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden divide-y divide-white/[0.04]"
          >
            {items.map((p) => {
              const inC = cart[p.id];
              return (
                <li key={p.id} className="px-3 py-2 bg-gray-900/40 hover:bg-gray-800/40 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${inC ? 'text-white' : 'text-gray-300'}`}>{p.name}</p>
                      <p className="text-xs text-gray-500">
                        {fmt(p.sale_price)}/{p.sale_type === 'kg' ? 'kg' : 'un'}
                        {p.stock_qty <= 0 && <span className="text-red-400 ml-1">· Sem estoque</span>}
                      </p>
                    </div>
                    {p.stock_qty <= 0 ? (
                      <span className="text-xs text-red-400/60 italic shrink-0">Esgotado</span>
                    ) : p.sale_type === 'kg' ? (
                      <input type="number" min="0.1" step="0.1" placeholder="kg"
                        value={inC?.weightKg ?? ''}
                        onChange={(e) => { if (!inC) onAdd(p); onWeight(p.id, e.target.value); }}
                        className="input w-16 text-xs py-1 text-center" />
                    ) : inC ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => inC.qty <= 1 ? onQty(p.id, 0) : onQty(p.id, inC.qty - 1)}
                          className="w-6 h-6 rounded-md bg-gray-700 hover:bg-gray-600 text-white font-bold text-sm flex items-center justify-center">−</button>
                        <span className="w-6 text-center text-sm font-bold text-white tabular-nums">{inC.qty}</span>
                        <button onClick={() => onQty(p.id, inC.qty + 1)}
                          className="w-6 h-6 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center justify-center">+</button>
                      </div>
                    ) : (
                      <button onClick={() => onAdd(p)}
                        className="text-xs font-bold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1 rounded-lg transition-colors shrink-0">
                        + Add
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Steps ─────────────────────────────────────────────────────

function StepCustomer({ name, setName, phone, setPhone, fetchSuggestions, showSug, suggestions, applySuggestion }) {
  return (
    <div className="space-y-4 max-w-md mx-auto">
      <p className="text-sm text-gray-400">Informe os dados do cliente para identificar o pedido.</p>

      {/* Name */}
      <div className="relative">
        <label className="text-xs text-gray-400 font-semibold mb-1 block">Nome *</label>
        <input
          type="text" placeholder="Nome do cliente" value={name} autoFocus
          onChange={(e) => { setName(e.target.value); fetchSuggestions(e.target.value); }}
          onBlur={() => setTimeout(() => {}, 150)}
          onFocus={() => {}}
          className="input w-full"
        />
        <AnimatePresence>
          {showSug && suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden"
            >
              {suggestions.map((s, i) => (
                <button key={i} onMouseDown={() => applySuggestion(s)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors">
                  <p className="text-sm text-gray-200 font-medium">{s.customer_name}</p>
                  {s.customer_phone && <p className="text-xs text-gray-500">{s.customer_phone}</p>}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Phone */}
      <div>
        <label className="text-xs text-gray-400 font-semibold mb-1 block">Telefone <span className="text-gray-600 font-normal">(opcional)</span></label>
        <input type="tel" placeholder="(11) 99999-9999" value={phone}
          onChange={(e) => { setPhone(e.target.value); fetchSuggestions(e.target.value); }}
          className="input w-full" />
      </div>
    </div>
  );
}

function StepItems({ products, loading, search, setSearch, cart, onAdd, onQty, onWeight, onRemove }) {
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

  const cartEntries = Object.values(cart);
  const total = cartTotal(cart);

  return (
    <div className="flex gap-4 h-full min-h-[320px]">
      {/* Catalog */}
      <div className="flex flex-col flex-1 min-w-0">
        <input type="text" placeholder="Buscar produto..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input w-full mb-3 shrink-0" autoFocus />

        <div className="col-scroll flex-1 space-y-1.5">
          {loading && <p className="text-gray-500 text-sm text-center py-8">Carregando...</p>}
          {searchResults ? (
            searchResults.length === 0
              ? <p className="text-gray-500 text-sm text-center py-8">Nenhum produto encontrado</p>
              : searchResults.map((p) => {
                const inCart = cart[p.id];
                return (
                  <button key={p.id} onClick={() => p.stock_qty > 0 && onAdd(p)} disabled={p.stock_qty <= 0}
                    className={['w-full text-left px-3 py-2 rounded-lg flex items-center justify-between gap-2 transition-colors',
                      p.stock_qty <= 0 ? 'opacity-40 cursor-not-allowed bg-gray-800/40' : 'bg-gray-800/60 hover:bg-gray-700/80',
                      inCart ? 'ring-1 ring-blue-500/60' : ''].join(' ')}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-200 truncate">{p.name}</p>
                      <p className="text-xs text-gray-500">{fmt(p.sale_price)}/{p.sale_type === 'kg' ? 'kg' : 'un'}</p>
                    </div>
                    {inCart && <span className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full shrink-0">{inCart.qty}×</span>}
                  </button>
                );
              })
          ) : (
            !loading && categories.map(({ name: catName, items }) => (
              <CategoryAccordion key={catName} name={catName} items={items} cart={cart}
                onAdd={onAdd} onQty={onQty} onWeight={onWeight} />
            ))
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="w-52 flex flex-col shrink-0 border-l border-white/10 pl-4">
        <p className="text-xs font-semibold text-gray-400 mb-2 shrink-0">Carrinho ({cartEntries.length})</p>
        <div className="col-scroll flex-1 space-y-2">
          {cartEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-600">
              <span className="text-3xl">🛒</span>
              <p className="text-xs italic text-center">Adicione itens ao pedido</p>
            </div>
          ) : cartEntries.map(({ product: p, qty, weightKg }) => (
            <div key={p.id} className="bg-gray-800/60 rounded-xl p-2 space-y-1">
              <div className="flex items-start justify-between gap-1">
                <p className="text-xs font-semibold text-gray-200 leading-tight flex-1 min-w-0 truncate">{p.name}</p>
                <button onClick={() => onRemove(p.id)} className="text-gray-600 hover:text-red-400 shrink-0 transition-colors">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {p.sale_type === 'kg' ? (
                <div className="flex items-center gap-1.5">
                  <input type="number" min="0.1" step="0.1" value={weightKg}
                    onChange={(e) => onWeight(p.id, e.target.value)}
                    className="input w-14 text-xs py-0.5" placeholder="kg" />
                  {weightKg && <span className="text-xs text-green-400">{fmt(parseFloat(p.sale_price) * parseFloat(weightKg))}</span>}
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button onClick={() => onQty(p.id, qty - 1)} className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold flex items-center justify-center">−</button>
                    <span className="w-5 text-center text-xs font-bold text-white">{qty}</span>
                    <button onClick={() => onQty(p.id, qty + 1)} className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold flex items-center justify-center">+</button>
                  </div>
                  <span className="text-xs text-green-400 font-semibold">{fmt(parseFloat(p.sale_price) * qty)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
        {cartEntries.length > 0 && (
          <div className="pt-2 border-t border-white/10 shrink-0">
            <p className="text-base font-black text-white">{fmt(total)}</p>
            <p className="text-[10px] text-gray-500">{cartEntries.length} item{cartEntries.length !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>
    </div>
  );
}

const MAX_SPLITS = 3;
const PAY_OPTIONS_SPLIT = PAY_OPTIONS.filter((p) => !['fiado','pending'].includes(p.value));

function StepPayment({
  channel, setChannel,
  deliveryType, setDeliveryType,
  neighborhood, setNeighborhood,
  street, setStreet,
  streetNumber, setStreetNumber,
  complement, setComplement,
  deliveryFee, setDeliveryFee,
  paymentMethod, setPaymentMethod,
  splitMode, setSplitMode,
  splitPayments, setSplitPayments,
  needsChange, setNeedsChange,
  changeFor, setChangeFor,
  notes, setNotes,
  scheduledFor, setScheduledFor,
  fiadoClientes, fiadoClienteId, setFiadoClienteId,
  fiadoClienteSearch, setFiadoClienteSearch,
  showMapPicker, setShowMapPicker,
  orderTotal,
}) {
  const splitTotal    = splitPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const splitRemain   = Math.max(0, (parseFloat(orderTotal) || 0) - splitTotal);
  const splitOk       = Math.abs(splitRemain) < 0.01;

  const addSplit = () => {
    if (splitPayments.length >= MAX_SPLITS) return;
    setSplitPayments((p) => [...p, { method: 'cash', amount: '' }]);
  };
  const removeSplit = (i) => setSplitPayments((p) => p.filter((_, idx) => idx !== i));
  const updateSplit = (i, key, val) =>
    setSplitPayments((p) => p.map((s, idx) => idx === i ? { ...s, [key]: val } : s));

  return (
    <div className="space-y-4 max-w-md">

      {/* Canal */}
      <div>
        <label className="text-xs text-gray-400 font-semibold mb-1 block">Canal do pedido</label>
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="input w-full text-sm">
          <option value="manual">Balcão / Manual</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="ifood">iFood</option>
          <option value="mesa">Mesa</option>
          <option value="telefone">Telefone</option>
        </select>
      </div>

      {/* Agendamento */}
      <div>
        <label className="text-xs text-gray-400 font-semibold mb-1 block">
          🕐 Agendamento <span className="text-gray-600 font-normal">(opcional)</span>
        </label>
        <input type="text" placeholder="Ex: 20:30, amanhã 12:00..." value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)} className="input w-full text-sm" />
      </div>

      {/* Tipo entrega */}
      <div>
        <label className="text-xs text-gray-400 font-semibold mb-1.5 block">Tipo de pedido</label>
        <div className="flex gap-2">
          {[
            { v: 'pickup',   label: '🏪 Retirada', color: 'orange' },
            { v: 'delivery', label: '🛵 Entrega',  color: 'blue'   },
          ].map(({ v, label, color }) => (
            <button key={v} type="button" onClick={() => setDeliveryType(v)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                deliveryType === v
                  ? color === 'orange'
                    ? 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40 scale-[1.02]'
                    : 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/40 scale-[1.02]'
                  : 'bg-gray-800/60 text-gray-400 hover:bg-gray-700/60'
              }`}>
              {label}
            </button>
          ))}
        </div>

        <AnimatePresence>
          {deliveryType === 'delivery' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="mt-2 space-y-2 overflow-hidden">

              {/* Bairro */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Bairro *</label>
                <select value={neighborhood}
                  onChange={(e) => {
                    const b = e.target.value;
                    setNeighborhood(b);
                    const found = NEIGHBORHOODS.find((n) => n.bairro === b);
                    setDeliveryFee(found ? String(found.taxa) : '');
                  }}
                  className="input w-full text-sm">
                  <option value="">— Selecione o bairro —</option>
                  {NEIGHBORHOODS.map(({ bairro, taxa }) => (
                    <option key={bairro} value={bairro}>{bairro} — R$ {taxa.toFixed(2)}</option>
                  ))}
                  <option value="outro">Outro (taxa manual)</option>
                </select>
              </div>

              {/* Rua */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Rua</label>
                <div className="flex gap-1.5">
                  <input type="text" placeholder="Nome da rua..." value={street}
                    onChange={(e) => setStreet(e.target.value)} className="input flex-1 text-sm" />
                  <button type="button" onClick={() => setShowMapPicker(true)}
                    title="Escolher no mapa"
                    className="px-3 py-2 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 text-sm font-bold transition-colors border border-orange-500/20 shrink-0">
                    🗺️
                  </button>
                </div>
              </div>

              {/* Número + Complemento */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 mb-1 block">Número</label>
                  <input type="text" placeholder="123" value={streetNumber}
                    onChange={(e) => setStreetNumber(e.target.value)} className="input w-full text-sm" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-400 mb-1 block">Complemento</label>
                  <input type="text" placeholder="Apto, casa..." value={complement}
                    onChange={(e) => setComplement(e.target.value)} className="input w-full text-sm" />
                </div>
              </div>

              {/* Taxa */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400 whitespace-nowrap shrink-0">Taxa de entrega (R$)</label>
                <input type="number" min="0" step="0.50" placeholder="0,00" value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)} className="input flex-1 text-sm text-right" />
              </div>

              {neighborhood && neighborhood !== 'outro' && parseFloat(deliveryFee) > 0 && (
                <p className="text-xs text-blue-400 bg-blue-500/10 rounded-lg px-2.5 py-1.5">
                  🛵 Taxa para <b>{neighborhood}</b>: R$ {parseFloat(deliveryFee).toFixed(2)}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Pagamento */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-gray-400 font-semibold">Forma de pagamento</label>
          <button type="button" onClick={() => { setSplitMode((v) => !v); setSplitPayments([{ method: 'cash', amount: '' }]); }}
            className={`text-xs px-2 py-0.5 rounded-lg font-semibold transition-colors ${
              splitMode ? 'bg-purple-500/20 text-purple-300' : 'bg-gray-700/60 text-gray-400 hover:text-gray-200'
            }`}>
            {splitMode ? '✕ Cancelar divisão' : '⊕ Dividir pagamento'}
          </button>
        </div>

        {/* Modo simples */}
        {!splitMode && (
          <>
            <div className="grid grid-cols-4 gap-1.5">
              {PAY_OPTIONS.map(({ value, label }) => (
                <button key={value} type="button"
                  onClick={() => { setPaymentMethod(value); setFiadoClienteId(''); setFiadoClienteSearch(''); }}
                  className={`py-2 px-1 rounded-lg text-xs font-semibold transition-all ${
                    paymentMethod === value
                      ? value === 'fiado'   ? 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/40 scale-[1.03]'
                      : value === 'pending' ? 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40 scale-[1.03]'
                      :                      'bg-green-500/20 text-green-300 ring-1 ring-green-500/40 scale-[1.03]'
                      : 'bg-gray-800/60 text-gray-400 hover:bg-gray-700/60'
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            <AnimatePresence>
              {paymentMethod === 'fiado' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="mt-2 space-y-1.5 overflow-hidden">
                  <input type="text" placeholder="Buscar cliente do fiado..."
                    value={fiadoClienteSearch}
                    onChange={(e) => { setFiadoClienteSearch(e.target.value); setFiadoClienteId(''); }}
                    className="input w-full text-sm" />
                  {fiadoClientes.length > 0 && (
                    <div className="max-h-28 overflow-y-auto rounded-xl border border-white/10 bg-gray-800 divide-y divide-white/[0.04]">
                      {fiadoClientes.filter((c) => !c.bloqueado).map((c) => (
                        <button key={c.id} type="button"
                          onClick={() => { setFiadoClienteId(c.id); setFiadoClienteSearch(c.name); }}
                          className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                            fiadoClienteId === c.id ? 'bg-purple-500/20 text-purple-300' : 'text-gray-300 hover:bg-gray-700'
                          }`}>
                          <span className="font-semibold">{c.name}</span>
                          {parseFloat(c.total_aberto) > 0 && (
                            <span className="ml-2 text-yellow-400">Deve {fmt(c.total_aberto)}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {paymentMethod === 'cash' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="mt-2 space-y-1.5 overflow-hidden">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={needsChange} onChange={(e) => setNeedsChange(e.target.checked)}
                      className="w-4 h-4 rounded accent-orange-500" />
                    <span className="text-xs text-gray-400">Precisa de troco?</span>
                  </label>
                  {needsChange && (
                    <input type="number" min="0" step="0.01" placeholder="Troco para R$..."
                      value={changeFor} onChange={(e) => setChangeFor(e.target.value)}
                      className="input w-full text-sm" />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* Modo dividido */}
        {splitMode && (
          <div className="space-y-2 bg-purple-500/5 border border-purple-500/20 rounded-xl p-3">
            {splitPayments.map((sp, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select value={sp.method} onChange={(e) => updateSplit(i, 'method', e.target.value)}
                  className="input flex-1 text-xs">
                  {PAY_OPTIONS_SPLIT.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <input type="number" min="0" step="0.01" placeholder="R$ 0,00"
                  value={sp.amount} onChange={(e) => updateSplit(i, 'amount', e.target.value)}
                  className="input w-24 text-sm text-right" />
                {splitPayments.length > 1 && (
                  <button type="button" onClick={() => removeSplit(i)}
                    className="text-gray-500 hover:text-red-400 transition-colors text-lg leading-none">×</button>
                )}
              </div>
            ))}

            <div className="flex items-center justify-between pt-1">
              {splitPayments.length < MAX_SPLITS && (
                <button type="button" onClick={addSplit}
                  className="text-xs text-purple-400 hover:text-purple-300 font-semibold">+ Adicionar forma</button>
              )}
              <span className={`text-xs font-semibold ml-auto ${splitOk ? 'text-green-400' : 'text-yellow-400'}`}>
                {splitOk ? '✓ Valores ok' : `Restante: R$ ${splitRemain.toFixed(2)}`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Observações */}
      <div>
        <label className="text-xs text-gray-400 font-semibold mb-1 block">Observações <span className="text-gray-600 font-normal">(opcional)</span></label>
        <input type="text" placeholder="Ex: sem cebola, sem glúten..." value={notes}
          onChange={(e) => setNotes(e.target.value)} className="input w-full text-sm" />
      </div>
    </div>
  );
}

function StepReview({ name, phone, cart, deliveryType, street, streetNumber, complement, neighborhood, deliveryFee,
  paymentMethod, splitMode, splitPayments, channel, notes, scheduledFor, fiadoClientes, fiadoClienteId }) {
  const items    = Object.values(cart);
  const subtotal = cartTotal(cart);
  const fee      = deliveryType === 'delivery' ? parseFloat(deliveryFee) || 0 : 0;
  const total    = subtotal + fee;
  const address  = [street, streetNumber, complement].filter(Boolean).join(', ');

  const PAY_LABELS = { cash: 'Dinheiro', pix: 'Pix', credit: 'Crédito', debit: 'Débito', voucher: 'Vale', fiado: 'Fiado', pending: 'A cobrar', other: 'Outro', split: 'Dividido' };
  const fiadoClient = fiadoClientes.find((c) => c.id === fiadoClienteId);
  const payDisplay = splitMode
    ? splitPayments.filter((s) => parseFloat(s.amount) > 0)
        .map((s) => `${PAY_LABELS[s.method] ?? s.method} R$${parseFloat(s.amount).toFixed(2)}`).join(' + ')
    : PAY_LABELS[paymentMethod] ?? paymentMethod;

  return (
    <div className="space-y-4 max-w-md">
      <div className="bg-gray-800/60 rounded-2xl border border-white/[0.07] overflow-hidden">
        {/* Customer */}
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-1">Cliente</p>
          <p className="text-sm font-semibold text-white">{name}</p>
          {phone && <p className="text-xs text-gray-400">{phone}</p>}
        </div>

        {/* Items */}
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-2">Itens</p>
          <ul className="space-y-1">
            {items.map(({ product: p, qty, weightKg }) => (
              <li key={p.id} className="flex justify-between text-sm">
                <span className="text-gray-300">
                  {p.sale_type === 'kg' ? `${weightKg}kg` : `${qty}×`} {p.name}
                </span>
                <span className="text-gray-400">
                  {fmt(p.sale_type === 'kg'
                    ? parseFloat(p.sale_price) * parseFloat(weightKg || 0)
                    : parseFloat(p.sale_price) * qty)}
                </span>
              </li>
            ))}
          </ul>
          {fee > 0 && (
            <div className="flex justify-between text-sm mt-1 pt-1 border-t border-white/[0.04]">
              <span className="text-gray-400">Taxa de entrega</span>
              <span className="text-gray-400">{fmt(fee)}</span>
            </div>
          )}
        </div>

        {/* Delivery + Payment */}
        <div className="px-4 py-3 border-b border-white/[0.06] flex gap-4">
          <div className="flex-1">
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-1">Entrega</p>
            <p className="text-sm text-white">{deliveryType === 'delivery' ? '🛵 Entrega' : '🏪 Retirada'}</p>
            {neighborhood && neighborhood !== 'outro' && <p className="text-xs text-blue-400 font-semibold mt-0.5">{neighborhood}</p>}
            {address && <p className="text-xs text-gray-400 truncate mt-0.5">{address}</p>}
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-1">Pagamento</p>
            <p className="text-sm text-white">{payDisplay}</p>
            {fiadoClient && <p className="text-xs text-purple-400">{fiadoClient.name}</p>}
          </div>
        </div>

        {/* Total */}
        <div className="px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-gray-400">Total do pedido</p>
          <p className="text-xl font-black text-white">{fmt(total)}</p>
        </div>
      </div>

      {notes && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5">
          <p className="text-xs text-amber-400">💬 {notes}</p>
        </div>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────

export default function NewOrderModal({ onClose, onCreated }) {
  const [products,    setProducts]    = useState([]);
  const [search,      setSearch]      = useState('');
  const [cart,        setCart]        = useState(emptyCart());
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState(null);
  const [caixaOpen,   setCaixaOpen]   = useState(null);

  // Wizard
  const [stepIndex, setStepIndex]    = useState(0);
  const [direction, setDirection]    = useState(1); // 1=forward -1=backward

  // Step 1 — Customer
  const [name,          setName]          = useState('');
  const [phone,         setPhone]         = useState('');
  const [suggestions,   setSuggestions]   = useState([]);
  const [showSug,       setShowSug]       = useState(false);
  const sugTimer = useRef(null);

  // Step 3 — Payment/Delivery
  const [channel,          setChannel]          = useState('manual');
  const [deliveryType,     setDeliveryType]     = useState('pickup');
  const [neighborhood,     setNeighborhood]     = useState('');
  const [street,           setStreet]           = useState('');
  const [streetNumber,     setStreetNumber]     = useState('');
  const [complement,       setComplement]       = useState('');
  const [deliveryFee,      setDeliveryFee]      = useState('');
  const [paymentMethod,    setPaymentMethod]    = useState('cash');
  const [splitMode,        setSplitMode]        = useState(false);
  const [splitPayments,    setSplitPayments]    = useState([{ method: 'cash', amount: '' }]);
  const [needsChange,      setNeedsChange]      = useState(false);
  const [changeFor,        setChangeFor]        = useState('');
  const [notes,            setNotes]            = useState('');
  const [scheduledFor,     setScheduledFor]     = useState('');
  const [showMapPicker,    setShowMapPicker]    = useState(false);
  const [fiadoClientes,    setFiadoClientes]    = useState([]);
  const [fiadoClienteId,   setFiadoClienteId]   = useState('');
  const [fiadoClienteSearch, setFiadoClienteSearch] = useState('');

  // ── Load ──────────────────────────────────────────────────
  useEffect(() => {
    getProducts({ active: true, limit: 200 })
      .then(({ data }) => setProducts(data.data ?? []))
      .catch(() => setError('Erro ao carregar produtos.'))
      .finally(() => setLoading(false));
    getCurrentCaixa()
      .then(({ data }) => setCaixaOpen(!!data.data))
      .catch(() => setCaixaOpen(true));
  }, []);

  useEffect(() => {
    if (paymentMethod !== 'fiado') return;
    listFiadoClientes({ search: fiadoClienteSearch })
      .then(({ data }) => setFiadoClientes(data.data ?? []))
      .catch(() => {});
  }, [paymentMethod, fiadoClienteSearch]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // ── Cart ──────────────────────────────────────────────────
  const handleAdd    = useCallback((p) => setCart((c) => addToCart(c, p)), []);
  const handleQty    = useCallback((id, qty) => {
    if (qty <= 0) setCart((c) => removeFromCart(c, id));
    else setCart((c) => ({ ...c, [id]: { ...c[id], qty } }));
  }, []);
  const handleWeight = useCallback((id, w) => setCart((c) => ({ ...c, [id]: { ...c[id], weightKg: w } })), []);
  const handleRemove = useCallback((id) => setCart((c) => removeFromCart(c, id)), []);

  // ── Autocomplete ──────────────────────────────────────────
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
    if (s.customer_address) {
      // Tenta separar "Rua X, 123, Complemento" em partes
      const parts = s.customer_address.split(',').map((p) => p.trim());
      setStreet(parts[0] ?? '');
      setStreetNumber(parts[1] ?? '');
      setComplement(parts.slice(2).join(', '));
    }
    setShowSug(false);
    setSuggestions([]);
  };

  // ── Navigation ─────────────────────────────────────────────
  const canAdvance = () => {
    if (stepIndex === 0) return name.trim().length > 0;
    if (stepIndex === 1) return Object.keys(cart).length > 0;
    if (stepIndex === 2) {
      if (deliveryType === 'delivery' && !neighborhood) return false;
      if (!splitMode && paymentMethod === 'fiado' && !fiadoClienteId) return false;
      if (splitMode) {
        const total = splitPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
        const orderTot = cartTotal(cart) + (deliveryType === 'delivery' ? parseFloat(deliveryFee) || 0 : 0);
        if (Math.abs(total - orderTot) > 0.01) return false;
      }
      return true;
    }
    return true;
  };

  const goNext = () => {
    if (stepIndex < STEPS.length - 1) {
      setDirection(1);
      setStepIndex((i) => i + 1);
      setError(null);
    } else {
      handleSubmit();
    }
  };

  const goBack = () => {
    if (stepIndex > 0) {
      setDirection(-1);
      setStepIndex((i) => i - 1);
      setError(null);
    } else {
      onClose();
    }
  };

  // ── Submit ─────────────────────────────────────────────────
  const handleSubmit = async () => {
    const cartEntries = Object.values(cart);
    setError(null);
    setSubmitting(true);

    const items = cartEntries.map(({ product, qty, weightKg }) => ({
      productId: product.id,
      ...(product.sale_type === 'kg' ? { weightKg: parseFloat(weightKg) } : { quantity: qty }),
    }));

    const customerAddress = [street, streetNumber, complement].filter(Boolean).join(', ');

    const splitNote = splitMode && splitPayments.length > 1
      ? '💰 Dividido: ' + splitPayments
          .filter((s) => parseFloat(s.amount) > 0)
          .map((s) => {
            const lbl = PAY_OPTIONS.find((p) => p.value === s.method)?.label ?? s.method;
            return `${lbl} R$${parseFloat(s.amount).toFixed(2)}`;
          }).join(' + ')
      : '';

    const fullNotes = [
      notes.trim(),
      scheduledFor.trim() ? `📅 Agendado: ${scheduledFor.trim()}` : '',
      needsChange && changeFor ? `Troco para R$ ${changeFor}` : needsChange ? 'Precisa de troco' : '',
      splitNote,
    ].filter(Boolean).join(' | ');

    const fee = deliveryType === 'delivery' ? parseFloat(deliveryFee) || 0 : 0;
    const finalPayMethod = splitMode ? splitPayments[0]?.method ?? 'cash' : paymentMethod;

    try {
      const { data } = await createOrder({
        customerName:    name.trim(),
        customerPhone:   phone.trim()         || undefined,
        customerAddress: customerAddress       || undefined,
        neighborhood:    (neighborhood && neighborhood !== 'outro') ? neighborhood : undefined,
        deliveryType,
        paymentMethod:   finalPayMethod,
        deliveryFee:     fee,
        channel,
        notes: fullNotes || undefined,
        items,
      });
      if (paymentMethod === 'fiado' && data.data?.id) {
        const subtotal = cartTotal(cart);
        await createFiadoCompra({
          cliente_id: fiadoClienteId,
          order_id:   data.data.id,
          descricao:  `Pedido #${data.data.order_number ?? data.data.id}`,
          valor:      subtotal + fee,
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

  // ── Render ─────────────────────────────────────────────────
  const currentStep = STEPS[stepIndex];
  const isLastStep  = stepIndex === STEPS.length - 1;
  const cartCount   = Object.keys(cart).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">

      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 16 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative w-full max-w-3xl max-h-[88vh] bg-gray-900 rounded-2xl shadow-2xl flex flex-col border border-white/10 overflow-hidden z-10"
      >
        {/* Map picker overlay — cobre o modal inteiro */}
        {showMapPicker && (
          <MapAddressPicker
            initialStreet={street}
            onClose={() => setShowMapPicker(false)}
            onConfirm={({ street: s }) => { setStreet(s); setShowMapPicker(false); }}
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-lg font-black text-white">Novo Pedido</h2>
            <p className="text-xs text-gray-500 mt-0.5">{currentStep.label}</p>
          </div>

          {/* Steps indicator */}
          <div className="hidden md:flex items-center gap-1 mx-auto">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <div className={[
                  'flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-all duration-300',
                  i < stepIndex  ? 'bg-green-500/20 text-green-400 scale-90'
                  : i === stepIndex ? 'bg-orange-500 text-white scale-110 shadow-lg shadow-orange-500/30'
                  : 'bg-gray-800 text-gray-600',
                ].join(' ')}>
                  {i < stepIndex ? '✓' : s.icon}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 h-0.5 mx-1 rounded transition-all duration-500 ${i < stepIndex ? 'bg-green-500/40' : 'bg-gray-800'}`} />
                )}
              </div>
            ))}
          </div>

          <button onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Caixa fechado */}
        {caixaOpen === false && (
          <div className="flex flex-col items-center justify-center gap-4 py-16 px-8 text-center flex-1">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <span className="text-4xl">🔒</span>
            </div>
            <div>
              <p className="text-lg font-black text-white mb-1">Caixa Fechado</p>
              <p className="text-sm text-gray-400">
                Abra o caixa em <span className="text-orange-400 font-semibold">Financeiro → Caixa</span> para lançar pedidos.
              </p>
            </div>
            <button onClick={onClose} className="btn-primary px-8">Entendido</button>
          </div>
        )}

        {/* Step content */}
        {caixaOpen !== false && (
          <>
            <div className={`flex-1 relative ${stepIndex === 1 ? 'overflow-hidden p-4' : 'overflow-y-auto p-5'}`}>
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={currentStep.id}
                  custom={direction}
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className={stepIndex === 1 ? 'h-full flex flex-col' : ''}
                >
                  {stepIndex === 0 && (
                    <StepCustomer name={name} setName={setName} phone={phone} setPhone={setPhone}
                      fetchSuggestions={fetchSuggestions} showSug={showSug} suggestions={suggestions}
                      applySuggestion={applySuggestion} />
                  )}
                  {stepIndex === 1 && (
                    <StepItems products={products} loading={loading} search={search} setSearch={setSearch}
                      cart={cart} onAdd={handleAdd} onQty={handleQty} onWeight={handleWeight} onRemove={handleRemove} />
                  )}
                  {stepIndex === 2 && (
                    <StepPayment
                      channel={channel} setChannel={setChannel}
                      deliveryType={deliveryType} setDeliveryType={setDeliveryType}
                      neighborhood={neighborhood} setNeighborhood={setNeighborhood}
                      street={street} setStreet={setStreet}
                      streetNumber={streetNumber} setStreetNumber={setStreetNumber}
                      complement={complement} setComplement={setComplement}
                      deliveryFee={deliveryFee} setDeliveryFee={setDeliveryFee}
                      paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
                      splitMode={splitMode} setSplitMode={setSplitMode}
                      splitPayments={splitPayments} setSplitPayments={setSplitPayments}
                      needsChange={needsChange} setNeedsChange={setNeedsChange}
                      changeFor={changeFor} setChangeFor={setChangeFor}
                      notes={notes} setNotes={setNotes}
                      scheduledFor={scheduledFor} setScheduledFor={setScheduledFor}
                      showMapPicker={showMapPicker} setShowMapPicker={setShowMapPicker}
                      orderTotal={cartTotal(cart) + (deliveryType === 'delivery' ? parseFloat(deliveryFee)||0 : 0)}
                      fiadoClientes={fiadoClientes} fiadoClienteId={fiadoClienteId}
                      setFiadoClienteId={setFiadoClienteId}
                      fiadoClienteSearch={fiadoClienteSearch} setFiadoClienteSearch={setFiadoClienteSearch} />
                  )}
                  {stepIndex === 3 && (
                    <StepReview name={name} phone={phone} cart={cart} deliveryType={deliveryType}
                      street={street} streetNumber={streetNumber} complement={complement}
                      neighborhood={neighborhood} deliveryFee={deliveryFee}
                      paymentMethod={paymentMethod} splitMode={splitMode} splitPayments={splitPayments}
                      channel={channel} notes={notes} scheduledFor={scheduledFor}
                      fiadoClientes={fiadoClientes} fiadoClienteId={fiadoClienteId} />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-white/10 flex items-center justify-between shrink-0 bg-gray-900/80">
              <button onClick={goBack}
                className="px-5 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-colors font-semibold">
                {stepIndex === 0 ? 'Cancelar' : '← Voltar'}
              </button>

              {error && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-1.5 flex-1 mx-4 text-center">
                  {error}
                </motion.p>
              )}

              <button
                onClick={goNext}
                disabled={!canAdvance() || submitting}
                className={[
                  'px-6 py-2 rounded-xl text-sm font-bold transition-all',
                  canAdvance() && !submitting
                    ? isLastStep
                      ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/20'
                      : 'bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-500/20'
                    : 'bg-gray-800 text-gray-600 cursor-not-allowed',
                ].join(' ')}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Enviando...
                  </span>
                ) : isLastStep ? '✓ Confirmar Pedido' : (
                  <span className="flex items-center gap-1.5">
                    {stepIndex === 1 && cartCount > 0 && (
                      <span className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">{cartCount}</span>
                    )}
                    Próximo →
                  </span>
                )}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
