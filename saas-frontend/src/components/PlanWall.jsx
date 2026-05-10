// PlanWall — overlay completo exibido quando o trial expira ou conta é cancelada
// Mostra comparativo de planos e botões de contato WhatsApp

import { useEffect, useState } from 'react';
import { getBillingStatus } from '../api/billing';

const CHECK_ICON = (
  <svg className="w-4 h-4 shrink-0 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

function PlanCard({ plan, featured }) {
  const colorMap = {
    orange: { ring: 'ring-orange-500/40', btn: 'bg-orange-500 hover:bg-orange-400', label: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300' },
    blue:   { ring: 'ring-blue-500/40',   btn: 'bg-blue-500   hover:bg-blue-400',   label: 'text-blue-400',   badge: 'bg-blue-500/20   text-blue-300'   },
    purple: { ring: 'ring-purple-500/40', btn: 'bg-purple-500 hover:bg-purple-400', label: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300' },
  };
  const c = colorMap[plan.color] ?? colorMap.orange;

  return (
    <div className={`relative flex flex-col rounded-2xl bg-gray-900 border border-white/[0.08] p-6 gap-4
      ${featured ? `ring-2 ${c.ring}` : ''}`}
    >
      {featured && (
        <span className={`absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full ${c.badge}`}>
          Mais popular
        </span>
      )}

      <div>
        <p className={`text-xs font-bold uppercase tracking-wider ${c.label}`}>{plan.name}</p>
        <p className="text-3xl font-black text-white mt-1">
          {plan.priceLabel}
        </p>
        <p className="text-sm text-gray-500 mt-0.5">{plan.description}</p>
      </div>

      <ul className="space-y-2 flex-1">
        {plan.highlights.map((h, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
            {CHECK_ICON}
            {h}
          </li>
        ))}
      </ul>

      <a
        href={plan.whatsappLink}
        target="_blank"
        rel="noopener noreferrer"
        className={`w-full py-3 rounded-xl text-sm font-bold text-white text-center transition-colors ${c.btn}`}
      >
        Assinar via WhatsApp
      </a>
    </div>
  );
}

export default function PlanWall({ onDismiss }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCancelled, setIsCancelled] = useState(false);

  useEffect(() => {
    getBillingStatus()
      .then(data => {
        if (data.blocked?.plans) setPlans(data.blocked.plans);
        if (data.subscription?.isCancelled) setIsCancelled(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/95 backdrop-blur-sm flex flex-col items-center justify-start overflow-y-auto">
      <div className="w-full max-w-4xl px-4 py-12">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-orange-500/20 flex items-center justify-center mx-auto mb-4 text-4xl select-none">
            {isCancelled ? '😔' : '⏰'}
          </div>
          <h1 className="text-3xl font-black text-white">
            {isCancelled ? 'Assinatura cancelada' : 'Seu teste gratuito acabou'}
          </h1>
          <p className="text-gray-400 mt-3 text-lg max-w-lg mx-auto">
            {isCancelled
              ? 'Sua conta está suspensa. Assine um plano para retomar o acesso.'
              : 'Você chegou ao fim do período de teste. Escolha um plano para continuar criando pedidos.'}
          </p>
          <p className="text-gray-500 text-sm mt-2">
            Pagamento confirmado manualmente via WhatsApp — sem burocracia.
          </p>
        </div>

        {/* Plans */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : plans.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map(p => (
              <PlanCard key={p.id} plan={p} featured={p.popular} />
            ))}
          </div>
        ) : (
          // Fallback se não carregar os planos
          <div className="text-center">
            <p className="text-gray-400 mb-4">Entre em contato para assinar um plano:</p>
            <a
              href="https://wa.me/5551981521264"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 rounded-xl text-white font-bold transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Falar no WhatsApp
            </a>
          </div>
        )}

        {/* Footer note */}
        <p className="text-center text-gray-600 text-xs mt-8">
          Após confirmar o pagamento pelo WhatsApp, seu acesso é liberado em minutos.
        </p>
      </div>
    </div>
  );
}
