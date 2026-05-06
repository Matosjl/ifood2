// TrialBanner — aparece no topo do app quando tenant está em período de teste

export default function TrialBanner() {
  const tenant = (() => {
    try { return JSON.parse(localStorage.getItem('tenant') || 'null'); } catch { return null; }
  })();

  if (!tenant || tenant.subscriptionStatus !== 'trialing') return null;
  if (!tenant.trialEndsAt) return null;

  const msLeft   = new Date(tenant.trialEndsAt) - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

  if (daysLeft <= 0) return null; // expirou — backend vai bloquear, não precisamos mostrar aqui

  const urgent = daysLeft <= 3;

  return (
    <div className={`w-full px-4 py-2 flex items-center justify-between text-sm ${
      urgent
        ? 'bg-red-500/10 border-b border-red-500/30'
        : 'bg-orange-500/10 border-b border-orange-500/20'
    }`}>
      <div className="flex items-center gap-2">
        <span>{urgent ? '⚠️' : '🎁'}</span>
        <span className={urgent ? 'text-red-300' : 'text-orange-300'}>
          {urgent
            ? `Atenção! Seu período de teste encerra em ${daysLeft} dia${daysLeft !== 1 ? 's' : ''}.`
            : `Período de teste: ${daysLeft} dias restantes.`}
          {' '}
          <span className="text-gray-400">Assine um plano para não perder o acesso.</span>
        </span>
      </div>
      <a
        href="/#precos"
        className={`text-xs font-bold px-3 py-1 rounded-lg transition-colors ${
          urgent
            ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
            : 'bg-orange-500/20 text-orange-300 hover:bg-orange-500/30'
        }`}
      >
        Ver planos
      </a>
    </div>
  );
}
