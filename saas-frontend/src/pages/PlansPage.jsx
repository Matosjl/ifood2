// PlansPage — página de comparativo de planos (acessível logado)
import { useEffect, useState } from 'react';
import { getBillingPlans } from '../api/billing';

const CHECK_ICON = (
  <svg className="w-4 h-4 shrink-0 text-green-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const WHATSAPP_ICON = (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

const COLOR = {
  orange: { label: 'text-orange-400', btn: 'bg-orange-500 hover:bg-orange-400', ring: 'ring-orange-500/40', badge: 'bg-orange-500/20 text-orange-300' },
  blue:   { label: 'text-blue-400',   btn: 'bg-blue-500   hover:bg-blue-400',   ring: 'ring-blue-500/40',   badge: 'bg-blue-500/20   text-blue-300'   },
  purple: { label: 'text-purple-400', btn: 'bg-purple-500 hover:bg-purple-400', ring: 'ring-purple-500/40', badge: 'bg-purple-500/20 text-purple-300' },
};

function PlanCard({ plan }) {
  const c = COLOR[plan.color] ?? COLOR.orange;
  return (
    <div className={`relative flex flex-col rounded-2xl bg-gray-900 border border-white/[0.08] p-6 gap-5
      ${plan.popular ? `ring-2 ${c.ring}` : ''}`}
    >
      {plan.popular && (
        <span className={`absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full ${c.badge}`}>
          Mais popular
        </span>
      )}

      <div>
        <p className={`text-xs font-bold uppercase tracking-wider ${c.label}`}>{plan.name}</p>
        <p className="text-4xl font-black text-white mt-1">{plan.priceLabel}</p>
        <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
      </div>

      <ul className="space-y-2.5 flex-1">
        {plan.highlights.map((h, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
            {CHECK_ICON}
            <span>{h}</span>
          </li>
        ))}
      </ul>

      <a
        href={plan.whatsappLink}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-colors ${c.btn}`}
      >
        {WHATSAPP_ICON}
        Assinar via WhatsApp
      </a>
    </div>
  );
}

export default function PlansPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBillingPlans()
      .then(setPlans)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="max-w-4xl mx-auto text-center mb-10">
        <h1 className="text-3xl font-black text-white">Escolha seu plano</h1>
        <p className="text-gray-400 mt-3 text-lg">
          Sem contrato. Sem burocracia. Pagamento confirmado via WhatsApp.
        </p>
        <p className="text-gray-600 text-sm mt-1">
          Após o pagamento, seu acesso é ativado em minutos.
        </p>
      </div>

      {/* Trial badge */}
      <div className="max-w-4xl mx-auto mb-8">
        <div className="flex items-center gap-3 bg-purple-500/10 border border-purple-500/20 rounded-xl px-5 py-4">
          <span className="text-2xl">⭐</span>
          <div>
            <p className="text-sm font-bold text-purple-300">Trial gratuito incluído no cadastro</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Todos os novos restaurantes ganham 3 dias de Premium + 7 dias de Basic sem custo.
            </p>
          </div>
        </div>
      </div>

      {/* Plan cards */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map(p => <PlanCard key={p.id} plan={p} />)}
        </div>
      )}

      {/* FAQ */}
      <div className="max-w-2xl mx-auto mt-12 space-y-4">
        <h2 className="text-lg font-bold text-white text-center mb-6">Dúvidas frequentes</h2>
        {[
          ['Como funciona o pagamento?', 'Você entra em contato pelo WhatsApp, combina o plano e faz o PIX. Após a confirmação, ativamos sua conta na hora.'],
          ['Posso mudar de plano depois?', 'Sim! Qualquer alteração é feita via WhatsApp. Sem complicação.'],
          ['O trial é automático?', 'Sim. Todo novo cadastro começa com 3 dias Premium + 7 dias Basic automaticamente.'],
          ['O que acontece quando o trial acaba?', 'Seu acesso fica suspenso até você assinar um plano. Seus dados ficam intactos por 30 dias.'],
        ].map(([q, a]) => (
          <div key={q} className="bg-gray-900 rounded-xl p-4 border border-white/[0.06]">
            <p className="text-sm font-bold text-white">{q}</p>
            <p className="text-sm text-gray-400 mt-1">{a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
