import { useMemo } from 'react';

// ── Nav groups ────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: 'Operação',
    items: [
      { key: 'orders',   emoji: '🍽️', label: 'Pedidos' },
      { key: 'kds',      emoji: '👨‍🍳', label: 'KDS Cozinha' },
      { key: 'entregas', emoji: '🛵', label: 'Entregas' },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { key: 'products', emoji: '📦', label: 'Produtos' },
      { key: 'stock',    emoji: '📊', label: 'Estoque' },
      { key: 'addons',   emoji: '🍟', label: 'Complementos' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { key: 'financial',  emoji: '💰', label: 'Financeiro' },
      { key: 'clientes',   emoji: '👥', label: 'Clientes' },
      { key: 'fidelidade', emoji: '⭐', label: 'Fidelidade' },
      { key: 'fiado',      emoji: '🤝', label: 'Fiado' },
      { key: 'relatorios', emoji: '📈', label: 'Relatórios' },
    ],
  },
  {
    label: 'Inteligência',
    items: [
      { key: 'ai',        emoji: '🤖', label: 'IA ZapFome' },
      { key: 'marketing', emoji: '📣', label: 'Marketing IA', soon: true },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { key: 'settings', emoji: '⚙️', label: 'Configurações' },
      { key: 'plans',    emoji: '💎', label: 'Planos', special: 'purple' },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────

const daysLeft = (dateStr) => {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - Date.now();
  return diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;
};

function TrialWidget({ onShowPlans }) {
  const tenant = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('tenant') || 'null'); } catch { return null; }
  }, []);

  if (!tenant || tenant.subscriptionStatus !== 'trialing') return null;

  const total   = daysLeft(tenant.trialEndsAt);
  const premium = daysLeft(tenant.premiumTrialEndsAt);
  if (!total || total <= 0) return null;

  const premiumActive = premium !== null && premium > 0;
  const urgent        = total <= 2;

  const color = premiumActive
    ? 'text-purple-400 bg-purple-500/10 border-purple-500/20'
    : urgent
      ? 'text-red-400 bg-red-500/10 border-red-500/20'
      : 'text-orange-400 bg-orange-500/10 border-orange-500/20';

  const label = premiumActive ? `Premium: ${premium}d` : `Trial: ${total}d`;

  return (
    <button
      onClick={onShowPlans}
      title="Ver planos"
      className={`hidden md:flex items-center gap-2 mx-2 mb-1 px-3 py-2 rounded-xl border text-xs font-bold transition-opacity hover:opacity-80 ${color}`}
    >
      <span>{premiumActive ? '⭐' : urgent ? '⚠️' : '🎁'}</span>
      <span className="flex-1 text-left truncate">{label} restante{total !== 1 ? 's' : ''}</span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────

export default function Sidebar({ page, setPage, onLogout, onShowPlans }) {
  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') ?? '{}'); }
    catch { return {}; }
  }, []);

  const tenant = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('tenant') ?? '{}'); }
    catch { return {}; }
  }, []);

  const handleNav = (key) => {
    if (key === 'plans') { onShowPlans?.(); return; }
    setPage(key);
  };

  return (
    <aside className="w-14 md:w-56 shrink-0 bg-gray-900 border-r border-white/[0.06] flex flex-col h-full z-10">

      {/* Brand */}
      <div className="px-3 md:px-4 py-4 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0 text-lg select-none">
            🍽️
          </div>
          <div className="hidden md:block min-w-0">
            <p className="text-sm font-black text-white truncate leading-tight">
              {tenant.name ?? 'Restaurante'}
            </p>
            <p className="text-[10px] text-gray-500 truncate capitalize mt-0.5">
              Plano {tenant.plan ?? 'básico'}
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-1">
            {/* Group label */}
            <p className="hidden md:block text-[10px] font-bold text-gray-600 uppercase tracking-widest px-4 pt-3 pb-1 select-none">
              {group.label}
            </p>

            <div className="px-2 space-y-0.5">
              {group.items.map(({ key, emoji, label, soon, special }) => {
                const isActive = page === key;
                return (
                  <button
                    key={key}
                    disabled={soon}
                    onClick={() => { if (!soon) handleNav(key); }}
                    title={label}
                    className={[
                      'w-full flex items-center gap-3 px-2.5 md:px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
                      isActive
                        ? 'bg-orange-500/15 text-orange-400'
                        : special === 'purple'
                          ? 'text-purple-400 hover:bg-purple-500/10'
                          : soon
                            ? 'text-gray-600 cursor-not-allowed opacity-40'
                            : 'text-gray-400 hover:text-white hover:bg-white/[0.06]',
                    ].join(' ')}
                  >
                    <span className="text-base shrink-0 w-5 text-center leading-none">{emoji}</span>
                    <span className="hidden md:block flex-1 text-left truncate">{label}</span>
                    {soon && (
                      <span className="hidden md:block text-[10px] bg-gray-800 text-gray-600 px-1.5 py-0.5 rounded-full leading-none shrink-0">
                        breve
                      </span>
                    )}
                    {isActive && (
                      <span className="hidden md:block w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Trial widget */}
      <TrialWidget onShowPlans={onShowPlans} />

      {/* User + Logout */}
      <div className="p-2 border-t border-white/[0.06] shrink-0 space-y-0.5">
        <div className="hidden md:flex items-center gap-2.5 px-3 py-2 rounded-xl min-w-0">
          <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 shrink-0 select-none">
            {(user.name ?? 'U')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-300 truncate leading-tight">
              {user.name ?? 'Usuário'}
            </p>
            <p className="text-[10px] text-gray-600 truncate capitalize">
              {user.role ?? 'staff'}
            </p>
          </div>
        </div>

        <button
          onClick={onLogout}
          title="Sair"
          className="w-full flex items-center gap-3 px-2.5 md:px-3 py-2 rounded-xl text-sm text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="hidden md:block">Sair</span>
        </button>
      </div>
    </aside>
  );
}
