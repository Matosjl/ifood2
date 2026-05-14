import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

// ── API — usa a mesma BASE do axios do projeto (resolve VITE_API_URL) ──
import baseApi from '../api/axios';
import { Map, MapMarker, MarkerContent, MarkerTooltip, MapRoute } from '../components/ui/map';

// Cliente separado para motoboy (token diferente do restaurante)
const driverApi = axios.create({
  baseURL: baseApi.defaults.baseURL, // herda a BASE já resolvida
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

const http = async (method, path, body, token) => {
  try {
    const res = await driverApi.request({
      method,
      url: `/driver${path}`,
      data: body,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.data.data;
  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    throw new Error(msg || `Erro ${err.response?.status ?? 'de rede'}`);
  }
};

// ── Socket URL ───────────────────────────────────────────────
const SOCKET_URL = baseApi.defaults.baseURL?.replace('/api', '') || '';

// ── Nominatim geocoding (for mini map) ───────────────────────
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
async function geocode(address) {
  if (!address) return null;
  const hasCity = /torres|rs\b/i.test(address);
  const query   = hasCity ? address : `${address}, Torres RS`;
  try {
    const res  = await fetch(
      `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    );
    const data = await res.json();
    if (data?.[0]) return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
  } catch { /* non-fatal */ }
  return null;
}

// OSRM route
const OSRM = 'https://router.project-osrm.org/route/v1/driving';
async function fetchRoute(from, to) {
  if (!from || !to) return null;
  try {
    const res  = await fetch(`${OSRM}/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`);
    const data = await res.json();
    return data?.routes?.[0]?.geometry?.coordinates ?? null;
  } catch { return null; }
}

// Torres RS center fallback
const TORRES_CENTER = [-49.7295, -29.3377];

// ── Icons (inline SVG simples) ────────────────────────────────
const Icon = ({ d, size = 20, cls = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    className={cls}>
    <path d={d} />
  </svg>
);

const ICONS = {
  pkg:   'M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z',
  money: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  user:  'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  menu:  'M3 12h18M3 6h18M3 18h18',
  phone: 'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 01.17 2.18 2 2 0 012.15 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92v2',
  map:   'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 7a3 3 0 100 6 3 3 0 000-6z',
  check: 'M20 6L9 17l-5-5',
  qr:    'M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 17h2M17 15h4M21 21h-4M15 19v2M19 19v2',
  clock: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',
  alert: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
};

// ── Pay methods ───────────────────────────────────────────────
const PAY_OPTIONS = [
  { value: 'cash',   label: '💵 Dinheiro' },
  { value: 'pix',    label: '📱 Pix'     },
  { value: 'credit', label: '💳 Crédito' },
  { value: 'debit',  label: '💳 Débito'  },
];

const PAY_LABELS = { cash: 'Dinheiro', pix: 'Pix', credit: 'Crédito', debit: 'Débito' };

const fmt = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2)}`;

// ─────────────────────────────────────────────────────────────
// LOGIN / REGISTER
// ─────────────────────────────────────────────────────────────

function AuthScreen({ onLogin }) {
  const [mode, setMode]     = useState('login');
  const [form, setForm]     = useState({ name: '', phone: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await http('POST', `/${mode}`, form);
      localStorage.setItem('driverToken', data.token);
      localStorage.setItem('driverUser', JSON.stringify(data.driver));
      onLogin(data.token, data.driver);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 px-6 py-8 text-center">
          <div className="text-5xl mb-2">🛵</div>
          <h1 className="text-2xl font-black text-white">ZapFome Driver</h1>
          <p className="text-blue-200 text-sm mt-1">Painel do Motoboy</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {['login', 'register'].map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                mode === m ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {m === 'login' ? 'Entrar' : 'Cadastrar'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {mode === 'register' && (
            <>
              <input value={form.name} onChange={(e) => set('name', e.target.value)}
                placeholder="Nome completo" required
                className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)}
                placeholder="Telefone (WhatsApp)" type="tel"
                className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </>
          )}
          <input value={form.email} onChange={(e) => set('email', e.target.value)}
            placeholder="E-mail" type="email" required
            className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input value={form.password} onChange={(e) => set('password', e.target.value)}
            placeholder="Senha" type="password" required
            className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

          {error && <p className="text-red-600 text-xs bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-700 text-white font-bold py-3 rounded-xl disabled:opacity-60 transition-opacity">
            {loading ? '...' : (mode === 'login' ? 'Entrar' : 'Criar conta')}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DELIVERY CARD
// ─────────────────────────────────────────────────────────────

function MiniMap({ delivery }) {
  const [showMap,    setShowMap]    = useState(false);
  const [customerCoords, setCustomerCoords] = useState(null);
  const [route,      setRoute]      = useState(null);

  // Restaurant fallback coords (Torres RS center)
  const restaurantCoords = TORRES_CENTER;

  useEffect(() => {
    if (!showMap) return;
    if (customerCoords) return; // already loaded
    geocode((delivery.customer_address || '') + (delivery.neighborhood ? ', ' + delivery.neighborhood : ''))
      .then((coords) => {
        if (coords) setCustomerCoords(coords);
      });
  }, [showMap]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showMap || !customerCoords) return;
    fetchRoute(restaurantCoords, customerCoords).then((r) => {
      if (r) setRoute(r);
    });
  }, [showMap, customerCoords]); // eslint-disable-line react-hooks/exhaustive-deps

  const destQuery = (delivery.customer_address || delivery.restaurant_name || '') + ', Torres RS';
  const mapsUrl   = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destQuery)}`;
  const wazeUrl   = `https://waze.com/ul?q=${encodeURIComponent(destQuery)}&navigate=yes`;

  return (
    <div>
      <button
        onClick={() => setShowMap((v) => !v)}
        className="flex items-center gap-1 text-xs text-blue-600 font-medium py-1"
      >
        🗺️ {showMap ? 'Ocultar mapa' : 'Ver no mapa'}
      </button>

      {showMap && (
        <div className="rounded-xl overflow-hidden border border-gray-200 mt-1" style={{ height: 200 }}>
          <Map
            center={customerCoords ?? restaurantCoords}
            zoom={customerCoords ? 14 : 12}
            theme="light"
            className="h-full w-full"
          >
            {/* Restaurant marker */}
            <MapMarker longitude={restaurantCoords[0]} latitude={restaurantCoords[1]}>
              <MarkerContent>
                <div className="w-7 h-7 rounded-full bg-orange-500 border-2 border-white shadow flex items-center justify-center text-sm">🏪</div>
              </MarkerContent>
              <MarkerTooltip>{delivery.restaurant_name}</MarkerTooltip>
            </MapMarker>

            {/* Customer marker */}
            {customerCoords && (
              <MapMarker longitude={customerCoords[0]} latitude={customerCoords[1]}>
                <MarkerContent>
                  <div className="w-7 h-7 rounded-full bg-blue-500 border-2 border-white shadow flex items-center justify-center text-sm">📍</div>
                </MarkerContent>
                <MarkerTooltip>{delivery.customer_name}</MarkerTooltip>
              </MapMarker>
            )}

            {/* Route */}
            {route && route.length >= 2 && (
              <MapRoute coordinates={route} color="#2563eb" width={3} opacity={0.8} />
            )}
          </Map>
        </div>
      )}

      {showMap && (
        <div className="flex gap-2 mt-2">
          <a href={wazeUrl} target="_blank" rel="noreferrer"
            className="flex-1 py-1.5 rounded-xl text-xs font-bold bg-cyan-500 text-white text-center">
            🔵 Waze
          </a>
          <a href={mapsUrl} target="_blank" rel="noreferrer"
            className="flex-1 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white text-center">
            🗺️ Maps
          </a>
        </div>
      )}
    </div>
  );
}

function DeliveryCard({ delivery, type, onAccept, onPickup, onPay, onComplete, loading }) {
  const [expanded, setExpanded] = useState(false);
  const [payPicker, setPayPicker] = useState(false);

  const isPaid  = !!delivery.paid_at || delivery.payment_method === 'pix';
  const dstatus = delivery.delivery_status;

  const openMaps = (label, query) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden mb-3">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="bg-blue-600 text-white text-xs font-black px-2 py-0.5 rounded-full">
            #{delivery.order_number}
          </span>
          <span className="text-xs text-gray-500">{delivery.restaurant_name}</span>
        </div>
        <div className="flex items-center gap-2">
          {!isPaid && (
            <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Icon d={ICONS.alert} size={12} /> COBRAR
            </span>
          )}
          {isPaid && (
            <span className="text-xs font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Icon d={ICONS.check} size={12} /> PAGO
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {/* Customer */}
        <div>
          <p className="font-semibold text-gray-800 text-sm">{delivery.customer_name || 'Cliente'}</p>
          {delivery.customer_phone && (
            <a href={`tel:${delivery.customer_phone}`}
              className="flex items-center gap-1 text-xs text-blue-600">
              <Icon d={ICONS.phone} size={12} /> {delivery.customer_phone}
            </a>
          )}
        </div>

        {/* Address */}
        {delivery.customer_address && (
          <div className="flex items-start gap-1.5 bg-blue-50 rounded-xl px-3 py-2">
            <Icon d={ICONS.map} size={14} cls="text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-blue-800">{delivery.customer_address}</p>
              {delivery.neighborhood && (
                <p className="text-xs text-blue-600">{delivery.neighborhood}</p>
              )}
            </div>
          </div>
        )}

        {/* Earnings */}
        <div className="flex items-center justify-between">
          {type === 'active' && delivery.driver_fee > 0 && (
            <span className="text-green-700 font-black text-base">
              Seu ganho: {fmt(delivery.driver_fee)}
            </span>
          )}
          <span className="text-gray-500 text-sm ml-auto">
            Total pedido: {fmt(delivery.total)}
          </span>
        </div>

        {/* Payment info */}
        <p className="text-xs text-gray-500">
          Pagamento: {PAY_LABELS[delivery.payment_method] || delivery.payment_method}
          {delivery.paid_at ? ` · pago` : ' · a cobrar'}
        </p>

        {/* Notes */}
        {delivery.notes && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1">
            💬 {delivery.notes}
          </p>
        )}

        {/* Mini map — show for active deliveries (accepted or picked_up) */}
        {type === 'active' && (dstatus === 'accepted' || dstatus === 'picked_up') && (
          <MiniMap delivery={delivery} />
        )}

        {/* Items toggle */}
        {delivery.items?.length > 0 && (
          <button onClick={() => setExpanded((e) => !e)}
            className="text-xs text-blue-600 underline">
            {expanded ? 'Ocultar itens' : `Ver ${delivery.items.length} iten(s)`}
          </button>
        )}
        {expanded && (
          <ul className="text-xs text-gray-600 space-y-0.5 pl-2 border-l-2 border-blue-200">
            {delivery.items.map((it, i) => (
              <li key={i}>{it.quantity}× {it.productName} — {fmt(it.total)}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Pay picker */}
      {payPicker && (
        <div className="px-4 pb-3 space-y-2 border-t pt-2 bg-yellow-50">
          <p className="text-xs font-semibold text-gray-700">Forma de pagamento recebida:</p>
          <div className="grid grid-cols-2 gap-2">
            {PAY_OPTIONS.map(({ value, label }) => (
              <button key={value} onClick={() => { onPay(delivery.delivery_id, value); setPayPicker(false); }}
                className="py-2 rounded-xl text-xs font-semibold bg-white border hover:bg-green-50 hover:border-green-400 transition-colors">
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => setPayPicker(false)} className="w-full text-xs text-gray-500 py-1">
            Cancelar
          </button>
        </div>
      )}

      {/* Actions */}
      {!payPicker && (
        <div className="px-4 pb-3 flex gap-2 flex-wrap border-t pt-2">
          {type === 'available' && (
            <>
              <button onClick={() => openMaps('restaurante', delivery.restaurant_name + ' Torres RS')}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border border-blue-300 text-blue-700 hover:bg-blue-50">
                🗺 Ver rota
              </button>
              <button onClick={() => onAccept(delivery.id)} disabled={loading}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-purple-700 text-white disabled:opacity-60">
                ✅ Aceitar
              </button>
            </>
          )}

          {type === 'active' && dstatus === 'accepted' && (
            <>
              <button onClick={() => openMaps('restaurante', delivery.restaurant_name + ' Torres RS')}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border border-gray-300 text-gray-700">
                🏪 Ir ao restaurante
              </button>
              <button onClick={() => onPickup(delivery.delivery_id)} disabled={loading}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white disabled:opacity-60">
                📦 Coletei
              </button>
            </>
          )}

          {type === 'active' && dstatus === 'picked_up' && (
            <>
              <button onClick={() => openMaps('cliente', delivery.customer_address + ', Torres RS')}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border border-gray-300 text-gray-700">
                🗺 Ir ao cliente
              </button>
              {!isPaid && (
                <button onClick={() => setPayPicker(true)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold bg-yellow-500 text-white">
                  💰 Cobrar
                </button>
              )}
              <button onClick={() => onComplete(delivery.delivery_id)} disabled={!isPaid || loading}
                title={!isPaid ? 'Registre o pagamento primeiro' : ''}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${
                  isPaid
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}>
                {isPaid ? '✅ Entregue!' : '🔒 Aguardando pgto'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────

export default function DriverApp() {
  const [token,    setToken]    = useState(() => localStorage.getItem('driverToken'));
  const [user,     setUser]     = useState(() => {
    try { return JSON.parse(localStorage.getItem('driverUser') || 'null'); } catch { return null; }
  });

  const [tab,      setTab]      = useState('deliveries'); // deliveries | earnings | profile
  const [subTab,   setSubTab]   = useState('available');  // available | active
  const [online,   setOnline]   = useState(false);
  const [available, setAvailable] = useState([]);
  const [active,   setActive]   = useState([]);
  const [stats,    setStats]    = useState(null);
  const [history,  setHistory]  = useState([]);
  const [profile,  setProfile]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [sideMenu, setSideMenu] = useState(false);
  const [connectModal, setConnectModal] = useState(false);
  const [connectToken, setConnectToken] = useState('');
  const [connectMsg,   setConnectMsg]   = useState('');
  const [error,    setError]    = useState('');
  const pollRef           = useRef(null);
  const socketRef         = useRef(null);
  const locationWatchRef  = useRef(null);

  // ── Fetch ───────────────────────────────────────────────────

  const fetchDeliveries = useCallback(async () => {
    if (!token) return;
    try {
      const [av, ac] = await Promise.all([
        http('GET', '/deliveries/available', null, token),
        http('GET', '/deliveries/active',    null, token),
      ]);
      setAvailable(av);
      setActive(ac);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [token]);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const [s, h] = await Promise.all([
        http('GET', '/stats',   null, token),
        http('GET', '/history', null, token),
      ]);
      setStats(s);
      setHistory(h);
    } catch {}
  }, [token]);

  const fetchProfile = useCallback(async () => {
    if (!token) return;
    try {
      const p = await http('GET', '/profile', null, token);
      setProfile(p);
    } catch {}
  }, [token]);

  // Carrega perfil (inclui restaurantes) no login e ao trocar de aba
  useEffect(() => {
    if (!token) return;
    fetchProfile(); // sempre ao montar / logar
  }, [token, fetchProfile]);

  // Polling a cada 15s quando online
  useEffect(() => {
    if (!token) return;
    fetchDeliveries();
    if (online) {
      pollRef.current = setInterval(fetchDeliveries, 15_000);
    }
    return () => clearInterval(pollRef.current);
  }, [token, online, fetchDeliveries]);

  useEffect(() => {
    if (tab === 'earnings') fetchStats();
    if (tab === 'profile')  fetchProfile();
  }, [tab, fetchStats, fetchProfile]);

  // ── Socket.io connection ─────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth:       { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      // No-op — driver is already in their own room via server auth
    });

    socket.on('delivery:new', (order) => {
      // Prepend to available list, dedup by id
      setAvailable((prev) => {
        if (prev.some((d) => d.id === order.id)) return prev;
        return [order, ...prev];
      });
    });

    // Restaurante atribuiu este motoboy a um pedido → atualiza ativas imediatamente
    socket.on('delivery:assigned', () => {
      fetchDeliveries();
      setSubTab('active');
    });

    socket.on('disconnect', () => {
      // Will reconnect automatically
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ─────────────────────────────────────────────────

  const toggleOnline = async () => {
    const goingOnline = !online;
    const newStatus   = goingOnline ? 'available' : 'offline';
    try {
      await http('PUT', '/status', { status: newStatus }, token);
      setOnline(goingOnline);

      if (goingOnline) {
        // Start GPS watch
        if ('geolocation' in navigator) {
          locationWatchRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              const lat = pos.coords.latitude;
              const lng = pos.coords.longitude;
              // Emit via socket for real-time
              if (socketRef.current?.connected) {
                socketRef.current.emit('driver:location', { lat, lng });
              }
              // Also persist to DB
              http('PUT', '/location', { lat, lng }, token).catch(() => {});
            },
            () => { /* GPS error — non-fatal */ },
            { enableHighAccuracy: true, maximumAge: 5_000 },
          );
        }
        fetchDeliveries();
      } else {
        // Stop GPS watch
        if (locationWatchRef.current != null) {
          navigator.geolocation.clearWatch(locationWatchRef.current);
          locationWatchRef.current = null;
        }
      }
    } catch (e) { setError(e.message); }
  };

  const handleAccept = async (orderId) => {
    setLoading(true);
    try {
      await http('POST', `/deliveries/${orderId}/accept`, {}, token);
      await fetchDeliveries();
      setSubTab('active');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handlePickup = async (deliveryId) => {
    setLoading(true);
    try {
      await http('POST', `/deliveries/${deliveryId}/pickup`, {}, token);
      await fetchDeliveries();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handlePay = async (deliveryId, paymentMethod) => {
    try {
      await http('POST', `/deliveries/${deliveryId}/pay`, { paymentMethod }, token);
      await fetchDeliveries();
    } catch (e) { setError(e.message); }
  };

  const handleComplete = async (deliveryId) => {
    setLoading(true);
    try {
      await http('POST', `/deliveries/${deliveryId}/complete`, {}, token);
      await fetchDeliveries();
      await fetchStats();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    setConnectMsg('');
    try {
      const data = await http('POST', '/connect', { token: connectToken }, token);
      setConnectMsg(`✅ Conectado a: ${data.restaurantName}`);
      setConnectToken('');
      fetchProfile();
    } catch (err) {
      setConnectMsg(`❌ ${err.message}`);
    }
  };

  const handleLogin = (tok, usr) => {
    setToken(tok);
    setUser(usr);
  };

  const handleLogout = () => {
    // Stop GPS if active
    if (locationWatchRef.current != null) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }
    localStorage.removeItem('driverToken');
    localStorage.removeItem('driverUser');
    setToken(null);
    setUser(null);
  };

  // ── Auth guard ──────────────────────────────────────────────

  if (!token || !user) return <AuthScreen onLogin={handleLogin} />;

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col max-w-md mx-auto relative">

      {/* Side menu backdrop */}
      {sideMenu && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSideMenu(false)} />
      )}

      {/* Side menu */}
      <div className={`fixed left-0 top-0 h-full w-72 bg-white z-50 shadow-2xl transition-transform duration-300 ${
        sideMenu ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 px-5 py-6">
          <div className="text-3xl mb-1">🛵</div>
          <p className="text-white font-bold">{user.name}</p>
          <p className="text-blue-200 text-sm">{user.email}</p>
        </div>
        <div className="p-4 space-y-2">
          <button onClick={() => { setConnectModal(true); setSideMenu(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 text-blue-700 font-semibold text-sm hover:bg-blue-100">
            <Icon d={ICONS.qr} size={18} /> Conectar Restaurante
          </button>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 text-red-700 font-semibold text-sm hover:bg-red-100">
            🚪 Sair
          </button>
        </div>
      </div>

      {/* Connect modal */}
      {connectModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-purple-700 px-5 py-4 flex items-center justify-between">
              <h2 className="text-white font-bold">Conectar Restaurante</h2>
              <button onClick={() => { setConnectModal(false); setConnectMsg(''); }}
                className="text-white/80 hover:text-white text-xl font-bold">×</button>
            </div>
            <form onSubmit={handleConnect} className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                Peça ao restaurante o <strong>código de 6 letras</strong> (ex: <code className="bg-gray-100 px-1 rounded">AB12CD</code>) ou escaneie o QR Code.
              </p>
              <input
                value={connectToken}
                onChange={(e) => setConnectToken(e.target.value.toUpperCase())}
                placeholder="Ex: AB12CD"
                maxLength={10}
                className="w-full border rounded-xl px-4 py-3 text-center text-xl font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {connectMsg && (
                <p className={`text-sm rounded-lg px-3 py-2 ${
                  connectMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>{connectMsg}</p>
              )}
              <button type="submit"
                className="w-full bg-gradient-to-r from-blue-600 to-purple-700 text-white font-bold py-3 rounded-xl">
                Conectar
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setSideMenu(true)} className="text-white">
            <Icon d={ICONS.menu} size={22} />
          </button>
          <span className="text-white font-black text-lg">🛵 Driver</span>
        </div>
        <button onClick={toggleOnline}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
            online
              ? 'bg-green-400 text-green-900'
              : 'bg-white/20 text-white border border-white/40'
          }`}>
          <span className={`w-2 h-2 rounded-full ${online ? 'bg-green-700 animate-pulse' : 'bg-gray-400'}`} />
          {online ? 'Online' : 'Offline'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-100 border-b border-red-200 px-4 py-2 text-xs text-red-700 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="font-bold">×</button>
        </div>
      )}

      {/* Offline notice */}
      {!online && tab === 'deliveries' && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 text-center">
          <p className="text-sm text-yellow-800 font-medium">Você está offline</p>
          <p className="text-xs text-yellow-600">Toque em "Offline" para ficar disponível</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-20">

        {/* ── Deliveries ── */}
        {tab === 'deliveries' && (
          <div>
            {/* Restaurantes conectados */}
            {profile?.restaurants?.length > 0 && (
              <div className="px-3 pt-3 pb-1 flex flex-wrap gap-1.5">
                {profile.restaurants.map((r) => (
                  <span key={r.id}
                    className="inline-flex items-center gap-1 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">
                    🏪 {r.name}
                  </span>
                ))}
              </div>
            )}
            {!profile?.restaurants?.length && (
              <div className="mx-3 mt-3 p-3 rounded-xl bg-yellow-50 border border-yellow-200 text-xs text-yellow-800">
                ⚠️ Nenhum restaurante conectado. Use o menu lateral para conectar.
              </div>
            )}

            {/* Sub-tabs */}
            <div className="flex border-b bg-white sticky top-0 z-10">
              {[
                { k: 'available', label: 'Disponíveis', count: available.length },
                { k: 'active',    label: 'Ativas',      count: active.length },
              ].map(({ k, label, count }) => (
                <button key={k} onClick={() => setSubTab(k)}
                  className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                    subTab === k
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-500'
                  }`}>
                  {label}
                  {count > 0 && (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                      subTab === k ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>{count}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="p-3">
              {subTab === 'available' && (
                available.length === 0
                  ? <div className="text-center text-gray-500 text-sm py-16">
                      {online ? '🎉 Nenhum pedido disponível no momento' : '📵 Fique online para receber pedidos'}
                    </div>
                  : available.map((d) => (
                      <DeliveryCard key={d.id} delivery={{ ...d, delivery_status: 'available' }}
                        type="available" onAccept={handleAccept} loading={loading} />
                    ))
              )}
              {subTab === 'active' && (
                active.length === 0
                  ? <div className="text-center text-gray-500 text-sm py-16">Nenhuma entrega em andamento</div>
                  : active.map((d) => (
                      <DeliveryCard key={d.delivery_id} delivery={d} type="active"
                        onPickup={handlePickup} onPay={handlePay}
                        onComplete={handleComplete} loading={loading} />
                    ))
              )}
            </div>
          </div>
        )}

        {/* ── Earnings ── */}
        {tab === 'earnings' && (
          <div className="p-4 space-y-4">
            {stats && (
              <>
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-5 text-white">
                  <p className="text-sm opacity-80">Hoje</p>
                  <p className="text-4xl font-black">{fmt(stats.today_earnings)}</p>
                  <p className="text-sm opacity-80 mt-1">{stats.today_count} entregas</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: '7 dias', earnings: stats.week_earnings,  count: stats.week_count },
                    { label: '30 dias', earnings: stats.month_earnings, count: stats.month_count },
                  ].map(({ label, earnings, count }) => (
                    <div key={label} className="bg-white rounded-2xl p-4 shadow-sm">
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="text-xl font-black text-gray-800">{fmt(earnings)}</p>
                      <p className="text-xs text-gray-400">{count} entregas</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {history.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">Histórico recente</h3>
                <div className="space-y-2">
                  {history.map((h) => (
                    <div key={h.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex justify-between items-center">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">#{h.order_number} — {h.customer_name}</p>
                        <p className="text-xs text-gray-500">{h.restaurant_name} · {h.neighborhood}</p>
                        <p className="text-xs text-gray-400">
                          {h.delivered_at ? new Date(h.delivered_at).toLocaleString('pt-BR') : ''}
                        </p>
                      </div>
                      <span className="text-green-700 font-black text-sm">{fmt(h.driver_fee)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Profile ── */}
        {tab === 'profile' && (
          <div className="p-4 space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-black">
                {user.name?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-gray-800 text-lg">{user.name}</p>
                <p className="text-sm text-gray-500">{user.email}</p>
                {user.phone && <p className="text-sm text-gray-500">{user.phone}</p>}
              </div>
            </div>

            <button onClick={() => setConnectModal(true)}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
              <Icon d={ICONS.qr} size={18} /> Conectar Restaurante
            </button>

            {profile?.restaurants?.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">Restaurantes conectados</h3>
                <div className="space-y-2">
                  {profile.restaurants.map((r) => (
                    <div key={r.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center gap-3">
                      <span className="text-2xl">🏪</span>
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{r.name}</p>
                        <p className="text-xs text-gray-400">
                          Conectado em {new Date(r.connected_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={handleLogout}
              className="w-full border border-red-300 text-red-600 font-semibold py-3 rounded-xl hover:bg-red-50">
              Sair da conta
            </button>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t shadow-lg flex">
        {[
          { k: 'deliveries', icon: ICONS.pkg,   label: 'Entregas', badge: active.length + available.length },
          { k: 'earnings',   icon: ICONS.money,  label: 'Ganhos' },
          { k: 'profile',    icon: ICONS.user,   label: 'Perfil' },
        ].map(({ k, icon, label, badge }) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 flex flex-col items-center py-3 gap-0.5 transition-colors ${
              tab === k ? 'text-blue-600' : 'text-gray-400'
            }`}>
            <div className="relative">
              <Icon d={icon} size={22} />
              {badge > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
            <span className="text-[10px] font-semibold">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
