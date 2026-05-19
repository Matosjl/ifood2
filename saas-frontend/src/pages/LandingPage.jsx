// ── LandingPage.jsx ── V2 redesign (light theme, conversion-focused)
import { useState } from 'react';

const OWNER_WHATSAPP = '5551981521264';

const waLink = (planName) => {
  const msg = encodeURIComponent(`Olá! Quero conhecer o ZapFome.\nPlano de interesse: ${planName}`);
  return `https://wa.me/${OWNER_WHATSAPP}?text=${msg}`;
};

// ── KanbanMockup ──────────────────────────────────────────────
const MOCK_COLS = [
  { label: 'PENDENTES', dot: 'bg-yellow-400', headBg: 'bg-yellow-500/10', headBd: 'border-yellow-500/30',
    countCls: 'bg-yellow-500/20 text-yellow-300', cardBorder: 'border-yellow-500', count: 2,
    cards: [
      { n: '#1023', name: 'Maria Silva', total: '81,80', ch: 'whatsapp', timer: '03:42', tCls: 'text-gray-400' },
      { n: '#1024', name: 'João P.',     total: '58,00', ch: 'ifood',    timer: '08:11', tCls: 'text-gray-400' },
    ]},
  { label: 'EM PREPARO', dot: 'bg-blue-400', headBg: 'bg-blue-500/10', headBd: 'border-blue-500/30',
    countCls: 'bg-blue-500/20 text-blue-300', cardBorder: 'border-blue-500', count: 2,
    cards: [
      { n: '#1025', name: 'Mesa 4',  total: '113,90', ch: 'mesa',     timer: '14:08', tCls: 'text-yellow-400' },
      { n: '#1026', name: 'Ana C.',  total: '22,00',  ch: 'whatsapp', timer: '22:00', tCls: 'text-red-400' },
    ]},
  { label: 'PRONTO', dot: 'bg-green-400', headBg: 'bg-green-500/10', headBd: 'border-green-500/30',
    countCls: 'bg-green-500/20 text-green-300', cardBorder: 'border-green-400', count: 1,
    cards: [
      { n: '#1027', name: 'Bruno R.', total: '33,00', ch: 'whatsapp', timer: '28:14', tCls: 'text-red-400' },
    ]},
  { label: 'CONCLUÍDO', dot: 'bg-gray-500', headBg: 'bg-gray-700/40', headBd: 'border-gray-600/30',
    countCls: 'bg-gray-700 text-gray-400', cardBorder: 'border-green-600', count: 1,
    cards: [
      { n: '#1021', name: 'Patrícia L.', total: '47,80', ch: 'ifood', timer: '—', tCls: 'text-gray-600' },
    ]},
];

