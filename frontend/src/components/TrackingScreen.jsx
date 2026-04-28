import { useEffect, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ── Ícones ────────────────────────────────────────────────────────────────────
const makeIcon = (emoji, size = 36) =>
  L.divIcon({
    html: `<div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))">${emoji}</div>`,
    className: "",
    iconAnchor: [size / 2, size / 2],
  });

const ICON_MOTO  = makeIcon("🛵", 36);
const ICON_LOJA  = makeIcon("🏪", 30);
const ICON_CASA  = makeIcon("🏠", 30);

// ── Haversine ─────────────────────────────────────────────────────────────────
function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function etaMinutes(motoPos, destino) {
  const km = haversineKm(motoPos, destino);
  return Math.max(1, Math.round((km / 30) * 60)); // ~30 km/h
}

// ── Componente que recentra o mapa suavemente ─────────────────────────────────
function SmoothPan({ center }) {
  const map = useMap();
  useEffect(() => {
    map.panTo(center, { animate: true, duration: 0.8 });
  }, [center, map]);
  return null;
}

// ── Marcador animado (interpolação linear) ────────────────────────────────────
function AnimatedMotoMarker({ position }) {
  const markerRef = useRef(null);
  const prevPos   = useRef(position);
  const frameRef  = useRef(null);

  useEffect(() => {
    if (!markerRef.current) return;
    const from = { ...prevPos.current };
    const to   = { ...position };
    const start = performance.now();
    const DURATION = 800; // ms

    cancelAnimationFrame(frameRef.current);

    const animate = (now) => {
      const t = Math.min((now - start) / DURATION, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOut
      const lat = from.lat + (to.lat - from.lat) * ease;
      const lng = from.lng + (to.lng - from.lng) * ease;
      markerRef.current?.setLatLng([lat, lng]);
      if (t < 1) frameRef.current = requestAnimationFrame(animate);
      else prevPos.current = to;
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [position]);

  return (
    <Marker
      ref={markerRef}
      position={[prevPos.current.lat, prevPos.current.lng]}
      icon={ICON_MOTO}
    >
      <Popup>
        <span className="font-mono text-xs">🛵 Entregador</span>
      </Popup>
    </Marker>
  );
}

// ── TrackingScreen ─────────────────────────────────────────────────────────────
const WS_BASE = (process.env.REACT_APP_BACKEND_URL || "http://localhost:8000")
  .replace(/^http/, "ws");

export function TrackingScreen({ orderId, entregador, restaurante, cliente, onFechar }) {
  // Posições
  const [motoPos, setMotoPos]   = useState(restaurante.coords);
  const [rota, setRota]         = useState([restaurante.coords, cliente.coords]);
  const [eta, setEta]           = useState(null);
  const [status, setStatus]     = useState("Aguardando entregador...");
  const [conectado, setConectado] = useState(false);

  const wsRef = useRef(null);

  const conectarWS = useCallback(() => {
    if (!orderId) return;
    const ws = new WebSocket(`${WS_BASE}/ws/track/${orderId}`);
    wsRef.current = ws;

    ws.onopen  = () => setConectado(true);
    ws.onclose = () => { setConectado(false); };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.lat && data.lng) {
          const pos = { lat: data.lat, lng: data.lng };
          setMotoPos(pos);
          setEta(etaMinutes(pos, cliente.coords));
          setStatus(data.status || "O entregador está a caminho");
          // Atualiza polyline: restaurante → moto → cliente
          setRota([restaurante.coords, pos, cliente.coords]);
        }
      } catch {}
    };

    ws.onerror = () => ws.close();
  }, [orderId, cliente.coords, restaurante.coords]);

  useEffect(() => {
    conectarWS();
    return () => wsRef.current?.close();
  }, [conectarWS]);

  const center = motoPos;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">

      {/* ── Barra superior ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/90 border-b border-[#27272A] z-10">
        <div className="flex items-center gap-3">
          <button onClick={onFechar} className="font-mono text-xs text-[#71717A] hover:text-[#EDEDED]">
            ← VOLTAR
          </button>
          <span className="font-mono text-xs text-[#00E559] tracking-widest">RASTREAMENTO</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${conectado ? "bg-[#00E559] animate-pulse" : "bg-[#FF4444]"}`} />
          <span className="font-mono text-[10px] text-[#71717A]">
            {conectado ? "AO VIVO" : "RECONECTANDO..."}
          </span>
        </div>
      </div>

      {/* ── Mapa ── */}
      <div className="flex-1 relative">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={15}
          style={{ height: "100%", width: "100%", background: "#0A0A0A" }}
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />

          <SmoothPan center={[center.lat, center.lng]} />

          {/* Rota */}
          <Polyline
            positions={rota.map(p => [p.lat, p.lng])}
            pathOptions={{ color: "#00E559", weight: 4, opacity: 0.8, dashArray: "8 4" }}
          />

          {/* Restaurante */}
          <Marker position={[restaurante.coords.lat, restaurante.coords.lng]} icon={ICON_LOJA}>
            <Popup><span className="font-mono text-xs">🏪 {restaurante.nome}</span></Popup>
          </Marker>

          {/* Casa do cliente */}
          <Marker position={[cliente.coords.lat, cliente.coords.lng]} icon={ICON_CASA}>
            <Popup><span className="font-mono text-xs">🏠 {cliente.endereco}</span></Popup>
          </Marker>

          {/* Moto animada */}
          <AnimatedMotoMarker position={motoPos} />
        </MapContainer>
      </div>

      {/* ── Card inferior ── */}
      <div className="bg-[#0A0A0A] border-t border-[#27272A] p-4 flex flex-col gap-3">

        {/* Status + ETA */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm text-[#EDEDED]">{status}</span>
          {eta !== null && (
            <span className="font-mono text-xs text-[#FFB800] border border-[#FFB800]/40 px-2 py-1">
              ⏱ ~{eta} min
            </span>
          )}
        </div>

        {/* Entregador */}
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full bg-[#111] border border-[#27272A] flex items-center justify-center text-2xl shrink-0 overflow-hidden">
            {entregador.foto
              ? <img src={entregador.foto} alt={entregador.nome} className="w-full h-full object-cover" />
              : "🛵"}
          </div>

          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="font-mono text-sm text-[#EDEDED] truncate">{entregador.nome}</span>
            <span className="font-mono text-[10px] text-[#71717A]">🏍 {entregador.placa}</span>
          </div>

          {/* Ações */}
          <div className="flex gap-2 shrink-0">
            <a
              href={`tel:${entregador.telefone}`}
              className="w-10 h-10 border border-[#27272A] flex items-center justify-center text-lg hover:border-[#00E559] transition-colors"
              title="Ligar"
            >
              📞
            </a>
            <button
              className="w-10 h-10 border border-[#27272A] flex items-center justify-center text-lg hover:border-[#00E559] transition-colors"
              title="Chat"
            >
              💬
            </button>
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="flex items-center gap-2">
          {["Pedido aceito", "Em preparo", "Saiu para entrega", "Entregue"].map((s, i) => {
            const steps = { "Aguardando entregador...": 0, "Em preparo": 1, "O entregador está a caminho": 2, "Entregue": 3 };
            const current = steps[status] ?? 2;
            return (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`w-2 h-2 rounded-full shrink-0 ${i <= current ? "bg-[#00E559]" : "bg-[#27272A]"}`} />
                <span className={`font-mono text-[9px] truncate ${i <= current ? "text-[#00E559]" : "text-[#3F3F46]"}`}>{s}</span>
                {i < 3 && <div className={`flex-1 h-px ${i < current ? "bg-[#00E559]" : "bg-[#27272A]"}`} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
