const NAV_ITEMS = [
  { key: 'orders',    emoji: '🍽️', label: 'Pedidos' },
  { key: 'products',  emoji: '📦', label: 'Produtos' },
  { key: 'stock',     emoji: '📊', label: 'Estoque' },
  { key: 'financial', emoji: '💰', label: 'Financeiro' },
];

export default function Sidebar({ page, setPage, onLogout }) {
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') ?? '{}'); }
    catch { return {}; }
  })();

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
              {user.tenant?.name ?? 'Restaurante'}
            </p>
            <p className="text-[10px] text-gray-500 truncate capitalize mt-0.5">
              Plano {user.tenant?.plan ?? 'básico'}
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5">
        {NAV_ITEMS.map(({ key, emoji, label, soon }) => (
          <button
            key={key}
            disabled={soon}
            onClick={() => !soon && setPage(key)}
            className={[
              'w-full flex items-center gap-3 px-2.5 md:px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
              page === key
                ? 'bg-orange-500/15 text-orange-400'
                : soon
                  ? 'text-gray-600 cursor-not-allowed opacity-50'
                  : 'text-gray-400 hover:text-white hover:bg-white/[0.06]',
            ].join(' ')}
          >
            <span className="text-base shrink-0 w-5 text-center leading-none">{emoji}</span>
            <span className="hidden md:block flex-1 text-left">{label}</span>
            {soon && (
              <span className="hidden md:block text-[10px] bg-gray-800 text-gray-600 px-1.5 py-0.5 rounded-full leading-none shrink-0">
                em breve
              </span>
            )}
          </button>
        ))}
      </nav>

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
