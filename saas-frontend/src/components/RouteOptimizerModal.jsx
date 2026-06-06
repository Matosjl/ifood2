import { useState, useEffect } from 'react';
import {
  priorityRoute,
  economicRoute,
  googleMapsRouteUrl,
  wazeRouteUrl,
} from '../utils/routeOptimizer';

// ── Nominatim geocoding (igual ao DriverApp) ──────────────────────────────
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

async function geocode(address) {
  if (!address) return null;
  // D6: endereço do mapa já inclui cidade — sem injeção de cidade hardcoded
  const query = address;
  try {
    const res  = await fetch(
      `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    );
    const data = await res.json();
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { /* non-fatal */ }
  return null;
}

// ── Helpers de formatação ─────────────────────────────────────────────────
const fmt = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2)}`;

function fmtTime(orderTime) {
  if (!orderTime) return '';
  return new Date(orderTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ── Componente de card de rota ────────────────────────────────────────────

function RouteCard({ route, type, onChoose, chosen }) {
  const isPriority = type === 'priority';
  const accent     = isPriority ? 'blue' : 'green';

  const accentClasses = {
    blue:  { border: 'border-blue-500',  bg: 'bg-blue-600',  light: 'bg-blue-50',  text: 'text-blue-700',  badge: 'bg-blue-100 text-blue-700'  },
    green: { border: 'border-green-500', bg: 'bg-green-600', light: 'bg-green-50', text: 'text-green-700', badge: 'bg-green-100 text-green-700' },
  }[accent];

  const mapsUrl = googleMapsRouteUrl(route.origin, route.stops);
  const wazeUrl = wazeRouteUrl(route.stops[route.stops.length - 1]);

  return (
    <div
      className={`flex-1 rounded-2xl border-2 overflow-hidden transition-all ${
        chosen ? accentClasses.border + ' shadow-lg scale-[1.01]' : 'border-gray-200'
      }`}
      onClick={() => onChoose(type)}
    >
      {/* Header */}
      <div className={`${chosen ? accentClasses.bg : 'bg-gray-100'} px-3 py-2.5 flex items-center gap-2`}>
        <span className="text-xl">{isPriority ? '⏰' : '⚡'}</span>
        <div>
          <p className={`font-black text-sm ${chosen ? 'text-white' : 'text-gray-700'}`}>
            {isPriority ? 'Por Horário' : 'Rota Econômica'}
          </p>
          <p className={`text-xs ${chosen ? 'text-white/80' : 'text-gray-500'}`}>
            {isPriority ? 'Mais urgentes primeiro' : 'Menor distância total'}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className={`flex gap-0 border-b ${chosen ? accentClasses.light : 'bg-white'}`}>
        <div className="flex-1 text-center py-2 border-r border-gray-100">
          <p className={`text-base font-black ${chosen ? accentClasses.text : 'text-gray-700'}`}>
            {route.totalKm} km
          </p>
          <p className="text-[10px] text-gray-400">distância</p>
        </div>
        <div className="flex-1 text-center py-2">
          <p className={`text-base font-black ${chosen ? accentClasses.text : 'text-gray-700'}`}>
            ~{route.totalMinutes} min
          </p>
          <p className="text-[10px] text-gray-400">estimado</p>
        </div>
      </div>

      {/* Stops list */}
      <div className="bg-white px-3 py-2 space-y-1.5">
        {route.stops.map((stop, idx) => (
          <div key={stop.id} className="flex items-start gap-2">
            <span className={`shrink-0 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center mt-0.5 ${
              chosen ? accentClasses.badge : 'bg-gray-100 text-gray-500'
            }`}>
              {idx + 1}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">
                {stop.customer || 'Cliente'} · #{stop.orderNumber}
              </p>
              <p className="text-[10px] text-gray-400 truncate">{stop.address}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {stop.createdAt && (
                  <span className="text-[10px] text-gray-400">🕐 {fmtTime(stop.createdAt)}</span>
                )}
                {stop.fee > 0 && (
                  <span className={`text-[10px] font-bold ${chosen ? accentClasses.text : 'text-green-600'}`}>
                    {fmt(stop.fee)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation buttons */}
      {chosen && (
        <div className="bg-white px-3 pb-3 pt-1 flex gap-2">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex-1 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white text-center"
          >
            🗺️ Google Maps
          </a>
          <a
            href={wazeUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex-1 py-2 rounded-xl text-xs font-bold bg-cyan-500 text-white text-center"
          >
            🔵 Waze
          </a>
        </div>
      )}
    </div>
  );
}

// ── Modal principal ───────────────────────────────────────────────────────

/**
 * RouteOptimizerModal
 *
 * Props:
 *   deliveries  — lista de entregas ativas (do estado `active` do DriverApp)
 *   driverLat   — lat do motoboy (ou null)
 *   driverLng   — lng do motoboy (ou null)
 *   onClose     — callback ao fechar
 */
export default function RouteOptimizerModal({ deliveries, driverLat, driverLng, onClose }) {
  const [status,  setStatus]  = useState('geocoding'); // geocoding | ready | error
  const [routes,  setRoutes]  = useState(null);        // { priority, economic }
  const [chosen,  setChosen]  = useState('economic');
  const [errMsg,  setErrMsg]  = useState('');

  // Origem = posição do motoboy, ou centro de Torres como fallback
  const origin = {
    lat: driverLat ?? -29.3377,
    lng: driverLng ?? -49.7295,
    name: 'Você',
  };

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      try {
        setStatus('geocoding');

        // Geocodifica entregas que não têm coordenadas
        const geocoded = await Promise.all(
          deliveries.map(async (d) => {
            if (d.lat && d.lng) {
              return { ...d };
            }
            const coords = await geocode(d.customer_address || d.address || '');
            return {
              ...d,
              lat: coords?.lat ?? origin.lat,
              lng: coords?.lng ?? origin.lng,
            };
          })
        );

        if (cancelled) return;

        // Normaliza campos para o otimizador
        const normalized = geocoded.map((d) => ({
          id:          d.delivery_id || d.id,
          orderId:     d.order_id    || d.orderId,
          orderNumber: d.order_number,
          customer:    d.customer_name || d.customer,
          address:     d.customer_address || d.address || '',
          neighborhood:d.neighborhood || '',
          lat:         d.lat,
          lng:         d.lng,
          createdAt:   d.created_at  || d.createdAt  || d.accepted_at,
          fee:         parseFloat(d.driver_fee ?? d.fee ?? 0),
          total:       parseFloat(d.total ?? 0),
          paymentMethod: d.payment_method,
          // original data passado adiante
          _raw: d,
        }));

        const priority = priorityRoute(normalized, origin);
        const economic = economicRoute(normalized, origin);

        // Adiciona origin para gerar URL de Maps
        priority.origin = origin;
        economic.origin = origin;

        setRoutes({ priority, economic });
        setStatus('ready');

        // Sugere econômica por padrão se economizar >= 0.5km
        if (priority.totalKm - economic.totalKm < 0.5) {
          setChosen('priority');
        }
      } catch (err) {
        if (!cancelled) {
          setErrMsg(err.message || 'Erro ao calcular rotas');
          setStatus('error');
        }
      }
    }

    prepare();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 z-[80] flex items-end justify-center">
      <div className="bg-gray-50 w-full max-w-md rounded-t-3xl overflow-hidden shadow-2xl flex flex-col"
           style={{ maxHeight: '92vh' }}>

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 px-4 py-3 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-white font-black text-base">🗺️ Roteirizar Entregas</h2>
            <p className="text-blue-200 text-xs">{deliveries.length} entrega{deliveries.length > 1 ? 's' : ''} para otimizar</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-lg">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* Loading */}
          {status === 'geocoding' && (
            <div className="text-center py-16">
              <div className="w-12 h-12 rounded-full border-4 border-blue-600 border-t-transparent animate-spin mx-auto mb-4" />
              <p className="text-gray-600 font-semibold text-sm">Calculando rotas...</p>
              <p className="text-gray-400 text-xs mt-1">Buscando coordenadas dos endereços</p>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="text-center py-12">
              <p className="text-3xl mb-3">😕</p>
              <p className="text-gray-700 font-semibold">Não foi possível calcular as rotas</p>
              <p className="text-red-500 text-sm mt-1">{errMsg}</p>
              <button onClick={onClose}
                className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold">
                Fechar
              </button>
            </div>
          )}

          {/* Rotas prontas */}
          {status === 'ready' && routes && (
            <>
              {/* Instruções */}
              <p className="text-xs text-gray-500 text-center mb-3">
                Toque em uma rota para selecioná-la, depois toque em <strong>Navegar</strong>
              </p>

              {/* Economia de km */}
              {routes.priority.totalKm - routes.economic.totalKm >= 0.5 && (
                <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-3 flex items-center gap-2">
                  <span className="text-green-600 text-lg">💡</span>
                  <p className="text-xs text-green-700">
                    A rota econômica economiza{' '}
                    <strong>{(routes.priority.totalKm - routes.economic.totalKm).toFixed(1)} km</strong>{' '}
                    e ~{routes.priority.totalMinutes - routes.economic.totalMinutes} min em relação à prioridade.
                  </p>
                </div>
              )}

              {/* Cards lado a lado */}
              <div className="flex gap-3">
                <RouteCard
                  route={routes.priority}
                  type="priority"
                  chosen={chosen === 'priority'}
                  onChoose={setChosen}
                />
                <RouteCard
                  route={routes.economic}
                  type="economic"
                  chosen={chosen === 'economic'}
                  onChoose={setChosen}
                />
              </div>

              {/* Nota */}
              <p className="text-[10px] text-gray-400 text-center mt-3">
                Distâncias estimadas em linha reta · tempos baseados em 30 km/h em área urbana
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
