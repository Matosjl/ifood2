/**
 * DeliveryMapPicker — Uber-style map picker for delivery address.
 *
 * - Pin fixed at center, map moves underneath (like iFood / Uber)
 * - Debounced reverse geocode via Nominatim on every moveend
 * - Real-time delivery fee + ETA based on delivery_zones config
 * - Zone detection: alerts when outside all zones
 *
 * Props:
 *   initialLat / initialLng  — starting center (restaurant coords or user GPS)
 *   deliveryZones             — tenant.delivery_zones (JSONB array)
 *   deliveryZoneType          — 'named' | 'radius'
 *   onConfirm({ lat, lng, address, neighborhood, city, cep, fee, eta, outsideZone })
 *   onClose()
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Haversine distance in km
function distKm(lat1, lng1, lat2, lng2) {
  const R   = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a   = Math.sin(dLat / 2) ** 2 +
              Math.cos((lat1 * Math.PI) / 180) *
              Math.cos((lat2 * Math.PI) / 180) *
              Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Given pin coords + delivery_zones config, return { fee, eta, outsideZone }.
 * Supports two zone types:
 *   'radius'  → zones: [{ radius_km, fee, eta_min, eta_max }] sorted by radius asc
 *   'named'   → zones: [{ name, fee, eta_min, eta_max }]  (matched by neighborhood text)
 */
function calcFeeEta(lat, lng, zones, zoneType, restaurantLat, restaurantLng, neighborhood) {
  if (!zones || zones.length === 0) return { fee: 0, eta: null, outsideZone: false };

  if (zoneType === 'radius' && restaurantLat && restaurantLng) {
    const dist = distKm(lat, lng, parseFloat(restaurantLat), parseFloat(restaurantLng));
    const sorted = [...zones].sort((a, b) => (a.radius_km ?? 99) - (b.radius_km ?? 99));
    for (const z of sorted) {
      if (dist <= (z.radius_km ?? 99)) {
        return {
          fee:         parseFloat(z.fee ?? 0),
          eta:         z.eta_min && z.eta_max ? `${z.eta_min}-${z.eta_max}min` : null,
          outsideZone: false,
          dist:        dist.toFixed(1),
        };
      }
    }
    // Beyond all zones
    const maxZone = sorted[sorted.length - 1];
    return {
      fee:         parseFloat(maxZone?.fee ?? 0),
      eta:         null,
      outsideZone: true,
      dist:        dist.toFixed(1),
    };
  }

  // Named zones — match by neighborhood (case-insensitive partial)
  if (zoneType === 'named' && neighborhood) {
    const nb = neighborhood.toLowerCase();
    const match = zones.find((z) => nb.includes((z.name ?? '').toLowerCase()) || (z.name ?? '').toLowerCase().includes(nb));
    if (match) {
      return {
        fee:         parseFloat(match.fee ?? 0),
        eta:         match.eta_min && match.eta_max ? `${match.eta_min}-${match.eta_max}min` : null,
        outsideZone: false,
      };
    }
    // Not matched → first zone as default or outside
    if (zones.length > 0) {
      return { fee: parseFloat(zones[0].fee ?? 0), eta: null, outsideZone: false };
    }
  }

  // Fallback: return first zone fee
  return { fee: parseFloat(zones[0]?.fee ?? 0), eta: null, outsideZone: false };
}

