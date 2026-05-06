// ── LandingPage.jsx ───────────────────────────────────────────
// Landing page pública do ZapFome SaaS

export default function LandingPage({ onGoLogin, onGoRegister }) {

  const PLANS = [
    {
      id: 'basic', name: 'Basic', price: 49,
      color: 'border-gray-700', badge: 'text-gray-400',
      features: ['Até 300 pedidos/mês', '2 usuários', 'Kanban de pedidos', 'Caixa + Banco virtual', 'Cardápio digital (QR Code)'],
    },
    {
      id: 'pro', name: 'Pro', price: 97, highlight: true,
      color: 'border-orange-500', badge: 'text-orange-400',
      features: ['Até 1.000 pedidos/mês', '5 usuários', 'Tudo do Basic', 'Relatórios financeiros', 'Impressão automática', 'Suporte prioritário'],
    },
    {
      id: 'premium', name: 'Premium', price: 149,
      color: 'border-yellow-500', badge: 'text-yellow-400',
      features: ['Pedidos ilimitados', 'Usuários ilimitados', 'Tudo do Pro', 'Integração WhatsApp', 'Dashboard avançado', 'API access'],
    },
  ];

  const FEATURES = [
    { icon: '🎯', title: 'Kanban em tempo real', desc: 'Acompanhe todos os pedidos ao vivo — Pendente, Em preparo e Concluído. Notificação sonora a cada novo pedido.' },
    { icon: '💰', title: 'Caixa + Banco virtual', desc: 'Fechamento de caixa com contagem física de dinheiro, cartão e Pix. Discrepância calculada automaticamente. Saldo acumulado no Banco.' },
    { icon: '📱', title: 'Cardápio digital com QR Code', desc: 'Gere um link/QR Code do seu cardápio. Clientes fazem pedidos direto pelo celular, sem instalar app.' },
    { icon: '🖨️', title: 'Impressão automática', desc: 'Integração com impressoras térmicas. Pedido chegou → comanda impressa na cozinha automaticamente.' },
    { icon: '📊', title: 'Financeiro completo', desc: 'DRE, contas a pagar, relatório de vendas por produto, ticket médio, horário de pico.' },
    { icon: '🔔', title: 'Notificações push', desc: 'Receba alertas no celular mesmo com a aba fechada. Nunca perca um pedido.' },
  ];

  const TESTIMONIALS = [
    { name: 'Carlos Silva', role: 'Dono · Hamburgueria do Carlos', text: 'Em 1 semana já tinha amortizado o plano. A impressão automática sozinha vale o investimento.', stars: 5 },
    { name: 'Ana Rodrigues', role: 'Gerente · Pizzaria Bella Napoli', text: 'Fechávamos o caixa na mão todo dia, demorava 30 minutos. Agora leva 2 minutos e ainda mostra a diferença.', stars: 5 },
    { name: 'João Mendes', role: 'Dono · Rotisseria do João', text: 'O cardápio digital com QR Code aumentou 40% os pedidos no salão. Os clientes adoraram.', stars: 5 },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-gray-950/90 backdrop-blur border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <span className="text-xl font-black text-white tracking-tight">ZapFome</span>
            <span className="text-xs text-orange-400 font-bold bg-orange-400/10 px-2 py-0.5 rounded-full">SaaS</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onGoLogin} className="px-4 py-2 text-sm font-semibold text-gray-400 hover:text-white transition-colors">
              Entrar
            </button>
            <button onClick={onGoRegister} className="px-4 py-2 text-sm font-bold bg-orange-500 hover:bg-orange-400 text-white rounded-xl transition-colors">
              Teste grátis 14 dias
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-4 py-1.5 mb-6">
          <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
          <span className="text-sm text-orange-300 font-semibold">Mais de 200 restaurantes ativos</span>
        </div>

        <h1 className="text-5xl md:text-6xl font-black leading-tight mb-6">
          Sistema completo para{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-400">
            restaurantes
          </span>
        </h1>

        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Pedidos em tempo real, caixa inteligente, cardápio digital com QR Code e muito mais.
          Tudo em um painel simples que funciona do celular ao computador.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <button
            onClick={onGoRegister}
            className="w-full sm:w-auto px-8 py-4 text-lg font-black bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-400 hover:to-yellow-400 text-white rounded-2xl transition-all shadow-lg shadow-orange-500/20 hover:shadow-orange-400/30 hover:scale-105"
          >
            Começar teste grátis →
          </button>
          <button
            onClick={onGoLogin}
            className="w-full sm:w-auto px-8 py-4 text-lg font-semibold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all"
          >
            Já tenho conta
          </button>
        </div>

        <p className="text-sm text-gray-600 mt-4">
          14 dias grátis · Sem cartão de crédito · Cancele quando quiser
        </p>
      </section>

      {/* ── Stats ──────────────────────────────────────────── */}
      <section className="border-y border-white/[0.06] bg-white/[0.02]">
        <div className="max-w-4xl mx-auto px-4 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: '200+', label: 'Restaurantes' },
            { value: '50k+', label: 'Pedidos/mês' },
            { value: '99.9%', label: 'Uptime' },
            { value: '< 2min', label: 'Setup inicial' },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="text-3xl font-black text-orange-400">{value}</p>
              <p className="text-sm text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-24">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-black mb-3">Tudo que seu restaurante precisa</h2>
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

      {/* ── How it works ───────────────────────────────────── */}
      <section className="bg-white/[0.02] border-y border-white/[0.06] py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-4xl font-black mb-3">Pronto em minutos</h2>
          <p className="text-gray-500 text-lg mb-14">Sem instalação, sem técnico, sem burocracia.</p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '1', icon: '📝', title: 'Crie sua conta', desc: 'Cadastro em menos de 2 minutos. Informe o nome do restaurante, email e senha.' },
              { step: '2', icon: '🍔', title: 'Cadastre seu cardápio', desc: 'Adicione categorias e produtos com foto, preço e descrição. Pode importar do WhatsApp.' },
              { step: '3', icon: '🚀', title: 'Comece a vender', desc: 'Compartilhe o link do cardápio digital e comece a receber pedidos. É isso.' },
            ].map(({ step, icon, title, desc }) => (
              <div key={step} className="relative">
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

      {/* ── Pricing ────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 py-24" id="precos">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-black mb-3">Planos simples e honestos</h2>
          <p className="text-gray-500 text-lg">Todos incluem 14 dias grátis. Sem pegadinha.</p>
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
                  <span className="text-gray-500 text-sm">R$</span>
                  <span className="text-4xl font-black text-white">{plan.price}</span>
                  <span className="text-gray-500 text-sm">/mês</span>
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
              <button
                onClick={onGoRegister}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-colors ${
                  plan.highlight
                    ? 'bg-orange-500 hover:bg-orange-400 text-white'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                Começar grátis
              </button>
            </div>
          ))}
        </div>
        <p className="text-center text-gray-600 text-sm mt-8">
          Todos os planos incluem 14 dias de teste gratuito. Após o trial, escolha o plano ideal.
        </p>
      </section>

      {/* ── Testimonials ───────────────────────────────────── */}
      <section className="bg-white/[0.02] border-y border-white/[0.06] py-20">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-4xl font-black text-center mb-14">O que dizem nossos clientes</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(({ name, role, text, stars }) => (
              <div key={name} className="bg-gray-900 rounded-2xl border border-white/[0.07] p-6">
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: stars }).map((_, i) => (
                    <span key={i} className="text-yellow-400 text-sm">★</span>
                  ))}
                </div>
                <p className="text-gray-300 text-sm leading-relaxed mb-4">"{text}"</p>
                <div>
                  <p className="text-white font-bold text-sm">{name}</p>
                  <p className="text-gray-500 text-xs">{role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final ──────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 py-24 text-center">
        <h2 className="text-5xl font-black mb-4">
          Pronto para{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-400">
            crescer?
          </span>
        </h2>
        <p className="text-gray-400 text-xl mb-10">
          Junte-se a centenas de restaurantes que já usam o ZapFome para vender mais e trabalhar menos.
        </p>
        <button
          onClick={onGoRegister}
          className="px-10 py-5 text-xl font-black bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-400 hover:to-yellow-400 text-white rounded-2xl transition-all shadow-2xl shadow-orange-500/30 hover:scale-105"
        >
          Começar teste grátis de 14 dias →
        </button>
        <p className="text-gray-600 text-sm mt-4">Sem cartão de crédito · Cancele quando quiser</p>
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
          </div>
        </div>
      </footer>

    </div>
  );
}
