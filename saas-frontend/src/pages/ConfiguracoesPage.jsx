import { useState, useCallback, useEffect, useRef } from 'react';
import Toast from '../components/Toast';
import api from '../api/axios';
import { Map, MapMarker, MarkerContent, MapControls, useMap } from '../components/ui/map';
import {
  updateProfile, updateTenantProfile, getTenantInfo,
  listUsers, createUser, updateUser, deactivateUser,
  getWhatsappStatus, connectWhatsapp, disconnectWhatsapp,
  updateSettings, getFullSettings,
  listCoupons, createCoupon, updateCoupon,
  listTables, createTable, deleteTable,
} from '../api/users';
import { PAY_OPTIONS } from '../constants/orders';

// ── Helpers ───────────────────────────────────────────────────

const getUser = () => {
  try { return JSON.parse(localStorage.getItem('user') ?? '{}'); }
  catch { return {}; }
};

const ROLE_LABELS = { owner: 'Proprietário', manager: 'Gerente', staff: 'Colaborador' };
const ROLE_CLS    = {
  owner:   'bg-orange-500/20 text-orange-300',
  manager: 'bg-blue-500/20 text-blue-300',
  staff:   'bg-gray-700/60 text-gray-400',
};

// ── Tab button ────────────────────────────────────────────────

function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
        active ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab 0 — QR Code do Cardápio
// ─────────────────────────────────────────────────────────────

