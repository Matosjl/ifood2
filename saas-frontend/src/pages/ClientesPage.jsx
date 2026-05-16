'use client';
/**
 * ClientesPage — Hub de clientes
 * Funcionalidades: listar, buscar, adicionar cliente, ver detalhes
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { searchCustomers, createCustomer } from '../api/orders';
import { Map, MapMarker, MarkerContent, MapControls } from '../components/ui/map';

// ── Tabs ──────────────────────────────────────────────────────

const TABS = [
  { id: 'todos',       label: 'Todos',       icon: '👥' },
  { id: 'funil',       label: 'Funil',       icon: '🎯', soon: true },
  { id: 'crm',         label: 'CRM',         icon: '💬', soon: true },
  { id: 'fidelizacao', label: 'Fidelização', icon: '⭐', soon: true },
  { id: 'campanhas',   label: 'Campanhas',   icon: '📣', soon: true },
  { id: 'recuperacao', label: 'Recuperação', icon: '🔄', soon: true },
  { id: 'prepago',     label: 'Pré-pago',    icon: '💳', soon: true },
];

// ── Helpers ───────────────────────────────────────────────────

const CITY_CENTER = [-49.7802, -29.3965];

const fmtBRL = (v) =>
  `R$ ${parseFloat(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const initials = (name = 'C') =>
  name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const avatarColor = (name = '') => {
  const colors = [
    'from-orange-500/40 to-orange-600/20 text-orange-300',
    'from-blue-500/40   to-blue-600/20   text-blue-300',
    'from-green-500/40  to-green-600/20  text-green-300',
    'from-purple-500/40 to-purple-600/20 text-purple-300',
    'from-pink-500/40   to-pink-600/20   text-pink-300',
    'from-teal-500/40   to-teal-600/20   text-teal-300',
  ];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx] || colors[0];
};

async function reverseGeocode(lng, lat) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    );
    const data = await res.json();
    const addr = data.address ?? {};
    const road = addr.road ?? addr.pedestrian ?? addr.path ?? '';
    const num  = addr.house_number ?? '';
    const sub  = addr.suburb ?? addr.neighbourhood ?? addr.quarter ?? '';
    return { road, num, sub, full: [road, num].filter(Boolean).join(', ') };
  } catch { return { road: '', num: '', sub: '', full: '' }; }
}

// ── Stat card ─────────────────────────────────────────────────

function StatCard({ icon, label, value, color = 'orange' }) {
  const colors = {
    orange: 'bg-orange-500/10 text-orange-400',
    blue:   'bg-blue-500/10   text-blue-400',
    green:  'bg-green-500/10  text-green-400',
    purple: 'bg-purple-500/10 text-purple-400',
  };
  return (
    <div className="bg-gray-800/60 border border-white/[0.07] rounded-2xl px-4 py-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${colors[color]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xl font-black text-white leading-none">{value}</p>
        <p className="text-xs text-gray-400 mt-0.5 font-medium">{label}</p>
      </div>
    </div>
  );
}

// ── Map picker (mini, inline no modal) ───────────────────────

function MapPicker({ onConfirm }) {
  const [pos,     setPos]     = useState(CITY_CENTER);
  const [preview, setPreview] = useState('Arraste o marcador...');
  const [loading, setLoading] = useState(false);

  const doGeo = useCallback(async (lng, lat) => {
    setLoading(true);
    const r = await reverseGeocode(lng, lat);
    setPreview(r.full || 'Endereço não encontrado');
    setLoading(false);
    return r;
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="h-52 rounded-xl overflow-hidden border border-white/10">
        <Map
          defaultCenter={{ lng: CITY_CENTER[0], lat: CITY_CENTER[1] }}
          defaultZoom={14}
          className="w-full h-full"
        >
          <MapControls position="top-right" showZoom showCompass={false} />
          <MapMarker
            longitude={pos[0]}
            latitude={pos[1]}
            draggable
            onDragEnd={async ({ lngLat }) => {
              setPos([lngLat.lng, lngLat.lat]);
              await doGeo(lngLat.lng, lngLat.lat);
            }}
          >
            <MarkerContent>
              <div className="w-8 h-8 rounded-full bg-orange-500 border-2 border-white shadow-lg flex items-center justify-center text-sm">
                📍
              </div>
            </MarkerContent>
          </MapMarker>
        </Map>
      </div>
      <div className="flex items-center gap-2">
        <p className="flex-1 text-xs text-gray-400 truncate">
          {loading ? 'Buscando...' : preview}
        </p>
        <button
          type="button"
          onClick={async () => {
            const r = await reverseGeocode(pos[0], pos[1]);
            onConfirm(r.full || preview, pos);
          }}
          className="px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 text-xs font-semibold rounded-lg transition-colors shrink-0"
        >
          Usar este endereço
        </button>
      </div>
    </div>
  );
}

// ── Modal: Adicionar Cliente ──────────────────────────────────

function AddClientModal({ onClose, onSaved }) {
  const [name,     setName]     = useState('');
  const [phone,    setPhone]    = useState('');
  const [address,  setAddress]  = useState('');
  const [coords,   setCoords]   = useState(null);
  const [showMap,  setShowMap]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Nome é obrigatório.'); return; }
    setSaving(true);
    setError('');
    try {
      await createCustomer({ name: name.trim(), phone: phone.trim() || undefined, address: address.trim() || undefined, coords: coords || undefined });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao salvar cliente.');
    } finally {
      setSaving(false);
    }
  };

  // Fecha com Escape
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative w-full max-w-md bg-gray-900 border border-white/[0.08] rounded-2xl shadow-2xl z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <p className="text-base font-black text-white">Novo Cliente</p>
            <p className="text-xs text-gray-500 mt-0.5">Cadastre um cliente para seu restaurante</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="px-5 py-4 flex flex-col gap-4">
          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">
              Nome <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus
              type="text"
              placeholder="Ex: João da Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input w-full"
            />
          </div>

          {/* Telefone */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">
              Telefone / WhatsApp
            </label>
            <input
              type="text"
              placeholder="(51) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input w-full"
            />
          </div>

          {/* Endereço */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-gray-400">Endereço</label>
              <button
                type="button"
                onClick={() => setShowMap((v) => !v)}
                className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 font-semibold transition-colors"
              >
                📍 {showMap ? 'Ocultar mapa' : 'Escolher no mapa'}
              </button>
            </div>
            <input
              type="text"
              placeholder="Rua, número, bairro..."
              value={address}
              onChange={(e) => { setAddress(e.target.value); setCoords(null); }}
              className="input w-full"
            />
            <AnimatePresence>
              {showMap && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 overflow-hidden"
                >
                  <MapPicker
                    onConfirm={(addr, c) => {
                      setAddress(addr);
                      setCoords(c);
                      setShowMap(false);
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/[0.07] border border-white/10 font-semibold transition-all">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !name.trim()}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all">
              {saving ? 'Salvando...' : 'Salvar cliente'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Painel de detalhes do cliente ─────────────────────────────

function CustomerDetail({ customer, onClose }) {
  const ini  = initials(customer.name);
  const col  = avatarColor(customer.name);
  const avg  = customer.order_count > 0
    ? parseFloat(customer.total_spent || 0) / customer.order_count
    : 0;
  const isVip    = (customer.order_count ?? 0) >= 10;
  const isRecent = customer.last_order_date && (Date.now() - new Date(customer.last_order_date)) < 7 * 86400e3;
  const isManual = !customer.last_order_date && customer.client_id;

  return (
    <motion.div
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 32 }}
      transition={{ type: 'spring', damping: 26, stiffness: 300 }}
      className="w-72 shrink-0 bg-gray-900 border-l border-white/[0.07] flex flex-col h-full overflow-y-auto"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
        <p className="text-sm font-black text-white">Detalhes</p>
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Avatar + name */}
      <div className="px-5 py-5 flex flex-col items-center text-center gap-3 border-b border-white/[0.06]">
        <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${col} flex items-center justify-center text-2xl font-black select-none`}>
          {ini}
        </div>
        <div>
          <p className="text-base font-black text-white leading-tight">{customer.name}</p>
          {customer.phone
            ? <p className="text-sm text-gray-400 mt-1">{customer.phone}</p>
            : <p className="text-xs text-gray-600 mt-1 italic">Sem telefone</p>
          }
        </div>
        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          {isVip && (
            <span className="text-[10px] bg-yellow-500/20 text-yellow-300 border border-yellow-500/20 px-2 py-0.5 rounded-full font-bold">⭐ VIP</span>
          )}
          {isRecent && !isVip && (
            <span className="text-[10px] bg-green-500/20 text-green-300 border border-green-500/20 px-2 py-0.5 rounded-full font-bold">🟢 Ativo</span>
          )}
          {isManual && (
            <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold">📋 Manual</span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 py-4 grid grid-cols-2 gap-2 border-b border-white/[0.06]">
        {[
          { label: 'Pedidos',         value: customer.order_count ?? 0,        icon: '🛒' },
          { label: 'Ticket Médio',    value: fmtBRL(avg),                      icon: '💵' },
          { label: 'Total Gasto',     value: fmtBRL(customer.total_spent),     icon: '💰' },
          { label: 'Último Pedido',   value: fmtDate(customer.last_order_date), icon: '📅' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-gray-800/60 rounded-xl p-3 flex flex-col gap-1">
            <span className="text-lg leading-none">{icon}</span>
            <p className="text-sm font-black text-white leading-tight">{value}</p>
            <p className="text-[10px] text-gray-500 leading-none">{label}</p>
          </div>
        ))}
      </div>

      {/* Endereço */}
      {customer.address && (
        <div className="px-4 py-4">
          <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">Endereço</p>
          <div className="flex items-start gap-2 bg-gray-800/40 rounded-xl p-3">
            <span className="text-base shrink-0 mt-0.5">📍</span>
            <p className="text-xs text-gray-300 leading-relaxed">{customer.address}</p>
          </div>
          {customer.phone && (
            <a
              href={`https://wa.me/55${customer.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-500/15 hover:bg-green-500/25 text-green-400 text-xs font-bold rounded-xl transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Enviar WhatsApp
            </a>
          )}
        </div>
      )}

      {!customer.address && !customer.phone && (
        <div className="px-4 py-6 flex flex-col items-center gap-2 text-gray-600">
          <span className="text-2xl">📭</span>
          <p className="text-xs text-center">Sem informações adicionais cadastradas</p>
        </div>
      )}
    </motion.div>
  );
}

