import { useState, useEffect } from 'react';
import { listTenants, createTenant, updateTenant, deactivateTenant, destroyTenant } from './api/admin';

const PLANS = ['basic', 'pro', 'premium'];
const PLAN_COLORS = { basic: 'text-gray-400', pro: 'text-blue-400', premium: 'text-yellow-400' };

// ── Create tenant modal ──────────────────────────────────────
function CreateModal({ adminKey, onClose, onCreated }) {
  const [tenantName, setTenantName] = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [plan,       setPlan]       = useState('pro');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  const submit = async () => {
    if (!tenantName || !email || !password) return setError('Preencha todos os campos.');
    setLoading(true);
    try {
      const { data } = await createTenant(adminKey, { tenantName, email, password, plan });
      onCreated(data.data);
      onClose();
    } catch (e) {
      setError(e.response?.data?.message ?? 'Erro ao criar restaurante.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 rounded-2xl border border-white/10 p-6 w-full max-w-md space-y-4">
        <h3 className="text-lg font-black text-white">Novo Restaurante</h3>
        <input className="input w-full" placeholder="Nome do restaurante *" value={tenantName} onChange={e => setTenantName(e.target.value)} />
        <input className="input w-full" placeholder="Email do owner *" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <input className="input w-full" placeholder="Senha do owner *" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <select className="input w-full" value={plan} onChange={e => setPlan(e.target.value)}>
          {PLANS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>
        {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-400 hover:bg-gray-700 font-semibold text-sm transition-colors">Cancelar</button>
          <button onClick={submit} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors disabled:opacity-50">
            {loading ? 'Criando...' : 'Criar Restaurante'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Login screen ─────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!key) return;
    setLoading(true);
    try {
      await listTenants(key);
      onLogin(key);
    } catch {
      setError('Chave inválida.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-5xl mb-3">🔐</div>
          <h1 className="text-2xl font-black text-white">Super Admin</h1>
          <p className="text-gray-500 text-sm mt-1">Acesso restrito ao operador do SaaS</p>
        </div>
        <div className="bg-gray-900 rounded-2xl border border-white/10 p-6 space-y-4">
          <input
            type="password"
            placeholder="Admin key..."
            value={key}
            onChange={e => { setKey(e.target.value); setError(null); }}
            onKeyDown={e => e.key === 'Enter' && submit()}
            className="input w-full"
            autoFocus
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button onClick={submit} disabled={loading} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors disabled:opacity-50">
            {loading ? 'Verificando...' : 'Entrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main admin panel ─────────────────────────────────────────
export default function AdminApp() {
  const [adminKey,     setAdminKey]     = useState(() => sessionStorage.getItem('adminKey') ?? '');
  const [authed,       setAuthed]       = useState(false);
  const [tenants,      setTenants]      = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [showCreate,   setShowCreate]   = useState(false);
  const [search,       setSearch]       = useState('');

  const handleLogin = (key) => {
    setAdminKey(key);
    sessionStorage.setItem('adminKey', key);
    setAuthed(true);
  };

  const loadTenants = async (key = adminKey) => {
    setLoading(true);
    try {
      const { data } = await listTenants(key);
      setTenants(data.data ?? []);
    } catch {
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authed) loadTenants();
  }, [authed]);

  useEffect(() => {
    if (adminKey) {
      setAuthed(true);
    }
  }, []);

  const handlePlanChange = async (id, plan) => {
    await updateTenant(adminKey, id, { plan });
    setTenants(ts => ts.map(t => t.id === id ? { ...t, plan } : t));
  };

  const handleToggleActive = async (tenant) => {
    const newStatus = tenant.subscription_status === 'active' ? 'suspended' : 'active';
    if (newStatus === 'suspended') {
      if (!confirm(`Suspender "${tenant.name}"?`)) return;
      await deactivateTenant(adminKey, tenant.id);
    } else {
      await updateTenant(adminKey, tenant.id, { subscription_status: 'active' });
    }
    setTenants(ts => ts.map(t => t.id === tenant.id ? { ...t, subscription_status: newStatus, active: newStatus === 'active' } : t));
  };

  const handleDestroy = async (tenant) => {
    const confirmed = confirm(
      `⚠️ ATENÇÃO: Isso irá APAGAR PERMANENTEMENTE o restaurante "${tenant.name}" e todos os seus dados (pedidos, produtos, usuários, etc.).\n\nEssa ação NÃO pode ser desfeita!\n\nDigite o nome do restaurante para confirmar:`
    );
    if (!confirmed) return;
    const name = prompt(`Digite exatamente: ${tenant.name}`);
    if (name !== tenant.name) { alert('Nome incorreto. Operação cancelada.'); return; }
    try {
      await destroyTenant(adminKey, tenant.id);
      setTenants(ts => ts.filter(t => t.id !== tenant.id));
      alert('Restaurante excluído permanentemente.');
    } catch (e) {
      alert(e.response?.data?.message ?? 'Erro ao excluir restaurante.');
    }
  };

  if (!authed) return <AdminLogin onLogin={handleLogin} />;

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.subscription_status === 'active').length,
    mrr: tenants
      .filter(t => t.subscription_status === 'active')
      .reduce((s, t) => s + ({ basic: 49, pro: 97, premium: 149 }[t.plan] ?? 0), 0),
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="bg-gray-900 border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔐</span>
          <div>
            <h1 className="font-black text-white leading-tight">Super Admin</h1>
            <p className="text-xs text-gray-500">Painel do operador SaaS</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadTenants()}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Atualizar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Novo Restaurante
          </button>
          <button onClick={() => { sessionStorage.removeItem('adminKey'); setAuthed(false); }}
            className="px-3 py-2 rounded-xl text-xs text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors">
            Sair
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="px-6 py-4 grid grid-cols-3 gap-4 max-w-2xl">
        {[
          { label: 'Restaurantes', value: stats.total,  color: 'text-white' },
          { label: 'Ativos',       value: stats.active, color: 'text-green-400' },
          { label: 'MRR',          value: `R$ ${stats.mrr.toLocaleString('pt-BR')}`, color: 'text-yellow-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-900 rounded-2xl border border-white/10 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Search + Table */}
      <div className="px-6 pb-10 space-y-3">
        <input
          type="text"
          placeholder="Buscar restaurante..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input max-w-sm"
        />

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-gray-900 rounded-2xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-white/[0.06]">
                  <th className="px-4 py-3 font-semibold">Restaurante</th>
                  <th className="px-4 py-3 font-semibold">Slug</th>
                  <th className="px-4 py-3 font-semibold text-center">Plano</th>
                  <th className="px-4 py-3 font-semibold text-center">Pedidos/mês</th>
                  <th className="px-4 py-3 font-semibold text-center">Usuários</th>
                  <th className="px-4 py-3 font-semibold text-center">Status</th>
                  <th className="px-4 py-3 font-semibold text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">{t.name}</p>
                      <p className="text-xs text-gray-500">{new Date(t.created_at).toLocaleDateString('pt-BR')}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{t.slug}</td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={t.plan}
                        onChange={e => handlePlanChange(t.id, e.target.value)}
                        className={`bg-transparent text-xs font-bold border-none outline-none cursor-pointer ${PLAN_COLORS[t.plan]}`}
                      >
                        {PLANS.map(p => <option key={p} value={p} className="bg-gray-900 text-white">{p}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-300 tabular-nums">{t.orders_this_month ?? 0}</td>
                    <td className="px-4 py-3 text-center text-gray-300 tabular-nums">{t.users_count ?? 0}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        t.subscription_status === 'active' ? 'bg-green-500/20 text-green-400'
                        : t.subscription_status === 'suspended' ? 'bg-red-500/20 text-red-400'
                        : 'bg-gray-700 text-gray-400'
                      }`}>
                        {t.subscription_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleToggleActive(t)}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                            t.subscription_status === 'active'
                              ? 'text-yellow-400 hover:bg-yellow-400/10'
                              : 'text-green-400 hover:bg-green-400/10'
                          }`}
                        >
                          {t.subscription_status === 'active' ? 'Suspender' : 'Ativar'}
                        </button>
                        <button
                          onClick={() => handleDestroy(t)}
                          title="Excluir permanentemente"
                          className="text-xs font-semibold px-2 py-1 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-600 italic">Nenhum restaurante encontrado</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateModal
          adminKey={adminKey}
          onClose={() => setShowCreate(false)}
          onCreated={(t) => { setTenants(prev => [t, ...prev]); }}
        />
      )}
    </div>
  );
}
