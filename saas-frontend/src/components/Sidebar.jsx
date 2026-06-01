import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// ── Role definitions ──────────────────────────────────────────
const ROLE_LABEL = {
  owner:   'Proprietário',
  manager: 'Gerente',
  staff:   'Equipe',
  caixa:   'Caixa',
  garcom:  'Garçom',
  cozinha: 'Cozinha',
};

// ── Nav groups ────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: 'Operação',
    items: [
      { key: 'orders',   emoji: '🍽️', label: 'Pedidos' },
      { key: 'kds',      emoji: '👨‍🍳', label: 'KDS Cozinha',  roles: ['owner','manager','staff','cozinha'] },
      { key: 'mesas',    emoji: '🪑', label: 'Mesas / QR',   roles: ['owner','manager'] },
      { key: 'garcom',   emoji: '🧑‍🍳', label: 'App Garçom',   roles: ['owner','manager','staff','garcom'] },
      { key: 'reservas', emoji: '📅', label: 'Reservas',      roles: ['owner','manager','staff','garcom'] },
      { key: 'entregas', emoji: '🛵', label: 'Entregas',      roles: ['owner','manager','staff'] },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { key: 'products', emoji: '📦', label: 'Produtos',      roles: ['owner','manager','staff'] },
      { key: 'stock',    emoji: '📊', label: 'Estoque',       roles: ['owner','manager','staff'] },
      { key: 'addons',   emoji: '🍟', label: 'Complementos',  roles: ['owner','manager','staff'] },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { key: 'fechamento',      emoji: '📋', label: 'Fechamento',      roles: ['owner','manager'] },
      { key: 'confiabilidade',  emoji: '🛡️', label: 'Confiabilidade', roles: ['owner','manager'] },
      { key: 'financial',  emoji: '💰', label: 'Financeiro',  roles: ['owner','manager','caixa'] },
      { key: 'clientes',   emoji: '👥', label: 'Clientes',    roles: ['owner','manager','staff','caixa'] },
      { key: 'fidelidade', emoji: '⭐', label: 'Fidelidade',  roles: ['owner','manager'] },
      { key: 'promocoes',  emoji: '🏷️', label: 'Promoções',  roles: ['owner','manager'] },
      { key: 'avaliacoes', emoji: '💬', label: 'Avaliações',  roles: ['owner','manager'] },
      { key: 'fiado',      emoji: '🤝', label: 'Fiado',       roles: ['owner','manager','caixa'] },
      { key: 'relatorios', emoji: '📈', label: 'Relatórios',  roles: ['owner','manager'] },
    ],
  },
  {
    label: 'Inteligência',
    items: [
      { key: 'ai',        emoji: '🤖', label: 'IA ZapFome',  roles: ['owner','manager'] },
      { key: 'marketing', emoji: '📣', label: 'Marketing IA', soon: true, roles: ['owner','manager'] },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { key: 'settings', emoji: '⚙️', label: 'Configurações', roles: ['owner','manager'] },
      { key: 'plans',    emoji: '💎', label: 'Planos', special: 'purple', roles: ['owner'] },
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
  const [drawerOpen, setDrawerOpen] = useState(false);

  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') ?? '{}'); }
    catch { return {}; }
  }, []);

  const tenant = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('tenant') ?? '{}'); }
    catch { return {}; }
  }, []);

  const userRole = user.role ?? 'staff';

  const handleNav = (key) => {
    if (key === 'plans') { onShowPlans?.(); setDrawerOpen(false); return; }
    setPage(key);
    setDrawerOpen(false);
  };

  // Filter groups / items based on role
  const filteredGroups = useMemo(() => {
    const canSee = (item) => !item.roles || item.roles.includes(userRole);
    return NAV_GROUPS
      .map((g) => ({ ...g, items: g.items.filter(canSee) }))
      .filter((g) => g.items.length > 0);
  }, [userRole]);

  // All visible items flat
  const allItems = useMemo(() =>
    filteredGroups.flatMap((g) => g.items.filter((i) => !i.soon)),
    [filteredGroups]
  );

  // Bottom nav: first 4 visible items
  const bottomNavItems = allItems.slice(0, 4);

  // ── Desktop sidebar ───────────────────────────────────────
  const desktopSidebar = (
    <aside className="hidden md:flex w-56 shrink-0 bg-gray-900 border-r border-white/[0.06] flex-col h-full z-10">

      {/* Brand */}
      <div className="px-4 py-4 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0 text-lg select-none">
            🍽️
          </div>
          <div className="min-w-0">
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
        {filteredGroups.map((group) => (
          <div key={group.label} className="mb-1">
            <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest px-4 pt-3 pb-1 select-none">
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
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
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
                    <span className="flex-1 text-left truncate">{label}</span>
                    {soon && (
                      <span className="text-[10px] bg-gray-800 text-gray-600 px-1.5 py-0.5 rounded-full leading-none shrink-0">
                        breve
                      </span>
                    )}
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <TrialWidget onShowPlans={onShowPlans} />

      {/* User + Logout */}
      <div className="p-2 border-t border-white/[0.06] shrink-0 space-y-0.5">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl min-w-0">
          <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 shrink-0 select-none">
            {(user.name ?? 'U')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-300 truncate leading-tight">
              {user.name ?? 'Usuário'}
            </p>
            <p className="text-[10px] text-gray-600 truncate capitalize">
              {ROLE_LABEL[user.role] ?? user.role ?? 'Equipe'}
            </p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );

  // ── Mobile bottom nav ────────────────────────────────────
  const mobileBottomNav = (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-gray-900 border-t border-white/[0.08] flex items-stretch"
         style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {bottomNavItems.map(({ key, emoji, label }) => {
        const isActive = page === key;
        return (
          <button
            key={key}
            onClick={() => handleNav(key)}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors min-w-0 ${
              isActive ? 'text-orange-400' : 'text-gray-500'
            }`}
          >
            <span className="text-xl leading-none">{emoji}</span>
            <span className="text-[10px] font-semibold truncate w-full text-center leading-tight px-0.5">
              {label}
            </span>
            {isActive && <span className="w-1 h-1 rounded-full bg-orange-400 mt-0.5" />}
          </button>
        );
      })}

      {/* Mais button */}
      <button
        onClick={() => setDrawerOpen(true)}
        className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
          drawerOpen ? 'text-orange-400' : 'text-gray-500'
        }`}
      >
        <span className="text-xl leading-none">☰</span>
        <span className="text-[10px] font-semibold">Mais</span>
      </button>
    </div>
  );

  // ── Mobile drawer (slide up) ─────────────────────────────
  const mobileDrawer = (
    <AnimatePresence>
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="md:hidden fixed inset-0 z-50 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer panel */}
          <motion.div
            key="drawer"
            className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900 rounded-t-2xl border-t border-white/[0.08] flex flex-col max-h-[80vh]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-700" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-300 shrink-0">
                  {(user.name ?? 'U')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{user.name ?? 'Usuário'}</p>
                  <p className="text-xs text-gray-500 capitalize">{ROLE_LABEL[userRole] ?? userRole} · {tenant.name}</p>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-gray-500 hover:text-white p-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Nav items */}
            <div className="flex-1 overflow-y-auto py-2">
              {filteredGroups.map((group) => (
                <div key={group.label} className="mb-1">
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest px-5 pt-3 pb-1 select-none">
                    {group.label}
                  </p>
                  <div className="px-3 space-y-0.5">
                    {group.items.map(({ key, emoji, label, soon, special }) => {
                      const isActive = page === key;
                      return (
                        <button
                          key={key}
                          disabled={soon}
                          onClick={() => { if (!soon) handleNav(key); }}
                          className={[
                            'w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all',
                            isActive
                              ? 'bg-orange-500/15 text-orange-400'
                              : special === 'purple'
                                ? 'text-purple-400 hover:bg-purple-500/10'
                                : soon
                                  ? 'text-gray-600 cursor-not-allowed opacity-40'
                                  : 'text-gray-400 active:bg-white/[0.06]',
                          ].join(' ')}
                        >
                          <span className="text-lg w-7 text-center leading-none shrink-0">{emoji}</span>
                          <span className="flex-1 text-left">{label}</span>
                          {soon && (
                            <span className="text-[10px] bg-gray-800 text-gray-600 px-2 py-0.5 rounded-full">breve</span>
                          )}
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Logout */}
            <div className="px-3 pb-3 pt-2 border-t border-white/[0.06] shrink-0">
              <button
                onClick={() => { onLogout(); setDrawerOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-gray-500 hover:text-red-400 active:bg-red-400/10 transition-colors"
              >
                <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Sair da conta</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {desktopSidebar}
      {mobileBottomNav}
      {mobileDrawer}
    </>
  );
}