// ── Tab: Todos Clientes ───────────────────────────────────────

function TabTodos() {
  const [customers,  setCustomers]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [stats,      setStats]      = useState({ total: 0, vip: 0, recent: 0, totalSpent: 0 });
  const [selected,   setSelected]   = useState(null);
  const [showAdd,    setShowAdd]    = useState(false);
  const searchTimer = useRef(null);

  const loadCustomers = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const { data } = await searchCustomers(q);
      const list = data.data ?? [];

      // Deduplicar por telefone (fallback nome)
      const seen   = new Set();
      const unique = list.filter((c) => {
        const key = c.phone?.trim() || c.name?.trim();
        if (!key || seen.has(key.toLowerCase())) return false;
        seen.add(key.toLowerCase());
        return true;
      });

      setCustomers(unique);

      // Stats (sem filtro)
      if (!q) {
        const now  = Date.now();
        const vip  = unique.filter((c) => (c.order_count ?? 0) >= 10).length;
        const rec  = unique.filter((c) => c.last_order_date && (now - new Date(c.last_order_date)) < 7 * 86400e3).length;
        const spent = unique.reduce((s, c) => s + parseFloat(c.total_spent ?? 0), 0);
        setStats({ total: unique.length, vip, recent: rec, totalSpent: spent });
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const handleSearch = (q) => {
    setSearch(q);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadCustomers(q), 300);
  };

  const handleSaved = () => {
    setShowAdd(false);
    loadCustomers(search);
  };

  return (
    <>
      {/* Add modal */}
      <AnimatePresence>
        {showAdd && <AddClientModal onClose={() => setShowAdd(false)} onSaved={handleSaved} />}
      </AnimatePresence>

      <div className="flex flex-col flex-1 min-h-0 gap-4">

        {/* Stats */}
        {!search && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
            <StatCard icon="👥" label="Total de clientes"    value={stats.total}   color="blue" />
            <StatCard icon="⭐" label="VIP (10+ pedidos)"    value={stats.vip}     color="orange" />
            <StatCard icon="🟢" label="Ativos esta semana"   value={stats.recent}  color="green" />
            <StatCard icon="💰" label="Total faturado"
              value={`R$ ${stats.totalSpent.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`}
              color="purple"
            />
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative flex-1 max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="input pl-9 w-full"
            />
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold rounded-xl transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:block">Novo Cliente</span>
          </button>
        </div>

        {/* Table + Detail panel side by side */}
        <div className="flex flex-1 min-h-0 gap-3">

          {/* Table */}
          <div className="flex-1 min-w-0 bg-gray-800/40 border border-white/[0.07] rounded-2xl flex flex-col overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-full gap-2 text-gray-500">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm">Carregando...</span>
              </div>
            ) : customers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600 py-10">
                <span className="text-4xl">👥</span>
                <p className="text-sm">{search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado ainda'}</p>
                {!search && (
                  <button onClick={() => setShowAdd(true)} className="text-sm text-orange-400 hover:text-orange-300 font-semibold transition-colors">
                    + Adicionar primeiro cliente
                  </button>
                )}
              </div>
            ) : (
              /* Scrollable table */
              <div className="overflow-auto flex-1">
                <table className="w-full text-left min-w-[540px]">
                  <thead className="sticky top-0 z-10 bg-gray-800/95 backdrop-blur-sm">
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-center">Pedidos</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-right">Ticket Médio</th>
                      <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-right">Último pedido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c, i) => {
                      const isActive   = selected?.name === c.name && selected?.phone === c.phone;
                      const ini2       = initials(c.name);
                      const col2       = avatarColor(c.name);
                      const isVip      = (c.order_count ?? 0) >= 10;
                      const isRecent   = c.last_order_date && (Date.now() - new Date(c.last_order_date)) < 7 * 86400e3;
                      const avg2       = c.order_count > 0 ? parseFloat(c.total_spent || 0) / c.order_count : 0;

                      return (
                        <motion.tr
                          key={`${c.phone || c.name}-${i}`}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02, duration: 0.15 }}
                          onClick={() => setSelected(isActive ? null : c)}
                          className={[
                            'border-b border-white/[0.04] transition-colors cursor-pointer',
                            isActive
                              ? 'bg-orange-500/10'
                              : 'hover:bg-white/[0.02]',
                          ].join(' ')}
                        >
                          {/* Cliente */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${col2} flex items-center justify-center text-xs font-bold shrink-0 select-none`}>
                                {ini2}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-sm font-semibold text-gray-200 truncate">{c.name}</p>
                                  {isVip && <span className="text-[9px] bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded-full font-bold shrink-0">VIP</span>}
                                  {isRecent && !isVip && <span className="text-[9px] bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded-full font-bold shrink-0">Ativo</span>}
                                  {!c.last_order_date && c.client_id && <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full font-bold shrink-0">Manual</span>}
                                </div>
                                {c.phone && <p className="text-[11px] text-gray-600 truncate mt-0.5">{c.phone}</p>}
                              </div>
                            </div>
                          </td>
                          {/* Pedidos */}
                          <td className="px-4 py-3 text-sm text-gray-400 text-center tabular-nums">
                            {c.order_count ?? 0}
                          </td>
                          {/* Ticket médio */}
                          <td className="px-4 py-3 text-sm text-gray-400 text-right tabular-nums">
                            {c.order_count > 0 ? fmtBRL(avg2) : '—'}
                          </td>
                          {/* Último pedido */}
                          <td className="px-4 py-3 text-sm text-gray-500 text-right">
                            {fmtDate(c.last_order_date)}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detail panel */}
          <AnimatePresence>
            {selected && (
              <CustomerDetail
                customer={selected}
                onClose={() => setSelected(null)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

// ── Coming Soon ───────────────────────────────────────────────

function ComingSoon({ tab }) {
  const descriptions = {
    funil:       'Visualize a jornada do cliente — do primeiro contato à fidelização.',
    crm:         'Histórico completo de conversas, pedidos e preferências de cada cliente.',
    fidelizacao: 'Programe pontos, cashback e recompensas automáticas.',
    campanhas:   'Crie e dispare campanhas de WhatsApp, SMS e email com segmentação.',
    recuperacao: 'Reconquiste clientes inativos com ofertas e mensagens personalizadas.',
    prepago:     'Gerencie clientes que pagam adiantado e configure lembretes automáticos.',
  };
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4 py-20 text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center text-3xl">
        {TABS.find((t) => t.id === tab)?.icon ?? '🚀'}
      </div>
      <div>
        <p className="text-lg font-black text-white mb-2">Em breve</p>
        <p className="text-sm text-gray-400 max-w-xs leading-relaxed">{descriptions[tab] ?? 'Este módulo estará disponível em breve.'}</p>
      </div>
      <span className="text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1.5 rounded-full font-semibold">
        🔧 Em desenvolvimento
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function ClientesPage() {
  const [activeTab, setActiveTab] = useState('todos');

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">

      {/* Header */}
      <div className="px-6 pt-6 pb-0 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-black text-white">Clientes</h1>
            <p className="text-sm text-gray-500 mt-0.5">Gerencie e fidelize sua base de clientes</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0 scrollbar-hide">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl text-sm font-semibold whitespace-nowrap transition-all border-b-2 -mb-px',
                activeTab === tab.id
                  ? 'text-orange-400 border-orange-500 bg-orange-500/5'
                  : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-white/[0.03]',
              ].join(' ')}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.soon && (
                <span className="text-[9px] bg-gray-800 text-gray-600 px-1 py-0.5 rounded-full leading-none">breve</span>
              )}
            </button>
          ))}
        </div>

        <div className="border-b border-white/[0.06] -mx-6" />
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden px-6 py-5 flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col flex-1 min-h-0"
          >
            {activeTab === 'todos' ? <TabTodos /> : <ComingSoon tab={activeTab} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
