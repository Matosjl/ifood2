import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Map, MapControls,
  MapMarker, MarkerContent, MarkerTooltip, MarkerPopup,
  MapRoute,
} from '../components/ui/map';
import { getOrders, updateOrderStatus } from '../api/orders';

// ── Constants ─────────────────────────────────────────────────

// Brazil center (fallback when no GPS)
const BRAZIL_CENTER = [-47.9292, -15.7801];

// OSRM public endpoint (free, no key)
const OSRM = 'https://router.project-osrm.org/route/v1/driving';

// Nominatim geocoding (free, no key)
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// ── Helpers ────────────────────────────────────────────────────

const fmt = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2)}`;

// Status label map
const STATUS_LABELS = {
  pending:    'Pendente',
  confirmed:  'Confirmado',
  preparing:  'Em preparo',
  ready:      'Pronto p/ entrega',
  delivering: 'Saiu p/ entrega',
  delivered:  'Entregue',
};

// Torres RS bounding box (viewbox para Nominatim priorizar resultados locais)
const TORRES_VIEWBOX = '-49.80,-29.45,-49.65,-29.28';

// Geocode an address string → [lng, lat] or null
// Sempre injeta "Torres RS" se o endereço não mencionar a cidade
async function geocodeAddress(address, neighborhood = '') {
  if (!address) return null;
  const hasCity = /torres|rs\b/i.test(address);
  const query   = hasCity
    ? address
    : [address, neighborhood, 'Torres RS'].filter(Boolean).join(', ');
  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1` +
                `&countrycodes=br&viewbox=${TORRES_VIEWBOX}&bounded=0`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
    const data = await res.json();
    if (data?.[0]) return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
  } catch { /* non-fatal */ }
  return null;
}