function QrCodeTab({ currentUser }) {
  const slug    = currentUser?.tenant?.slug ?? '';
  const menuUrl = slug ? `${window.location.origin}/menu/${slug}` : '';
  const qrSrc   = menuUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&color=000000&bgcolor=ffffff&data=${encodeURIComponent(menuUrl)}`
    : null;

  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(menuUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQr = () => {
    const link = document.createElement('a');
    link.href = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(menuUrl)}&format=png`;
    link.download = `cardapio-${slug}.png`;
    link.target = '_blank';
    link.click();
  };

  if (!slug) {
    return (
      <p className="text-gray-500 text-sm italic py-6 text-center">
        Slug do restaurante não encontrado. Faça login novamente.
      </p>
    );
  }

  return (
    <div className="max-w-sm space-y-6">
      {/* QR code preview */}
      <div className="flex flex-col items-center gap-4 p-6 bg-gray-800/60 rounded-2xl border border-white/[0.06]">
        {qrSrc ? (
          <img
            src={qrSrc}
            alt="QR Code do cardápio"
            className="w-48 h-48 rounded-xl shadow-lg bg-white p-2"
          />
        ) : (
          <div className="w-48 h-48 rounded-xl bg-gray-700 flex items-center justify-center text-gray-500 text-xs">
            Gerando…
          </div>
        )}
        <p className="text-xs text-gray-500 text-center">
          Imprima ou exiba este QR Code para seus clientes acessarem o cardápio digital.
        </p>
      </div>

      {/* Link do cardápio */}
      <div>
        <label className="text-xs text-gray-400 font-semibold mb-1 block">Link do Cardápio</label>
        <div className="flex gap-2">
          <input
            readOnly
            value={menuUrl}
            className="input flex-1 text-xs text-gray-300 bg-gray-800/80 cursor-text select-all"
            onClick={(e) => e.target.select()}
          />
          <button
            onClick={copyLink}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
              copied ? 'bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
          >
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <a
          href={menuUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors text-center"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Abrir Cardápio
        </a>
        <button
          onClick={downloadQr}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-semibold transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Baixar QR
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab 1 — Restaurante
// ─────────────────────────────────────────────────────────────

function RestauranteTab({ currentUser, onToast }) {
  const [name,           setName]           = useState('');
  const [whatsapp,       setWhatsapp]       = useState('');
  const [address,        setAddress]        = useState('');
  const [defaultFee,     setDefaultFee]     = useState(
    () => localStorage.getItem('defaultDeliveryFee') ?? ''
  );
  const [markerPos,      setMarkerPos]      = useState(null);  // [lng, lat]
  const [showMap,        setShowMap]        = useState(false);
  const [geocoding,      setGeocoding]      = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [tenant,         setTenant]         = useState(null);
  const [chatbotEnabled, setChatbotEnabled] = useState(true);
  const [savingChatbot,  setSavingChatbot]  = useState(false);
  const mapRef = useRef(null);

  // Reverse-geocode helper
  const reverseGeocode = useCallback(async (lng, lat) => {
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, { headers: { 'Accept-Language': 'pt-BR' } });
      const data = await res.json();
      const addr = data.address ?? {};
      const road = addr.road ?? addr.pedestrian ?? '';
      const num  = addr.house_number ?? '';
      const city = addr.city ?? addr.town ?? addr.village ?? '';
      const sub  = addr.suburb ?? addr.neighbourhood ?? '';
      return [road, num].filter(Boolean).join(', ') + (sub ? ` — ${sub}` : '') + (city ? `, ${city}` : '');
    } catch { return ''; }
  }, []);

  useEffect(() => {
    getTenantInfo()
      .then(({ data }) => {
        const t = data.data;
        setTenant(t);
        setName(t.name ?? '');
        setWhatsapp(t.whatsapp_number ?? '');
        setAddress(t.address ?? '');
        setChatbotEnabled(t.chatbot_enabled ?? true);
      })
      .catch(() => {});
    // Load saved coordinates
    getFullSettings()
      .then(({ data }) => {
        const s = data.data;
        if (s.restaurant_lat && s.restaurant_lng) {
          setMarkerPos([parseFloat(s.restaurant_lng), parseFloat(s.restaurant_lat)]);
        }
      })
      .catch(() => {});
  }, []);

  const handleChatbotToggle = async (val) => {
    setSavingChatbot(true);
    try {
      await api.patch('/tenant/chatbot', { enabled: val });
      setChatbotEnabled(val);
      onToast(val ? 'Chatbot ativado!' : 'Chatbot desativado.');
    } catch (err) {
      onToast(err.response?.data?.message ?? 'Erro ao alterar chatbot.', 'error');
    } finally {
      setSavingChatbot(false);
    }
  };

  if (currentUser.role !== 'owner') {
    return (
      <div className="text-gray-500 text-sm italic py-6 text-center">
        Apenas o proprietário pode alterar as informações do restaurante.
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateTenantProfile({ name, whatsappNumber: whatsapp.trim(), address: address.trim() });
      const u = getUser();
      if (u.tenant) { u.tenant.name = name.trim(); localStorage.setItem('user', JSON.stringify(u)); }
      const feeVal = parseFloat(defaultFee);
      if (feeVal > 0) localStorage.setItem('defaultDeliveryFee', String(feeVal));
      else localStorage.removeItem('defaultDeliveryFee');
      onToast('Dados do restaurante atualizados!');
    } catch (err) {
      onToast(err.response?.data?.message ?? 'Erro ao atualizar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLocation = async () => {
    if (!markerPos) return;
    setSavingLocation(true);
    try {
      await updateSettings({ restaurantLat: markerPos[1], restaurantLng: markerPos[0] });
      onToast('Localização do restaurante salva!');
      setShowMap(false);
    } catch (err) {
      onToast(err.response?.data?.message ?? 'Erro ao salvar localização.', 'error');
    } finally {
      setSavingLocation(false);
    }
  };

  const DEFAULT_CENTER = markerPos ?? [-49.7802, -29.3965];

  return (
    <div className="max-w-xl space-y-5">
      {/* Plan card */}
      <div className="bg-gray-800/60 rounded-2xl p-4 border border-white/[0.06] space-y-1">
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Plano atual</p>
        <p className="text-white font-semibold capitalize">{getUser().tenant?.plan ?? '—'}</p>
        {tenant?.usage && (
          <p className="text-xs text-gray-400">
            {tenant.usage.ordersThisMonth} / {tenant.usage.ordersLimit ?? '∞'} pedidos este mês
          </p>
        )}
      </div>

      {/* Basic info form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs text-gray-400 font-semibold mb-1 block">Nome do Restaurante *</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="input w-full" placeholder="Nome do restaurante" />
        </div>
        <div>
          <label className="text-xs text-gray-400 font-semibold mb-1 block">
            WhatsApp <span className="text-gray-600 font-normal">(aparece no cardápio do cliente)</span>
          </label>
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
            className="input w-full" placeholder="5511999999999" type="tel" />
          <p className="text-[11px] text-gray-600 mt-1">Formato: 55 + DDD + número. Ex: 5511999887766</p>
        </div>
        <div>
          <label className="text-xs text-gray-400 font-semibold mb-1 block">Endereço <span className="text-gray-600 font-normal">(texto livre)</span></label>
          <input value={address} onChange={(e) => setAddress(e.target.value)}
            className="input w-full" placeholder="Rua, número — Bairro, Cidade" />
        </div>
        <div>
          <label className="text-xs text-gray-400 font-semibold mb-1 block">
            Taxa de entrega padrão <span className="text-gray-600 font-normal">(R$)</span>
          </label>
          <input type="number" min="0" step="0.50" placeholder="0,00"
            value={defaultFee} onChange={(e) => setDefaultFee(e.target.value)}
            className="input w-40" />
        </div>
        <button type="submit" disabled={saving || !name.trim()}
          className="btn-green px-6 disabled:opacity-50">
          {saving ? 'Salvando...' : 'Salvar dados'}
        </button>
      </form>

      {/* Location on map */}
      <div className="pt-5 border-t border-white/[0.06]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">📍 Localização no mapa</p>
            <p className="text-[11px] text-gray-600 mt-0.5">
              {markerPos
                ? `Salvo: ${markerPos[1].toFixed(5)}, ${markerPos[0].toFixed(5)}`
                : 'Não definida — o mapa de entregas abrirá no centro padrão'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              // Ao abrir o mapa sem posição salva, inicializa no centro padrão
              // para que o botão "Confirmar" fique ativo imediatamente
              if (!showMap && !markerPos) {
                setMarkerPos([-49.7802, -29.3965]);
              }
              setShowMap((v) => !v);
            }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 transition-colors"
          >
            {showMap ? 'Fechar mapa' : markerPos ? '✏️ Alterar' : '📍 Definir no mapa'}
          </button>
        </div>

        {showMap && (
          <div className="space-y-2">
            <div className="h-64 rounded-2xl overflow-hidden border border-white/10">
              <Map
                ref={mapRef}
                defaultCenter={{ lng: DEFAULT_CENTER[0], lat: DEFAULT_CENTER[1] }}
                defaultZoom={15}
                theme="light"
                className="w-full h-full"
              >
                <MapControls position="top-right" showZoom showCompass={false} />
                <MapMarker
                  longitude={markerPos ? markerPos[0] : DEFAULT_CENTER[0]}
                  latitude={markerPos ? markerPos[1] : DEFAULT_CENTER[1]}
                  draggable
                  onDragEnd={async ({ lngLat }) => {
                    setMarkerPos([lngLat.lng, lngLat.lat]);
                    setGeocoding(true);
                    const addr = await reverseGeocode(lngLat.lng, lngLat.lat);
                    if (addr && !address.trim()) setAddress(addr);
                    setGeocoding(false);
                  }}
                >
                  <MarkerContent>
                    <div className="w-10 h-10 rounded-full bg-orange-500 border-2 border-white shadow-xl flex items-center justify-center text-lg select-none">
                      🍽️
                    </div>
                  </MarkerContent>
                </MapMarker>
              </Map>
            </div>
            <p className="text-[11px] text-gray-500">
              {geocoding ? '🔍 Buscando endereço...' : 'Arraste o marcador até a entrada do seu restaurante.'}
            </p>
            <button
              type="button"
              onClick={handleSaveLocation}
              disabled={savingLocation || !markerPos}
              className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold transition-all disabled:opacity-40"
            >
              {savingLocation ? 'Salvando...' : '✅ Confirmar localização'}
            </button>
          </div>
        )}
      </div>

      {/* Chatbot toggle */}
      <div className="pt-5 border-t border-white/[0.06]">
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">🤖 Chatbot WhatsApp</p>
        <div className={`flex items-center justify-between gap-4 px-4 py-4 rounded-2xl border transition-colors ${
          chatbotEnabled ? 'bg-green-500/10 border-green-500/25' : 'bg-gray-800/60 border-white/[0.06]'
        }`}>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">
              {chatbotEnabled ? '✅ Chatbot ativo' : '⏸ Chatbot pausado'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {chatbotEnabled ? 'Respondendo automaticamente no WhatsApp' : 'Não está respondendo mensagens automáticas'}
            </p>
          </div>
          <button
            onClick={() => handleChatbotToggle(!chatbotEnabled)}
            disabled={savingChatbot}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
              chatbotEnabled ? 'bg-green-500' : 'bg-gray-600'
            }`}
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform ${
              chatbotEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab 2 — Minha Conta
// ─────────────────────────────────────────────────────────────

function ContaTab({ currentUser, onToast }) {
  const [name,    setName]    = useState(currentUser.name ?? '');
  const [curPwd,  setCurPwd]  = useState('');
  const [newPwd,  setNewPwd]  = useState('');
  const [confPwd, setConfPwd] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const updates = {};
    if (name.trim() !== currentUser.name) updates.name = name.trim();
    if (newPwd) {
      if (newPwd !== confPwd) return setError('As senhas não coincidem.');
      if (newPwd.length < 8)  return setError('Senha deve ter pelo menos 8 caracteres.');
      if (!curPwd)            return setError('Informe a senha atual.');
      updates.currentPassword = curPwd;
      updates.newPassword = newPwd;
    }
    if (!Object.keys(updates).length) return setError('Nenhuma alteração detectada.');

    setSaving(true);
    try {
      const { data } = await updateProfile(updates);
      // Update stored user name
      const u = getUser();
      u.name = data.data.name;
      localStorage.setItem('user', JSON.stringify(u));
      setCurPwd(''); setNewPwd(''); setConfPwd('');
      onToast('Perfil atualizado com sucesso!');
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao atualizar perfil.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-5">
      {/* Name */}
      <div>
        <label className="text-xs text-gray-400 font-semibold mb-1 block">Seu Nome</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input w-full" />
      </div>

      <div className="border-t border-white/[0.06] pt-4">
        <p className="text-xs text-gray-400 font-semibold mb-3">Alterar Senha <span className="text-gray-600 font-normal">(opcional)</span></p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Senha atual</label>
            <input type="password" value={curPwd} onChange={(e) => setCurPwd(e.target.value)}
              className="input w-full" placeholder="••••••••" autoComplete="current-password" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Nova senha</label>
            <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
              className="input w-full" placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Confirmar nova senha</label>
            <input type="password" value={confPwd} onChange={(e) => setConfPwd(e.target.value)}
              className="input w-full" placeholder="Repita a nova senha" autoComplete="new-password" />
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 font-semibold mb-1 block">E-mail</label>
        <input value={currentUser.email ?? ''} disabled className="input w-full opacity-50 cursor-not-allowed" />
        <p className="text-[11px] text-gray-600 mt-1">O e-mail não pode ser alterado.</p>
      </div>

      {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

      <button type="submit" disabled={saving} className="btn-green px-6 disabled:opacity-50">
        {saving ? 'Salvando...' : 'Salvar Alterações'}
      </button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab 3 — Equipe
// ─────────────────────────────────────────────────────────────

function AddUserModal({ onClose, onAdded }) {
  const [form,   setForm]   = useState({ name: '', email: '', password: '', role: 'staff' });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { data } = await createUser(form);
      onAdded(data.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Erro ao criar usuário.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-base font-black text-white">Adicionar Colaborador</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1 block">Nome *</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className="input w-full" placeholder="Nome completo" autoFocus />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1 block">E-mail *</label>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className="input w-full" placeholder="email@exemplo.com" />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1 block">Senha provisória *</label>
            <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} className="input w-full" placeholder="Mínimo 8 caracteres" />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-semibold mb-1 block">Função</label>
            <select value={form.role} onChange={(e) => set('role', e.target.value)} className="input w-full">
              <option value="staff">Colaborador</option>
              <option value="manager">Gerente</option>
            </select>
          </div>
          {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-green px-5 disabled:opacity-50">{saving ? 'Criando...' : 'Criar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EquipeTab({ currentUser, onToast }) {
  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listUsers();
      setUsers(data.data ?? []);
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRoleChange = async (id, role) => {
    try {
      const { data } = await updateUser(id, { role });
      setUsers((prev) => prev.map((u) => u.id === id ? data.data : u));
      onToast('Função atualizada.');
    } catch (err) {
      onToast(err.response?.data?.message ?? 'Erro.', 'error');
    }
  };

  const handleDeactivate = async (id) => {
    if (!confirm('Desativar este colaborador?')) return;
    try {
      await deactivateUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      onToast('Colaborador desativado.');
    } catch (err) {
      onToast(err.response?.data?.message ?? 'Erro.', 'error');
    }
  };

  const isOwner = currentUser.role === 'owner';

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{users.length} membro{users.length !== 1 ? 's' : ''}</p>
        {isOwner && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Adicionar
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3 bg-gray-800/60 rounded-xl border border-white/[0.06]">
              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 shrink-0 select-none">
                {(u.name ?? 'U')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-200 truncate">
                  {u.name}
                  {u.id === currentUser.id && (
                    <span className="ml-1.5 text-[10px] text-gray-500">(você)</span>
                  )}
                </p>
                <p className="text-xs text-gray-500 truncate">{u.email}</p>
              </div>

              {/* Role selector — owner can change others */}
              {isOwner && u.role !== 'owner' && u.id !== currentUser.id ? (
                <select
                  value={u.role}
                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                  className="input text-xs py-1 px-2 w-32"
                >
                  <option value="manager">Gerente</option>
                  <option value="staff">Colaborador</option>
                </select>
              ) : (
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_CLS[u.role] ?? ROLE_CLS.staff}`}>
                  {ROLE_LABELS[u.role] ?? u.role}
                </span>
              )}

              {/* Deactivate */}
              {isOwner && u.role !== 'owner' && u.id !== currentUser.id && (
                <button
                  onClick={() => handleDeactivate(u.id)}
                  className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  title="Desativar"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <AddUserModal
          onClose={() => setShowModal(false)}
          onAdded={(u) => { setUsers((prev) => [u, ...prev]); onToast('Colaborador criado!'); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab 4 — Motoboys
// ─────────────────────────────────────────────────────────────

const DRIVER_STATUS_ICON  = { available: '🟢', busy: '🟡', offline: '⚫' };
const DRIVER_STATUS_LABEL = { available: 'Disponível', busy: 'Em entrega', offline: 'Offline' };

function MotoboyTab({ currentUser, onToast }) {
  const [token,   setToken]   = useState('');
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // onToast is intentionally NOT in the dependency array to avoid an
  // infinite re-render loop: failure → onToast → parent re-render → new
  // onToast ref → load recreated → useEffect fires again → failure…
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [tkRes, drRes] = await Promise.all([
        api.get('/driver/restaurant/token'),
        api.get('/driver/restaurant/drivers'),
      ]);
      setToken(tkRes.data.data?.token ?? tkRes.data.data ?? '');
      setDrivers(drRes.data.data ?? []);
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Erro ao carregar dados de motoboys.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const qrData = token ? `ZAPFOME:${token}` : '';
  const qrSrc  = qrData
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
        <span className="text-3xl">⚠️</span>
        <p className="text-sm text-red-400 font-semibold">{error}</p>
        <button
          onClick={load}
          className="px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm text-white font-semibold transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-md">

      {/* Token display */}
      <div className="bg-gray-800/60 rounded-2xl p-5 border border-white/[0.06] space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-300">Código de Conexão</h3>
          <button
            onClick={load}
            className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Atualizar
          </button>
        </div>

        <p className="text-xs text-gray-500">
          Compartilhe este código com seus motoboys para que eles se conectem ao restaurante.
        </p>

        {/* Large monospace token */}
        <div className="flex items-center justify-center">
          <span className="text-4xl font-mono font-black tracking-[0.3em] text-white bg-gray-700/80 px-6 py-3 rounded-xl border border-white/10 select-all">
            {token || '——'}
          </span>
        </div>

        {/* QR Code */}
        {qrSrc && (
          <div className="flex flex-col items-center gap-2 pt-2">
            <img
              src={qrSrc}
              alt="QR Code para motoboys"
              className="w-40 h-40 rounded-xl shadow-lg bg-white p-2"
            />
            <p className="text-[11px] text-gray-500 text-center">
              Motoboys também podem escanear este QR Code no app ZapFome Driver.
            </p>
          </div>
        )}
      </div>

      {/* Connected drivers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-300">
            Motoboys Conectados
            <span className="ml-2 text-xs font-normal text-gray-500">({drivers.length})</span>
          </h3>
        </div>

        {drivers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-2 text-gray-600 bg-gray-800/40 rounded-xl border border-white/[0.04]">
            <span className="text-2xl">🛵</span>
            <p className="text-xs italic">Nenhum motoboy conectado ainda</p>
          </div>
        ) : (
          <div className="space-y-2">
            {drivers.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 px-4 py-3 bg-gray-800/60 rounded-xl border border-white/[0.06]"
              >
                <span className="text-xl shrink-0">
                  {DRIVER_STATUS_ICON[d.status] ?? '⚫'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-200 truncate">{d.name}</p>
                  {d.phone && (
                    <p className="text-xs text-gray-500 truncate">📞 {d.phone}</p>
                  )}
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                  d.status === 'available' ? 'bg-green-500/20 text-green-300' :
                  d.status === 'busy'      ? 'bg-yellow-500/20 text-yellow-300' :
                                             'bg-gray-700/60 text-gray-500'
                }`}>
                  {DRIVER_STATUS_LABEL[d.status] ?? d.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab: WhatsApp Connection
// ─────────────────────────────────────────────────────────────

function WhatsappTab({ onToast }) {
  const [status,      setStatus]      = useState(null); // { connected, instance, qrcode, status }
  const [loading,     setLoading]     = useState(true);
  const [connecting,  setConnecting]  = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await getWhatsappStatus();
      setStatus(data.data);
      // Para polling se conectou
      if (data.data?.connected && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data } = await connectWhatsapp();
      setStatus(data.data);
      onToast('Escaneie o QR Code no WhatsApp para conectar!');
      // Começa polling a cada 5s para detectar quando conectar
      pollRef.current = setInterval(async () => {
        try {
          const res = await getWhatsappStatus();
          setStatus(res.data.data);
          if (res.data.data?.connected) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            onToast('WhatsApp conectado com sucesso! ✅');
          }
        } catch { /* ignore */ }
      }, 5000);
    } catch (err) {
      onToast(err.response?.data?.message ?? 'Erro ao conectar WhatsApp.', 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Desconectar o WhatsApp? As notificações automáticas serão pausadas.')) return;
    try {
      await disconnectWhatsapp();
      setStatus({ connected: false, instance: null, qrcode: null, status: 'not_configured' });
      onToast('WhatsApp desconectado.');
    } catch (err) {
      onToast(err.response?.data?.message ?? 'Erro ao desconectar.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-sm space-y-5">
      {/* Status card */}
      <div className={`rounded-2xl border p-5 space-y-4 ${
        status?.connected
          ? 'bg-green-500/10 border-green-500/25'
          : 'bg-gray-800/60 border-white/[0.06]'
      }`}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{status?.connected ? '✅' : '📱'}</span>
          <div>
            <p className="text-base font-black text-white">
              {status?.connected ? 'WhatsApp conectado' : 'WhatsApp desconectado'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {status?.connected
                ? 'Notificações automáticas ativas para clientes'
                : 'Conecte para enviar atualizações de pedido via WhatsApp'}
            </p>
            {status?.instance && (
              <p className="text-[11px] text-gray-600 mt-0.5">Instância: {status.instance}</p>
            )}
          </div>
        </div>

        {/* QR Code */}
        {!status?.connected && status?.qrcode && (
          <div className="flex flex-col items-center gap-3 pt-2">
            <p className="text-xs text-amber-400 font-semibold text-center">
              📲 Abra o WhatsApp → Aparelhos Conectados → Conectar aparelho → Escaneie
            </p>
            <div className="bg-white p-3 rounded-2xl shadow-xl">
              <img
                src={status.qrcode.startsWith('data:') ? status.qrcode : `data:image/png;base64,${status.qrcode}`}
                alt="QR Code WhatsApp"
                className="w-52 h-52"
              />
            </div>
            <p className="text-[11px] text-gray-500 text-center animate-pulse">
              Aguardando conexão... (verificando a cada 5s)
            </p>
          </div>
        )}

        <div className="flex gap-2">
          {!status?.connected ? (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {connecting ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Conectando...</>
              ) : (
                <>{status?.qrcode ? '🔄 Atualizar QR Code' : '🔗 Conectar WhatsApp'}</>
              )}
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="flex-1 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/40 text-red-400 font-bold text-sm transition-colors border border-red-500/20"
            >
              Desconectar
            </button>
          )}
          <button onClick={load} className="p-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors" title="Atualizar">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="bg-gray-800/40 rounded-xl p-4 space-y-1.5 border border-white/[0.05]">
        <p className="text-xs font-bold text-gray-400">ℹ️ Como funciona</p>
        <p className="text-xs text-gray-500">Ao conectar, cada mudança de status do pedido (confirmado, em preparo, pronto, saiu para entrega) dispara uma mensagem automática para o número do cliente.</p>
        <p className="text-xs text-gray-500">Usa Evolution API local — sem custos extras por mensagem.</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab: Formas de Pagamento
// ─────────────────────────────────────────────────────────────

function PagamentosTab({ onToast }) {
  const [accepted, setAccepted] = useState(null); // string[] | null
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    getFullSettings()
      .then(({ data }) => {
        const methods = data.data?.accepted_payment_methods;
        setAccepted(Array.isArray(methods) ? methods : PAY_OPTIONS.map((p) => p.value));
      })
      .catch(() => setAccepted(PAY_OPTIONS.map((p) => p.value)));
  }, []);

  const toggle = (value) => {
    setAccepted((prev) => {
      if (!prev) return [value];
      return prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value];
    });
  };

  const handleSave = async () => {
    if (!accepted || accepted.length === 0) {
      onToast('Selecione pelo menos uma forma de pagamento.', 'error');
      return;
    }
    setSaving(true);
    try {
      await updateSettings({ acceptedPaymentMethods: accepted });
      onToast('Formas de pagamento salvas!');
    } catch (err) {
      onToast(err.response?.data?.message ?? 'Erro ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!accepted) {
    return <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-md space-y-5">
      <p className="text-sm text-gray-400">Selecione quais formas de pagamento o restaurante aceita. Apenas as ativas aparecerão na criação de pedidos.</p>
      <div className="space-y-2">
        {PAY_OPTIONS.map(({ value, label }) => {
          const on = accepted.includes(value);
          const [emoji, ...rest] = label.split(' ');
          return (
            <button
              key={value}
              type="button"
              onClick={() => toggle(value)}
              className={[
                'w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all',
                on ? 'border-green-500/40 bg-green-500/10 text-white' : 'border-white/10 bg-gray-800/40 text-gray-500 hover:border-white/20 hover:text-gray-300',
              ].join(' ')}
            >
              <span className="flex items-center gap-2.5 text-sm font-semibold">
                <span className="text-lg">{emoji}</span>
                {rest.join(' ')}
              </span>
              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-black transition-colors ${on ? 'bg-green-500 border-green-500 text-white' : 'border-gray-600'}`}>
                {on ? '✓' : ''}
              </span>
            </button>
          );
        })}
      </div>
      <button onClick={handleSave} disabled={saving} className="btn-green px-6 disabled:opacity-50">
        {saving ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab: Zonas de Entrega (com desenho de polígonos no mapa)
// ─────────────────────────────────────────────────────────────

const ZONE_COLORS = ['#f97316','#3b82f6','#22c55e','#a855f7','#ec4899','#14b8a6','#f59e0b','#ef4444'];

/** Componente interno — usa useMap() para desenhar polígonos no mapa */
function PolygonLayer({ zones, drawPoints, isDrawing, onMapClick, onMapDblClick }) {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !isLoaded) return;

    // ── GeoJSON dos polígonos já salvos ───────────────────────
    const zonesGeo = {
      type: 'FeatureCollection',
      features: zones
        .filter((z) => z.polygon?.length >= 3)
        .map((z, i) => ({
          type: 'Feature',
          properties: { name: z.name, fee: z.fee, color: z.color || ZONE_COLORS[i % ZONE_COLORS.length] },
          geometry: { type: 'Polygon', coordinates: [[...z.polygon, z.polygon[0]]] },
        })),
    };

    // ── GeoJSON do polígono em desenho ────────────────────────
    const pts = drawPoints;
    const drawGeo = {
      type: 'FeatureCollection',
      features: [
        ...(pts.length >= 2 ? [{
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: pts },
        }] : []),
        ...pts.map((pt) => ({
          type: 'Feature', properties: {},
          geometry: { type: 'Point', coordinates: pt },
        })),
      ],
    };

    // Atualiza ou cria fontes
    if (map.getSource('zones-src')) {
      map.getSource('zones-src').setData(zonesGeo);
    } else {
      map.addSource('zones-src', { type: 'geojson', data: zonesGeo });
      map.addLayer({ id: 'zones-fill',    type: 'fill',   source: 'zones-src', paint: { 'fill-color': ['get','color'], 'fill-opacity': 0.18 } });
      map.addLayer({ id: 'zones-outline', type: 'line',   source: 'zones-src', paint: { 'line-color': ['get','color'], 'line-width': 2 } });
      map.addLayer({ id: 'zones-labels',  type: 'symbol', source: 'zones-src',
        layout: { 'text-field': '{name}', 'text-size': 12, 'text-anchor': 'center' },
        paint:  { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1 },
      });
    }

    if (map.getSource('draw-src')) {
      map.getSource('draw-src').setData(drawGeo);
    } else {
      map.addSource('draw-src', { type: 'geojson', data: drawGeo });
      map.addLayer({ id: 'draw-line', type: 'line',   source: 'draw-src', filter: ['==','$type','LineString'],
        paint: { 'line-color': '#f97316', 'line-width': 2, 'line-dasharray': [3,2] },
      });
      map.addLayer({ id: 'draw-pts', type: 'circle', source: 'draw-src', filter: ['==','$type','Point'],
        paint: { 'circle-radius': 5, 'circle-color': '#f97316', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
      });
    }

    // Cursor
    map.getCanvas().style.cursor = isDrawing ? 'crosshair' : '';

    // Handlers de clique
    const handleClick = (e) => {
      if (!isDrawing) return;
      e.preventDefault();
      onMapClick([e.lngLat.lng, e.lngLat.lat]);
    };
    const handleDblClick = (e) => {
      if (!isDrawing) return;
      e.preventDefault();
      onMapDblClick();
    };
    map.on('click', handleClick);
    map.on('dblclick', handleDblClick);
    return () => {
      map.off('click', handleClick);
      map.off('dblclick', handleDblClick);
      map.getCanvas().style.cursor = '';
    };
  }, [map, isLoaded, zones, drawPoints, isDrawing, onMapClick, onMapDblClick]);

  return null;
}

function ZonasTab({ onToast }) {
  const [zoneType,    setZoneType]    = useState('polygon'); // 'polygon' | 'radius'
  const [zones,       setZones]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [isDrawing,   setIsDrawing]   = useState(false);
  const [drawPoints,  setDrawPoints]  = useState([]);
  const [pendingPoly, setPendingPoly] = useState(null); // polygon awaiting name+fee
  const [editName,    setEditName]    = useState('');
  const [editFee,     setEditFee]     = useState('');
  const [restCenter,  setRestCenter]  = useState(null);
  // radius mode
  const [newRadius,   setNewRadius]   = useState('');
  const [newRadFee,   setNewRadFee]   = useState('');

  useEffect(() => {
    getFullSettings().then(({ data }) => {
      const d = data.data;
      setZoneType(d?.delivery_zone_type || 'polygon');
      setZones(Array.isArray(d?.delivery_zones) ? d.delivery_zones : []);
      if (d?.restaurant_lat && d?.restaurant_lng)
        setRestCenter([parseFloat(d.restaurant_lng), parseFloat(d.restaurant_lat)]);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const mapCenter = restCenter ?? [-49.7802, -29.3965];

  const handleMapClick = useCallback(([lng, lat]) => {
    setDrawPoints((p) => [...p, [lng, lat]]);
  }, []);

  const handleMapDblClick = useCallback(() => {
    setDrawPoints((pts) => {
      if (pts.length < 3) return pts;
      setPendingPoly(pts);
      setIsDrawing(false);
      return [];
    });
  }, []);

  const closePoly = () => {
    if (drawPoints.length < 3) return;
    setPendingPoly(drawPoints);
    setIsDrawing(false);
    setDrawPoints([]);
  };

  const cancelDraw = () => {
    setIsDrawing(false);
    setDrawPoints([]);
    setPendingPoly(null);
    setEditName('');
    setEditFee('');
  };

  const confirmZone = () => {
    if (!editName.trim() || !editFee || !pendingPoly) return;
    const color = ZONE_COLORS[zones.length % ZONE_COLORS.length];
    setZones((z) => [...z, { name: editName.trim(), fee: parseFloat(editFee), polygon: pendingPoly, color }]);
    setPendingPoly(null); setEditName(''); setEditFee('');
  };

  const removeZone = (i) => setZones((z) => z.filter((_, idx) => idx !== i));

  const addRadius = () => {
    if (!newRadius || !newRadFee) return;
    const sorted = [...zones, { radiusKm: parseFloat(newRadius), fee: parseFloat(newRadFee) }]
      .sort((a, b) => a.radiusKm - b.radiusKm);
    setZones(sorted);
    setNewRadius(''); setNewRadFee('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({ deliveryZones: zones, deliveryZoneType: zoneType });
      onToast('Zonas de entrega salvas!');
    } catch (err) {
      onToast(err.response?.data?.message ?? 'Erro ao salvar.', 'error');
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      {/* Tipo */}
      <div>
        <label className="text-xs text-gray-400 font-semibold mb-2 block">Modelo de cobrança</label>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          {[
            { v: 'polygon', emoji: '🗺️', title: 'Por área no mapa',    desc: 'Desenhe polígonos no mapa real' },
            { v: 'radius',  emoji: '📍', title: 'Por raio da loja',    desc: 'Raios concêntricos com taxas diferentes' },
          ].map(({ v, emoji, title, desc }) => (
            <button key={v} type="button" onClick={() => { setZoneType(v); cancelDraw(); }}
              className={['flex flex-col gap-1 p-4 rounded-xl border-2 text-left transition-all',
                zoneType === v ? 'border-orange-400 bg-orange-500/10' : 'border-white/10 hover:border-white/20 bg-gray-800/40',
              ].join(' ')}
            >
              <span className="text-2xl">{emoji}</span>
              <p className="text-sm font-bold text-white">{title}</p>
              <p className="text-xs text-gray-400">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Modo Polígono ────────────────────────────────────── */}
      {zoneType === 'polygon' && (
        <div className="flex gap-4 flex-col lg:flex-row">

          {/* Painel esquerdo — lista + confirmação */}
          <div className="w-full lg:w-64 shrink-0 space-y-3">

            {/* Confirmar zona desenhada */}
            {pendingPoly && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-bold text-orange-300">✏️ Nomear zona desenhada</p>
                <input value={editName} onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nome (ex: Centro, Zona Norte)" className="input w-full text-sm" autoFocus />
                <div className="flex items-center gap-2">
                  <input type="number" min="0" step="0.5" value={editFee}
                    onChange={(e) => setEditFee(e.target.value)}
                    placeholder="Taxa R$" className="input flex-1 text-sm" />
                  <button onClick={confirmZone} disabled={!editName.trim() || !editFee}
                    className="px-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm disabled:opacity-40 shrink-0">
                    ✓
                  </button>
                </div>
                <button onClick={cancelDraw} className="w-full text-xs text-gray-500 hover:text-red-400 transition-colors">
                  Descartar polígono
                </button>
              </div>
            )}

            {/* Botão desenhar */}
            {!pendingPoly && (
              <button
                onClick={() => { setIsDrawing(true); setDrawPoints([]); }}
                disabled={isDrawing}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-orange-500/40 text-orange-400 hover:bg-orange-500/10 text-sm font-bold transition-all disabled:opacity-50"
              >
                {isDrawing ? '🖊️ Clicando no mapa...' : '+ Desenhar nova zona'}
              </button>
            )}

            {/* Instrução de desenho */}
            {isDrawing && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 space-y-2">
                <p className="text-xs text-blue-300 font-semibold">🖊️ Modo desenho ativo</p>
                <p className="text-xs text-gray-400">• Clique no mapa para adicionar pontos</p>
                <p className="text-xs text-gray-400">• Duplo-clique para fechar</p>
                <p className="text-xs text-gray-400 tabular-nums">{drawPoints.length} pontos</p>
                <div className="flex gap-2">
                  <button onClick={closePoly} disabled={drawPoints.length < 3}
                    className="flex-1 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold disabled:opacity-40 transition-all">
                    Fechar polígono
                  </button>
                  <button onClick={cancelDraw}
                    className="flex-1 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold transition-all">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Lista de zonas */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                {zones.length} zona{zones.length !== 1 ? 's' : ''} configurada{zones.length !== 1 ? 's' : ''}
              </p>
              {zones.length === 0 && !isDrawing && !pendingPoly && (
                <p className="text-xs text-gray-600 italic">Nenhuma zona ainda. Clique em "Desenhar nova zona".</p>
              )}
              {zones.map((z, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-800/60 rounded-xl px-3 py-2.5 border border-white/[0.06]">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: z.color || ZONE_COLORS[i % ZONE_COLORS.length] }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-200 truncate">{z.name}</p>
                    <p className="text-[10px] text-green-400 font-bold">R$ {parseFloat(z.fee).toFixed(2)}</p>
                  </div>
                  <button onClick={() => removeZone(i)} className="text-gray-600 hover:text-red-400 transition-colors text-sm shrink-0">✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* Mapa */}
          <div className="flex-1 min-h-[420px] rounded-2xl overflow-hidden border border-white/10">
            <Map defaultCenter={{ lng: mapCenter[0], lat: mapCenter[1] }} defaultZoom={13} theme="dark" className="w-full h-full">
              <MapControls position="top-right" showZoom showCompass={false} />
              {/* Marca o restaurante */}
              {restCenter && (
                <MapMarker longitude={restCenter[0]} latitude={restCenter[1]}>
                  <MarkerContent>
                    <div className="w-8 h-8 rounded-full bg-orange-500 border-2 border-white shadow-lg flex items-center justify-center text-sm select-none">🍽️</div>
                  </MarkerContent>
                </MapMarker>
              )}
              <PolygonLayer
                zones={zones}
                drawPoints={drawPoints}
                isDrawing={isDrawing}
                onMapClick={handleMapClick}
                onMapDblClick={handleMapDblClick}
              />
            </Map>
          </div>
        </div>
      )}

      {/* ── Modo Raio ────────────────────────────────────────── */}
      {zoneType === 'radius' && (
        <div className="max-w-sm space-y-3">
          <p className="text-xs text-gray-500">
            💡 Para o raio funcionar, defina a localização do restaurante na aba <strong className="text-gray-300">Restaurante</strong>.
          </p>
          <div className="bg-gray-800/40 rounded-xl border border-white/[0.06] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/[0.06]">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Raios — {zones.length} zona{zones.length !== 1 ? 's' : ''}</p>
            </div>
            {zones.length === 0 ? (
              <p className="text-xs text-gray-600 italic text-center py-5">Nenhum raio configurado</p>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {zones.map((z, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <p className="text-sm font-semibold text-gray-200">Até {z.radiusKm} km</p>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-green-400">R$ {parseFloat(z.fee).toFixed(2)}</span>
                      <button onClick={() => removeZone(i)} className="text-gray-600 hover:text-red-400 transition-colors">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="px-4 py-3 bg-gray-800/60 border-t border-white/[0.06] flex gap-2">
              <input type="number" min="0.1" step="0.5" placeholder="km"
                value={newRadius} onChange={(e) => setNewRadius(e.target.value)}
                className="input w-20 text-sm" />
              <input type="number" min="0" step="0.5" placeholder="Taxa R$"
                value={newRadFee} onChange={(e) => setNewRadFee(e.target.value)}
                className="input flex-1 text-sm" />
              <button onClick={addRadius} disabled={!newRadius || !newRadFee}
                className="px-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm disabled:opacity-40">
                + Add
              </button>
            </div>
          </div>
        </div>
      )}

      <button onClick={handleSave} disabled={saving} className="btn-green px-6 disabled:opacity-50 w-fit">
        {saving ? 'Salvando...' : 'Salvar zonas'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab: Horários de Funcionamento
// ─────────────────────────────────────────────────────────────

const DAYS = [
  { key: 'seg', label: 'Segunda-feira' },
  { key: 'ter', label: 'Terça-feira' },
  { key: 'qua', label: 'Quarta-feira' },
  { key: 'qui', label: 'Quinta-feira' },
  { key: 'sex', label: 'Sexta-feira' },
  { key: 'sab', label: 'Sábado' },
  { key: 'dom', label: 'Domingo' },
];

const DEFAULT_HOURS = DAYS.map(() => ({ open: true, start: '08:00', end: '22:00' }));

// ── NFC-e Tab ────────────────────────────────────────────────

function NfceTab({ onToast }) {
  const [form,    setForm]    = useState({ apiKey: '', companyId: '', environment: 'Homologation', defaultNcm: '21069090', cfop: '5102' });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    api.get('/nfce/config')
      .then(({ data }) => {
        if (data.data) setForm((f) => ({ ...f, ...data.data }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/nfce/config', form);
      onToast('Configurações NFC-e salvas!', 'success');
    } catch (e) {
      onToast(e?.response?.data?.message ?? 'Erro ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-gray-500 text-sm">Carregando...</p>;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">🧾 NFC-e / Nota Fiscal</h3>
        <p className="text-sm text-gray-400">
          Integração com <a href="https://nfe.io" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">NFe.io</a>.
          Crie sua conta, registre a empresa e cole a API Key abaixo. A NFC-e é emitida por pedido no histórico.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1">API Key (NFe.io)</label>
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
            placeholder="Sua API Key do NFe.io"
            className="input w-full"
          />
          <p className="text-xs text-gray-600 mt-1">Acesse nfe.io → Conta → API Keys</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1">Company ID</label>
          <input
            type="text"
            value={form.companyId}
            onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))}
            placeholder="ID da empresa no NFe.io"
            className="input w-full"
          />
          <p className="text-xs text-gray-600 mt-1">Acesse nfe.io → Empresas → copie o ID</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">Ambiente</label>
            <select
              value={form.environment}
              onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))}
              className="input w-full"
            >
              <option value="Homologation">Homologação (testes)</option>
              <option value="Production">Produção</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">NCM padrão</label>
            <input
              type="text"
              value={form.defaultNcm}
              onChange={(e) => setForm((f) => ({ ...f, defaultNcm: e.target.value }))}
              placeholder="21069090"
              className="input w-full"
              maxLength={8}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1">CFOP</label>
          <input
            type="text"
            value={form.cfop}
            onChange={(e) => setForm((f) => ({ ...f, cfop: e.target.value }))}
            placeholder="5102"
            className="input w-full"
            maxLength={4}
          />
          <p className="text-xs text-gray-600 mt-1">5102 = venda dentro do estado | 6102 = venda para outro estado</p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-green w-full"
        >
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </div>

      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-sm text-yellow-300">
        <p className="font-semibold mb-1">⚠️ Requisitos para emissão</p>
        <ul className="space-y-1 text-yellow-300/80 list-disc list-inside text-xs">
          <li>CNPJ ativo com inscrição estadual</li>
          <li>Conta na NFe.io com empresa cadastrada e certificado digital (A1 ou A3)</li>
          <li>Para NCM de alimentos preparados: use <strong>21069090</strong></li>
          <li>Para bebidas: use <strong>22029000</strong></li>
          <li>Emita no modo Homologação primeiro para testar</li>
        </ul>
      </div>
    </div>
  );
}

// ── Impressoras Tab ───────────────────────────────────────────

const PRINTER_TARGETS = [
  { value: 'kitchen', label: '🍳 Cozinha',    cls: 'bg-orange-500/20 text-orange-300' },
  { value: 'bar',     label: '🍺 Bar',         cls: 'bg-cyan-500/20 text-cyan-300'    },
  { value: 'both',    label: '🔀 Ambos',       cls: 'bg-purple-500/20 text-purple-300'},
  { value: 'none',    label: '🚫 Não imprimir',cls: 'bg-gray-700 text-gray-400'       },
];

function ImpresorasTab({ onToast }) {
  const [cats,    setCats]    = useState([]);
  const [saving,  setSaving]  = useState(null); // id da categoria sendo salva
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/categories')
      .then(({ data }) => setCats(data.data ?? []))
      .catch(() => onToast('Erro ao carregar categorias.', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleTarget = async (cat, value) => {
    setSaving(cat.id);
    // Optimistic update
    setCats((prev) => prev.map((c) => c.id === cat.id ? { ...c, printer_target: value } : c));
    try {
      await api.patch(`/categories/${cat.id}`, { printer_target: value });
      onToast(`${cat.name}: destino atualizado.`, 'success');
    } catch {
      setCats((prev) => prev.map((c) => c.id === cat.id ? cat : c));
      onToast('Erro ao salvar.', 'error');
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <p className="text-gray-500 text-sm">Carregando...</p>;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">🖨️ Roteamento de Impressoras</h3>
        <p className="text-sm text-gray-400">
          Defina para qual impressora cada categoria deve ir ao imprimir a comanda.
          Configure uma impressora para <span className="text-orange-400 font-medium">Cozinha</span> e
          outra para <span className="text-cyan-400 font-medium">Bar</span> no seu sistema operacional,
          depois selecione aqui o destino de cada categoria.
        </p>
      </div>

      <div className="bg-gray-800/60 rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left px-4 py-2.5 text-gray-400 font-semibold">Categoria</th>
              <th className="text-left px-4 py-2.5 text-gray-400 font-semibold">Impressora</th>
            </tr>
          </thead>
          <tbody>
            {cats.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-500 text-sm">
                Nenhuma categoria cadastrada. Adicione categorias na página de Produtos.
              </td></tr>
            )}
            {cats.map((cat) => {
              const current = PRINTER_TARGETS.find((t) => t.value === (cat.printer_target ?? 'kitchen'))
                           ?? PRINTER_TARGETS[0];
              return (
                <tr key={cat.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-white font-medium">{cat.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {PRINTER_TARGETS.map((opt) => (
                        <button
                          key={opt.value}
                          disabled={saving === cat.id}
                          onClick={() => handleTarget(cat, opt.value)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                            cat.printer_target === opt.value || (!cat.printer_target && opt.value === 'kitchen')
                              ? `${opt.cls} border-current`
                              : 'bg-gray-700/40 text-gray-500 border-transparent hover:border-white/20'
                          } disabled:opacity-50`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-sm text-blue-300">
        <p className="font-semibold mb-1">💡 Como configurar dois computadores</p>
        <ol className="space-y-1 text-blue-300/80 list-decimal list-inside">
          <li>No computador do caixa: deixe a impressora 58mm como padrão do browser</li>
          <li>No computador/tablet da cozinha: deixe a impressora 80mm como padrão</li>
          <li>Na cozinha, acesse o ZapFome e ligue o <strong>toggle de comanda automática</strong> (ícone chef 🍳 no cabeçalho)</li>
          <li>Cada vez que chegar um pedido, a comanda imprime automaticamente no destino correto</li>
        </ol>
      </div>
    </div>
  );
}

function HorariosTab({ onToast }) {
  const [hours,  setHours]  = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getFullSettings()
      .then(({ data }) => {
        const bh = data.data?.business_hours;
        setHours(Array.isArray(bh) && bh.length === 7 ? bh : DEFAULT_HOURS);
      })
      .catch(() => setHours(DEFAULT_HOURS));
  }, []);

  const setDay = (i, field, val) =>
    setHours((prev) => prev.map((d, idx) => idx === i ? { ...d, [field]: val } : d));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({ businessHours: hours });
      onToast('Horários salvos!');
    } catch (err) {
      onToast(err.response?.data?.message ?? 'Erro ao salvar.', 'error');
    } finally { setSaving(false); }
  };

  if (!hours) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-lg space-y-4">
      <p className="text-sm text-gray-400">
        Configure os dias e horários em que o restaurante está aberto. Fora desses horários o cardápio digital exibirá uma mensagem de "fechado".
      </p>

      <div className="bg-gray-800/60 rounded-2xl border border-white/[0.06] overflow-hidden divide-y divide-white/[0.04]">
        {DAYS.map(({ label }, i) => {
          const d = hours[i];
          return (
            <div key={i} className={`flex items-center gap-3 px-4 py-3 transition-colors ${!d.open ? 'opacity-50' : ''}`}>
              {/* Toggle aberto/fechado */}
              <button
                type="button"
                onClick={() => setDay(i, 'open', !d.open)}
                className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${
                  d.open ? 'bg-green-500' : 'bg-gray-600'
                }`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                  d.open ? 'translate-x-5' : 'translate-x-1'
                }`} />
              </button>

              {/* Nome do dia */}
              <span className="text-sm font-semibold text-gray-200 w-32 shrink-0">{label}</span>

              {/* Horários */}
              {d.open ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="time"
                    value={d.start}
                    onChange={(e) => setDay(i, 'start', e.target.value)}
                    className="input text-sm w-28"
                  />
                  <span className="text-gray-500 text-xs shrink-0">até</span>
                  <input
                    type="time"
                    value={d.end}
                    onChange={(e) => setDay(i, 'end', e.target.value)}
                    className="input text-sm w-28"
                  />
                </div>
              ) : (
                <span className="text-xs text-gray-600 italic">Fechado</span>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={handleSave} disabled={saving} className="btn-green px-6 disabled:opacity-50">
        {saving ? 'Salvando...' : 'Salvar horários'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab: Mesas (QR Code por mesa)
// ─────────────────────────────────────────────────────────────

function MesasTab({ currentUser, onToast }) {
  const [tables,  setTables]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [newNum,  setNewNum]  = useState('');
  const [newName, setNewName] = useState('');
  const [adding,  setAdding]  = useState(false);

  const slug    = currentUser?.tenant?.slug ?? '';
  const menuUrl = (tableNum) =>
    slug ? `${window.location.origin}/menu/${slug}?table=${encodeURIComponent(tableNum)}` : '';

  const load = useCallback(async () => {
    try {
      const { data } = await listTables();
      setTables(data.data ?? []);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newNum.trim()) return;
    setAdding(true);
    try {
      const { data } = await createTable({ number: newNum.trim(), name: newName.trim() || undefined });
      setTables((prev) => [...prev, data.data]);
      setNewNum(''); setNewName('');
      onToast('Mesa adicionada!');
    } catch (err) {
      onToast(err.response?.data?.message ?? 'Erro ao adicionar mesa.', 'error');
    } finally { setAdding(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remover esta mesa?')) return;
    try {
      await deleteTable(id);
      setTables((prev) => prev.filter((t) => t.id !== id));
      onToast('Mesa removida.');
    } catch (err) {
      onToast(err.response?.data?.message ?? 'Erro.', 'error');
    }
  };

  const downloadQr = (tableNum) => {
    const url = menuUrl(tableNum);
    const link = document.createElement('a');
    link.href  = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}&format=png`;
    link.download = `mesa-${tableNum}.png`;
    link.target = '_blank';
    link.click();
  };

  return (
    <div className="max-w-2xl space-y-5">
      <p className="text-sm text-gray-400">
        Cada mesa gera um QR Code exclusivo. O cliente escaneia e faz o pedido direto pelo cardápio digital, sem precisar chamar o garçom.
      </p>

      {/* Add mesa */}
      <div className="flex gap-2 items-end">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Número / ID *</label>
          <input
            type="text"
            placeholder="1, 2, A1..."
            value={newNum}
            onChange={(e) => setNewNum(e.target.value)}
            className="input w-28 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-400 mb-1 block">Nome <span className="text-gray-600 font-normal">(opcional)</span></label>
          <input
            type="text"
            placeholder="Ex: Varanda, VIP..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="input w-full text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={adding || !newNum.trim()}
          className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm transition-colors disabled:opacity-50 shrink-0 self-end"
        >
          {adding ? '...' : '+ Adicionar'}
        </button>
      </div>

      {/* Table list */}
      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : tables.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-600 bg-gray-800/40 rounded-xl border border-white/[0.04]">
          <span className="text-3xl">🍽️</span>
          <p className="text-xs italic">Nenhuma mesa cadastrada</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {tables.map((t) => {
            const url = menuUrl(t.number);
            const qrSrc = url
              ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`
              : null;
            return (
              <div key={t.id} className="bg-gray-800/60 rounded-2xl border border-white/[0.06] overflow-hidden">
                <div className="px-3 py-2.5 flex items-center justify-between border-b border-white/[0.06]">
                  <div>
                    <p className="text-sm font-black text-white">Mesa {t.number}</p>
                    {t.name && <p className="text-xs text-gray-500">{t.name}</p>}
                  </div>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {qrSrc && (
                  <div className="flex flex-col items-center gap-2 p-3">
                    <img src={qrSrc} alt={`QR Mesa ${t.number}`} className="w-24 h-24 rounded-xl bg-white p-1.5" />
                    <button
                      onClick={() => downloadQr(t.number)}
                      className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
                    >
                      ⬇ Baixar QR
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab: Cupons de Desconto
// ─────────────────────────────────────────────────────────────

function CuponsTab({ onToast }) {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ code: '', description: '', discountType: 'percent', discountValue: '', minOrder: '', maxUses: '', expiresAt: '' });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await listCoupons();
      setCoupons(data.data ?? []);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleAdd = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      const { data } = await createCoupon({
        code:          form.code,
        description:   form.description,
        discountType:  form.discountType,
        discountValue: parseFloat(form.discountValue),
        minOrder:      parseFloat(form.minOrder) || 0,
        maxUses:       form.maxUses ? parseInt(form.maxUses) : undefined,
        expiresAt:     form.expiresAt || undefined,
      });
      setCoupons((prev) => [data.data, ...prev]);
      setForm({ code: '', description: '', discountType: 'percent', discountValue: '', minOrder: '', maxUses: '', expiresAt: '' });
      onToast('Cupom criado!');
    } catch (err) {
      onToast(err.response?.data?.message ?? 'Erro ao criar cupom.', 'error');
    } finally { setAdding(false); }
  };

  const toggleActive = async (coupon) => {
    try {
      const { data } = await updateCoupon(coupon.id, { active: !coupon.active });
      setCoupons((prev) => prev.map((c) => c.id === coupon.id ? data.data : c));
    } catch (err) {
      onToast(err.response?.data?.message ?? 'Erro.', 'error');
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Criar cupom */}
      <form onSubmit={handleAdd} className="bg-gray-800/60 rounded-2xl p-4 border border-white/[0.06] space-y-3">
        <p className="text-sm font-bold text-white mb-2">✨ Criar novo cupom</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Código *</label>
            <input value={form.code} onChange={(e) => setF('code', e.target.value.toUpperCase())}
              className="input w-full text-sm uppercase" placeholder="PROMO10" required />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Tipo de desconto</label>
            <select value={form.discountType} onChange={(e) => setF('discountType', e.target.value)} className="input w-full text-sm">
              <option value="percent">Percentual (%)</option>
              <option value="fixed">Valor fixo (R$)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Valor *</label>
            <input type="number" min="0.01" step="0.01" value={form.discountValue}
              onChange={(e) => setF('discountValue', e.target.value)}
              className="input w-full text-sm" placeholder={form.discountType === 'percent' ? '10' : '5.00'} required />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Pedido mínimo R$</label>
            <input type="number" min="0" step="1" value={form.minOrder}
              onChange={(e) => setF('minOrder', e.target.value)}
              className="input w-full text-sm" placeholder="0 = sem mínimo" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Máx. de usos</label>
            <input type="number" min="1" step="1" value={form.maxUses}
              onChange={(e) => setF('maxUses', e.target.value)}
              className="input w-full text-sm" placeholder="Ilimitado" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Expira em</label>
            <input type="date" value={form.expiresAt}
              onChange={(e) => setF('expiresAt', e.target.value)}
              className="input w-full text-sm" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Descrição</label>
          <input value={form.description} onChange={(e) => setF('description', e.target.value)}
            className="input w-full text-sm" placeholder="Ex: 10% off no primeiro pedido" />
        </div>
        <button type="submit" disabled={adding || !form.code || !form.discountValue}
          className="btn-green px-5 disabled:opacity-50">
          {adding ? 'Criando...' : '+ Criar Cupom'}
        </button>
      </form>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-24"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : coupons.length === 0 ? (
        <p className="text-xs text-gray-600 italic text-center py-6">Nenhum cupom criado ainda</p>
      ) : (
        <div className="space-y-2">
          {coupons.map((c) => (
            <div key={c.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
              c.active ? 'bg-gray-800/60 border-white/[0.06]' : 'bg-gray-900/40 border-white/[0.03] opacity-60'
            }`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-white tracking-wider">{c.code}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                    c.active ? 'bg-green-500/20 text-green-300' : 'bg-gray-700 text-gray-500'
                  }`}>{c.active ? 'Ativo' : 'Inativo'}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {c.discount_type === 'percent' ? `${c.discount_value}% off` : `R$ ${parseFloat(c.discount_value).toFixed(2)} off`}
                  {parseFloat(c.min_order) > 0 && ` · mín R$ ${parseFloat(c.min_order).toFixed(2)}`}
                  {c.max_uses && ` · ${c.uses_count}/${c.max_uses} usos`}
                  {c.expires_at && ` · até ${new Date(c.expires_at).toLocaleDateString('pt-BR')}`}
                </p>
                {c.description && <p className="text-xs text-gray-500">{c.description}</p>}
              </div>
              <button
                onClick={() => toggleActive(c)}
                className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${c.active ? 'bg-green-500' : 'bg-gray-600'}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${c.active ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function ConfiguracoesPage() {
  const [tab,   setTab]   = useState('conta');
  const [toast, setToast] = useState(null);

  const currentUser = getUser();
  const isOwner     = currentUser.role === 'owner';

  const showToast = (msg, type = 'success') => setToast({ msg, type });

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">

      {/* Header */}
      <div className="px-5 py-3.5 bg-gray-900/80 backdrop-blur border-b border-white/5 shrink-0">
        <h1 className="text-lg font-black text-white mb-3">⚙️ Configurações</h1>
        <div className="flex gap-1 flex-wrap">
          <Tab active={tab === 'conta'}       onClick={() => setTab('conta')}>Minha Conta</Tab>
          {isOwner && (
            <Tab active={tab === 'restaurante'} onClick={() => setTab('restaurante')}>Restaurante</Tab>
          )}
          <Tab active={tab === 'equipe'}      onClick={() => setTab('equipe')}>Equipe</Tab>
          {isOwner && (
            <Tab active={tab === 'whatsapp'} onClick={() => setTab('whatsapp')}>📱 WhatsApp</Tab>
          )}
          {isOwner && (
            <Tab active={tab === 'pagamentos'} onClick={() => setTab('pagamentos')}>💳 Pagamentos</Tab>
          )}
          {isOwner && (
            <Tab active={tab === 'zonas'} onClick={() => setTab('zonas')}>🗺️ Entrega</Tab>
          )}
          {isOwner && (
            <Tab active={tab === 'nfce'} onClick={() => setTab('nfce')}>🧾 NFC-e</Tab>
          )}
          {isOwner && (
            <Tab active={tab === 'impressoras'} onClick={() => setTab('impressoras')}>🖨️ Impressoras</Tab>
          )}
          {isOwner && (
            <Tab active={tab === 'horarios'} onClick={() => setTab('horarios')}>🕐 Horários</Tab>
          )}
          {isOwner && (
            <Tab active={tab === 'mesas'} onClick={() => setTab('mesas')}>🍽️ Mesas</Tab>
          )}
          {isOwner && (
            <Tab active={tab === 'cupons'} onClick={() => setTab('cupons')}>🎫 Cupons</Tab>
          )}
          {isOwner && (
            <Tab active={tab === 'qrcode'} onClick={() => setTab('qrcode')}>🔲 QR Cardápio</Tab>
          )}
          {isOwner && (
            <Tab active={tab === 'motoboys'} onClick={() => setTab('motoboys')}>🛵 Motoboys</Tab>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {tab === 'conta'       && <ContaTab       currentUser={currentUser} onToast={showToast} />}
        {tab === 'restaurante' && <RestauranteTab currentUser={currentUser} onToast={showToast} />}
        {tab === 'equipe'      && <EquipeTab      currentUser={currentUser} onToast={showToast} />}
        {tab === 'whatsapp'    && <WhatsappTab    onToast={showToast} />}
        {tab === 'pagamentos'  && <PagamentosTab  onToast={showToast} />}
        {tab === 'zonas'       && <ZonasTab       onToast={showToast} />}
        {tab === 'nfce'        && <NfceTab        onToast={showToast} />}
        {tab === 'impressoras' && <ImpresorasTab  onToast={showToast} />}
        {tab === 'horarios'    && <HorariosTab    onToast={showToast} />}
        {tab === 'mesas'       && <MesasTab       currentUser={currentUser} onToast={showToast} />}
        {tab === 'cupons'      && <CuponsTab      onToast={showToast} />}
        {tab === 'qrcode'      && <QrCodeTab      currentUser={currentUser} />}
        {tab === 'motoboys'   && <MotoboyTab     currentUser={currentUser} onToast={showToast} />}
      </div>

      {toast && (
        <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />
      )}
    </div>
  );
}
