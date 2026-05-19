// ── LandingPage.jsx ───────────────────────────────────────────
import { useState } from 'react';

const OWNER_WHATSAPP = '5551981521264';

const waLink = (planName) => {
  const msg = encodeURIComponent(
    `Olá! Quero conhecer o ZapFome.\nPlano de interesse: ${planName}`
  );
  return `https://wa.me/${OWNER_WHATSAPP}?text=${msg}`;
};

const PLANS = [
  {
    id: 'basic', name: 'Basic', price: 'R$ 67', period: '/mês',
    color: 'border-gray-700', badge: 'text-orange-400',
    features: [
      'Pedidos ilimitados',
      'Controle de caixa',
      'Histórico de pedidos',
      'Fiado e clientes',
      'Cardápio digital (QR Code)',
      '2 usuários',
    ],
  },
  {
    id: 'pro', name: 'Pro', price: 'R$ 179,99', period: '/mês', highlight: true,
    color: 'border-orange-500', badge: 'text-orange-400',
    features: [
      'Tudo do Basic',
      'Relatórios avançados',
      'Múltiplos usuários (até 5)',
      'Alertas de estoque',
      'Suporte prioritário',
    ],
  },
  {
    id: 'premium', name: 'Premium', price: 'R$ 370', period: '/mês',
    color: 'border-yellow-500', badge: 'text-yellow-400',
    features: [
      'Tudo do Pro',
      'Usuários ilimitados',
      'API pública',
      'Integrações avançadas',
      'Suporte VIP via WhatsApp',
    ],
  },
];

