/**
 * NewOrderModal — wizard 4 passos com animações Framer Motion
 * Passo 1: Cliente   Passo 2: Itens   Passo 3: Entrega/Pag.   Passo 4: Revisão
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getProducts, createOrder, searchCustomers, createCustomer } from '../api/orders';
import { getProductAddonGroups } from '../api/addons';
import { getCurrentCaixa } from '../api/caixa';
import { listFiadoClientes, createFiadoCompra } from '../api/fiado';
import { getFullSettings, validateCoupon } from '../api/users';
import { Map, MapMarker, MarkerContent, MapControls } from './ui/map';
import { NEIGHBORHOODS, PAY_OPTIONS, fmt } from '../constants/orders';
import { addToCart, removeFromCart, cartTotal, groupByCategory } from '../utils/cart';

// Ray-casting point-in-polygon — [lng,lat] ponto, polygon = [[lng,lat],...]
function pointInPolygon([px, py], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Reverse-geocode [lng, lat] → { road, number, suburb, allSuburbs[] } via Nominatim
async function reverseGeocode(lng, lat) {
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    );
    const data = await res.json();
    const addr = data.address ?? {};
    // Coleta todos os campos geográficos possíveis para matching de bairro
    // Prioridade: mais específico (neighbourhood/quarter) antes do genérico (suburb/county)
    const allSuburbs = [
      addr.neighbourhood, addr.quarter, addr.city_district,
      addr.suburb, addr.district, addr.borough,
      addr.county, addr.town, addr.village,
      addr.municipality, addr.state_district,
    ].filter(Boolean);
    return {
      road:       addr.road ?? addr.pedestrian ?? addr.path ?? addr.footway ?? addr.street ?? '',
      number:     addr.house_number ?? '',
      suburb:     allSuburbs[0] ?? '',
      allSuburbs,
      displayName: data.display_name ?? '',
    };
  } catch { return { road: '', number: '', suburb: '', allSuburbs: [], displayName: '' }; }
}

// Forward-geocode: busca endereço por texto → [{ display, lat, lng, road, number, suburb, allSuburbs }]
async function forwardGeocode(query) {
  if (!query || query.length < 4) return [];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=pt-BR&addressdetails=1`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    );
    const results = await res.json();
    return results.map((r) => {
      const addr = r.address ?? {};
      const allSuburbs = [
        addr.suburb, addr.neighbourhood, addr.quarter, addr.city_district,
        addr.district, addr.borough, addr.county, addr.town, addr.village,
        addr.municipality,
      ].filter(Boolean);
      return {
        display:     r.display_name,
        lat:         parseFloat(r.lat),
        lng:         parseFloat(r.lon),
        road:        addr.road ?? addr.pedestrian ?? addr.street ?? '',
        number:      addr.house_number ?? '',
        suburb:      allSuburbs[0] ?? '',
        allSuburbs,
      };
    });
  } catch { return []; }
}

// ── Map address picker (overlay dentro do modal) ──────────────

const CITY_CENTER = [-49.7802, -29.3965]; // Estrada dos Cunhas 1203, Sala 2, Itapeva, Torres RS

function MapAddressPicker({ initialStreet, onConfirm, onClose, restaurantCenter }) {
  const mapCenter = restaurantCenter ?? CITY_CENTER;
  const [markerPos,    setMarkerPos]    = useState(mapCenter);
  const [loading,      setLoading]      = useState(false);
  const [previewRoad,  setPreviewRoad]  = useState(initialStreet || '');
  const [previewNum,   setPreviewNum]   = useState('');
  const [previewSub,   setPreviewSub]   = useState('');
  const [allSuburbs,   setAllSuburbs]   = useState([]);
  const [searchText,   setSearchText]   = useState('');
  const [suggestions,  setSuggestions]  = useState([]);
  const [searching,    setSearching]    = useState(false);
  const mapRef     = useRef(null);
  const searchTimer = useRef(null);

  const doGeocode = useCallback(async (lng, lat) => {
    setLoading(true);
    const result = await reverseGeocode(lng, lat);
    setPreviewRoad(result.road);
    setPreviewNum(result.number);
    setPreviewSub(result.suburb);
    setAllSuburbs(result.allSuburbs || []);
    setLoading(false);
    return result;
  }, []);

  // Busca de endereço com debounce
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchText(val);
    setSuggestions([]);
    clearTimeout(searchTimer.current);
    if (val.length < 5) return;
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const results = await forwardGeocode(val);
      setSuggestions(results.slice(0, 4));
      setSearching(false);
    }, 600);
  };

  const handleSelectSuggestion = (s) => {
    setMarkerPos([s.lng, s.lat]);
    setPreviewRoad(s.road);
    setPreviewNum(s.number);
    setPreviewSub(s.suburb);
    setAllSuburbs(s.allSuburbs || []);
    setSearchText(s.road + (s.number ? ', ' + s.number : ''));
    setSuggestions([]);
    // Centraliza o mapa na seleção
    if (mapRef.current?.flyTo) {
      mapRef.current.flyTo({ center: [s.lng, s.lat], zoom: 17 });
    }
  };

  const handleDragEnd = useCallback(async (lngLat) => {
    setMarkerPos([lngLat.lng, lngLat.lat]);
    setSearchText('');
    setSuggestions([]);
    await doGeocode(lngLat.lng, lngLat.lat);
  }, [doGeocode]);

  const handleConfirm = async () => {
    setLoading(true);
    const fresh = await reverseGeocode(markerPos[0], markerPos[1]);
    onConfirm({
      street:       fresh.road   || previewRoad,
      streetNumber: fresh.number || previewNum,
      suburb:       fresh.suburb || previewSub,
      allSuburbs:   fresh.allSuburbs?.length ? fresh.allSuburbs : allSuburbs,
      coords:       markerPos,
    });
  };

  const fullPreview = [previewRoad, previewNum].filter(Boolean).join(', ');

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-gray-950 rounded-2xl overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-3 bg-gray-900 border-b border-white/10 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-black text-white">📍 Escolher localização</p>
            <p className="text-xs text-gray-400">Busque o endereço ou arraste o alfinete</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10">✕</button>
        </div>

        {/* Barra de busca de endereço */}
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar endereço, ex: Av. Independência 1080, Torres..."
            value={searchText}
            onChange={handleSearchChange}
            className="w-full bg-gray-800 text-white text-xs rounded-xl px-3 py-2 pr-8 border border-white/10 focus:outline-none focus:border-orange-500/50 placeholder-gray-500"
          />
          {searching && (
            <span className="absolute right-2.5 top-2 text-xs text-gray-500 animate-pulse">⏳</span>
          )}
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-40 mt-1 bg-gray-800 border border-white/10 rounded-xl overflow-hidden shadow-xl">
              {suggestions.map((s, i) => (
                <button key={i} type="button"
                  onClick={() => handleSelectSuggestion(s)}
                  className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-700 border-b border-white/5 last:border-0 truncate">
                  📍 {s.display}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative min-h-0">
        <Map ref={mapRef} center={mapCenter} zoom={14} theme="dark" className="h-full w-full">
          <MapControls position="top-right" showZoom showLocate
            onLocate={({ longitude, latitude }) => setMarkerPos([longitude, latitude])} />
          <MapMarker longitude={markerPos[0]} latitude={markerPos[1]} draggable
            onDragEnd={handleDragEnd}>
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
          <p className="text-xs text-gray-400 mb-0.5">Endereço identificado:</p>
          {loading ? (
            <p className="text-sm text-gray-500 animate-pulse">Identificando...</p>
          ) : fullPreview ? (
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-white truncate">{fullPreview}</p>
              {previewSub && <p className="text-xs text-gray-400 truncate">📌 {previewSub}</p>}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">— arraste o alfinete —</p>
          )}
        </div>
        <button onClick={handleConfirm} disabled={loading}
          className="shrink-0 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm transition-colors disabled:opacity-50">
          Confirmar
        </button>
      </div>
    </div>
  );
}


// ── Animation variants ────────────────────────────────────────

const stepVariants = {
  enter: (dir) => ({ opacity: 0, x: dir > 0 ? 30 : -30 }),
  center: { opacity: 1, x: 0 },
  exit:  (dir) => ({ opacity: 0, x: dir > 0 ? -30 : 30 }),
};

const STEPS = [
  { id: 'customer', label: 'Cliente',    icon: '👤', desc: 'Quem vai receber?' },
  { id: 'items',    label: 'Produtos',   icon: '🛒', desc: 'O que vai pedir?' },
  { id: 'payment',  label: 'Entrega',    icon: '📦', desc: 'Como e onde?' },
  { id: 'review',   label: 'Finalizar',  icon: '✅', desc: 'Confirmar pedido' },
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

function StepCustomer({
  name, setName, phone, setPhone,
  fetchSuggestions, showSug, suggestions, applySuggestion,
  addNewCustomer, addingCustomer,
  pickupMode, setPickupMode, deliveryType,
  allCustomers, custLoading,
}) {
  const phoneRequired = !pickupMode && deliveryType === 'delivery';

  return (
    <div className="flex gap-4 min-h-[320px]">

      {/* ── Sidebar: clientes recentes ── */}
      <div className="w-48 shrink-0 flex flex-col border-r border-white/[0.07] pr-3 gap-3">

        {/* Header da sidebar */}
        <div>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
            Recentes
          </p>
          <div className="space-y-0.5">
            {custLoading ? (
              <div className="space-y-1.5">
                {[1,2,3].map((i) => (
                  <div key={i} className="h-8 bg-gray-800/60 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : allCustomers.length === 0 ? (
              <p className="text-[11px] text-gray-600 italic py-2">Nenhum cliente ainda</p>
            ) : allCustomers.slice(0, 8).map((c, i) => {
              const initials = ((c.name ?? c.customer_name) ?? 'C').split(' ').map((w) => w[0]).slice(0,2).join('').toUpperCase();
              const orders   = c.order_count ?? 1;
              const isVip    = orders >= 10;
              return (
                <button key={i} type="button" onMouseDown={() => applySuggestion(c)}
                  className="w-full text-left px-2 py-1.5 rounded-xl hover:bg-white/[0.06] transition-colors group flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center text-[10px] font-bold text-orange-300 shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <p className="text-[11px] font-semibold text-gray-300 truncate group-hover:text-white leading-none">
                        {c.name ?? c.customer_name}
                      </p>
                      {isVip && <span className="text-[8px] text-yellow-400">★</span>}
                    </div>
                    <p className="text-[10px] text-gray-600 leading-none mt-0.5">
                      {orders} pedido{orders !== 1 ? 's' : ''}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Divisor */}
        <div className="border-t border-white/[0.06]" />

        {/* Quick actions */}
        <div>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
            Rápido
          </p>
          <div className="space-y-1">
            <button type="button"
              onMouseDown={() => setPickupMode(true)}
              className="w-full text-left px-2 py-1.5 rounded-xl hover:bg-orange-500/10 text-[11px] text-gray-400 hover:text-orange-300 transition-colors flex items-center gap-1.5 font-medium">
              🏃 Retirada balcão
            </button>
            <button type="button"
              onMouseDown={() => { applySuggestion({ name: 'Cliente', phone: '' }); }}
              className="w-full text-left px-2 py-1.5 rounded-xl hover:bg-gray-700/40 text-[11px] text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1.5 font-medium">
              🎭 Anônimo
            </button>
          </div>
        </div>
      </div>

      {/* ── Formulário ── */}
      <div className="flex-1 space-y-4">
        <div>
          <p className="text-base font-bold text-white">Quem vai receber o pedido?</p>
          <p className="text-xs text-gray-500 mt-0.5">Selecione um cliente recente ou preencha os dados</p>
        </div>

        {/* Toggle: nome para retirada */}
        <button type="button" onClick={() => setPickupMode((v) => !v)}
          className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl font-semibold transition-all border ${
            pickupMode
              ? 'bg-orange-500/20 text-orange-300 border-orange-500/40 scale-[1.02]'
              : 'bg-gray-800/60 text-gray-400 border-white/[0.07] hover:text-gray-200 hover:bg-gray-800'
          }`}>
          🏃 Nome para retirada
          {pickupMode && (
            <span className="bg-orange-500/30 text-orange-300 text-[10px] px-1.5 py-0.5 rounded-full leading-none">ativo</span>
          )}
        </button>
        {pickupMode && (
          <p className="text-[10px] text-gray-500 -mt-2 pl-1">
            Apenas identifica o pedido — telefone não obrigatório e não aparece no histórico.
          </p>
        )}

        {/* Nome */}
        <div className="relative">
          <label className="text-xs text-gray-400 font-semibold mb-1 flex items-center gap-1.5">
            Nome *
            {pickupMode && (
              <span className="text-[10px] text-orange-400 font-normal bg-orange-500/10 px-1.5 py-0.5 rounded-full">para retirada</span>
            )}
          </label>
          <input
            type="text"
            placeholder={pickupMode ? 'Ex: Mesa 3, João, Balcão...' : 'Como ele será identificado...'}
            value={name} autoFocus
            onChange={(e) => {
              setName(e.target.value);
              if (!pickupMode) fetchSuggestions(e.target.value);
            }}
            className="input w-full focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/50 transition-all"
          />
          <AnimatePresence>
            {showSug && suggestions.length > 0 && !pickupMode && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden"
              >
                {suggestions.map((s, i) => (
                  <button key={i} onMouseDown={() => applySuggestion(s)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors">
                    <p className="text-sm text-gray-200 font-medium">{s.name ?? s.customer_name}</p>
                    {(s.phone ?? s.customer_phone) && <p className="text-xs text-gray-500">{s.phone ?? s.customer_phone}</p>}
                  </button>
                ))}
              </motion.div>
            )}
            {showSug && suggestions.length === 0 && name.trim().length >= 2 && !pickupMode && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="absolute left-0 right-0 top-full mt-1 z-10"
              >
                <button
                  type="button"
                  onMouseDown={addNewCustomer}
                  disabled={addingCustomer}
                  className="w-full text-left px-3 py-2.5 bg-gray-800 border border-white/10 rounded-xl shadow-xl hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm"
                >
                  {addingCustomer ? (
                    <span className="text-gray-400 animate-pulse">Salvando...</span>
                  ) : (
                    <>
                      <span className="text-green-400 font-bold text-base leading-none">＋</span>
                      <span className="text-gray-200">
                        Adicionar <span className="font-semibold text-white">{name.trim()}</span> como novo cliente
                      </span>
                    </>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Telefone — oculto no modo retirada */}
        {!pickupMode && (
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-0.5 block">
              Telefone{' '}
              {phoneRequired
                ? <span className="text-red-400">*</span>
                : <span className="text-gray-600 font-normal">(opcional)</span>
              }
            </label>
            <p className="text-[10px] text-gray-600 mb-1">Para enviar atualizações e próximos pedidos</p>
            <input type="tel" placeholder="(51) 99999-9999" value={phone}
              onChange={(e) => { setPhone(e.target.value); fetchSuggestions(e.target.value); }}
              className={`input w-full focus:ring-2 focus:ring-orange-500/40 transition-all ${phoneRequired && !phone.trim() ? 'ring-1 ring-red-500/50' : ''}`} />
            {phoneRequired && !phone.trim() && (
              <p className="text-[10px] text-red-400 mt-1 pl-0.5">Obrigatório para pedidos de entrega</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Variation Picker Modal ─────────────────────────────────────

function VariationPicker({ product, selections, onSelect, onConfirm, onClose }) {
  const groups = (product.variations ?? []).filter((g) => g.options?.some((o) => o.available));
  const fmt = (v) => `R$ ${parseFloat(v).toFixed(2).replace('.', ',')}`;

  // Todas as obrigatórias preenchidas?
  const canConfirm = groups
    .filter((g) => g.required)
    .every((g) => selections[g.id]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-base font-black text-white">{product.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Selecione as opções</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Groups */}
        <div className="flex-1 overflow-auto p-4 space-y-5">
          {groups.map((g) => (
            <div key={g.id}>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-bold text-gray-200">{g.name}</p>
                {g.required
                  ? <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-semibold">Obrigatório</span>
                  : <span className="text-[10px] bg-gray-700/60 text-gray-500 px-1.5 py-0.5 rounded-full">Opcional</span>
                }
              </div>
              <div className="space-y-1.5">
                {g.options.filter((o) => o.available).map((opt) => {
                  const selected = selections[g.id]?.optionId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onSelect(g.id, { optionId: opt.id, optionName: opt.name, price: parseFloat(opt.price) })}
                      className={[
                        'w-full flex items-center justify-between px-4 py-2.5 rounded-xl border-2 transition-all text-left',
                        selected
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-white/10 hover:border-white/20 bg-gray-800/40',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          selected ? 'border-orange-500 bg-orange-500' : 'border-gray-600'
                        }`}>
                          {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <span className="text-sm font-semibold text-gray-200">{opt.name}</span>
                      </div>
                      <span className={`text-sm font-bold shrink-0 ${selected ? 'text-orange-400' : 'text-gray-400'}`}>
                        {fmt(opt.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 shrink-0">
          {canConfirm && (
            <p className="text-xs text-center text-gray-400 mb-2">
              Total: <span className="text-white font-bold">
                {fmt(Object.values(selections).reduce((s, sel) => s + (sel.price || 0), 0))}
              </span>
            </p>
          )}
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-black text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {canConfirm ? 'Adicionar ao Carrinho' : 'Selecione todas as opções obrigatórias'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Addon Picker Modal ─────────────────────────────────────────

function AddonPicker({ product, groups, currentAddons = [], onConfirm, onClose }) {
  // Initialize selections from currentAddons
  const initSel = () => {
    const map = {};
    for (const g of groups) {
      map[g.id] = {};
      for (const item of g.items) {
        const existing = currentAddons.find((a) => a.addon_item_id === item.id);
        if (existing) map[g.id][item.id] = existing.qty ?? 1;
      }
    }
    return map;
  };
  const [selections, setSelections] = useState(initSel);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const toggle = (groupId, item) => {
    setSelections((prev) => {
      const grp = { ...(prev[groupId] ?? {}) };
      if (grp[item.id]) { delete grp[item.id]; }
      else              { grp[item.id] = 1; }
      return { ...prev, [groupId]: grp };
    });
  };

  const handleConfirm = () => {
    const addons = [];
    for (const g of groups) {
      for (const item of g.items) {
        const qty = selections[g.id]?.[item.id];
        if (qty) addons.push({ addon_item_id: item.id, addon_name: item.name, qty, unit_price: parseFloat(item.price), total: parseFloat(item.price) * qty });
      }
    }
    onConfirm(addons);
  };

  const addonsTotal = groups.reduce((sum, g) => {
    for (const item of g.items) {
      const qty = selections[g.id]?.[item.id] ?? 0;
      sum += qty * parseFloat(item.price);
    }
    return sum;
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -10 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-start justify-between">
          <div>
            <h3 className="text-base font-black text-white">{product.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Escolha os complementos</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors ml-2 shrink-0">✕</button>
        </div>

        <div className="overflow-y-auto max-h-80 p-4 space-y-5">
          {groups.map((g) => (
            <div key={g.id}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-300 uppercase tracking-wide">{g.name}</p>
                {g.min_qty > 0 && <span className="text-[10px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-full">mín {g.min_qty}</span>}
                {g.max_qty  && <span className="text-[10px] text-gray-500 ml-1">máx {g.max_qty}</span>}
              </div>
              <div className="space-y-1">
                {g.items.filter((i) => i.active !== false).map((item) => {
                  const selected = !!(selections[g.id]?.[item.id]);
                  return (
                    <button key={item.id} type="button" onClick={() => toggle(g.id, item)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all text-sm ${
                        selected
                          ? 'bg-orange-500/15 border-orange-500/40 text-white'
                          : 'bg-gray-800/50 border-white/[0.06] text-gray-300 hover:bg-gray-700/60'
                      }`}
                    >
                      <span className="font-medium">{item.name}</span>
                      <div className="flex items-center gap-2">
                        {parseFloat(item.price) > 0 && (
                          <span className="text-xs text-gray-400">+R$ {parseFloat(item.price).toFixed(2)}</span>
                        )}
                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors text-[10px] font-black ${
                          selected ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-600'
                        }`}>{selected ? '✓' : ''}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500">Base: <span className="text-gray-300">{product.sale_price !== undefined ? `R$ ${parseFloat(product.sale_price).toFixed(2)}` : ''}</span></p>
            {addonsTotal > 0 && <p className="text-xs text-orange-400 font-semibold">+R$ {addonsTotal.toFixed(2)} em extras</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-xl bg-gray-800 text-gray-400 text-sm font-semibold hover:bg-gray-700">Sem extras</button>
            <button onClick={handleConfirm} className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-400">Confirmar</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function StepItems({ products, loading, search, setSearch, cart, onAdd, onQty, onWeight, onRemove, onItemNotes }) {
  const categories = groupByCategory(products);

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
          ) : cartEntries.map(({ product: p, qty, weightKg, addons, notes: itemNotes, variation }) => {
            const varPrice = variation?.length ? variation.reduce((s, sel) => s + (parseFloat(sel.price) || 0), 0) : null;
            const unitPrice = varPrice ?? parseFloat(p.sale_price);
            return (
            <div key={p.id} className="bg-gray-800/60 rounded-xl p-2 space-y-1">
              <div className="flex items-start justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-200 leading-tight truncate">{p.name}</p>
                  {variation?.length > 0 && (
                    <p className="text-[10px] text-orange-400 leading-none mt-0.5">
                      {variation.map((s) => s.optionName).join(' · ')}
                    </p>
                  )}
                </div>
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
                  {weightKg && <span className="text-xs text-green-400">{fmt(unitPrice * parseFloat(weightKg))}</span>}
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button onClick={() => onQty(p.id, qty - 1)} className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold flex items-center justify-center">−</button>
                    <span className="w-5 text-center text-xs font-bold text-white">{qty}</span>
                    <button onClick={() => onQty(p.id, qty + 1)} className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold flex items-center justify-center">+</button>
                  </div>
                  <span className="text-xs text-green-400 font-semibold">{fmt(unitPrice * qty)}</span>
                </div>
              )}
              {addons?.length > 0 && (
                <div className="pl-1 space-y-0.5">
                  {addons.map((a) => (
                    <p key={a.addon_item_id} className="text-[10px] text-orange-400 leading-none">
                      + {a.addon_name}{a.unit_price > 0 ? ` (+R$${parseFloat(a.unit_price).toFixed(2)})` : ''}
                    </p>
                  ))}
                </div>
              )}
              {/* Observação por item */}
              <input
                type="text"
                value={itemNotes ?? ''}
                onChange={(e) => onItemNotes?.(p.id, e.target.value)}
                placeholder="Obs.: sem cebola..."
                className="w-full text-[11px] bg-gray-700/60 border border-white/10 rounded-lg px-2 py-1 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
              />
            </div>
            );
          })}
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
// PAY_OPTIONS_SPLIT é calculado dinamicamente no StepPayment usando effectivePay

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
  phoneOk,
  pickupMode,
  cashbackBalance, useCashback, setUseCashback,
  tenantPayMethods,
  tenantZones, tenantZoneType,
  couponCode, setCouponCode,
  couponResult, couponError, validatingCoupon,
  onValidateCoupon, onClearCoupon,
}) {
  // Zonas efetivas: usa tenant (qualquer tipo) ou NEIGHBORHOODS como fallback
  const effectiveZones = tenantZones?.length > 0
    ? tenantZones.map((z) => ({ bairro: z.name, taxa: z.fee }))
    : NEIGHBORHOODS;
  // Formas de pagamento efetivas
  const effectivePay = tenantPayMethods?.length > 0
    ? PAY_OPTIONS.filter((p) => tenantPayMethods.includes(p.value))
    : PAY_OPTIONS;
  const effectivePaySplit = effectivePay.filter((p) => !['fiado','pending'].includes(p.value));
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

      {/* Tipo entrega — cards iFood-style */}
      <div>
        <label className="text-xs text-gray-400 font-semibold mb-2 block">Como quer receber?</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { v: 'pickup',   emoji: '🏪', label: 'Retirar no local', color: 'orange' },
            { v: 'delivery', emoji: '🛵', label: 'Receber em casa',  color: 'blue'   },
          ].map(({ v, emoji, label, color }) => {
            const active = deliveryType === v;
            return (
              <button key={v} type="button" onClick={() => setDeliveryType(v)}
                className={[
                  'flex flex-col items-center gap-1.5 py-4 rounded-2xl font-bold text-sm border-2 transition-all active:scale-95',
                  active && color === 'orange' ? 'border-orange-400 bg-orange-500/15 text-orange-300 shadow-lg shadow-orange-500/10' :
                  active && color === 'blue'   ? 'border-blue-400   bg-blue-500/15   text-blue-300   shadow-lg shadow-blue-500/10'   :
                  'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300 bg-gray-800/40',
                ].join(' ')}>
                <span className="text-2xl">{emoji}</span>
                <span className="text-xs font-semibold">{label}</span>
              </button>
            );
          })}
        </div>

        <AnimatePresence>
          {deliveryType === 'delivery' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="mt-3 space-y-2 overflow-hidden">

              {/* Aviso: telefone obrigatório */}
              {!phoneOk && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  <span className="text-red-400 shrink-0">📱</span>
                  <p className="text-xs text-red-400">
                    Telefone obrigatório para entrega —{' '}
                    <span className="font-semibold">volte ao passo 1 e preencha.</span>
                  </p>
                </div>
              )}

              {/* CTA de endereço no mapa — iFood-style */}
              {!street ? (
                <button type="button" onClick={() => setShowMapPicker(true)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 border-dashed border-orange-500/40 bg-orange-500/5 hover:bg-orange-500/10 hover:border-orange-500/60 transition-all active:scale-[0.98] group">
                  <span className="text-2xl shrink-0">📍</span>
                  <div className="text-left min-w-0">
                    <p className="text-sm font-bold text-orange-400 group-hover:text-orange-300">Escolher endereço no mapa</p>
                    <p className="text-xs text-gray-500">Arraste o alfinete para o local exato</p>
                  </div>
                  <svg className="w-4 h-4 text-orange-400/60 shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                /* Endereço já selecionado — chip resumo */
                <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                  <span className="text-lg shrink-0 mt-0.5">📍</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {[street, streetNumber].filter(Boolean).join(', ')}
                    </p>
                    {neighborhood && (
                      <p className="text-xs text-blue-300 truncate">
                        {neighborhood}{parseFloat(deliveryFee) > 0 ? ` · R$ ${parseFloat(deliveryFee).toFixed(2)}` : ''}
                      </p>
                    )}
                  </div>
                  <button type="button" onClick={() => setShowMapPicker(true)}
                    className="shrink-0 text-xs text-blue-400 hover:text-blue-300 font-semibold px-2 py-1 rounded-lg hover:bg-blue-500/10 transition-colors">
                    Editar
                  </button>
                </div>
              )}

              {/* Número + Complemento (sempre visível após endereço escolhido) */}
              {street && (
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
              )}

              {/* Bairro + Taxa (colapsados em linha só para ajuste manual) */}
              <details className="group">
                <summary className="text-xs text-gray-500 hover:text-gray-400 cursor-pointer select-none list-none flex items-center gap-1 py-1">
                  <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Ajustar bairro / taxa manualmente
                </summary>
                <div className="mt-2 space-y-2 pl-1">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Bairro</label>
                    <select value={neighborhood}
                      onChange={(e) => {
                        const b = e.target.value;
                        setNeighborhood(b);
                        const found = effectiveZones.find((n) => n.bairro === b);
                        setDeliveryFee(found ? String(found.taxa) : '');
                      }}
                      className="input w-full text-sm">
                      <option value="">— Selecione o bairro —</option>
                      {effectiveZones.map(({ bairro, taxa }) => (
                        <option key={bairro} value={bairro}>{bairro} — R$ {parseFloat(taxa).toFixed(2)}</option>
                      ))}
                      <option value="outro">Outro (taxa manual)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 whitespace-nowrap shrink-0">Taxa (R$)</label>
                    <input type="number" min="0" step="0.50" placeholder="0,00" value={deliveryFee}
                      onChange={(e) => setDeliveryFee(e.target.value)} className="input flex-1 text-sm text-right" />
                  </div>
                </div>
              </details>

              {neighborhood && neighborhood !== 'outro' && parseFloat(deliveryFee) > 0 && !street && (
                <p className="text-xs text-blue-400 bg-blue-500/10 rounded-lg px-2.5 py-1.5">
                  🛵 Taxa para <b>{neighborhood}</b>: R$ {parseFloat(deliveryFee).toFixed(2)}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Cashback disponível */}
      {!pickupMode && cashbackBalance > 0 && (
        <div className="flex items-center justify-between gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3">
          <div>
            <p className="text-sm font-bold text-emerald-400">💰 Saldo cashback</p>
            <p className="text-xs text-emerald-300/70">R$ {cashbackBalance.toFixed(2)} disponível</p>
          </div>
          <button type="button" onClick={() => setUseCashback((v) => !v)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${
              useCashback
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-gray-800/60 text-gray-400 border-white/10 hover:border-emerald-500/30 hover:text-emerald-400'
            }`}>
            {useCashback ? '✓ Desconto aplicado' : 'Usar como desconto'}
          </button>
        </div>
      )}

      {/* Cupom de desconto */}
      <div>
        <label className="text-xs text-gray-400 font-semibold mb-1 block">
          🎫 Cupom de desconto <span className="text-gray-600 font-normal">(opcional)</span>
        </label>
        {couponResult ? (
          <div className="flex items-center justify-between gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">
            <div>
              <p className="text-sm font-bold text-emerald-400">✓ Cupom <span className="tracking-wider">{couponResult.code}</span> aplicado</p>
              <p className="text-xs text-emerald-300/70">Desconto: R$ {parseFloat(couponResult.discount).toFixed(2)}</p>
            </div>
            <button type="button" onClick={onClearCoupon}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors font-semibold px-2 py-1 rounded-lg hover:bg-red-400/10">
              Remover
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Código do cupom..."
              value={couponCode}
              onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); if (couponError) setCouponError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && onValidateCoupon()}
              className="input flex-1 text-sm uppercase tracking-wider"
            />
            <button
              type="button"
              onClick={onValidateCoupon}
              disabled={!couponCode.trim() || validatingCoupon}
              className="px-3 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold text-xs transition-colors disabled:opacity-40 shrink-0"
            >
              {validatingCoupon ? '...' : 'Aplicar'}
            </button>
          </div>
        )}
        {couponError && <p className="text-xs text-red-400 mt-1">{couponError}</p>}
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
            <div className="grid grid-cols-3 gap-2">
              {effectivePay.map(({ value, label, color }) => {
                const active = paymentMethod === value;
                const [emoji, ...rest] = label.split(' ');
                const name = rest.join(' ');
                const activeCls =
                  value === 'fiado'   ? 'border-purple-400 bg-purple-500/15 text-purple-300' :
                  value === 'pending' ? 'border-orange-400 bg-orange-500/15 text-orange-300' :
                  value === 'pix'     ? 'border-blue-400   bg-blue-500/15   text-blue-300'   :
                  value === 'credit' || value === 'debit' ? 'border-violet-400 bg-violet-500/15 text-violet-300' :
                  'border-green-400 bg-green-500/15 text-green-300';
                return (
                  <button key={value} type="button"
                    onClick={() => { setPaymentMethod(value); setFiadoClienteId(''); setFiadoClienteSearch(''); }}
                    className={[
                      'flex flex-col items-center gap-1 py-3 rounded-2xl text-sm font-semibold border-2 transition-all active:scale-95',
                      active ? activeCls : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300 bg-gray-800/40',
                    ].join(' ')}>
                    <span className="text-xl">{emoji}</span>
                    <span className="text-xs">{name}</span>
                  </button>
                );
              })}
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
                  {effectivePaySplit.map(({ value, label }) => (
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
  paymentMethod, splitMode, splitPayments, channel, notes, scheduledFor, fiadoClientes, fiadoClienteId,
  useCashback, cashbackBalance, pickupMode, couponResult }) {
  const items        = Object.values(cart);
  const subtotal     = cartTotal(cart);
  const fee          = deliveryType === 'delivery' ? parseFloat(deliveryFee) || 0 : 0;
  const cashbackUsed = (!pickupMode && useCashback && cashbackBalance > 0)
    ? Math.min(cashbackBalance, subtotal + fee)
    : 0;
  const couponDiscount = parseFloat(couponResult?.discount ?? 0);
  const total    = subtotal + fee - cashbackUsed - couponDiscount;
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

        {/* Cashback deduction */}
        {cashbackUsed > 0 && (
          <div className="px-4 py-2 flex items-center justify-between border-t border-white/[0.04]">
            <p className="text-sm text-emerald-400">💰 Cashback aplicado</p>
            <p className="text-sm font-semibold text-emerald-400">−{fmt(cashbackUsed)}</p>
          </div>
        )}

        {/* Coupon deduction */}
        {couponDiscount > 0 && (
          <div className="px-4 py-2 flex items-center justify-between border-t border-white/[0.04]">
            <p className="text-sm text-violet-400">🎫 Cupom {couponResult?.code}</p>
            <p className="text-sm font-semibold text-violet-400">−{fmt(couponDiscount)}</p>
          </div>
        )}

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
  const [cart,        setCart]        = useState({});
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
  const [pickupMode,    setPickupMode]    = useState(false);
  const [allCustomers,   setAllCustomers]   = useState([]);
  const [custLoading,    setCustLoading]    = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const sugTimer   = useRef(null);
  const fiadoTimer = useRef(null);

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
  // Cashback do cliente selecionado
  const [cashbackBalance,  setCashbackBalance]  = useState(0);   // saldo disponível
  const [useCashback,      setUseCashback]      = useState(false); // toggle
  // Tenant settings (formas de pagamento + zonas de entrega)
  const [tenantPayMethods,   setTenantPayMethods]   = useState(null);  // null = loading (usa PAY_OPTIONS completo)
  const [tenantZones,        setTenantZones]        = useState(null);  // null = usa NEIGHBORHOODS
  const [tenantZoneType,     setTenantZoneType]     = useState('named');
  const [restaurantCenter,   setRestaurantCenter]   = useState(null);  // [lng, lat]
  // Cupom
  const [couponCode,         setCouponCode]         = useState('');
  const [couponResult,       setCouponResult]       = useState(null);  // { discount, code, ... }
  const [couponError,        setCouponError]        = useState('');
  const [validatingCoupon,   setValidatingCoupon]   = useState(false);
  // Addon picker
  const [addonPickerProduct,  setAddonPickerProduct]  = useState(null);
  const [addonPickerGroups,   setAddonPickerGroups]   = useState([]);
  const addonGroupsCache = useRef({});  // productId → groups[]

  // Variation picker
  const [varPickerProduct,    setVarPickerProduct]    = useState(null);
  const [varSelections,       setVarSelections]       = useState({});  // { groupId: { optionId, optionName, price } }

  // ── Load ──────────────────────────────────────────────────
  useEffect(() => {
    getProducts({ active: true, limit: 200 })
      .then(({ data }) => setProducts(data.data ?? []))
      .catch(() => setError('Erro ao carregar produtos.'))
      .finally(() => setLoading(false));
    getCurrentCaixa()
      .then(({ data }) => setCaixaOpen(!!data.data))
      .catch(() => setCaixaOpen(true));
    // Carrega configurações do restaurante (formas de pagamento + zonas)
    getFullSettings()
      .then(({ data }) => {
        const d = data.data;
        if (Array.isArray(d?.accepted_payment_methods) && d.accepted_payment_methods.length > 0) {
          setTenantPayMethods(d.accepted_payment_methods);
        }
        if (Array.isArray(d?.delivery_zones) && d.delivery_zones.length > 0) {
          setTenantZones(d.delivery_zones);
          setTenantZoneType(d.delivery_zone_type || 'named');
        }
        if (d?.restaurant_lat && d?.restaurant_lng) {
          setRestaurantCenter([parseFloat(d.restaurant_lng), parseFloat(d.restaurant_lat)]);
        }
      })
      .catch(() => { /* usa defaults */ });
  }, []);

  useEffect(() => {
    if (paymentMethod !== 'fiado') return;
    clearTimeout(fiadoTimer.current);
    fiadoTimer.current = setTimeout(() => {
      listFiadoClientes({ search: fiadoClienteSearch })
        .then(({ data }) => setFiadoClientes(data.data ?? []))
        .catch(() => {});
    }, 300);
  }, [paymentMethod, fiadoClienteSearch]);

  // Carrega lista completa de clientes para a sidebar do passo 1
  useEffect(() => {
    setCustLoading(true);
    searchCustomers('')
      .then(({ data }) => {
        setAllCustomers(data.data ?? []);
      })
      .catch((err) => {
        console.error('[NewOrderModal] Erro ao carregar clientes:', err?.response?.data?.message ?? err?.message);
      })
      .finally(() => setCustLoading(false));
  }, []);

  // Reset cashback quando modo retirada é ativado (sem histórico de cliente)
  useEffect(() => {
    if (pickupMode) { setCashbackBalance(0); setUseCashback(false); }
  }, [pickupMode]);

  // Quando seleciona cliente fiado, preenche nome e telefone automaticamente
  useEffect(() => {
    if (!fiadoClienteId) return;
    const client = fiadoClientes.find((c) => c.id === fiadoClienteId);
    if (!client) return;
    if (client.name)  setName(client.name);
    if (client.phone) setPhone(client.phone);
  }, [fiadoClienteId, fiadoClientes]);

  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Enter' && !e.shiftKey) {
        const tag = (e.target?.tagName ?? '').toLowerCase();
        if (tag === 'textarea' || tag === 'select') return;
        if (canAdvance() && !submitting && !showMapPicker) {
          e.preventDefault();
          goNext();
        }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, stepIndex, submitting, showMapPicker,
      name, cart, deliveryType, neighborhood, pickupMode,
      phone, splitMode, paymentMethod, fiadoClienteId]);

  // ── Cart ──────────────────────────────────────────────────
  const handleAdd = useCallback(async (p) => {
    // 1. Variações obrigatórias têm prioridade — abre o picker
    const varGroups = Array.isArray(p.variations) ? p.variations : [];
    if (varGroups.some((g) => g.required && g.options?.some((o) => o.available))) {
      setVarPickerProduct(p);
      setVarSelections({});
      return;
    }

    // 2. Addons (grupos opcionais)
    if (!(p.id in addonGroupsCache.current)) {
      try {
        const { data } = await getProductAddonGroups(p.id);
        addonGroupsCache.current[p.id] = data.data ?? [];
      } catch { addonGroupsCache.current[p.id] = []; }
    }
    const groups = addonGroupsCache.current[p.id] ?? [];
    if (groups.length > 0) {
      setAddonPickerProduct(p);
      setAddonPickerGroups(groups);
    } else {
      setCart((c) => addToCart(c, p));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleItemNotes = useCallback((id, val) =>
    setCart((c) => ({ ...c, [id]: { ...c[id], notes: val } })), []);

  const handleQty    = useCallback((id, qty) => {
    if (qty <= 0) setCart((c) => removeFromCart(c, id));
    else setCart((c) => ({ ...c, [id]: { ...c[id], qty } }));
  }, []);
  const handleWeight = useCallback((id, w) => setCart((c) => ({ ...c, [id]: { ...c[id], weightKg: w } })), []);
  const handleRemove = useCallback((id) => setCart((c) => removeFromCart(c, id)), []);

  // ── Autocomplete ──────────────────────────────────────────
  const fetchSuggestions = useCallback((q) => {
    clearTimeout(sugTimer.current);
    if (!q || q.length < 2) { setSuggestions([]); setShowSug(false); return; }
    sugTimer.current = setTimeout(async () => {
      try {
        const { data } = await searchCustomers(q);
        setSuggestions(data.data ?? []);
        setShowSug(true);
      } catch (err) {
        console.error('[NewOrderModal] Erro ao buscar clientes:', err?.response?.data?.message ?? err?.message);
      }
    }, 300);
  }, []);

  // ── Coupon ────────────────────────────────────────────────
  const handleValidateCoupon = useCallback(async () => {
    if (!couponCode.trim()) return;
    setCouponError('');
    setValidatingCoupon(true);
    try {
      const orderTot = cartTotal(cart) + (deliveryType === 'delivery' ? parseFloat(deliveryFee) || 0 : 0);
      const { data } = await validateCoupon({ code: couponCode.trim(), orderTotal: orderTot });
      setCouponResult(data.data);
    } catch (err) {
      setCouponError(err.response?.data?.message ?? 'Cupom inválido.');
      setCouponResult(null);
    } finally {
      setValidatingCoupon(false);
    }
  }, [couponCode, cart, deliveryType, deliveryFee]);

  const clearCoupon = () => { setCouponCode(''); setCouponResult(null); setCouponError(''); };

  const applySuggestion = (s) => {
    setName(s.name ?? s.customer_name ?? '');
    setPhone(s.phone ?? s.customer_phone ?? '');
    const bal = parseFloat(s.cashback_balance ?? 0);
    setCashbackBalance(bal);
    if (bal <= 0) setUseCashback(false);
    if (s.address ?? s.customer_address) {
      const s_address = s.address ?? s.customer_address;
      // Tenta separar "Rua X, 123, Complemento" em partes
      const parts = s_address.split(',').map((p) => p.trim());
      setStreet(parts[0] ?? '');
      setStreetNumber(parts[1] ?? '');
      setComplement(parts.slice(2).join(', '));
    }
    // Restaura bairro e taxa do último pedido do cliente
    if (s.neighborhood) {
      setNeighborhood(s.neighborhood);
      if (s.delivery_fee != null) setDeliveryFee(String(s.delivery_fee));
    }
    setShowSug(false);
    setSuggestions([]);
  };

  const handleAddNewCustomer = useCallback(async () => {
    if (!name.trim() || addingCustomer) return;
    setAddingCustomer(true);
    try {
      await createCustomer({ name: name.trim(), phone: phone.trim() || undefined });
      // Recarrega lista de clientes na sidebar
      const { data } = await searchCustomers('');
      const list = data.data ?? [];
      const seen = new Set();
      const unique = list.filter((c) => {
        const key = c.customer_phone?.trim() || c.customer_name?.trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setAllCustomers(unique);
    } catch { /* non-fatal — cliente ainda pode avançar sem salvar */ }
    finally {
      setAddingCustomer(false);
      setShowSug(false);
      setSuggestions([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, phone, addingCustomer]);

  // ── Navigation ─────────────────────────────────────────────
  const canAdvance = () => {
    if (stepIndex === 0) return name.trim().length > 0;
    if (stepIndex === 1) return Object.keys(cart).length > 0;
    if (stepIndex === 2) {
      // Bairro obrigatório apenas se não houver endereço manual já preenchido
      if (deliveryType === 'delivery' && !neighborhood && !street.trim()) return false;
      // Telefone obrigatório para entrega (exceto modo retirada)
      if (deliveryType === 'delivery' && !pickupMode && !phone.trim()) return false;
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

    const items = cartEntries.map(({ product, qty, weightKg, addons, notes: itemNotes, variation }) => {
      const varLabel = variation?.length
        ? ` (${variation.map((s) => s.optionName).join(', ')})`
        : '';
      const varPrice = variation?.length
        ? variation.reduce((s, sel) => s + (parseFloat(sel.price) || 0), 0)
        : null;
      return {
        productId:   product.id,
        productName: product.name + varLabel,
        ...(product.sale_type === 'kg' ? { weightKg: parseFloat(weightKg) } : { quantity: qty }),
        ...(varPrice != null ? { unitPrice: varPrice } : {}),
        ...(addons?.length ? { addons } : {}),
        ...(itemNotes?.trim() ? { notes: itemNotes.trim() } : {}),
      };
    });

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
    const subtotal = cartTotal(cart);
    const cbUsed = (!pickupMode && useCashback && cashbackBalance > 0)
      ? Math.min(cashbackBalance, subtotal + fee)
      : 0;
    const couponDiscount = couponResult?.discount ?? 0;
    const finalPayMethod = splitMode ? splitPayments[0]?.method ?? 'cash' : paymentMethod;

    try {
      const { data } = await createOrder({
        customerName:    name.trim(),
        // No modo "retirada", não envia telefone (sem histórico de cliente)
        customerPhone:   (!pickupMode && phone.trim()) || undefined,
        customerAddress: customerAddress               || undefined,
        neighborhood:    (neighborhood && neighborhood !== 'outro') ? neighborhood : undefined,
        deliveryType,
        paymentMethod:   finalPayMethod,
        deliveryFee:     fee,
        channel,
        notes: fullNotes || undefined,
        items,
        cashbackUsed:    cbUsed > 0 ? cbUsed : undefined,
        couponCode:      couponResult?.code || undefined,
        couponDiscount:  couponDiscount > 0 ? couponDiscount : undefined,
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
        className="relative w-full max-w-[760px] max-h-[88vh] rounded-2xl shadow-2xl flex flex-col border border-white/[0.08] overflow-hidden z-10"
        style={{ background: 'linear-gradient(160deg, #1a2332 0%, #1e293b 60%, #1a2332 100%)' }}
      >
        {/* Map picker overlay — cobre o modal inteiro */}
        {showMapPicker && (
          <MapAddressPicker
            initialStreet={street}
            restaurantCenter={restaurantCenter}
            onClose={() => setShowMapPicker(false)}
            onConfirm={({ street: s, streetNumber: sn, suburb, allSuburbs = [] }) => {
              // Aplica rua do mapa
              if (s) setStreet(s);
              // Se o Nominatim devolveu número (forward geocoding com número exato), aplica
              if (sn) setStreetNumber(sn);
              else setStreetNumber(''); // senão limpa — usuário digita

              let matchedZone = null;

              // ── Prioridade 1: polígono desenhado + coordenadas ──────
              if (tenantZoneType === 'polygon' && coords && tenantZones?.length > 0) {
                const hit = tenantZones.find((z) =>
                  z.polygon?.length >= 3 && pointInPolygon(coords, z.polygon)
                );
                if (hit) matchedZone = { bairro: hit.name, taxa: hit.fee };
              }

              // ── Prioridade 2: match textual por nome de bairro ──────
              if (!matchedZone) {
                const candidates = [...(allSuburbs || []), suburb].filter(Boolean);
                const normed = (s) => s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
                const zonesNamed = (tenantZones?.length > 0 && (tenantZoneType === 'named' || tenantZoneType === 'polygon'))
                  ? tenantZones.map((z) => ({ bairro: z.name, taxa: z.fee }))
                  : NEIGHBORHOODS;

                for (const candidate of candidates) {
                  const c = normed(candidate);
                  const exact = zonesNamed.find((nb) => normed(nb.bairro) === c);
                  if (exact) { matchedZone = exact; break; }
                }
                if (!matchedZone) {
                  for (const candidate of candidates) {
                    const c = normed(candidate);
                    const partial = zonesNamed.find(
                      (nb) => c.includes(normed(nb.bairro)) || normed(nb.bairro).includes(c)
                    );
                    if (partial) { matchedZone = partial; break; }
                  }
                }
                if (!matchedZone) {
                  for (const candidate of candidates) {
                    const words = normed(candidate).split(/\s+/).filter((w) => w.length > 3);
                    const wordMatch = zonesNamed.find(
                      (nb) => words.some((w) => normed(nb.bairro).includes(w))
                    );
                    if (wordMatch) { matchedZone = wordMatch; break; }
                  }
                }
              }

              if (matchedZone) {
                setNeighborhood(matchedZone.bairro);
                setDeliveryFee(String(matchedZone.taxa));
              }
              setShowMapPicker(false);
            }}
          />
        )}

        {/* Variation picker overlay */}
        {varPickerProduct && (
          <VariationPicker
            product={varPickerProduct}
            selections={varSelections}
            onSelect={(groupId, sel) => setVarSelections((prev) => ({ ...prev, [groupId]: sel }))}
            onClose={() => { setVarPickerProduct(null); setVarSelections({}); }}
            onConfirm={() => {
              const selArr = Object.entries(varSelections).map(([gid, sel]) => ({
                groupId: gid,
                groupName: varPickerProduct.variations.find((g) => g.id === gid)?.name ?? '',
                ...sel,
              }));
              setCart((c) => addToCart(c, varPickerProduct, [], selArr));
              setVarPickerProduct(null);
              setVarSelections({});
            }}
          />
        )}

        {/* Addon picker overlay */}
        <AnimatePresence>
          {addonPickerProduct && (
            <AddonPicker
              product={addonPickerProduct}
              groups={addonPickerGroups}
              currentAddons={cart[addonPickerProduct.id]?.addons ?? []}
              onClose={() => setAddonPickerProduct(null)}
              onConfirm={(addons) => {
                setCart((c) => addToCart(c, addonPickerProduct, addons));
                setAddonPickerProduct(null);
              }}
            />
          )}
        </AnimatePresence>

        {/* Header */}
        <div className="px-5 pt-4 pb-0 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-black text-white tracking-tight">Novo Pedido</h2>
              <p className="text-xs text-gray-500 mt-0.5">{currentStep.desc}</p>
            </div>
            <button onClick={onClose}
              className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Stepper premium com labels */}
          <div className="hidden md:flex items-end gap-0 -mx-5 px-5">
            {STEPS.map((s, i) => {
              const done    = i < stepIndex;
              const current = i === stepIndex;
              return (
                <div key={s.id} className="flex-1 flex flex-col items-center gap-1.5 relative pb-3">
                  {/* Connector line */}
                  {i > 0 && (
                    <div className={[
                      'absolute left-0 top-3.5 w-1/2 h-px -translate-y-1/2 transition-all duration-500',
                      done || current ? 'bg-orange-500/40' : 'bg-white/[0.07]',
                    ].join(' ')} />
                  )}
                  {i < STEPS.length - 1 && (
                    <div className={[
                      'absolute right-0 top-3.5 w-1/2 h-px -translate-y-1/2 transition-all duration-500',
                      done ? 'bg-orange-500/40' : 'bg-white/[0.07]',
                    ].join(' ')} />
                  )}

                  {/* Circle */}
                  <div className={[
                    'w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 z-10 relative',
                    done    ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/30'
                    : current ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/40 ring-2 ring-orange-500/30 scale-110'
                    :           'bg-gray-800 text-gray-600 ring-1 ring-white/[0.06]',
                  ].join(' ')}>
                    {done ? '✓' : <span className="text-xs">{i + 1}</span>}
                  </div>

                  {/* Label */}
                  <div className="text-center">
                    <p className={`text-[11px] font-semibold leading-none transition-colors ${current ? 'text-orange-400' : done ? 'text-green-500/70' : 'text-gray-600'}`}>
                      {s.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
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
            <div className={`flex-1 relative ${stepIndex === 1 ? 'overflow-hidden p-4' : stepIndex === 0 ? 'overflow-hidden p-5' : 'overflow-y-auto p-5'}`}>
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
                      applySuggestion={applySuggestion}
                      addNewCustomer={handleAddNewCustomer} addingCustomer={addingCustomer}
                      pickupMode={pickupMode} setPickupMode={setPickupMode}
                      deliveryType={deliveryType}
                      allCustomers={allCustomers} custLoading={custLoading} />
                  )}
                  {stepIndex === 1 && (
                    <StepItems products={products} loading={loading} search={search} setSearch={setSearch}
                      cart={cart} onAdd={handleAdd} onQty={handleQty} onWeight={handleWeight} onRemove={handleRemove} onItemNotes={handleItemNotes} />
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
                      fiadoClienteSearch={fiadoClienteSearch} setFiadoClienteSearch={setFiadoClienteSearch}
                      phoneOk={pickupMode || !!phone.trim()}
                      pickupMode={pickupMode}
                      cashbackBalance={cashbackBalance} useCashback={useCashback} setUseCashback={setUseCashback}
                      tenantPayMethods={tenantPayMethods}
                      tenantZones={tenantZones} tenantZoneType={tenantZoneType}
                      couponCode={couponCode} setCouponCode={setCouponCode}
                      couponResult={couponResult} couponError={couponError}
                      validatingCoupon={validatingCoupon}
                      onValidateCoupon={handleValidateCoupon} onClearCoupon={clearCoupon} />
                  )}
                  {stepIndex === 3 && (
                    <StepReview name={name} phone={phone} cart={cart} deliveryType={deliveryType}
                      street={street} streetNumber={streetNumber} complement={complement}
                      neighborhood={neighborhood} deliveryFee={deliveryFee}
                      paymentMethod={paymentMethod} splitMode={splitMode} splitPayments={splitPayments}
                      channel={channel} notes={notes} scheduledFor={scheduledFor}
                      fiadoClientes={fiadoClientes} fiadoClienteId={fiadoClienteId}
                      useCashback={useCashback} cashbackBalance={cashbackBalance} pickupMode={pickupMode}
                      couponResult={couponResult} />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-white/[0.06] flex items-center justify-between shrink-0"
              style={{ background: 'linear-gradient(0deg, #141f2e 0%, #1a2332 100%)' }}>
              <button onClick={goBack}
                className="px-5 py-2.5 rounded-xl text-sm text-gray-500 hover:text-white hover:bg-white/[0.07] transition-all font-semibold border border-transparent hover:border-white/10">
                {stepIndex === 0 ? 'Cancelar' : '← Voltar'}
              </button>

              {error && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-1.5 flex-1 mx-4 text-center">
                  {error}
                </motion.p>
              )}

              <motion.button
                onClick={goNext}
                disabled={!canAdvance() || submitting}
                whileHover={canAdvance() && !submitting ? { scale: 1.02 } : {}}
                whileTap={canAdvance() && !submitting ? { scale: 0.98 } : {}}
                className={[
                  'px-6 py-2.5 rounded-xl text-sm font-bold transition-all relative overflow-hidden',
                  canAdvance() && !submitting
                    ? isLastStep
                      ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/30'
                      : 'bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-500/30'
                    : 'bg-gray-800/80 text-gray-600 cursor-not-allowed',
                ].join(' ')}
              >
                {/* Glow pulse quando válido */}
                {canAdvance() && !submitting && !isLastStep && (
                  <span className="absolute inset-0 rounded-xl bg-orange-400/20 animate-pulse pointer-events-none" />
                )}
                <span className="relative flex items-center gap-1.5">
                  {submitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Enviando...
                    </>
                  ) : isLastStep ? '✓ Confirmar Pedido' : (
                    <>
                      {stepIndex === 1 && cartCount > 0 && (
                        <span className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">{cartCount}</span>
                      )}
                      Próximo →
                    </>
                  )}
                </span>
              </motion.button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