function KanbanMockup() {
  return (
    <div className="rounded-2xl overflow-hidden shadow-2xl shadow-orange-200/40 bg-gray-950 border border-gray-200">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border-b border-gray-200">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
        <div className="ml-3 flex-1 bg-white rounded-md px-3 py-0.5 text-[10px] text-gray-400 max-w-xs truncate">
          painel.zapfome.com.br/pedidos
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-white/[0.06]">
        <span className="text-xs font-black text-white">🍽 Cozinha</span>
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black animate-pulse">
          3 pendentes
        </span>
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400" style={{ boxShadow: '0 0 4px #4ade80' }} />
        <span className="text-[10px] text-gray-500">Ao vivo</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 p-2 bg-gray-950" style={{ minHeight: 280 }}>
        {MOCK_COLS.map((col) => (
          <div key={col.label} className="flex flex-col gap-1.5">
            <div className={`flex items-center justify-between px-2 py-1 rounded-t-lg border border-b-0 ${col.headBg} ${col.headBd}`}>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${col.dot}`} />
                <span className="text-[9px] font-black tracking-wider text-gray-200 uppercase truncate">{col.label}</span>
              </div>
              <span className={`text-[9px] font-bold px-1.5 rounded-full ${col.countCls}`}>{col.count}</span>
            </div>
            <div className="flex-1 p-1.5 space-y-1.5 rounded-b-lg border border-t-0 bg-gray-900/60 border-gray-700/30">
              {col.cards.map((c) => (
                <div key={c.n} className={`rounded-md border-l-2 bg-gray-800/80 p-1.5 ring-1 ring-white/5 ${col.cardBorder}`}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-black text-white">{c.n}</span>
                    <span className={`text-[8px] font-mono ${c.tCls}`}>⏱ {c.timer}</span>
                  </div>
                  <p className="text-[9px] text-gray-300 truncate mt-0.5">{c.name}</p>
                  <div className="flex items-center justify-between mt-1 gap-1">
                    <span className="text-[10px] font-black text-white whitespace-nowrap">R$&nbsp;{c.total}</span>
                    <span className="text-[8px] text-purple-300 bg-purple-500/20 px-1 rounded truncate">{c.ch}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── FaqItem ───────────────────────────────────────────────────
function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors">
        <span className="font-bold text-gray-900 text-sm md:text-base">{q}</span>
        <span className={`w-7 h-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-lg font-black shrink-0 transition-transform ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      {open && (
        <div className="px-5 pb-4 text-gray-600 text-sm leading-relaxed border-t border-gray-50 pt-3">{a}</div>
      )}
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────
const FEATURES = [
  { icon: '🎯', title: 'Kanban em tempo real', desc: 'Acompanhe todos os pedidos ao vivo — Pendente, Em preparo e Concluído. Notificação sonora a cada novo pedido.' },
  { icon: '💰', title: 'Caixa + Banco virtual', desc: 'Fechamento de caixa com contagem de dinheiro, cartão e Pix. Discrepância calculada automaticamente.' },
  { icon: '📱', title: 'Cardápio digital com QR Code', desc: 'Gere um link do seu cardápio. Clientes fazem pedidos pelo celular, sem instalar app.' },
  { icon: '🤝', title: 'Fiado e clientes', desc: 'Controle de crédito por cliente, histórico de compras e saldo em aberto.' },
  { icon: '📊', title: 'Financeiro completo', desc: 'Relatório de vendas por produto, ticket médio, período personalizado.' },
  { icon: '📦', title: 'Controle de estoque', desc: 'Dedução automática a cada venda, alertas de estoque baixo.' },
];

const PLANS_V2 = [
  { id: 'basic', name: 'Basic', tag: 'Comece simples', price: '67', cents: '00', period: '/mês',
    accent: 'border-gray-200', badge: 'text-gray-500 bg-gray-100',
    features: ['Pedidos ilimitados', 'Controle de caixa diário', 'Cardápio digital com QR Code', 'Fiado e clientes', '2 usuários no painel'] },
  { id: 'pro', name: 'Pro', tag: '🔥 Mais escolhido', price: '179', cents: '99', period: '/mês', highlight: true,
    accent: 'border-orange-400 ring-4 ring-orange-100', badge: 'text-white bg-orange-500',
    features: ['Tudo do Basic', 'Relatórios avançados (produto, canal, ticket)', 'Múltiplos usuários (até 5)', 'Alertas de estoque baixo', 'Suporte prioritário'] },
  { id: 'premium', name: 'Premium', tag: 'Operação séria', price: '370', cents: '00', period: '/mês',
    accent: 'border-purple-200', badge: 'text-purple-700 bg-purple-100',
    features: ['Tudo do Pro', 'Usuários ilimitados', 'IA ZapFome (insights e alertas)', 'API pública + integrações', 'Suporte VIP via WhatsApp 7 dias'] },
];

const TESTIMONIALS = [
  { name: 'Léo da Lanchonete', biz: 'Lancheria do Léo · Torres/RS', emoji: '🍔', stars: 5, quote: 'Antes eu perdia uns 4-5 pedidos por noite no WhatsApp. Hoje cai tudo num painel só, com som. Já me pagou.' },
  { name: 'Dona Cida', biz: 'Padaria Pão Quente · Caxias/RS', emoji: '🥖', stars: 5, quote: 'O fiado era minha tristeza. Agora o ZapFome lembra quem tá devendo e ainda manda a cobrança pelo Zap pra mim.' },
  { name: 'Bruno do Açaí', biz: 'Açaí Tropical · Capão/RS', emoji: '🍨', stars: 5, quote: 'O QR Code na fachada mudou meu fim de semana. Cliente chega, escaneia e pede sentado. Subi 30% no mês.' },
];

const FAQS = [
  { q: 'Preciso de algum equipamento ou instalação?', a: 'Não. ZapFome roda no navegador (celular, tablet, computador). Se você tem WhatsApp funcionando, você tem ZapFome funcionando.' },
  { q: 'Como funciona o pagamento via WhatsApp?', a: 'Você testa 10 dias grátis. Se gostou, manda mensagem no nosso Zap, a gente passa o Pix e libera seu acesso em minutos. Sem cartão preso, sem assinatura automática.' },
  { q: 'O cardápio digital tem mesmo custo zero pra sempre?', a: 'Pros 100 primeiros restaurantes que se inscreverem, sim — pra sempre, sem cobrar setup nem mensalidade do cardápio. Depois das 100 vagas, vira pago.' },
  { q: 'E se eu não souber mexer em computador?', a: 'A gente liga, mostra, e te ajuda a cadastrar o cardápio. Em 1 hora você tá vendendo. Vídeos curtos pra cada função, e suporte humano por WhatsApp em horário comercial.' },
  { q: 'Funciona pra pedidos do iFood/99Food?', a: 'Sim. Pedidos do iFood, WhatsApp, mesa e balcão caem no mesmo painel, separados por canal. Você não precisa ficar pulando de tela.' },
  { q: 'Posso cancelar quando quiser?', a: 'Pode. Não tem fidelidade, não tem multa, não tem letra miúda. Cancela pelo Zap, e pronto. Seu cardápio digital fica preservado.' },
];

// ── Page ──────────────────────────────────────────────────────
export default function LandingPage({ onGoLogin, onGoRegister }) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <style>{`
        @keyframes floatY  { 0%,100%{transform:translateY(0) rotate(-3deg)} 50%{transform:translateY(-8px) rotate(-3deg)} }
        @keyframes floatY2 { 0%,100%{transform:translateY(0) rotate(2deg)}  50%{transform:translateY(-8px) rotate(2deg)} }
      `}</style>

      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <span className="text-xl font-black text-gray-900 tracking-tight">ZapFome</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            <a href="#precos" className="hidden sm:block px-3 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">Preços</a>
            <a href="#duvidas" className="hidden sm:block px-3 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">Dúvidas</a>
            <button onClick={onGoLogin} className="px-3 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">Entrar</button>
            <a href={waLink('Quero conhecer')} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 text-sm font-bold bg-green-500 hover:bg-green-600 text-white rounded-xl transition-colors active:scale-95 shadow-sm shadow-green-500/30">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0a12 12 0 00-10.4 18l-1.6 6 6.2-1.6A12 12 0 1012 0zm0 22a10 10 0 01-5.1-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A10 10 0 1112 22z"/>
                <path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.8 1-1 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5 0-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.5 1.1 2.9 1.2 3 2.1 3.3 5.1 4.6c.7.3 1.3.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.1-1.4-.1-.1-.3-.2-.5-.3z"/>
              </svg>
              <span className="hidden sm:inline">WhatsApp</span>
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero V2 ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-50 via-white to-white" />
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-30"
          style={{ background: 'radial-gradient(ellipse at top right, #fdba74 0%, transparent 60%)' }} />
        <div className="relative max-w-6xl mx-auto px-4 pt-14 pb-20">
          <div className="grid lg:grid-cols-[1fr_1.1fr] gap-12 items-center">
            {/* Copy */}
            <div>
              <div className="inline-flex items-center gap-2 bg-orange-100 border border-orange-200 rounded-full px-3 py-1.5 mb-6">
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="text-xs text-orange-700 font-bold tracking-wide">100 RESTAURANTES GANHAM CARDÁPIO DIGITAL GRÁTIS</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black leading-[1.05] tracking-tight text-gray-900 mb-5">
                Pare de{' '}
                <span className="relative">
                  <span className="relative z-10">perder pedidos</span>
                  <span className="absolute left-0 bottom-1 w-full h-3 bg-yellow-200 -z-0" />
                </span>{' '}
                no caos do balcão.
              </h1>
              <p className="text-lg text-gray-600 leading-relaxed mb-7 max-w-xl">
                ZapFome organiza pedidos em tempo real, cobra os fiados que você esquece,
                e abre seu cardápio digital em <b className="text-gray-900">5 minutos</b>.
                Tudo no WhatsApp do seu jeito — sem instalar nada.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <a href={waLink('Quero entrar nos 100 grátis')} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-4 text-base font-black bg-green-500 hover:bg-green-600 text-white rounded-2xl transition-all shadow-xl shadow-green-500/30 hover:scale-[1.02] active:scale-95">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0a12 12 0 00-10.4 18l-1.6 6 6.2-1.6A12 12 0 1012 0zm0 22a10 10 0 01-5.1-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A10 10 0 1112 22z"/>
                    <path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.8 1-1 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5 0-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.5 1.1 2.9 1.2 3 2.1 3.3 5.1 4.6c.7.3 1.3.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.1-1.4-.1-.1-.3-.2-.5-.3z"/>
                  </svg>
                  Quero entrar nos 100 grátis
                </a>
                <button onClick={onGoRegister}
                  className="inline-flex items-center justify-center gap-2 px-6 py-4 text-base font-bold bg-white hover:bg-gray-50 text-gray-900 border-2 border-gray-200 hover:border-gray-300 rounded-2xl transition-all active:scale-95">
                  Testar 10 dias grátis →
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-gray-500">
                <span className="flex items-center gap-1.5"><span className="text-green-500 font-black">✓</span>Sem cartão de crédito</span>
                <span className="flex items-center gap-1.5"><span className="text-green-500 font-black">✓</span>Cancele quando quiser</span>
                <span className="flex items-center gap-1.5"><span className="text-green-500 font-black">✓</span>Suporte BR via WhatsApp</span>
              </div>
            </div>
            {/* Mockup */}
            <div className="relative hidden lg:block">
              <KanbanMockup />
              <div className="absolute -left-6 top-1/3 flex items-center gap-2 bg-white shadow-2xl shadow-gray-200 border border-gray-100 rounded-2xl px-4 py-3"
                style={{ animation: 'floatY 3s ease-in-out infinite' }}>
                <span className="text-3xl">💸</span>
                <div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">venda extra/mês</div>
                  <div className="text-xl font-black text-green-600 tabular-nums">+R$&nbsp;3.240</div>
                </div>
              </div>
              <div className="absolute -right-4 -bottom-6 flex items-center gap-2 bg-white shadow-2xl shadow-gray-200 border border-gray-100 rounded-2xl px-4 py-3"
                style={{ animation: 'floatY2 3s ease-in-out infinite', animationDelay: '1s' }}>
                <span className="text-3xl">⏱️</span>
                <div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">pedidos em</div>
                  <div className="text-xl font-black text-orange-600">tempo real</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────── */}
      <section className="bg-gray-50 border-y border-gray-100 py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-4xl font-black mb-3 tracking-tight text-gray-900">Pronto em minutos</h2>
          <p className="text-gray-500 text-lg mb-14">Sem instalação, sem técnico, sem burocracia.</p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '1', icon: '📝', title: 'Crie sua conta',           desc: 'Cadastro em menos de 2 minutos. Informe o nome do restaurante, email e senha.' },
              { step: '2', icon: '🍔', title: 'Cadastre seu cardápio',    desc: 'Adicione categorias e produtos com foto, preço e descrição.' },
              { step: '3', icon: '🚀', title: 'Comece a receber pedidos', desc: 'Compartilhe o link do cardápio digital e receba pedidos em tempo real.' },
            ].map(({ step, icon, title, desc }) => (
              <div key={step}>
                <div className="w-12 h-12 rounded-2xl bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-500 font-black text-lg mx-auto mb-4">{step}</div>
                <div className="text-3xl mb-2">{icon}</div>
                <h3 className="text-lg font-bold mb-2 text-gray-900">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-24">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-black mb-3 tracking-tight text-gray-900">Tudo que seu restaurante precisa</h2>
          <p className="text-gray-500 text-lg">Uma plataforma, todas as ferramentas.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon, title, desc }) => (
            <div key={title} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:border-orange-200 hover:shadow-md transition-all group">
              <div className="text-3xl mb-3">{icon}</div>
              <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-orange-600 transition-colors">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Trial callout ─────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-4 pb-10">
        <div className="bg-gradient-to-r from-purple-50 to-orange-50 border border-orange-100 rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3">⭐</div>
          <h3 className="text-2xl font-black text-gray-900 mb-2">10 dias de teste grátis</h3>
          <p className="text-gray-600 mb-1"><span className="text-purple-600 font-bold">Dias 1-3:</span> acesso completo ao plano Premium</p>
          <p className="text-gray-600 mb-6"><span className="text-orange-600 font-bold">Dias 4-10:</span> plano Basic liberado</p>
          <button onClick={onGoRegister}
            className="px-8 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl transition-colors shadow-lg shadow-orange-500/20">
            Criar conta grátis
          </button>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────── */}
      <section className="py-20 bg-orange-50 border-y border-orange-100">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-600 mb-2">Quem já usa</p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight text-gray-900">
              Donos brasileiros, problemas reais, resultado prático.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-white rounded-2xl border border-orange-100 shadow-lg shadow-orange-200/30 p-6 flex flex-col">
                <div className="text-yellow-400 text-lg mb-3">{'★'.repeat(t.stars)}</div>
                <p className="text-gray-700 text-base leading-relaxed mb-5 flex-1">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-orange-300 to-amber-400 flex items-center justify-center text-2xl shrink-0 shadow-sm">{t.emoji}</div>
                  <div className="min-w-0">
                    <p className="font-black text-gray-900 text-sm truncate">{t.name}</p>
                    <p className="text-xs text-gray-500 truncate">{t.biz}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing V2 ───────────────────────────────────────── */}
      <section id="precos" className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-600 mb-2">Investimento</p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight text-gray-900 mb-3">
              Planos simples. Pagamento honesto pelo WhatsApp.
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              Pagar 1 pedido perdido por semana custa mais do que o ZapFome inteiro no mês.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PLANS_V2.map((plan) => (
              <div key={plan.id}
                className={`relative bg-white rounded-2xl border-2 ${plan.accent} p-6 flex flex-col ${plan.highlight ? 'md:scale-105 shadow-2xl shadow-orange-200/50' : 'shadow-sm'}`}>
                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-black px-3 py-1 rounded-full tracking-wide ${plan.badge}`}>
                  {plan.tag}
                </div>
                <div className="mb-6 pt-2">
                  <h3 className="text-lg font-black text-gray-900 mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-0.5 tabular-nums">
                    <span className="text-gray-400 font-bold text-xl">R$</span>
                    <span className="text-5xl font-black text-gray-900">{plan.price}</span>
                    <span className="text-lg text-gray-400 font-bold">,{plan.cents}</span>
                    <span className="text-gray-400 text-sm ml-1">{plan.period}</span>
                  </div>
                </div>
                <ul className="space-y-2.5 flex-1 mb-6 list-none p-0">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-[10px] font-black mt-0.5 shrink-0">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="space-y-2">
                  <a href={waLink(plan.name)} target="_blank" rel="noopener noreferrer"
                    className={`w-full flex items-center justify-center gap-1.5 py-3 rounded-xl font-black text-sm transition-all active:scale-95 ${
                      plan.highlight ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/30' : 'bg-gray-900 hover:bg-gray-800 text-white'
                    }`}>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0a12 12 0 00-10.4 18l-1.6 6 6.2-1.6A12 12 0 1012 0zm5.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.8 1-1 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5 0-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.5 1.1 2.9 1.2 3 2.1 3.3 5.1 4.6c.7.3 1.3.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.1-1.4-.1-.1-.3-.2-.5-.3z"/>
                    </svg>
                    Assinar pelo WhatsApp
                  </a>
                  <button onClick={onGoRegister}
                    className="w-full py-2.5 rounded-xl font-semibold text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors">
                    Testar 10 dias grátis
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-10 text-xs text-gray-500">
            <span>💳 Sem cartão pra começar</span>
            <span>🔓 Cancele quando quiser</span>
            <span>🇧🇷 Suporte BR humano</span>
            <span>⚡ Ativação em minutos</span>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section id="duvidas" className="py-24 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-600 mb-2">Dúvidas honestas, respostas honestas</p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight text-gray-900">Antes de você perguntar</h2>
          </div>
          <div className="space-y-2">
            {FAQS.map((item, i) => <FaqItem key={i} q={item.q} a={item.a} />)}
          </div>
          <div className="mt-10 text-center">
            <p className="text-gray-500 text-sm mb-3">Não encontrou sua dúvida?</p>
            <a href={waLink('Tenho uma dúvida')} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 bg-green-500 hover:bg-green-600 text-white font-bold text-sm rounded-2xl transition-colors active:scale-95 shadow-md shadow-green-500/30">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0a12 12 0 00-10.4 18l-1.6 6 6.2-1.6A12 12 0 1012 0zm5.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.8 1-1 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5 0-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.5 1.1 2.9 1.2 3 2.1 3.3 5.1 4.6c.7.3 1.3.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.1-1.4-.1-.1-.3-.2-.5-.3z"/>
              </svg>
              Pergunte direto no WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* ── CTA Final (orange gradient) ──────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-orange-500 to-amber-500 text-white py-24">
        <div className="absolute inset-0 opacity-10"
          style={{ background: 'radial-gradient(circle at 20% 30%, white 0%, transparent 50%), radial-gradient(circle at 80% 70%, white 0%, transparent 50%)' }} />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <div className="text-5xl mb-4">⚡</div>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-5 leading-tight">
            O próximo pedido que você perder<br className="hidden sm:block" /> custa mais que o ZapFome.
          </h2>
          <p className="text-white/90 text-lg md:text-xl mb-10 max-w-xl mx-auto leading-relaxed">
            Comece grátis em 5 minutos. Cardápio digital, painel de pedidos, caixa, fiado — tudo no Zap.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-xl mx-auto">
            <a href={waLink('Quero entrar nas 100 vagas grátis')} target="_blank" rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 px-8 py-5 text-lg font-black bg-white text-green-600 hover:bg-green-50 rounded-2xl transition-all shadow-2xl hover:scale-[1.02] active:scale-95">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0a12 12 0 00-10.4 18l-1.6 6 6.2-1.6A12 12 0 1012 0zm5.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.8 1-1 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5 0-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.5 1.1 2.9 1.2 3 2.1 3.3 5.1 4.6c.7.3 1.3.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.1-1.4-.1-.1-.3-.2-.5-.3z"/>
              </svg>
              Garantir vaga no WhatsApp
            </a>
            <button onClick={onGoRegister}
              className="flex-1 inline-flex items-center justify-center gap-2 px-8 py-5 text-lg font-bold bg-orange-700/30 hover:bg-orange-700/50 text-white border-2 border-white/40 rounded-2xl transition-all active:scale-95">
              Testar 10 dias →
            </button>
          </div>
          <p className="text-white/80 text-sm mt-5">✓ Sem cartão · ✓ Cancele quando quiser · ✓ Suporte BR humano</p>
        </div>
      </section>

      {/* ── Footer V2 ─────────────────────────────────────────── */}
      <footer className="bg-gray-950 text-gray-400 pt-14 pb-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">⚡</span>
                <span className="text-xl font-black text-white">ZapFome</span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed max-w-xs">
                Sistema brasileiro de pedidos para restaurantes, lancherias, mercados e padarias.
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">Produto</p>
              <ul className="space-y-2 text-sm list-none p-0">
                <li><a href="#precos" className="hover:text-white transition-colors">Preços</a></li>
                <li><a href="#duvidas" className="hover:text-white transition-colors">Dúvidas</a></li>
                <li><button onClick={onGoRegister} className="hover:text-white transition-colors text-left">Testar grátis</button></li>
                <li><button onClick={onGoLogin} className="hover:text-white transition-colors text-left">Entrar no painel</button></li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">Suporte</p>
              <ul className="space-y-2 text-sm list-none p-0">
                <li>
                  <a href={waLink('Suporte')} target="_blank" rel="noopener noreferrer"
                    className="hover:text-white transition-colors flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0a12 12 0 00-10.4 18l-1.6 6 6.2-1.6A12 12 0 1012 0zm0 22a10 10 0 01-5.1-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A10 10 0 1112 22z"/>
                    </svg>
                    WhatsApp humano
                  </a>
                </li>
                <li><span className="text-gray-600">Seg-Sáb · 8h-22h BRT</span></li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">Tipos de negócio</p>
              <ul className="space-y-2 text-sm list-none p-0">
                <li><span className="text-gray-500">🍔 Lancherias</span></li>
                <li><span className="text-gray-500">🍕 Restaurantes</span></li>
                <li><span className="text-gray-500">🥖 Padarias</span></li>
                <li><span className="text-gray-500">🍨 Açaiterias</span></li>
                <li><span className="text-gray-500">🛒 Mercadinhos</span></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/[0.06] pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
            <span>© {new Date().getFullYear()} ZapFome · Feito no Brasil 🇧🇷</span>
            <span>Atualização em tempo real · Tudo no Zap</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