export default function DeliveryMapPicker({
  initialLat,
  initialLng,
  deliveryZones = [],
  deliveryZoneType = 'named',
  restaurantLat,
  restaurantLng,
  onConfirm,
  onClose,
}) {
  const mapContainer = useRef(null);
  const mapRef       = useRef(null);
  const geocodeTimer = useRef(null);

  const startLat = parseFloat(initialLat) || -15.7942; // Brasília fallback
  const startLng = parseFloat(initialLng) || -47.8822;

  const [address,         setAddress]         = useState('');
  const [addressApprox,   setAddressApprox]   = useState(false); // true quando não tem logradouro
  const [neighborhood,    setNeighborhood]    = useState('');
  const [city,            setCity]            = useState('');
  const [cep,             setCep]             = useState('');
  const [feeInfo,         setFeeInfo]         = useState({ fee: 0, eta: null, outsideZone: false });
  const [geocoding,       setGeocoding]       = useState(false);
  const [centerCoords,    setCenterCoords]    = useState({ lat: startLat, lng: startLng });
  const [mapMoved,        setMapMoved]        = useState(false);

  // Initialize map
  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [startLng, startLat],
      zoom: 15,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    // Show restaurant marker if coords available
    if (restaurantLat && restaurantLng) {
      const el = document.createElement('div');
      el.innerHTML = '🏠';
      el.style.cssText = 'font-size:22px;cursor:default;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))';
      new maplibregl.Marker({ element: el })
        .setLngLat([parseFloat(restaurantLng), parseFloat(restaurantLat)])
        .addTo(map);
    }

    map.on('moveend', () => {
      if (map.isMoving()) return; // ignora moveend durante flyTo animado
      const c = map.getCenter();
      setCenterCoords({ lat: c.lat, lng: c.lng });
      setMapMoved(true);
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reverse geocode on center change (debounced 600ms)
  const doGeocode = useCallback(async (lat, lng) => {
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
        { headers: { 'Accept-Language': 'pt-BR' } }
      );
      const d = await res.json();
      const a = d.address ?? {};

      const road    = a.road ?? a.street ?? a.pedestrian ?? a.path ?? a.footway ?? '';
      const houseN  = a.house_number ?? '';
      const nb      = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.district ?? a.city_district ?? '';
      const cityStr = a.city ?? a.town ?? a.municipality ?? a.county ?? '';
      const state   = a.state ?? '';
      const post    = (a.postcode ?? '').replace(/\D/g, '');
      const postFmt = post.length >= 8 ? `${post.slice(0, 5)}-${post.slice(5, 8)}` : post;

      const streetPart = [road, houseN].filter(Boolean).join(', ');
      const hasRoad    = Boolean(streetPart);

      // Se não tem logradouro, monta endereço só com bairro/cidade para não bloquear o pedido.
      // Em áreas com OSM incompleto (litoral, interior), road costuma vir vazio.
      const fullAddr = hasRoad
        ? [streetPart, nb, state ? `${cityStr}/${state}` : cityStr, postFmt && `CEP ${postFmt}`].filter(Boolean).join(' — ')
        : [nb, state ? `${cityStr}/${state}` : cityStr, postFmt && `CEP ${postFmt}`].filter(Boolean).join(' — ');

      setAddress(fullAddr || nb || 'Localização no mapa');
      setAddressApprox(!hasRoad);
      setNeighborhood(nb);
      setCity(cityStr);
      setCep(postFmt);

      // Calc fee
      const info = calcFeeEta(lat, lng, deliveryZones, deliveryZoneType, restaurantLat, restaurantLng, nb);
      setFeeInfo(info);
    } catch {
      // Nominatim falhou (rate limit, rede) — calcula fee pelo fallback para não bloquear pedido
      setAddress('Localização no mapa');
      setAddressApprox(true);
      const fallback = calcFeeEta(lat, lng, deliveryZones, deliveryZoneType, restaurantLat, restaurantLng, '');
      setFeeInfo(fallback);
    } finally {
      setGeocoding(false);
    }
  }, [deliveryZones, deliveryZoneType, restaurantLat, restaurantLng]);

  useEffect(() => {
    if (!mapMoved) return;
    clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(() => doGeocode(centerCoords.lat, centerCoords.lng), 600);
    return () => clearTimeout(geocodeTimer.current);
  }, [centerCoords, mapMoved, doGeocode]);

  // Initial geocode
  useEffect(() => {
    doGeocode(startLat, startLng);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pode confirmar se tem coordenadas válidas e zona identificada (sem bloquear por falta de rua)
  const canConfirm = !geocoding && !feeInfo.outsideZone && Boolean(centerCoords.lat) && Boolean(centerCoords.lng);

  const handleConfirm = () => {
    onConfirm({
      lat:         centerCoords.lat,
      lng:         centerCoords.lng,
      address,
      neighborhood,
      city,
      cep,
      fee:         feeInfo.fee,
      eta:         feeInfo.eta,
      outsideZone: feeInfo.outsideZone,
      dist:        feeInfo.dist,
    });
  };

  const fmtBRL = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Map takes most of screen */}
      <div className="relative flex-1">
        <div ref={mapContainer} className="absolute inset-0" />

        {/* Fixed center pin */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingBottom: 32 }}>
          <div className="relative flex flex-col items-center">
            {/* Pin body */}
            <div className={`w-10 h-10 rounded-full border-4 border-white shadow-2xl flex items-center justify-center text-xl transition-all ${geocoding ? 'scale-90 opacity-70' : 'scale-100'} ${feeInfo.outsideZone ? 'bg-red-500' : 'bg-orange-500'}`}>
              📍
            </div>
            {/* Shadow dot */}
            <div className="w-3 h-1.5 bg-black/30 rounded-full mt-0.5 blur-sm" />
          </div>
        </div>

        {/* Top bar: close + title */}
        <div className="absolute top-0 left-0 right-0 flex items-center gap-3 px-4 pt-4 pb-2">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-gray-700 text-lg font-bold backdrop-blur"
          >
            ✕
          </button>
          <div className="flex-1 bg-white/90 backdrop-blur rounded-2xl px-4 py-2.5 shadow-lg">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Mova o mapa para ajustar</p>
            {geocoding ? (
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-400">Identificando...</p>
              </div>
            ) : (
              <p className="text-sm font-semibold text-gray-800 leading-snug mt-0.5 truncate">{address || 'Aguardando...'}</p>
            )}
          </div>
        </div>

        {/* Recenter button (go to user GPS) */}
        <button
          onClick={() => {
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition((pos) => {
              const { latitude: lat, longitude: lng } = pos.coords;
              mapRef.current?.flyTo({ center: [lng, lat], zoom: 16, speed: 1.5 });
              // Geocodifica imediatamente nos coords do GPS, sem esperar moveend
              setCenterCoords({ lat, lng });
              setMapMoved(true);
              doGeocode(lat, lng);
            }, () => {});
          }}
          className="absolute bottom-28 right-4 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center text-lg"
          title="Minha localização"
        >
          🎯
        </button>
      </div>

      {/* Bottom sheet */}
      <div className="bg-white rounded-t-3xl shadow-2xl px-4 pt-4 pb-6 space-y-3">
        {/* Fee + ETA */}
        <div className="flex items-center gap-3">
          {feeInfo.outsideZone ? (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
              <p className="text-sm font-bold text-red-600">⚠️ Fora da área de entrega</p>
              <p className="text-xs text-red-400 mt-0.5">
                {feeInfo.dist ? `${feeInfo.dist}km do restaurante — ` : ''}Mova o pin para uma área atendida
              </p>
            </div>
          ) : (
            <>
              <div className="flex-1 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 text-center">
                <p className="text-xs font-bold text-orange-500 uppercase tracking-wide">Taxa de entrega</p>
                <p className="text-xl font-black text-orange-600 tabular-nums">
                  {feeInfo.fee === 0 ? 'Grátis' : fmtBRL(feeInfo.fee)}
                </p>
              </div>
              {feeInfo.eta && (
                <div className="flex-1 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-center">
                  <p className="text-xs font-bold text-green-600 uppercase tracking-wide">Tempo estimado</p>
                  <p className="text-xl font-black text-green-700">⏱️ {feeInfo.eta}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Address preview */}
        {address && !geocoding && (
          <div className={`rounded-2xl px-4 py-3 ${addressApprox ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'}`}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Endereço selecionado</p>
            <p className="text-sm font-semibold text-gray-800">{address}</p>
            {addressApprox && (
              <p className="text-xs text-yellow-600 mt-1">📌 Endereço aproximado — confirme número/complemento com o cliente</p>
            )}
          </div>
        )}

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className={`w-full font-black py-4 rounded-2xl text-white text-base transition-all active:scale-95 shadow-lg ${feeInfo.outsideZone ? 'bg-red-400 cursor-not-allowed opacity-70' : !canConfirm ? 'bg-gray-300 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600 shadow-orange-200'}`}
        >
          {feeInfo.outsideZone
            ? '⚠️ Fora da área de entrega'
            : geocoding
            ? 'Identificando endereço...'
            : `Confirmar — ${feeInfo.fee === 0 ? 'Frete grátis' : fmtBRL(feeInfo.fee)}`}
        </button>
      </div>
    </div>
  );
}
