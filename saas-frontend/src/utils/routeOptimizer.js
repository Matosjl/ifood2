/**
 * routeOptimizer.js
 * Algoritmos de otimização de rotas para o app do motoboy.
 * Sem dependências externas — roda 100% no browser.
 */

// ── Haversine ──────────────────────────────────────────────────────────────
function toRad(deg) { return deg * Math.PI / 180; }

/**
 * Distância em km entre dois pontos (lat/lng).
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a    = Math.sin(dLat / 2) ** 2
             + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Velocidade média em área urbana (km/h) — usada para estimar tempo.
 */
const AVG_SPEED_KMH = 30;

/**
 * Calcula distância total de uma sequência de paradas.
 * @param {{ lat, lng }} origin
 * @param {{ lat, lng }[]} stops
 * @returns {number} km
 */
export function totalDistanceKm(origin, stops) {
  let dist = 0;
  let prev = origin;
  for (const stop of stops) {
    dist += haversineKm(prev.lat, prev.lng, stop.lat, stop.lng);
    prev = stop;
  }
  return dist;
}

/**
 * Estima tempo em minutos dado uma distância.
 */
export function estimateMinutes(distKm, stopCount = 0) {
  const driveMin = (distKm / AVG_SPEED_KMH) * 60;
  const stopMin  = stopCount * 3; // ~3 min por parada (entrar, bater, assinar)
  return Math.round(driveMin + stopMin);
}

// ── ROTA 1: Por Horário (prioridade) ──────────────────────────────────────

/**
 * Ordena entregas pela urgência: pedidos mais antigos primeiro.
 * @param {{ lat, lng, createdAt: string }[]} deliveries
 * @param {{ lat, lng }} origin
 * @returns {{ stops, totalKm, totalMinutes }}
 */
export function priorityRoute(deliveries, origin) {
  const stops = [...deliveries].sort(
    (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
  );
  const totalKm      = totalDistanceKm(origin, stops);
  const totalMinutes = estimateMinutes(totalKm, stops.length);
  return { stops, totalKm: +totalKm.toFixed(1), totalMinutes };
}

// ── ROTA 2: Econômica — Nearest-Neighbor TSP ─────────────────────────────

/**
 * Algoritmo do vizinho mais próximo: a cada passo escolhe a entrega
 * mais perto da posição atual. Minimiza distância total percorrida.
 * Complexidade O(n²) — eficiente para até ~50 paradas.
 *
 * @param {{ lat, lng }[]} deliveries
 * @param {{ lat, lng }} origin
 * @returns {{ stops, totalKm, totalMinutes }}
 */
export function economicRoute(deliveries, origin) {
  const unvisited = [...deliveries];
  const stops     = [];
  let   current   = origin;

  while (unvisited.length > 0) {
    let nearestIdx  = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const d = haversineKm(current.lat, current.lng, unvisited[i].lat, unvisited[i].lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx  = i;
      }
    }

    const [nearest] = unvisited.splice(nearestIdx, 1);
    stops.push(nearest);
    current = nearest;
  }

  const totalKm      = totalDistanceKm(origin, stops);
  const totalMinutes = estimateMinutes(totalKm, stops.length);
  return { stops, totalKm: +totalKm.toFixed(1), totalMinutes };
}

// ── Google Maps URL com waypoints ────────────────────────────────────────

/**
 * Gera URL do Google Maps com rota multi-parada.
 * @param {{ lat, lng, name?: string }} origin
 * @param {{ lat, lng }[]} stops
 * @returns {string}
 */
export function googleMapsRouteUrl(origin, stops) {
  if (!stops.length) return '';

  const dest  = stops[stops.length - 1];
  const wps   = stops.slice(0, -1);

  const params = new URLSearchParams({
    api:         1,
    origin:      `${origin.lat},${origin.lng}`,
    destination: `${dest.lat},${dest.lng}`,
    travelmode:  'driving',
  });

  if (wps.length > 0) {
    params.set('waypoints', wps.map((s) => `${s.lat},${s.lng}`).join('|'));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Gera URL do Waze com destino final (Waze não suporta multi-paradas via URL).
 */
export function wazeRouteUrl(stop) {
  return `https://waze.com/ul?ll=${stop.lat},${stop.lng}&navigate=yes`;
}
