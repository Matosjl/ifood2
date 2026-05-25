'use client';
/**
 * ClientesPage — Hub de clientes
 * Funcionalidades: listar, buscar, adicionar cliente, ver detalhes
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { searchCustomers, createCustomer, getCustomerFunnel, updateCustomer } from '../api/orders';
import { listCampaigns, previewCampaign, createCampaign, sendCampaign, createLead, importLeads, listCRMCustomers, getCRMCustomer, updateCRMCustomer } from '../api/users';
import { Map, MapMarker, MarkerContent, MapControls } from '../components/ui/map';

// ── Tabs ──────────────────────────────────────────────────────

const TABS = [
  { id: 'todos',       label: 'Todos',       icon: '👥' },
  { id: 'funil',       label: 'Funil CRM',   icon: '🎯' },
  { id: 'crm',         label: 'CRM',         icon: '💬' },
  { id: 'fidelizacao', label: 'Fidelização', icon: '⭐', soon: true },
  { id: 'campanhas',   label: 'Campanhas',   icon: '📣' },
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

function CustomerDetail({ customer, onClose, onUpdated }) {
  const [editing,   setEditing]   = useState(false);
  const [editName,  setEditName]  = useState(customer.name ?? '');
  const [editPhone, setEditPhone] = useState(customer.phone ?? '');
  const [saving,    setSaving]    = useState(false);
  const [editErr,   setEditErr]   = useState('');

  const ini  = initials(customer.name);
  const col  = avatarColor(customer.name);
  const avg  = customer.order_count > 0
    ? parseFloat(customer.total_spent || 0) / customer.order_count
    : 0;
  const isVip    = (customer.order_count ?? 0) >= 10;
  const isRecent = customer.last_order_date && (Date.now() - new Date(customer.last_order_date)) < 7 * 86400e3;
  const isManual = !customer.last_order_date && customer.client_id;

  const handleSaveEdit = async () => {
    if (!editName.trim()) { setEditErr('Nome é obrigatório.'); return; }
    setSaving(true); setEditErr('');
    try {
      await updateCustomer({
        clientId: customer.client_id ?? undefined,
        oldPhone: customer.phone ?? undefined,
        name: editName.trim(),
        phone: editPhone.trim() || undefined,
      });
      setEditing(false);
      onUpdated?.();
    } catch (err) {
      setEditErr(err.response?.data?.message ?? 'Erro ao salvar.');
    } finally { setSaving(false); }
  };

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
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setEditing(v => !v); setEditErr(''); setEditName(customer.name ?? ''); setEditPhone(customer.phone ?? ''); }}
            className="p-1.5 rounded-lg text-gray-500 hover:text-orange-400 hover:bg-orange-500/10 transition-colors"
            title="Editar cliente"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Edit form */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-white/[0.06]"
          >
            <div className="px-5 py-4 flex flex-col gap-3">
              <p className="text-xs font-bold text-orange-400 uppercase tracking-widest">Editar Cliente</p>
              <div>
                <label className="text-[11px] text-gray-500 font-semibold mb-1 block">Nome</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} className="input w-full text-sm" placeholder="Nome completo" />
              </div>
              <div>
                <label className="text-[11px] text-gray-500 font-semibold mb-1 block">Telefone</label>
                <input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="input w-full text-sm" placeholder="(51) 99999-9999" />
              </div>
              {editErr && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{editErr}</p>}
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-xl border border-white/10 text-gray-400 hover:text-white text-xs font-semibold transition-colors">Cancelar</button>
                <button onClick={handleSaveEdit} disabled={saving} className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold transition-colors disabled:opacity-50">
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                onUpdated={() => { loadCustomers(search); setSelected(null); }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

// ── Tab: Funil CRM ────────────────────────────────────────────

const SEGMENT_DEFS = [
  {
    id:    'vip',
    label: 'VIP',
    icon:  '⭐',
    desc:  '6+ pedidos, ativo nos últimos 30 dias',
    color: 'yellow',
    bg:    'bg-yellow-500/10',
    border:'border-yellow-500/20',
    text:  'text-yellow-300',
    bar:   'bg-yellow-500',
    pill:  'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    tip:   'Seus melhores clientes. Priorize atendimento VIP e cashback exclusivo.',
  },
  {
    id:    'recorrente',
    label: 'Recorrente',
    icon:  '🔄',
    desc:  '2-5 pedidos, ativo nos últimos 30 dias',
    color: 'green',
    bg:    'bg-green-500/10',
    border:'border-green-500/20',
    text:  'text-green-300',
    bar:   'bg-green-500',
    pill:  'bg-green-500/20 text-green-300 border-green-500/30',
    tip:   'Clientes fiéis em crescimento. Incentive a virar VIP com programa de pontos.',
  },
  {
    id:    'novo',
    label: 'Novo',
    icon:  '✨',
    desc:  'Primeiro pedido nos últimos 30 dias',
    color: 'blue',
    bg:    'bg-blue-500/10',
    border:'border-blue-500/20',
    text:  'text-blue-300',
    bar:   'bg-blue-500',
    pill:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
    tip:   'Conquistados recentemente. Mande uma mensagem de boas-vindas e desconto no 2º pedido.',
  },
  {
    id:    'lead',
    label: 'Lead',
    icon:  '👋',
    desc:  'Cadastrado mas ainda não pediu',
    color: 'gray',
    bg:    'bg-gray-500/10',
    border:'border-gray-500/20',
    text:  'text-gray-400',
    bar:   'bg-gray-500',
    pill:  'bg-gray-500/20 text-gray-400 border-gray-500/30',
    tip:   'Potenciais clientes. Envie um cupom de boas-vindas para converter o primeiro pedido.',
  },
  {
    id:    'em_risco',
    label: 'Em Risco',
    icon:  '⚠️',
    desc:  'Último pedido entre 30 e 60 dias atrás',
    color: 'orange',
    bg:    'bg-orange-500/10',
    border:'border-orange-500/20',
    text:  'text-orange-300',
    bar:   'bg-orange-500',
    pill:  'bg-orange-500/20 text-orange-300 border-orange-500/30',
    tip:   'Estão sumindo! Aja agora — um desconto de 15% pode reativar a maioria.',
  },
  {
    id:    'perdido',
    label: 'Perdido',
    icon:  '💤',
    desc:  'Sem pedido há mais de 60 dias',
    color: 'red',
    bg:    'bg-red-500/10',
    border:'border-red-500/20',
    text:  'text-red-300',
    bar:   'bg-red-500',
    pill:  'bg-red-500/20 text-red-300 border-red-500/30',
    tip:   'Clientes inativos. Win-back: oferta agressiva ("Sentimos sua falta! 20% OFF hoje").',
  },
];

// ── Modal: Novo Lead Manual ───────────────────────────────────
function NovoLeadModal({ onClose, onSaved }) {
  const [name,  setName]  = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handleSave = async () => {
    if (!name.trim() && !phone.trim()) return setError('Informe ao menos nome ou telefone.');
    setSaving(true); setError('');
    try {
      await createLead({ name: name.trim(), phone: phone.trim(), notes: notes.trim() });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao salvar lead.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -10 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-sm p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">➕ Novo Lead</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <p className="text-xs text-gray-500">Adicione um contato manualmente ao funil. Ele aparecerá como Lead até fazer o primeiro pedido.</p>

        {[
          { label: 'Nome',      val: name,  set: setName,  ph: 'João Silva' },
          { label: 'Telefone',  val: phone, set: setPhone, ph: '51999991234' },
        ].map(({ label, val, set, ph }) => (
          <div key={label}>
            <label className="text-xs text-gray-400 font-semibold mb-1 block uppercase tracking-wider">{label}</label>
            <input value={val} onChange={e => set(e.target.value)} placeholder={ph} className="input w-full" />
          </div>
        ))}
        <div>
          <label className="text-xs text-gray-400 font-semibold mb-1 block uppercase tracking-wider">Observação</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Origem, interesse…" className="input w-full resize-none" />
        </div>
        {error && <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold transition-colors disabled:opacity-50">
            {saving ? 'Salvando…' : 'Salvar Lead'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Modal: Importar Leads (CSV / paste) ───────────────────────
function ImportLeadsModal({ onClose, onSaved }) {
  const [text,    setText]    = useState('');
  const [saving,  setSaving]  = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState('');

  // Parse lines: "Nome,Telefone" or "Telefone" or "Nome;Telefone"
  const parseLines = (raw) => {
    return raw.split('\n')
      .map(l => l.trim()).filter(Boolean)
      .map(line => {
        const sep = line.includes(';') ? ';' : ',';
        const parts = line.split(sep).map(p => p.trim());
        const phone = parts.find(p => /^\d{8,15}$/.test(p.replace(/\D/g, '')));
        const name  = parts.find(p => p !== phone && p.length > 1 && !/^\d+$/.test(p));
        return { name: name || null, phone: phone ? phone.replace(/\D/g, '') : null };
      })
      .filter(l => l.name || l.phone);
  };

  const handleImport = async () => {
    const leads = parseLines(text);
    if (!leads.length) return setError('Nenhum contato válido encontrado.');
    setSaving(true); setError('');
    try {
      const { data } = await importLeads(leads);
      setResult(data.data);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao importar.');
    } finally { setSaving(false); }
  };

  const preview = parseLines(text).slice(0, 5);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -10 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">📥 Importar Leads</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>

        {result ? (
          <div className="text-center py-6 space-y-3">
            <div className="text-5xl">✅</div>
            <p className="text-white font-bold text-lg">{result.inserted} leads importados!</p>
            {result.skipped > 0 && <p className="text-gray-500 text-sm">{result.skipped} linhas ignoradas (sem nome/telefone)</p>}
            <button onClick={onSaved} className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm transition-colors">Concluir</button>
          </div>
        ) : (
          <>
            <div className="bg-gray-800/60 rounded-xl p-3 text-xs text-gray-400 space-y-1">
              <p className="font-semibold text-gray-300">Formato aceito — cole uma linha por contato:</p>
              <p className="font-mono text-gray-500">João Silva, 51999991234</p>
              <p className="font-mono text-gray-500">51999995678</p>
              <p className="font-mono text-gray-500">Maria; 51988887777</p>
            </div>

            <div>
              <label className="text-xs text-gray-400 font-semibold mb-1 block uppercase tracking-wider">
                Lista de contatos {text && `· ${parseLines(text).length} detectados`}
              </label>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={8}
                placeholder={"João Silva, 51999991234\nMaria, 51988887777\n51977776666"}
                className="input w-full resize-none font-mono text-xs"
              />
            </div>

            {preview.length > 0 && (
              <div className="bg-gray-800/40 rounded-xl p-3 space-y-1">
                <p className="text-xs text-gray-500 font-semibold mb-2">Pré-visualização (primeiros 5):</p>
                {preview.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-green-400">✓</span>
                    <span className="text-gray-300">{l.name || '—'}</span>
                    <span className="text-gray-500">{l.phone || 'sem telefone'}</span>
                  </div>
                ))}
              </div>
            )}

            {error && <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors">Cancelar</button>
              <button onClick={handleImport} disabled={saving || !text.trim()} className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold transition-colors disabled:opacity-50">
                {saving ? 'Importando…' : `Importar ${parseLines(text).length > 0 ? parseLines(text).length : ''} Leads`}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

// ── Tab: Funil CRM ────────────────────────────────────────────
function TabFunil() {
  const [customers,    setCustomers]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [activeSegId,  setActiveSegId]  = useState(null);
  const [showNovoLead, setShowNovoLead] = useState(false);
  const [showImport,   setShowImport]   = useState(false);

  const loadFunnel = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getCustomerFunnel();
      setCustomers(data.data ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadFunnel(); }, [loadFunnel]);

  // Group by segment
  const groups = useMemo(() => {
    const g = {};
    SEGMENT_DEFS.forEach((s) => { g[s.id] = []; });
    customers.forEach((c) => { if (g[c.segment]) g[c.segment].push(c); });
    return g;
  }, [customers]);

  const total = customers.length;
  const activeDef = SEGMENT_DEFS.find((s) => s.id === activeSegId);
  const activeList = activeSegId ? (groups[activeSegId] ?? []) : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 gap-2 text-gray-500">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm">Calculando funil...</span>
      </div>
    );
  }

  return (
    <>
    <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">

      {/* Left: funnel visualization */}
      <div className="flex flex-col gap-3 w-80 shrink-0 overflow-y-auto pr-1">

        <div className="shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Funil de Clientes</p>
            <div className="flex gap-1.5">
              <button
                onClick={() => setShowImport(true)}
                className="text-xs px-2.5 py-1 rounded-lg bg-gray-700/60 hover:bg-gray-700 text-gray-300 font-semibold transition-colors"
                title="Importar lista de leads"
              >
                📥 Importar
              </button>
              <button
                onClick={() => setShowNovoLead(true)}
                className="text-xs px-2.5 py-1 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 font-semibold transition-colors"
                title="Adicionar lead manualmente"
              >
                ➕ Novo Lead
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-600">{total} clientes no total · Clique em um segmento para ver a lista</p>
        </div>

        {SEGMENT_DEFS.map((seg) => {
          const count   = groups[seg.id]?.length ?? 0;
          const pct     = total > 0 ? Math.round((count / total) * 100) : 0;
          const revenue = (groups[seg.id] ?? []).reduce((s, c) => s + parseFloat(c.total_spent ?? 0), 0);
          const isActive = activeSegId === seg.id;

          return (
            <motion.button
              key={seg.id}
              onClick={() => setActiveSegId(isActive ? null : seg.id)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={[
                'w-full text-left rounded-2xl border p-4 transition-all',
                isActive ? `${seg.bg} ${seg.border}` : 'bg-gray-800/50 border-white/[0.07] hover:bg-gray-800',
              ].join(' ')}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl leading-none">{seg.icon}</span>
                  <span className={`text-sm font-bold ${isActive ? seg.text : 'text-gray-200'}`}>{seg.label}</span>
                </div>
                <div className="text-right">
                  <span className={`text-xl font-black tabular-nums ${isActive ? seg.text : 'text-white'}`}>{count}</span>
                  <span className="text-xs text-gray-600 ml-1">{pct}%</span>
                </div>
              </div>

              {/* Bar */}
              <div className="h-1.5 bg-gray-700/50 rounded-full overflow-hidden mb-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className={`h-full rounded-full ${seg.bar}`}
                />
              </div>

              <div className="flex items-center justify-between">
                <p className="text-[10px] text-gray-600 truncate pr-2">{seg.desc}</p>
                {revenue > 0 && (
                  <p className="text-[10px] text-gray-500 tabular-nums shrink-0">
                    {fmtBRL(revenue)}
                  </p>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Right: customer list for selected segment */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {!activeSegId ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center flex-1 gap-3 text-gray-600"
            >
              <span className="text-5xl">🎯</span>
              <p className="text-sm font-semibold">Selecione um segmento</p>
              <p className="text-xs text-center max-w-xs">Clique em qualquer cartão do funil para ver os clientes desse grupo e as ações recomendadas.</p>
            </motion.div>
          ) : (
            <motion.div
              key={activeSegId}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              className="flex flex-col flex-1 min-h-0 gap-3"
            >
              {/* Segment header */}
              <div className={`shrink-0 rounded-2xl border p-4 ${activeDef.bg} ${activeDef.border}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{activeDef.icon}</span>
                  <span className={`text-base font-black ${activeDef.text}`}>{activeDef.label}</span>
                  <span className={`text-xs border px-2 py-0.5 rounded-full font-semibold ${activeDef.pill}`}>
                    {activeList.length} cliente{activeList.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">💡 {activeDef.tip}</p>
              </div>

              {/* List */}
              {activeList.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 gap-2 text-gray-600">
                  <span className="text-3xl">✅</span>
                  <p className="text-sm">Nenhum cliente neste segmento</p>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto bg-gray-800/40 border border-white/[0.07] rounded-2xl">
                  <table className="w-full text-left min-w-[400px]">
                    <thead className="sticky top-0 z-10 bg-gray-800/95 backdrop-blur-sm">
                      <tr className="border-b border-white/[0.06]">
                        <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                        <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-center">Pedidos</th>
                        <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-right hidden sm:table-cell">Total gasto</th>
                        <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-right hidden md:table-cell">Último pedido</th>
                        <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-center">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeList.map((c, i) => {
                        const ini2 = initials(c.name);
                        const col2 = avatarColor(c.name);
                        const hasPhone = c.phone && c.phone.trim();

                        return (
                          <motion.tr
                            key={`${c.phone || c.name}-${i}`}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(i * 0.02, 0.3) }}
                            className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${col2} flex items-center justify-center text-xs font-bold shrink-0 select-none`}>
                                  {ini2}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-gray-200 truncate">{c.name}</p>
                                  {hasPhone && <p className="text-[11px] text-gray-600 truncate">{c.phone}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-400 text-center tabular-nums">
                              {c.order_count ?? 0}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-400 text-right tabular-nums hidden sm:table-cell">
                              {c.total_spent > 0 ? fmtBRL(c.total_spent) : '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500 text-right hidden md:table-cell">
                              {fmtDate(c.last_order_date)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {hasPhone ? (
                                <a
                                  href={`https://wa.me/55${c.phone.replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Enviar WhatsApp"
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-green-500/15 hover:bg-green-500/25 text-green-400 transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                  </svg>
                                </a>
                              ) : (
                                <span className="text-xs text-gray-700">—</span>
                              )}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>

    {/* Modals */}
    <AnimatePresence>
      {showNovoLead && (
        <NovoLeadModal
          onClose={() => setShowNovoLead(false)}
          onSaved={() => { setShowNovoLead(false); loadFunnel(); }}
        />
      )}
      {showImport && (
        <ImportLeadsModal
          onClose={() => setShowImport(false)}
          onSaved={() => { setShowImport(false); loadFunnel(); }}
        />
      )}
    </AnimatePresence>
    </>
  );
}

// ── Tab: CRM ──────────────────────────────────────────────────

const SEGMENT_BADGE = {
  vip:        { label: '⭐ VIP',        cls: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  recorrente: { label: '🔄 Recorrente', cls: 'bg-green-500/20  text-green-300  border-green-500/30'  },
  novo:       { label: '✨ Novo',       cls: 'bg-blue-500/20   text-blue-300   border-blue-500/30'   },
  lead:       { label: '👋 Lead',       cls: 'bg-gray-600/40   text-gray-300   border-gray-500/30'   },
  em_risco:   { label: '⚠️ Em risco',   cls: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  perdido:    { label: '💤 Perdido',    cls: 'bg-red-500/20    text-red-400    border-red-500/30'     },
};

const TAG_COLORS = [
  'bg-purple-500/20 text-purple-300',
  'bg-teal-500/20   text-teal-300',
  'bg-pink-500/20   text-pink-300',
  'bg-indigo-500/20 text-indigo-300',
  'bg-cyan-500/20   text-cyan-300',
];

function CRMDetailPanel({ customerId, onClose, onUpdate }) {
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [editNotes,setEditNotes]= useState(false);
  const [notes,    setNotes]    = useState('');
  const [tagInput, setTagInput] = useState('');
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    setLoading(true);
    getCRMCustomer(customerId)
      .then(({ data: d }) => {
        setData(d.data);
        setNotes(d.data.notes || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customerId]);

  const saveNotes = async () => {
    setSaving(true);
    try {
      const { data: d } = await updateCRMCustomer(customerId, { notes });
      setData(prev => ({ ...prev, notes: d.data.notes }));
      setEditNotes(false);
      onUpdate?.();
    } finally { setSaving(false); }
  };

  const addTag = async (tag) => {
    const trimmed = tag.trim();
    if (!trimmed || data.tags?.includes(trimmed)) return;
    const newTags = [...(data.tags || []), trimmed];
    const { data: d } = await updateCRMCustomer(customerId, { tags: newTags });
    setData(prev => ({ ...prev, tags: d.data.tags }));
    setTagInput('');
    onUpdate?.();
  };

  const removeTag = async (tag) => {
    const newTags = (data.tags || []).filter(t => t !== tag);
    const { data: d } = await updateCRMCustomer(customerId, { tags: newTags });
    setData(prev => ({ ...prev, tags: d.data.tags }));
    onUpdate?.();
  };

  const badge = data ? SEGMENT_BADGE[data.segment] : null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="bg-gray-900 border border-white/10 rounded-t-3xl md:rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            {data && (
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarColor(data.name)} flex items-center justify-center text-sm font-bold shrink-0`}>
                {initials(data.name || '?')}
              </div>
            )}
            <div>
              <p className="text-white font-bold">{data?.name || 'Carregando...'}</p>
              <p className="text-xs text-gray-500">{data?.phone || ''}</p>
            </div>
            {badge && (
              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${badge.cls}`}>
                {badge.label}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none px-1">×</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Carregando...</div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

            {/* Métricas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Pedidos',       value: data.order_count ?? 0,           color: 'text-blue-400' },
                { label: 'Total gasto',   value: fmtBRL(data.total_spent),         color: 'text-green-400' },
                { label: 'Cashback',      value: fmtBRL(data.cashback_balance),    color: 'text-yellow-400' },
                { label: 'Cliente desde', value: fmtDate(data.created_at),         color: 'text-gray-300' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-gray-800/60 rounded-xl p-3 border border-white/[0.06]">
                  <p className="text-[11px] text-gray-500 mb-1">{label}</p>
                  <p className={`text-base font-black ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Tags */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tags</p>
              <div className="flex flex-wrap gap-2">
                {(data.tags || []).map((tag, i) => (
                  <span key={tag} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${TAG_COLORS[i % TAG_COLORS.length]}`}>
                    {tag}
                    <button onClick={() => removeTag(tag)} className="opacity-60 hover:opacity-100 text-xs ml-0.5">×</button>
                  </span>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); } }}
                    placeholder="+ nova tag"
                    className="h-7 px-2.5 text-xs rounded-full bg-gray-700/60 border border-white/10 text-gray-300 placeholder-gray-600 outline-none focus:border-orange-500/50 w-24"
                  />
                </div>
              </div>
            </div>

            {/* Notas */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Anotações internas</p>
                {!editNotes && (
                  <button onClick={() => setEditNotes(true)} className="text-xs text-orange-400 hover:text-orange-300">
                    {data.notes ? '✏️ Editar' : '+ Adicionar nota'}
                  </button>
                )}
              </div>
              {editNotes ? (
                <div className="space-y-2">
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Ex: prefere sem cebola, paga sempre no pix, cliente VIP pessoal..."
                    className="input w-full resize-none text-sm"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setEditNotes(false)} className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400">Cancelar</button>
                    <button onClick={saveNotes} disabled={saving} className="px-3 py-1.5 text-xs rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-bold disabled:opacity-50">
                      {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 bg-gray-800/40 rounded-xl px-4 py-3 min-h-[44px] whitespace-pre-wrap">
                  {data.notes || <span className="text-gray-600 italic">Sem anotações.</span>}
                </p>
              )}
            </div>

            {/* Histórico de pedidos */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Últimos pedidos {data.orders?.length > 0 && <span className="text-gray-600 font-normal">({data.orders.length})</span>}
              </p>
              {!data.orders?.length ? (
                <p className="text-sm text-gray-600 italic">Nenhum pedido registrado.</p>
              ) : (
                <div className="space-y-2">
                  {data.orders.map((o) => (
                    <div key={o.id} className="flex items-center justify-between bg-gray-800/40 rounded-xl px-4 py-2.5 border border-white/[0.05]">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs text-gray-600 font-mono">#{o.order_number}</span>
                        <span className="text-xs text-gray-400 truncate">{fmtDate(o.created_at)}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          o.status === 'delivered' ? 'bg-green-500/20 text-green-400' :
                          o.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                          'bg-gray-700 text-gray-400'
                        }`}>{o.status}</span>
                      </div>
                      <span className="text-sm font-bold text-white shrink-0 ml-3">{fmtBRL(o.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ações */}
            {data.phone && (
              <div className="pt-2 pb-2">
                <a
                  href={`https://wa.me/55${data.phone.replace(/\D/g,'')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-green-500/20 hover:bg-green-500/30 text-green-300 font-semibold text-sm transition-colors border border-green-500/20"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Enviar mensagem no WhatsApp
                </a>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function TabCRM() {
  const [customers,  setCustomers]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [segment,    setSegment]    = useState('todos');
  const [page,       setPage]       = useState(1);
  const [meta,       setMeta]       = useState({ total: 0, pages: 1 });
  const [selected,   setSelected]   = useState(null);
  const searchRef = useRef(null);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const { data } = await listCRMCustomers({
        search: search || undefined,
        segment: segment !== 'todos' ? segment : undefined,
        page: p, limit: 30,
      });
      setCustomers(data.data ?? []);
      setMeta(data.meta ?? { total: 0, pages: 1 });
      setPage(p);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [search, segment]);

  useEffect(() => { load(1); }, [load]);

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden gap-3">

      {/* Toolbar */}
      <div className="flex gap-2 shrink-0 flex-wrap">
        <input
          ref={searchRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar por nome ou telefone..."
          className="input flex-1 min-w-48 text-sm"
        />
        <select
          value={segment}
          onChange={e => setSegment(e.target.value)}
          className="input w-44 text-sm"
        >
          <option value="todos">Todos os segmentos</option>
          <option value="vip">⭐ VIP</option>
          <option value="recorrente">🔄 Recorrente</option>
          <option value="novo">✨ Novo</option>
          <option value="lead">👋 Lead</option>
          <option value="em_risco">⚠️ Em risco</option>
          <option value="perdido">💤 Perdido</option>
        </select>
        <div className="text-xs text-gray-500 flex items-center px-2">
          {meta.total} cliente{meta.total !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-gray-800/40 border border-white/[0.07] rounded-2xl">
        {loading ? (
          <div className="flex items-center justify-center h-40 gap-2 text-gray-500 text-sm">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Carregando...
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-600">
            <span className="text-3xl">👥</span>
            <p className="text-sm">Nenhum cliente encontrado</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10 bg-gray-800/95 backdrop-blur-sm">
              <tr className="border-b border-white/[0.06]">
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Segmento</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-center hidden sm:table-cell">Pedidos</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-right hidden md:table-cell">Total gasto</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-right hidden lg:table-cell">Último pedido</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-center">Tags</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c, i) => {
                const badge = SEGMENT_BADGE[c.segment] ?? SEGMENT_BADGE.lead;
                const col   = avatarColor(c.name);
                return (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.015, 0.25) }}
                    onClick={() => setSelected(c.id)}
                    className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${col} flex items-center justify-center text-xs font-bold shrink-0`}>
                          {initials(c.name || '?')}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-200 truncate">{c.name || '—'}</p>
                          <p className="text-[11px] text-gray-600">{c.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 text-center tabular-nums hidden sm:table-cell">
                      {c.order_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 text-right tabular-nums hidden md:table-cell">
                      {c.total_spent > 0 ? fmtBRL(c.total_spent) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-right hidden lg:table-cell">
                      {fmtDate(c.last_order_date)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-wrap gap-1 justify-center">
                        {(c.tags || []).slice(0, 2).map((tag, ti) => (
                          <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${TAG_COLORS[ti % TAG_COLORS.length]}`}>
                            {tag}
                          </span>
                        ))}
                        {(c.tags || []).length > 2 && (
                          <span className="text-[10px] text-gray-600">+{c.tags.length - 2}</span>
                        )}
                        {c.notes && <span className="text-[10px] text-gray-600" title={c.notes}>📝</span>}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {meta.pages > 1 && (
        <div className="flex items-center justify-center gap-2 shrink-0">
          <button disabled={page <= 1} onClick={() => load(page - 1)} className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 disabled:opacity-30">‹ Anterior</button>
          <span className="text-xs text-gray-500">Página {page} de {meta.pages}</span>
          <button disabled={page >= meta.pages} onClick={() => load(page + 1)} className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 disabled:opacity-30">Próxima ›</button>
        </div>
      )}

      {/* Detail panel */}
      <AnimatePresence>
        {selected && (
          <CRMDetailPanel
            customerId={selected}
            onClose={() => setSelected(null)}
            onUpdate={() => load(page)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Tab: Campanhas WhatsApp ───────────────────────────────────

const SEGMENT_LABELS = {
  todos:      { label: 'Todos os clientes', icon: '👥', color: 'blue' },
  vip:        { label: 'VIP',               icon: '⭐', color: 'yellow' },
  recorrente: { label: 'Recorrentes',        icon: '🔄', color: 'green' },
  novo:       { label: 'Novos',              icon: '✨', color: 'blue' },
  lead:       { label: 'Leads',              icon: '👋', color: 'gray' },
  em_risco:   { label: 'Em Risco',           icon: '⚠️', color: 'orange' },
  perdido:    { label: 'Perdidos',           icon: '💤', color: 'red' },
};

const STATUS_BADGE = {
  draft:   { label: 'Rascunho',  cls: 'bg-gray-700 text-gray-300' },
  sending: { label: 'Enviando',  cls: 'bg-blue-500/20 text-blue-300 animate-pulse' },
  done:    { label: 'Concluída', cls: 'bg-green-500/20 text-green-300' },
  failed:  { label: 'Com erros', cls: 'bg-red-500/20 text-red-300' },
};

const MESSAGE_TEMPLATES = [
  { label: 'Boas-vindas',        text: 'Olá, {nome}! 👋 Sentimos sua falta! Temos novidades esperando por você. Acesse agora e peça com facilidade! 🍽️' },
  { label: 'Desconto especial',  text: 'Oi {nome}! 🎁 Só hoje você tem 15% de desconto no seu pedido. Use o cupom VOLTA15 e aproveite!' },
  { label: 'Frete grátis',       text: '{nome}, frete GRÁTIS no seu próximo pedido! 🛵 Oferta válida hoje. Não perca! 🔥' },
  { label: 'Win-back',           text: 'Oi {nome}, sumiu! 😢 A gente sente sua falta. Que tal dar uma chance e fazer um pedido hoje? Temos um desconto exclusivo pra você!' },
  { label: 'Promoção do dia',    text: '🔥 Promoção relâmpago! {nome}, hoje temos ofertas especiais no cardápio. Corre lá e confere! 🍔🍕' },
];

function TabCampanhas() {
  const [campaigns,  setCampaigns]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [sending,    setSending]    = useState({});

  // Create form state
  const [cfName,    setCfName]    = useState('');
  const [cfSegment, setCfSegment] = useState('todos');
  const [cfMessage, setCfMessage] = useState('');
  const [cfPreview, setCfPreview] = useState(null);
  const [cfSaving,  setCfSaving]  = useState(false);
  const [cfError,   setCfError]   = useState('');
  const previewTimer = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await listCampaigns();
      setCampaigns(data.data ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Preview count ao trocar segmento
  useEffect(() => {
    clearTimeout(previewTimer.current);
    setCfPreview(null);
    previewTimer.current = setTimeout(async () => {
      try {
        const { data } = await previewCampaign(cfSegment);
        setCfPreview(data.data?.count ?? 0);
      } catch { /* silent */ }
    }, 400);
  }, [cfSegment]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!cfName.trim() || !cfMessage.trim()) return;
    setCfSaving(true); setCfError('');
    try {
      await createCampaign({ name: cfName.trim(), segment: cfSegment, message: cfMessage.trim() });
      setCfName(''); setCfSegment('todos'); setCfMessage('');
      setShowCreate(false);
      await load();
    } catch (err) {
      setCfError(err.response?.data?.message ?? 'Erro ao criar campanha.');
    } finally { setCfSaving(false); }
  };

  const handleSend = async (id) => {
    setSending((s) => ({ ...s, [id]: true }));
    try {
      await sendCampaign(id);
      await load();
    } catch (err) {
      alert(err.response?.data?.message ?? 'Erro ao disparar campanha.');
    } finally {
      setSending((s) => ({ ...s, [id]: false }));
    }
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">

      {/* Toolbar */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <p className="text-sm font-bold text-white">Campanhas WhatsApp</p>
          <p className="text-xs text-gray-500 mt-0.5">Dispare mensagens para segmentos de clientes via WhatsApp</p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-xl transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Nova Campanha
        </button>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden shrink-0"
          >
            <form onSubmit={handleCreate} className="bg-gray-800/60 border border-white/[0.08] rounded-2xl p-5 space-y-4">
              <p className="text-sm font-black text-white">📣 Nova Campanha</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Nome da campanha *</label>
                  <input value={cfName} onChange={(e) => setCfName(e.target.value)}
                    placeholder="Ex: Promoção de Domingo" className="input w-full" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Segmento de destino *</label>
                  <div className="flex items-center gap-2">
                    <select value={cfSegment} onChange={(e) => setCfSegment(e.target.value)}
                      className="input flex-1">
                      {Object.entries(SEGMENT_LABELS).map(([key, s]) => (
                        <option key={key} value={key}>{s.icon} {s.label}</option>
                      ))}
                    </select>
                    {cfPreview !== null && (
                      <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                        {cfPreview} contatos
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-400 font-semibold">Mensagem * <span className="text-gray-600 font-normal ml-1">use {'{nome}'} para personalizar</span></label>
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    {MESSAGE_TEMPLATES.map((t) => (
                      <button key={t.label} type="button"
                        onClick={() => setCfMessage(t.text)}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={cfMessage} onChange={(e) => setCfMessage(e.target.value)}
                  rows={4} placeholder="Digite a mensagem que será enviada via WhatsApp..."
                  className="input w-full resize-none"
                />
                <p className="text-[11px] text-gray-600 mt-1">{cfMessage.length} caracteres</p>
              </div>

              {cfError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{cfError}</p>
              )}

              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white border border-white/10 hover:bg-white/[0.06] font-semibold transition-all">
                  Cancelar
                </button>
                <button type="submit" disabled={cfSaving || !cfName.trim() || !cfMessage.trim()}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white transition-all">
                  {cfSaving ? 'Criando...' : '✅ Criar Campanha'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-500">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Carregando...</span>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
            <span className="text-5xl">📣</span>
            <p className="text-sm font-semibold">Nenhuma campanha ainda</p>
            <p className="text-xs text-center max-w-xs">Crie sua primeira campanha para disparar mensagens WhatsApp para um grupo de clientes.</p>
          </div>
        ) : (
          campaigns.map((c) => {
            const seg  = SEGMENT_LABELS[c.segment] ?? SEGMENT_LABELS.todos;
            const stat = STATUS_BADGE[c.status]    ?? STATUS_BADGE.draft;
            const pct  = c.total > 0 ? Math.round(((c.sent + c.failed) / c.total) * 100) : 0;
            const isDone    = c.status === 'done';
            const isSending = c.status === 'sending';
            const isDraft   = c.status === 'draft';

            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-800/50 border border-white/[0.07] rounded-2xl p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-black text-white truncate">{c.name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${stat.cls}`}>
                        {stat.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-gray-500">{seg.icon} {seg.label}</span>
                      <span className="text-gray-700">·</span>
                      <span className="text-xs text-gray-500">{c.total} contatos</span>
                      <span className="text-gray-700">·</span>
                      <span className="text-xs text-gray-600">{fmtDate(c.created_at)}</span>
                    </div>
                  </div>

                  {isDraft && (
                    <button
                      onClick={() => handleSend(c.id)}
                      disabled={!!sending[c.id]}
                      className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-bold transition-all disabled:opacity-50 active:scale-95"
                    >
                      {sending[c.id] ? (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : '🚀'}
                      {sending[c.id] ? 'Iniciando...' : 'Disparar'}
                    </button>
                  )}
                </div>

                {/* Mensagem preview */}
                <p className="text-xs text-gray-600 italic truncate mb-3">"{c.message}"</p>

                {/* Progress bar (quando enviando ou concluída) */}
                {(isSending || isDone) && c.total > 0 && (
                  <div className="space-y-1.5">
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5 }}
                        className={`h-full rounded-full ${isDone ? 'bg-green-500' : 'bg-blue-500'}`}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-gray-500">
                      <span>✅ {c.sent} enviados · ❌ {c.failed} falhas</span>
                      <span className="tabular-nums">{pct}%</span>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </div>
    </div>
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
            {activeTab === 'todos'     && <TabTodos />}
            {activeTab === 'funil'     && <TabFunil />}
            {activeTab === 'crm'       && <TabCRM />}
            {activeTab === 'campanhas' && <TabCampanhas />}
            {activeTab !== 'todos' && activeTab !== 'funil' && activeTab !== 'crm' && activeTab !== 'campanhas' && <ComingSoon tab={activeTab} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