const FEATURES = [
  { icon: '🎯', title: 'Kanban em tempo real', desc: 'Acompanhe todos os pedidos ao vivo — Pendente, Em preparo e Concluído. Notificação sonora a cada novo pedido.' },
  { icon: '💰', title: 'Caixa + Banco virtual', desc: 'Fechamento de caixa com contagem de dinheiro, cartão e Pix. Discrepância calculada automaticamente.' },
  { icon: '📱', title: 'Cardápio digital com QR Code', desc: 'Gere um link do seu cardápio. Clientes fazem pedidos pelo celular, sem instalar app.' },
  { icon: '🤝', title: 'Fiado e clientes', desc: 'Controle de crédito por cliente, histórico de compras e saldo em aberto.' },
  { icon: '📊', title: 'Financeiro completo', desc: 'Relatório de vendas por produto, ticket médio, período personalizado.' },
  { icon: '📦', title: 'Controle de estoque', desc: 'Dedução automática a cada venda, alertas de estoque baixo.' },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-gray-900 border border-white/[0.07] rounded-2xl overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors">
        <span className="font-bold text-white text-sm">{q}</span>
        <span className={`w-7 h-7 rounded-full bg-orange-500/15 text-orange-400 flex items-center justify-center text-lg font-black shrink-0 transition-transform ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      {open && (
        <div className="px-5 pb-4 text-gray-400 text-sm leading-relaxed border-t border-white/[0.06] pt-3">{a}</div>
      )}
    </div>
  );
}

export default function LandingPage({ onGoLogin, onGoRegister }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-gray-950/90 backdrop-blur border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <span className="text-xl font-black text-white tracking-tight">ZapFome</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onGoLogin} className="px-4 py-2 text-sm font-semibold text-gray-400 hover:text-white transition-colors">
              Entrar
            </button>
            <button onClick={onGoRegister} className="px-4 py-2 text-sm font-bold bg-orange-500 hover:bg-orange-400 text-white rounded-xl transition-colors">
              Testar grátis
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-1.5 mb-6">
          <span className="text-sm">⭐</span>
          <span className="text-sm text-purple-300 font-semibold">3 dias Premium + 7 dias Basic — totalmente grátis</span>
        </div>

        <h1 className="text-5xl md:text-6xl font-black leading-tight tracking-tight mb-6">
          Sistema de pedidos para{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-400">
            restaurantes
          </span>
        </h1>

        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Kanban de pedidos em tempo real, caixa inteligente, cardápio digital com QR Code e controle financeiro.
          Tudo em um painel simples, sem instalação.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <button
            onClick={onGoRegister}
            className="w-full sm:w-auto px-8 py-4 text-lg font-black bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-400 hover:to-yellow-400 text-white rounded-2xl transition-all shadow-lg shadow-orange-500/20 hover:scale-105 active:scale-95"
          >
            Começar teste grátis →
          </button>
          <a
            href={waLink('Quero conhecer')}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-8 py-4 text-lg font-semibold text-white bg-green-600/20 hover:bg-green-600/30 border border-green-600/40 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Falar no WhatsApp
          </a>
        </div>

        <p className="text-sm text-gray-600 mt-4">
          Sem cartão de crédito · Pagamento via WhatsApp após o trial
        </p>
      </section>

      {/* ── How it works ───────────────────────────────────── */}
      <section className="bg-white/[0.02] border-y border-white/[0.06] py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-4xl font-black mb-3">Pronto em minutos</h2>
          <p className="text-gray-500 text-lg mb-14">Sem instalação, sem técnico, sem burocracia.</p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '1', icon: '📝', title: 'Crie sua conta', desc: 'Cadastro em menos de 2 minutos. Informe o nome do restaurante, email e senha.' },
              { step: '2', icon: '🍔', title: 'Cadastre seu cardápio', desc: 'Adicione categorias e produtos com foto, preço e descrição.' },
              { step: '3', icon: '🚀', title: 'Comece a receber pedidos', desc: 'Compartilhe o link do cardápio digital e receba pedidos em tempo real.' },
            ].map(({ step, icon, title, desc }) => (
              <div key={step}>
                <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 font-black text-lg mx-auto mb-4">
                  {step}
                </div>
                <div className="text-3xl mb-2">{icon}</div>
                <h3 className="text-lg font-bold mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-24">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-black mb-3 tracking-tight">Tudo que seu restaurante precisa</h2>
          <p className="text-gray-500 text-lg">Uma plataforma, todas as ferramentas.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon, title, desc }) => (
            <div key={title} className="bg-gray-900 border border-white/[0.07] rounded-2xl p-6 hover:border-orange-500/30 transition-colors group">
              <div className="text-3xl mb-3">{icon}</div>
              <h3 className="text-lg font-bold text-white mb-2 group-hover:text-orange-300 transition-colors">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Trial callout ───────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-4 pb-10">
        <div className="bg-gradient-to-r from-purple-500/10 to-orange-500/10 border border-white/10 rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3">⭐</div>
          <h3 className="text-2xl font-black text-white mb-2">10 dias de teste grátis</h3>
          <p className="text-gray-400 mb-1">
            <span className="text-purple-300 font-bold">Dias 1-3:</span> acesso completo ao plano Premium
          </p>
          <p className="text-gray-400 mb-6">
            <span className="text-orange-300 font-bold">Dias 4-10:</span> plano Basic liberado
          </p>
          <button
            onClick={onGoRegister}
            className="px-8 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl transition-colors"
          >
            Criar conta grátis
          </button>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────── */}
      <section className="py-20 bg-white/[0.02] border-y border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-400 mb-2">Quem já usa</p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">
              Donos brasileiros, problemas reais, resultado prático.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { name: 'Léo da Lanchonete', biz: 'Lancheria do Léo · Torres/RS', emoji: '🍔', stars: 5, quote: 'Antes eu perdia uns 4-5 pedidos por noite no WhatsApp. Hoje cai tudo num painel só, com som. Já me pagou.' },
              { name: 'Dona Cida', biz: 'Padaria Pão Quente · Caxias/RS', emoji: '🥖', stars: 5, quote: 'O fiado era minha tristeza. Agora o ZapFome lembra quem tá devendo e ainda manda a cobrança pelo Zap pra mim.' },
              { name: 'Bruno do Açaí', biz: 'Açaí Tropical · Capão/RS', emoji: '🍨', stars: 5, quote: 'O QR Code na fachada mudou meu fim de semana. Cliente chega, escaneia e pede sentado. Subi 30% no mês.' },
            ].map((t) => (
              <div key={t.name} className="bg-gray-900 border border-white/[0.07] rounded-2xl p-6 flex flex-col hover:border-orange-500/20 transition-colors">
                <div className="text-yellow-400 text-lg mb-3 tracking-tight">{'★'.repeat(t.stars)}</div>
                <p className="text-gray-300 text-base leading-relaxed mb-5 flex-1">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-orange-300 to-amber-400 flex items-center justify-center text-2xl shrink-0">
                    {t.emoji}
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-white text-sm truncate">{t.name}</p>
                    <p className="text-xs text-gray-500 truncate">{t.biz}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <section id="duvidas" className="py-24">
        <div className="max-w-3xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-400 mb-2">Dúvidas honestas, respostas honestas</p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Antes de você perguntar</h2>
          </div>
          <div className="space-y-2">
            {[
              { q: 'Preciso de algum equipamento ou instalação?', a: 'Não. ZapFome roda no navegador (celular, tablet, computador). Se você tem WhatsApp funcionando, você tem ZapFome funcionando.' },
              { q: 'Como funciona o pagamento via WhatsApp?', a: 'Você testa 10 dias grátis. Se gostou, manda mensagem no nosso Zap, a gente passa o Pix e libera seu acesso em minutos. Sem cartão preso, sem assinatura automática.' },
              { q: 'O cardápio digital tem mesmo custo zero pra sempre?', a: 'Pros 100 primeiros restaurantes que se inscreverem, sim — pra sempre, sem cobrar setup nem mensalidade do cardápio. Depois das 100 vagas, vira pago.' },
              { q: 'E se eu não souber mexer em computador?', a: 'A gente liga, mostra, e te ajuda a cadastrar o cardápio. Em 1 hora você tá vendendo. Vídeos curtos pra cada função, e suporte humano por WhatsApp em horário comercial.' },
              { q: 'Funciona pra pedidos do iFood/99Food?', a: 'Sim. Pedidos do iFood, WhatsApp, mesa e balcão caem no mesmo painel, separados por canal. Você não precisa ficar pulando de tela.' },
              { q: 'Posso cancelar quando quiser?', a: 'Pode. Não tem fidelidade, não tem multa, não tem letra miúda. Cancela pelo Zap, e pronto. Seu cardápio digital fica preservado.' },
            ].map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} />
            ))}
          </div>
          <div className="mt-10 text-center">
            <p className="text-gray-500 text-sm mb-3">Não encontrou sua dúvida?</p>
            <a href={waLink('Tenho uma dúvida')} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 bg-green-600 hover:bg-green-500 text-white font-bold text-sm rounded-2xl transition-colors active:scale-95 shadow-lg shadow-green-900/40">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0a12 12 0 00-10.4 18l-1.6 6 6.2-1.6A12 12 0 1012 0zm5.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.8 1-1 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5 0-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.5 1.1 2.9 1.2 3 2.1 3.3 5.1 4.6c.7.3 1.3.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.1-1.4-.1-.1-.3-.2-.5-.3z"/>
              </svg>
              Pergunte direto no WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 py-24" id="precos">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-black mb-3">Planos simples e honestos</h2>
          <p className="text-gray-500 text-lg">Pagamento confirmado via WhatsApp. Sem burocracia.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-gray-900 rounded-2xl border-2 ${plan.color} p-6 flex flex-col ${plan.highlight ? 'scale-105 shadow-2xl shadow-orange-500/10' : ''}`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-orange-500 text-white text-xs font-black px-3 py-1 rounded-full">MAIS POPULAR</span>
                </div>
              )}
              <div className="mb-6">
                <h3 className={`text-lg font-black ${plan.badge} mb-1`}>{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white">{plan.price}</span>
                  <span className="text-gray-500 text-sm">{plan.period}</span>
                </div>
              </div>
              <ul className="space-y-2.5 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="space-y-2">
                <button
                  onClick={onGoRegister}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-colors ${
                    plan.highlight
                      ? 'bg-orange-500 hover:bg-orange-400 text-white'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  Testar grátis 10 dias
                </button>
                <a
                  href={waLink(plan.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 rounded-xl font-semibold text-sm text-green-400 hover:bg-green-500/10 border border-green-500/20 transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Assinar via WhatsApp
                </a>
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-gray-600 text-sm mt-8">
          Após o pagamento pelo WhatsApp, seu acesso é ativado em minutos.
        </p>
      </section>

      {/* ── CTA final ──────────────────────────────────────── */}
      <section className="bg-white/[0.02] border-y border-white/[0.06] py-24">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-5xl font-black mb-4">
            Pronto para{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-400">
              começar?
            </span>
          </h2>
          <p className="text-gray-400 text-xl mb-10">
            Crie sua conta em 2 minutos e teste tudo grátis por 10 dias.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={onGoRegister}
              className="px-10 py-5 text-xl font-black bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-400 hover:to-yellow-400 text-white rounded-2xl transition-all shadow-2xl shadow-orange-500/30 hover:scale-105"
            >
              Criar conta grátis →
            </button>
            <a
              href={waLink('Quero conhecer')}
              target="_blank"
              rel="noopener noreferrer"
              className="px-10 py-5 text-xl font-semibold text-white bg-green-600/20 hover:bg-green-600/30 border border-green-600/40 rounded-2xl transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Tirar dúvidas
            </a>
          </div>
          <p className="text-gray-600 text-sm mt-4">Sem cartão de crédito · Cancele quando quiser</p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <span className="font-black text-white">ZapFome</span>
            <span className="text-gray-600 text-sm">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <a href="#precos" className="hover:text-white transition-colors">Preços</a>
            <button onClick={onGoLogin} className="hover:text-white transition-colors">Entrar</button>
            <button onClick={onGoRegister} className="hover:text-white transition-colors">Cadastrar</button>
            <a href={waLink('Suporte')} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Suporte</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