// Fetch OSRM route between two [lng,lat] points
async function fetchRoute(from, to) {
  if (!from || !to) return null;
  try {
    const url = `${OSRM}/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;
    const res  = await fetch(url);
    const data = await res.json();
    return data?.routes?.[0]?.geometry?.coordinates ?? null;
  } catch { /* non-fatal */ }
  return null;
}

// ── Driver marker (pulsing blue dot) ─────────────────────────

function DriverMarkerContent() {
  return (
    <div className="relative">
      {/* Pulse ring */}
      <span className="absolute inset-0 rounded-full bg-blue-500/30 animate-ping" style={{ animationDuration: '1.5s' }} />
      {/* Inner dot */}
      <div className="relative h-5 w-5 rounded-full bg-blue-500 border-2 border-white shadow-lg flex items-center justify-center">
        <span className="text-[8px]">🛵</span>
      </div>
    </div>
  );
}

// ── Delivery marker (order number pin) ───────────────────────

function DeliveryMarkerContent({ orderNumber, active }) {
  return (
    <div className={[
      'flex items-center justify-center rounded-full border-2 shadow-lg font-black transition-all',
      'px-2 h-7 min-w-[28px] text-xs',
      active
        ? 'bg-orange-500 border-white text-white scale-125 shadow-orange-500/40'
        : 'bg-gray-900 border-orange-400 text-orange-300 hover:scale-110',
    ].join(' ')}>
      #{orderNumber}
    </div>
  );
}

// ── Order popup (detail card on map) ─────────────────────────

const PAYMENT_LABELS = {
  cash: 'Dinheiro', pix: 'Pix', credit: 'Crédito',
  debit: 'Débito', voucher: 'Vale-Ref.', other: 'Outro',
};

function OrderPopup({ order, delivering, onDeliver, onRoute, onPin, isPinning }) {
  const items     = order.items ?? [];
  const payment   = PAYMENT_LABELS[order.payment_method] ?? order.payment_method ?? '—';
  const address   = order.customer_address ?? '';
  const mapsUrl   = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  const wazeUrl   = `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;

  return (
    <div className="space-y-2 min-w-[220px] max-w-[260px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-black text-white text-base">#{order.orderNumber}</span>
        <span className={[
          'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
          order.status === 'delivered'  ? 'bg-green-500/20 text-green-300' :
          order.status === 'delivering' ? 'bg-blue-500/20 text-blue-300' :
          order.status === 'ready'      ? 'bg-orange-500/20 text-orange-300' :
          order.status === 'preparing'  ? 'bg-yellow-500/20 text-yellow-300' :
                                          'bg-gray-500/20 text-gray-400',
        ].join(' ')}>
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>

      {/* Cliente */}
      {order.customerName && (
        <p className="text-sm font-semibold text-gray-200">{order.customerName}</p>
      )}
      {order.customerPhone && (
        <p className="text-xs text-gray-400">📞 {order.customerPhone}</p>
      )}

      {/* Endereço / bairro */}
      {(order.neighborhood || address) && (
        <div className="bg-gray-800 rounded-lg px-2.5 py-1.5 space-y-0.5">
          {order.neighborhood && (
            <p className="text-xs font-bold text-orange-300">📌 {order.neighborhood}</p>
          )}
          {address && (
            <p className="text-xs text-gray-400">📍 {address}</p>
          )}
        </div>
      )}

      {/* Itens */}
      {items.length > 0 && (
        <div className="space-y-0.5">
          {items.slice(0, 3).map((it, i) => (
            <p key={i} className="text-xs text-gray-400 truncate">
              · {it.quantity ?? it.weight_kg + 'kg'}× {it.product_name}
            </p>
          ))}
          {items.length > 3 && (
            <p className="text-xs text-gray-500">+{items.length - 3} item(s)…</p>
          )}
        </div>
      )}

      {/* Total + pagamento */}
      <div className="flex items-center justify-between pt-1 border-t border-white/10">
        <span className="text-sm font-black text-orange-400">{fmt(order.total)}</span>
        <span className="text-xs text-gray-400">{payment}</span>
      </div>

      {/* Fixar localização manualmente */}
      <button onClick={onPin}
        className={[
          'w-full py-1.5 rounded-lg text-xs font-bold transition-colors',
          isPinning
            ? 'bg-purple-500 text-white animate-pulse'
            : 'bg-gray-700 hover:bg-gray-600 text-gray-200',
        ].join(' ')}>
        {isPinning ? '🎯 Clique no mapa para fixar…' : '📍 Fixar localização no mapa'}
      </button>

      {/* Ações de navegação */}
      {address && (
        <div className="flex gap-1.5">
          <a href={mapsUrl} target="_blank" rel="noreferrer"
            className="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold text-center transition-colors">
            🗺️ Maps
          </a>
          <a href={wazeUrl} target="_blank" rel="noreferrer"
            className="flex-1 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold text-center transition-colors">
            🔵 Waze
          </a>
        </div>
      )}

      {/* Rota interna */}
      <button onClick={onRoute}
        className="w-full py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-colors">
        🛣️ Calcular Rota no Mapa
      </button>

      {/* Marcar entregue */}
      {order.status !== 'delivered' && (
        <button onClick={() => onDeliver(order.id)} disabled={delivering === order.id}
          className="w-full py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-bold transition-colors disabled:opacity-50">
          {delivering === order.id ? 'Registrando...' : '✓ Marcar como Entregue'}
        </button>
      )}
    </div>
  );
}

// ── Order card (sidebar) ───────────────────────────────────────

function OrderCard({ order, active, onSelect, onDeliver, delivering, onPin, isPinning, hasCoords }) {
  return (
    <button
      onClick={() => onSelect(order)}
      className={[
        'w-full text-left rounded-xl border p-3 transition-all',
        active
          ? 'bg-orange-500/10 border-orange-500/40 ring-1 ring-orange-500/30'
          : 'bg-gray-800/60 border-white/[0.06] hover:border-orange-500/30 hover:bg-gray-800',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-black text-white">#{order.orderNumber}</span>
        <span className={[
          'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
          order.status === 'delivered'  ? 'bg-green-500/20 text-green-300' :
          order.status === 'delivering' ? 'bg-blue-500/20 text-blue-300' :
          order.status === 'ready'      ? 'bg-orange-500/20 text-orange-300' :
          order.status === 'preparing'  ? 'bg-yellow-500/20 text-yellow-300' :
                                          'bg-gray-500/20 text-gray-400',
        ].join(' ')}>
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>

      {order.customerName && (
        <p className="text-xs text-gray-300 truncate font-medium">{order.customerName}</p>
      )}
      {order.customerAddress && (
        <p className="text-xs text-gray-500 truncate mt-0.5" title={order.customerAddress}>
          📍 {order.customerAddress}
        </p>
      )}

      <div className="flex items-center justify-between mt-2 gap-1">
        <span className="text-sm font-semibold text-white">{fmt(order.total)}</span>
        <div className="flex gap-1">
          {/* Botão fixar pin — aparece para pedidos sem coords ou quando coords erradas */}
          {onPin && (
            <button
              onClick={(e) => { e.stopPropagation(); onPin(); }}
              title="Fixar localização no mapa"
              className={[
                'px-2 py-1 rounded-lg text-xs font-semibold transition-colors',
                isPinning
                  ? 'bg-purple-500 text-white animate-pulse'
                  : hasCoords
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-400'
                    : 'bg-purple-600/30 hover:bg-purple-600/60 text-purple-300',
              ].join(' ')}
            >
              📍
            </button>
          )}
          {order.status !== 'delivered' && (
            <button
              onClick={(e) => { e.stopPropagation(); onDeliver(order.id); }}
              disabled={delivering === order.id}
              className="px-2.5 py-1 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {delivering === order.id ? '...' : '✓ Entregue'}
            </button>
          )}
          {order.status === 'delivered' && (
            <span className="text-xs text-green-400 font-semibold self-center">✓ Entregue</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────

export default function EntregasPage() {
  const [orders,         setOrders]         = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [driverPos,      setDriverPos]      = useState(null);   // [lng, lat]
  const [geoError,       setGeoError]       = useState(null);
  const [coords,         setCoords]         = useState({});     // orderId → [lng, lat]
  const [activeOrder,    setActiveOrder]    = useState(null);
  const [route,          setRoute]          = useState([]);     // [[lng,lat],...]
  const [routeLoading,   setRouteLoading]   = useState(false);
  const [delivering,     setDelivering]     = useState(null);   // orderId being updated
  const [mapCenter,      setMapCenter]      = useState(BRAZIL_CENTER);
  const [mapZoom,        setMapZoom]        = useState(12);
  const [pinningOrderId, setPinningOrderId] = useState(null); // orderId aguardando pin manual
  const watchIdRef = useRef(null);
  const mapRef     = useRef(null);

  // ── Load delivery orders ──────────────────────────────────
  const loadOrders = useCallback(async () => {
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data } = await getOrders({ limit: 100, startDate: today.toISOString() });
      const deliveries = (data.data ?? []).filter(
        (o) => o.delivery_type === 'delivery' && o.status !== 'cancelled'
      );
      // Só atualiza se algo mudou — evita re-renders desnecessários no polling
      setOrders((prev) => {
        const prevSig = prev.map((o) => `${o.id}:${o.status}`).join(',');
        const nextSig = deliveries.map((o) => `${o.id}:${o.status}`).join(',');
        return prevSig === nextSig ? prev : deliveries;
      });
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Poll every 30s for new ready orders
  useEffect(() => {
    const id = setInterval(loadOrders, 30_000);
    return () => clearInterval(id);
  }, [loadOrders]);

  // ── GPS tracking ──────────────────────────────────────────
  // Coordenadas fixas do estabelecimento (fallback quando GPS bloqueado — ex: HTTP sem HTTPS)
  // Estrada dos Cunhas 1203, Sala N2, Itapeva, Torres RS
  const CITY_FALLBACK = [-49.7802, -29.3965]; // Estrada dos Cunhas 1203, Sala 2, Itapeva, Torres RS

  useEffect(() => {
    const useFallback = (msg) => {
      setGeoError(`${msg} — usando localização da cidade`);
      setDriverPos(CITY_FALLBACK);
    };

    if (!('geolocation' in navigator)) { useFallback('GPS não disponível'); return; }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const next = [pos.coords.longitude, pos.coords.latitude];
        setDriverPos(next);
        setMapCenter((prev) => prev);
      },
      (err) => useFallback(err.message),
      { enableHighAccuracy: true, maximumAge: 5_000 },
    );
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // Center map on driver position once we get it
  useEffect(() => {
    if (driverPos && !activeOrder) {
      setMapCenter(driverPos);
      setMapZoom(14);
    }
  }, [driverPos]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Geocode delivery addresses ────────────────────────────
  useEffect(() => {
    const pending = orders.filter(
      (o) => o.customer_address && !coords[o.id]
    );
    pending.forEach(async (o) => {
      const c = await geocodeAddress(o.customer_address, o.neighborhood);
      if (c) setCoords((prev) => ({ ...prev, [o.id]: c }));
    });
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pin manual: clique no mapa fixa a localização do pedido ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!pinningOrderId) {
      map.getCanvas().style.cursor = '';
      return;
    }
    map.getCanvas().style.cursor = 'crosshair';
    const handleClick = (e) => {
      const { lng, lat } = e.lngLat;
      setCoords((prev) => ({ ...prev, [pinningOrderId]: [lng, lat] }));
      setPinningOrderId(null);
      map.getCanvas().style.cursor = '';
    };
    map.on('click', handleClick);
    return () => { map.off('click', handleClick); map.getCanvas().style.cursor = ''; };
  }, [pinningOrderId]);

  // ── Select order → show route ─────────────────────────────
  const handleSelect = useCallback(async (order) => {
    setActiveOrder(order);
    setRoute([]);

    const dest = coords[order.id];
    const from = driverPos;
    if (!from || !dest) return;

    // Fly map to the route midpoint
    const midLng = (from[0] + dest[0]) / 2;
    const midLat = (from[1] + dest[1]) / 2;
    setMapCenter([midLng, midLat]);
    setMapZoom(13);

    setRouteLoading(true);
    const routeCoords = await fetchRoute(from, dest);
    if (routeCoords) setRoute(routeCoords);
    setRouteLoading(false);
  }, [coords, driverPos]);

  // ── Mark delivered ────────────────────────────────────────
  const handleDeliver = useCallback(async (id) => {
    setDelivering(id);
    try {
      await updateOrderStatus(id, 'delivered');
      setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status: 'delivered' } : o));
      if (activeOrder?.id === id) { setActiveOrder(null); setRoute([]); }
    } catch { /* non-fatal */ }
    finally { setDelivering(null); }
  }, [activeOrder]);

  // ── Active deliveries (non-delivered) ─────────────────────
  const activeDeliveries = orders.filter((o) => o.status !== 'delivered');
  const delivered        = orders.filter((o) => o.status === 'delivered');

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">

      {/* Header */}
      <div className="px-5 py-3 bg-gray-900/80 backdrop-blur border-b border-white/5 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-base font-black text-white">🛵 Mapa de Entregas</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {activeDeliveries.length} pendente{activeDeliveries.length !== 1 ? 's' : ''}
            {delivered.length > 0 && ` · ${delivered.length} entregue${delivered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {geoError && (
          <span className="text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded-lg">
            ⚠️ GPS: {geoError}
          </span>
        )}
        {!geoError && driverPos && (
          <span className="text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-lg">
            📡 GPS ativo
          </span>
        )}
      </div>

      {/* Body: map + sidebar */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-72 shrink-0 flex flex-col border-r border-white/[0.06] bg-gray-900/60 overflow-hidden">
          <div className="p-2 overflow-y-auto flex-1 space-y-2">

            {loading && (
              <div className="flex items-center justify-center h-32">
                <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!loading && activeDeliveries.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-600">
                <span className="text-4xl">🛵</span>
                <p className="text-sm italic text-center">Nenhuma entrega pendente</p>
              </div>
            )}

            {activeDeliveries.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                active={activeOrder?.id === order.id}
                onSelect={handleSelect}
                onDeliver={handleDeliver}
                delivering={delivering}
                onPin={() => { setPinningOrderId((p) => p === order.id ? null : order.id); setActiveOrder(order); }}
                isPinning={pinningOrderId === order.id}
                hasCoords={!!coords[order.id]}
              />
            ))}

            {delivered.length > 0 && (
              <>
                <div className="px-1 pt-2 pb-1">
                  <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Entregues hoje</p>
                </div>
                {delivered.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    active={false}
                    onSelect={() => {}}
                    onDeliver={() => {}}
                    delivering={null}
                  />
                ))}
              </>
            )}
          </div>

          {/* Route info bar */}
          {activeOrder && (
            <div className="p-3 border-t border-white/[0.06] bg-gray-800/60 shrink-0">
              <p className="text-xs font-semibold text-orange-400 truncate">
                📦 #{activeOrder.orderNumber} · {activeOrder.customerName ?? '—'}
              </p>
              <p className="text-[11px] text-gray-400 truncate mt-0.5">
                {activeOrder.customer_address ?? 'Endereço não informado'}
              </p>
              {routeLoading && (
                <p className="text-xs text-gray-500 mt-1 animate-pulse">Calculando rota...</p>
              )}
              {route.length > 0 && !routeLoading && (
                <p className="text-xs text-green-400 mt-1">✓ Rota calculada</p>
              )}
              {!driverPos && (
                <p className="text-xs text-yellow-400 mt-1">⚠️ GPS necessário para rota</p>
              )}
              <button
                onClick={() => { setActiveOrder(null); setRoute([]); }}
                className="mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                ✕ Fechar rota
              </button>
            </div>
          )}
        </aside>

        {/* Map */}
        <div className="flex-1 min-w-0 relative">
          {/* Banner modo pin */}
          {pinningOrderId && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold shadow-xl flex items-center gap-2">
              🎯 Clique no mapa para fixar a localização do pedido
              <button onClick={() => setPinningOrderId(null)} className="ml-1 text-purple-200 hover:text-white">✕</button>
            </div>
          )}
          <Map
            ref={mapRef}
            center={mapCenter}
            zoom={mapZoom}
            theme="dark"
            className="h-full w-full"
          >
            <MapControls
              position="top-right"
              showZoom
              showLocate
              showFullscreen
              onLocate={({ longitude, latitude }) => {
                setDriverPos([longitude, latitude]);
                setMapCenter([longitude, latitude]);
                setMapZoom(15);
              }}
            />

            {/* Driver position */}
            {driverPos && (
              <MapMarker longitude={driverPos[0]} latitude={driverPos[1]}>
                <MarkerContent>
                  <DriverMarkerContent />
                </MarkerContent>
                <MarkerTooltip>Você está aqui</MarkerTooltip>
              </MapMarker>
            )}

            {/* Delivery markers */}
            {activeDeliveries.map((order) => {
              const pos = coords[order.id];
              if (!pos) return null;
              const isActive = activeOrder?.id === order.id;
              return (
                <MapMarker
                  key={order.id}
                  longitude={pos[0]}
                  latitude={pos[1]}
                  onClick={() => handleSelect(order)}
                >
                  <MarkerContent>
                    <DeliveryMarkerContent orderNumber={order.order_number ?? order.orderNumber} active={isActive} />
                  </MarkerContent>
                  {isActive && (
                    <MarkerPopup closeButton onClose={() => { setActiveOrder(null); setRoute([]); }}>
                      <OrderPopup
                        order={order}
                        delivering={delivering}
                        onDeliver={handleDeliver}
                        onRoute={() => handleSelect(order)}
                        onPin={() => { setPinningOrderId((p) => p === order.id ? null : order.id); }}
                        isPinning={pinningOrderId === order.id}
                      />
                    </MarkerPopup>
                  )}
                </MapMarker>
              );
            })}

            {/* Route line */}
            {route.length >= 2 && (
              <MapRoute
                coordinates={route}
                color="#f97316"
                width={4}
                opacity={0.85}
              />
            )}

            {/* Straight-line fallback while geocoding */}
            {activeOrder && driverPos && coords[activeOrder.id] && route.length < 2 && !routeLoading && (
              <MapRoute
                id="fallback"
                coordinates={[driverPos, coords[activeOrder.id]]}
                color="#f97316"
                width={3}
                opacity={0.5}
                dashArray={[4, 4]}
              />
            )}
          </Map>

          {/* Empty state overlay */}
          {!loading && orders.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-950/60 backdrop-blur-sm">
              <div className="text-center space-y-3">
                <span className="text-5xl">🛵</span>
                <p className="text-white font-black text-lg">Sem entregas hoje</p>
                <p className="text-gray-400 text-sm">
                  Pedidos com entrega e status "Pronto" aparecerão aqui.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
