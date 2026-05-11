import { useState, useEffect } from 'react';
import { listTenants, createTenant, updateTenant, activateTenant, extendTrial, deactivateTenant, destroyTenant } from './api/admin';

const PLANS     = ['basic', 'pro', 'premium'];
const PLAN_PRICES = { basic: 67, pro: 179.99, premium: 370 };
const PLAN_COLORS = { basic: 'text-orange-400', pro: 'text-blue-400', premium: 'text-purple-400' };

const STATUS_BADGE = {
  active:    'bg-green-500/20 text-green-400',
  trialing:  'bg-purple-500/20 text-purple-400',
  suspended: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-gray-700 text-gray-500',
};

const daysLeft = (dateStr) => {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - Date.now();
  return diff > 0 ? Math.ceil(diff / 86400000) : 0;
};

// ── Create tenant modal ──────────────────────────────────────
function CreateModal({ adminKey, onClose, onCreated }) {
  const [tenantName, setTenantName] = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [plan,       setPlan]       = useState('basic');
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
          {PLANS.map(p => <option key={p} value={p} className="bg-gray-900">{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
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

// ── Activate modal (after payment) ───────────────────────────
function ActivateModal({ tenant, adminKey, onClose, onDone }) {
  const [plan,    setPlan]    = useState(tenant.plan);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await activateTenant(adminKey, tenant.id, plan);
      onDone(tenant.id, { subscription_status: 'active', active: true, plan });
      onClose();
    } catch (e) {
      alert(e.response?.data?.message ?? 'Erro ao ativar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 rounded-2xl border border-white/10 p-6 w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="text-4xl mb-2">✅</div>
          <h3 className="text-lg font-black text-white">Ativar conta</h3>
          <p className="text-sm text-gray-400 mt-1">{tenant.name}</p>
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Plano contratado</label>
          <select className="input w-full mt-1.5" value={plan} onChange={e => setPlan(e.target.value)}>
            {PLANS.map(p => (
              <option key={p} value={p} className="bg-gray-900">
                {p.charAt(0).toUpperCase() + p.slice(1)} — R$ {PLAN_PRICES[p].toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-gray-500 bg-gray-800 rounded-xl p-3">
          Isso remove o trial e ativa a conta permanentemente no plano selecionado.
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-400 font-semibold text-sm">Cancelar</button>
          <button onClick={submit} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm disabled:opacity-50">
            {loading ? 'Ativando...' : 'Confirmar Pagamento'}
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
          <p className="text-gray-500 text-sm mt-1">Painel do operador ZapFome</p>
        </div>
        <div className="bg-gray-900 rounded-2xl border border-white/10 p-6 space-y-4">
          <input
            type="password" placeholder="Admin key..." value={key}
            onChange={e => { setKey(e.target.value); setError(null); }}
            onKeyDown={e => e.key === 'Enter' && submit()}
            className="input w-full" autoFocus
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

// ── Trial badge ───────────────────────────────────────────────
function TrialInfo({ tenant }) {
  if (tenant.subscription_status !== 'trialing') return null;
  const total   = daysLeft(tenant.trial_ends_at);
  const premium = daysLeft(tenant.premium_trial_ends_at);
  if (total === null) return null;

  return (
    <div className="mt-0.5 text-[10px] text-gray-500">
      {premium > 0
        ? <span className="text-purple-400">⭐ Premium {premium}d</span>
        : <span className={total <= 2 ? 'text-red-400' : 'text-orange-400'}>
            Trial {total}d restantes
          </span>
      }
    </div>
  );
}

// ── Main admin panel ─────────────────────────────────────────
export default function AdminApp() {
  const [adminKey,       setAdminKey]       = useState(() => sessionStorage.getItem('adminKey') ?? '');
  const [authed,         setAuthed]         = useState(false);
  const [tenants,        setTenants]        = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [showCreate,     setShowCreate]     = useState(false);
  const [activating,     setActivating]     = useState(null);  // tenant being activated
  const [search,         setSearch]         = useState('');
  const [filterStatus,   setFilterStatus]   = useState('all');

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

  useEffect(() => { if (authed) loadTenants(); }, [authed]);
  useEffect(() => { if (adminKey) setAuthed(true); }, []);

  const patchTenant = (id, changes) =>
    setTenants(ts => ts.map(t => t.id === id ? { ...t, ...changes } : t));

  const handlePlanChange = async (id, plan) => {
    await updateTenant(adminKey, id, { plan });
    patchTenant(id, { plan });
  };

  const handleExtendTrial = async (tenant) => {
    const days = parseInt(prompt(`Quantos dias adicionar ao trial de "${tenant.name}"?`, '7'), 10);
    if (!days || isNaN(days)) return;
    try {
      const { data } = await extendTrial(adminKey, tenant.id, days);
      patchTenant(tenant.id, { trial_ends_at: data.data.trial_ends_at, subscription_status: data.data.subscription_status });
    } catch (e) {
      alert(e.response?.data?.message ?? 'Erro ao estender trial.');
    }
  };

  const handleSuspend = async (tenant) => {
    if (!confirm(`Suspender "${tenant.name}"?`)) return;
    await deactivateTenant(adminKey, tenant.id);
    patchTenant(tenant.id, { subscription_status: 'cancelled', active: false });
  };

  const handleDestroy = async (tenant) => {
    if (!confirm(`⚠️ APAGAR PERMANENTEMENTE "${tenant.name}" e todos os dados?\n\nEssa ação NÃO pode ser desfeita!`)) return;
    const name = prompt(`Digite exatamente: ${tenant.name}`);
    if (name !== tenant.name) { alert('Nome incorreto. Operação cancelada.'); return; }
    try {
      await destroyTenant(adminKey, tenant.id);
      setTenants(ts => ts.filter(t => t.id !== tenant.id));
    } catch (e) {
      alert(e.response?.data?.message ?? 'Erro ao excluir.');
    }
  };

  if (!authed) return <AdminLogin onLogin={handleLogin} />;

  const filtered = tenants
    .filter(t => filterStatus === 'all' || t.subscription_status === filterStatus)
    .filter(t =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase())
    );

  const mrr = tenants
    .filter(t => t.subscription_status === 'active')
    .reduce((s, t) => s + (PLAN_PRICES[t.plan] ?? 0), 0);

  const stats = {
    total:     tenants.length,
    active:    tenants.filter(t => t.subscription_status === 'active').length,
    trialing:  tenants.filter(t => t.subscription_status === 'trialing').length,
    suspended: tenants.filter(t => ['suspended', 'cancelled'].includes(t.subscription_status)).length,
    mrr,
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="bg-gray-900 border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <div>
            <h1 className="font-black text-white leading-tight">ZapFome Admin</h1>
            <p className="text-xs text-gray-500">Painel do operador</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadTenants()} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors" title="Atualizar">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Novo
          </button>
          <button onClick={() => { sessionStorage.removeItem('adminKey'); setAuthed(false); }}
            className="px-3 py-2 rounded-xl text-xs text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors">
            Sair
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total',     value: stats.total,     color: 'text-white' },
          { label: 'Ativos',    value: stats.active,    color: 'text-green-400' },
          { label: 'Trial',     value: stats.trialing,  color: 'text-purple-400' },
          { label: 'Suspensos', value: stats.suspended, color: 'text-red-400' },
          { label: 'MRR',       value: `R$ ${mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, color: 'text-yellow-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-900 rounded-2xl border border-white/10 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="px-6 pb-3 flex flex-wrap gap-2">
        <input
          type="text" placeholder="Buscar restaurante..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="input max-w-xs"
        />
        <div className="flex gap-1">
          {['all', 'active', 'trialing', 'suspended'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filterStatus === s ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'
              }`}
            >
              {s === 'all' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="px-6 pb-10">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-gray-900 rounded-2xl border border-white/10 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-white/[0.06]">
                  <th className="px-4 py-3 font-semibold">Restaurante</th>
                  <th className="px-4 py-3 font-semibold text-center">Plano</th>
                  <th className="px-4 py-3 font-semibold text-center">Status</th>
                  <th className="px-4 py-3 font-semibold text-center">Pedidos/mês</th>
                  <th className="px-4 py-3 font-semibold text-center">Usuários</th>
                  <th className="px-4 py-3 font-semibold text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">{t.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{t.slug}</p>
                      <TrialInfo tenant={t} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={t.plan}
                        onChange={e => handlePlanChange(t.id, e.target.value)}
                        className={`bg-transparent text-xs font-bold border-none outline-none cursor-pointer ${PLAN_COLORS[t.plan]}`}
                      >
                        {PLANS.map(p => <option key={p} value={p} className="bg-gray-900 text-white">{p}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_BADGE[t.subscription_status] ?? 'bg-gray-700 text-gray-400'}`}>
                        {t.subscription_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-300 tabular-nums">{t.orders_this_month ?? 0}</td>
                    <td className="px-4 py-3 text-center text-gray-300 tabular-nums">{t.users_count ?? 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {/* Ativar após pagamento */}
                        {t.subscription_status !== 'active' && (
                          <button
                            onClick={() => setActivating(t)}
                            className="text-xs font-bold px-2.5 py-1 rounded-lg text-green-400 hover:bg-green-400/10 transition-colors whitespace-nowrap"
                          >
                            ✅ Ativar
                          </button>
                        )}
                        {/* Estender trial */}
                        {t.subscription_status === 'trialing' && (
                          <button
                            onClick={() => handleExtendTrial(t)}
                            className="text-xs font-bold px-2.5 py-1 rounded-lg text-purple-400 hover:bg-purple-400/10 transition-colors whitespace-nowrap"
                          >
                            +dias
                          </button>
                        )}
                        {/* Suspender */}
                        {t.subscription_status === 'active' && (
                          <button
                            onClick={() => handleSuspend(t)}
                            className="text-xs font-bold px-2.5 py-1 rounded-lg text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                          >
                            Suspender
                          </button>
                        )}
                        {/* Excluir */}
                        <button
                          onClick={() => handleDestroy(t)}
                          title="Excluir permanentemente"
                          className="text-xs px-2 py-1 rounded-lg text-red-500/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-gray-600 italic">
                      Nenhum restaurante encontrado
                    </td>
                  </tr>
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
          onCreated={(t) => setTenants(prev => [t, ...prev])}
        />
      )}

      {activating && (
        <ActivateModal
          tenant={activating}
          adminKey={adminKey}
          onClose={() => setActivating(null)}
          onDone={(id, changes) => patchTenant(id, changes)}
        />
      )}
    </div>
  );
}
