// TrialBanner — aparece no topo do app durante o período de trial
// Fase 1 (dias 1-3): Premium ativo — banner roxo/dourado
// Fase 2 (dias 4-10): voltou para Basic — banner laranja
// Urgente (≤ 2 dias restantes): banner vermelho

const daysLeft = (dateStr) => {
  if (!dateStr) return 0;
  const diff = new Date(dateStr) - Date.now();
  return diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;
};

export default function TrialBanner({ onShowPlans }) {
  const tenant = (() => {
    try { return JSON.parse(localStorage.getItem('tenant') || 'null'); } catch { return null; }
  })();

  if (!tenant || tenant.subscriptionStatus !== 'trialing') return null;

  const totalDaysLeft   = daysLeft(tenant.trialEndsAt);
  const premiumDaysLeft = daysLeft(tenant.premiumTrialEndsAt);

  if (totalDaysLeft <= 0) return null; // já expirou — backend cuidará

  const premiumActive = premiumDaysLeft > 0;
  const urgent        = totalDaysLeft <= 2;

  // ── Cores por fase ──────────────────────────────────────────
  let bg, border, textColor, badge;
  if (premiumActive) {
    bg        = 'bg-purple-500/10';
    border    = 'border-purple-500/20';
    textColor = 'text-purple-300';
    badge     = 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30';
  } else if (urgent) {
    bg        = 'bg-red-500/10';
    border    = 'border-red-500/30';
    textColor = 'text-red-300';
    badge     = 'bg-red-500/20 text-red-300 hover:bg-red-500/30';
  } else {
    bg        = 'bg-orange-500/10';
    border    = 'border-orange-500/20';
    textColor = 'text-orange-300';
    badge     = 'bg-orange-500/20 text-orange-300 hover:bg-orange-500/30';
  }

  // ── Mensagem por fase ───────────────────────────────────────
  let icon, message;
  if (premiumActive) {
    icon    = '⭐';
    message = (
      <>
        <span className="font-bold">Premium ativo!</span>{' '}
        Você tem {premiumDaysLeft} dia{premiumDaysLeft !== 1 ? 's' : ''} de acesso Premium.{' '}
        Após isso, volta para o plano Basic por mais {totalDaysLeft - premiumDaysLeft} dias.
      </>
    );
  } else {
    icon    = urgent ? '⚠️' : '🎁';
    message = (
      <>
        {urgent ? <span className="font-bold">Atenção! </span> : null}
        Teste expira em{' '}
        <span className="font-bold">{totalDaysLeft} dia{totalDaysLeft !== 1 ? 's' : ''}</span>.{' '}
        {urgent
          ? 'Assine agora para não perder o acesso.'
          : 'Assine um plano para manter seu acesso.'}
      </>
    );
  }

  return (
    <div className={`w-full px-4 py-2 flex items-center justify-between text-sm ${bg} border-b ${border}`}>
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <span className={textColor}>{message}</span>
      </div>
      <button
        onClick={() => onShowPlans?.()}
        className={`text-xs font-bold px-3 py-1 rounded-lg transition-colors ${badge}`}
      >
        Ver planos
      </button>
    </div>
  );
}
