import { useState, useCallback, useEffect } from 'react';
import Toast from '../components/Toast';
import api from '../api/axios';
import {
  updateProfile, updateTenantProfile, getTenantInfo,
  listUsers, createUser, updateUser, deactivateUser,
} from '../api/users';

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
  const [name,         setName]         = useState('');
  const [whatsapp,     setWhatsapp]     = useState('');
  const [address,      setAddress]      = useState('');
  const [defaultFee,   setDefaultFee]   = useState(
    () => localStorage.getItem('defaultDeliveryFee') ?? ''
  );
  const [saving,       setSaving]       = useState(false);
  const [tenant,       setTenant]       = useState(null);

  useEffect(() => {
    getTenantInfo()
      .then(({ data }) => {
        const t = data.data;
        setTenant(t);
        setName(t.name ?? '');
        setWhatsapp(t.whatsapp_number ?? '');
        setAddress(t.address ?? '');
      })
      .catch(() => {});
  }, []);

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
      if (u.tenant) {
        u.tenant.name = name.trim();
        localStorage.setItem('user', JSON.stringify(u));
      }
      // Persiste taxa padrão de entrega localmente
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

  return (
    <div className="max-w-md space-y-5">
      <div className="bg-gray-800/60 rounded-2xl p-4 border border-white/[0.06] space-y-1">
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Plano atual</p>
        <p className="text-white font-semibold capitalize">{getUser().tenant?.plan ?? '—'}</p>
        {tenant?.usage && (
          <p className="text-xs text-gray-400">
            {tenant.usage.ordersThisMonth} / {tenant.usage.ordersLimit ?? '∞'} pedidos este mês
          </p>
        )}
      </div>

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
            className="input w-full" placeholder="5511999999999 (com código do país)" type="tel" />
          <p className="text-[11px] text-gray-600 mt-1">Formato: 55 + DDD + número. Ex: 5511999887766</p>
        </div>
        <div>
          <label className="text-xs text-gray-400 font-semibold mb-1 block">
            Endereço <span className="text-gray-600 font-normal">(opcional)</span>
          </label>
          <input value={address} onChange={(e) => setAddress(e.target.value)}
            className="input w-full" placeholder="Rua, número — Bairro, Cidade" />
        </div>
        <div>
          <label className="text-xs text-gray-400 font-semibold mb-1 block">
            Taxa de entrega padrão <span className="text-gray-600 font-normal">(R$ — pré-preenche novos pedidos delivery)</span>
          </label>
          <input
            type="number" min="0" step="0.50" placeholder="0,00"
            value={defaultFee}
            onChange={(e) => setDefaultFee(e.target.value)}
            className="input w-40"
          />
        </div>
        <button type="submit" disabled={saving || !name.trim()}
          className="btn-green px-6 disabled:opacity-50">
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </form>
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
            <Tab active={tab === 'qrcode'} onClick={() => setTab('qrcode')}>📱 QR Code</Tab>
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
        {tab === 'qrcode'      && <QrCodeTab      currentUser={currentUser} />}
        {tab === 'motoboys'   && <MotoboyTab     currentUser={currentUser} onToast={showToast} />}
      </div>

      {toast && (
        <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />
      )}
    </div>
  );
}
