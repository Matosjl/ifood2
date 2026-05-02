/**
 * LandingPage.jsx — Página de vendas do ZapFome para donos de restaurante
 * ─────────────────────────────────────────────────────────────────────────────
 * Seções:
 *  1. Hero — headline + CTA principal + preview do painel
 *  2. Problema — dores que o dono tem hoje
 *  3. Funcionalidades — grid com os recursos do sistema
 *  4. Como funciona — 3 passos simples
 *  5. Prova social — depoimentos (mock)
 *  6. Preço — plano único transparente
 *  7. FAQ — dúvidas comuns
 *  8. CTA final — botão de WhatsApp
 */
import { useState } from "react";

const WA_LINK = "https://wa.me/5511999999999?text=Quero%20testar%20o%20ZapFome%20no%20meu%20restaurante!";

// ── Helpers ───────────────────────────────────────────────────────────────────
const Chip = ({ children, color = "#22c55e" }) => (
  <span
    className="inline-flex items-center text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full"
    style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
  >
    {children}
  </span>
);

const CtaButton = ({ href, children, secondary = false }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={`inline-flex items-center gap-2 px-7 py-4 rounded-2xl text-base font-bold transition-all active:scale-[0.97] shadow-xl ${
      secondary
        ? "bg-white/8 border border-white/15 text-white hover:bg-white/12"
        : "text-black hover:brightness-110"
    }`}
    style={!secondary ? { background: "#22c55e", boxShadow: "0 8px 32px #22c55e40" } : {}}
  >
    {children}
  </a>
);

// ── Features ──────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: "📱",
    title: "Cardápio Digital",
    desc: "Link exclusivo do seu restaurante com design premium. Clientes pedem direto pelo celular, sem app.",
    color: "#38bdf8",
  },
  {
    icon: "🖨️",
    title: "Impressão Automática",
    desc: "Pedidos imprimem automaticamente na cozinha. Suporte à impressora térmica 58mm.",
    color: "#22c55e",
  },
  {
    icon: "📊",
    title: "CRM & Funil de Vendas",
    desc: "Veja quem são seus clientes VIP, recorrentes e novos. Mande promoções no WhatsApp com 1 clique.",
    color: "#f97316",
  },
  {
    icon: "🤖",
    title: "Atendente IA (LangGraph)",
    desc: "Assistente inteligente responde clientes 24h com cardápio em tempo real e status do pedido.",
    color: "#a78bfa",
  },
  {
    icon: "💰",
    title: "Financeiro Completo",
    desc: "Abertura e fechamento de caixa, lançamentos, relatórios de vendas e lucro por período.",
    color: "#fbbf24",
  },
  {
    icon: "📦",
    title: "Controle de Estoque",
    desc: "Alertas de estoque baixo, deducão automática nos pedidos e histórico de movimentação.",
    color: "#34d399",
  },
  {
    icon: "🛵",
    title: "Gestão de Entregadores",
    desc: "Despacho de pedidos, rastreamento em tempo real e painel dedicado para motoboys.",
    color: "#fb7185",
  },
  {
    icon: "⚡",
    title: "Painel em Tempo Real",
    desc: "WebSocket nativo — novos pedidos aparecem instantaneamente com alerta sonoro.",
    color: "#e879f9",
  },
];

// ── Steps ─────────────────────────────────────────────────────────────────────
const STEPS = [
  {
    n: "01",
    title: "Cadastre seu restaurante",
    desc: "Leva menos de 5 minutos. Adicione os produtos, configure as categorias e defina sua taxa de entrega.",
    icon: "🏪",
  },
  {
    n: "02",
    title: "Compartilhe seu link",
    desc: "Envie o link do cardápio pelo WhatsApp, Instagram ou coloque no menu da mesa. Clientes pedem na hora.",
    icon: "📲",
  },
  {
    n: "03",
    title: "Gerencie tudo em um painel",
    desc: "Pedidos, estoque, financeiro, CRM e IA — tudo em um único lugar, acessível de qualquer dispositivo.",
    icon: "🎛️",
  },
];

// ── Testimonials ──────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    name: "Carlos Mendonça",
    role: "Dono · Burguer do Carlos",
    text: "Antes eu perdia pedido toda hora no zap. Agora tudo cai direto na cozinha. Faturei 40% mais no primeiro mês.",
    stars: 5,
    avatar: "C",
    color: "#fbbf24",
  },
  {
    name: "Ana Rodrigues",
    role: "Gerente · Pizzaria Bella",
    text: "O CRM me mostrou que 20% dos clientes respondem por 60% do faturamento. Criei um programa VIP e funcionou.",
    stars: 5,
    avatar: "A",
    color: "#f97316",
  },
  {
    name: "Marcos Lima",
    role: "Proprietário · Sushi Zen",
    text: "A IA atende os clientes no Instagram direto com o cardápio atualizado. Economizei 3h por dia de atendimento.",
    stars: 5,
    avatar: "M",
    color: "#38bdf8",
  },
];

// ── FAQ ───────────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: "Preciso de aplicativo para os clientes baixarem?",
    a: "Não! Tudo funciona pelo navegador. O cliente acessa o link do cardápio pelo celular e faz o pedido sem instalar nada.",
  },
  {
    q: "Como funciona a impressão dos pedidos?",
    a: "Suportamos impressoras térmicas 58mm via USB (Windows). O pedido é impresso automaticamente quando chega ou quando você aceita. Sem configuração complicada.",
  },
  {
    q: "Precisa de internet para funcionar?",
    a: "Sim, o sistema é online. Recomendamos manter o painel aberto em um tablet ou notebook na cozinha com wi-fi.",
  },
  {
    q: "Posso usar no celular?",
    a: "Sim! O painel é responsivo. Funciona bem em tablets e funciona no celular para consultas rápidas.",
  },
  {
    q: "E a Evolution API (WhatsApp)?",
    a: "Você pode conectar sua própria instância da Evolution API para enviar mensagens automáticas de confirmação de pedido e promoções via WhatsApp Business. É opcional.",
  },
  {
    q: "Tem custo de mensalidade?",
    a: "O sistema é self-hosted — você paga apenas pela VPS (≈R$25/mês na Hetzner) e pelas chamadas de IA do OpenAI (uso real, geralmente R$1-5/mês). Sem mensalidade nossa.",
  },
];

const FaqItem = ({ q, a }) => {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="border border-white/8 rounded-2xl overflow-hidden cursor-pointer transition-all hover:border-white/15"
      onClick={() => setOpen(v => !v)}
    >
      <div className="flex items-center justify-between px-5 py-4 gap-3">
        <p className="text-sm font-semibold text-white">{q}</p>
        <span className={`text-zinc-500 transition-transform shrink-0 ${open ? "rotate-45" : ""}`}>+</span>
      </div>
      {open && (
        <div className="px-5 pb-4 border-t border-white/6">
          <p className="text-sm text-zinc-400 leading-relaxed pt-3">{a}</p>
        </div>
      )}
    </div>
  );
};

// ── Seção wrapper ─────────────────────────────────────────────────────────────
const Section = ({ id, children, className = "" }) => (
  <section id={id} className={`max-w-5xl mx-auto px-4 sm:px-6 ${className}`}>
    {children}
  </section>
);

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#080808] text-white overflow-x-hidden">

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-[#080808]/90 backdrop-blur-xl border-b border-white/6">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <span className="text-xl">🍔</span>
            <span className="font-black text-lg tracking-tight text-white">ZapFome</span>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm text-zinc-400">
            <a href="#features" className="hover:text-white transition-colors">Funcionalidades</a>
            <a href="#preco"    className="hover:text-white transition-colors">Preço</a>
            <a href="#faq"      className="hover:text-white transition-colors">FAQ</a>
          </div>
          <a
            href={WA_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl transition-all text-black"
            style={{ background: "#22c55e" }}
          >
            💬 Falar agora
          </a>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        {/* Glow background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full blur-[120px] opacity-15"
            style={{ background: "radial-gradient(circle, #22c55e 0%, transparent 70%)" }} />
        </div>

        <Section className="pt-20 pb-16 text-center relative z-10">
          <Chip>🚀 Sistema completo de delivery</Chip>

          <h1 className="mt-6 text-4xl sm:text-6xl font-black leading-tight tracking-tight">
            Seu restaurante
            <br />
            <span style={{ color: "#22c55e" }}>vendendo mais</span>
            <br />
            no digital
          </h1>

          <p className="mt-5 text-base sm:text-lg text-zinc-400 max-w-xl mx-auto leading-relaxed">
            Painel de pedidos, cardápio digital premium, CRM com funil de vendas,
            controle de estoque, financeiro e IA integrada —
            <strong className="text-white"> tudo em um só sistema.</strong>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <CtaButton href={WA_LINK}>
              💬 Quero começar grátis
            </CtaButton>
            <CtaButton href="#features" secondary>
              Ver funcionalidades →
            </CtaButton>
          </div>

          <p className="mt-4 text-xs text-zinc-600">
            Sem mensalidade · Self-hosted · Setup em 30 minutos
          </p>

          {/* Preview do painel */}
          <div className="mt-14 relative">
            <div
              className="mx-auto max-w-3xl rounded-3xl overflow-hidden border border-white/10 shadow-2xl"
              style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)" }}
            >
              {/* Fake browser bar */}
              <div className="flex items-center gap-2 px-4 py-3 bg-[#111] border-b border-white/6">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/70" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                  <div className="w-3 h-3 rounded-full bg-green-500/70" />
                </div>
                <div className="flex-1 bg-white/5 border border-white/8 rounded-md px-3 py-1 text-xs text-zinc-500 text-center">
                  app.zapfome.com.br/restaurante/seu-restaurante
                </div>
              </div>

              {/* Mock painel */}
              <div className="bg-[#0A0A0A] p-4 grid grid-cols-3 sm:grid-cols-6 gap-2 border-b border-white/6">
                {["PEDIDOS","NOVO PEDIDO","CARDÁPIO","ESTOQUE","💰 FINANCEIRO","📊 CRM"].map((tab, i) => (
                  <div key={tab}
                    className={`text-[10px] font-mono px-2 py-1.5 text-center border transition-colors ${
                      i === 0
                        ? "border-[#22c55e] text-[#22c55e]"
                        : "border-[#27272A] text-[#3F3F46]"
                    }`}>
                    {tab}
                  </div>
                ))}
              </div>

              {/* Mock pedidos */}
              <div className="bg-[#080808] p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { status: "PENDENTE",  cor: "#FFB800", cliente: "João S.",  total: "R$ 89,70", hora: "14:32", item: "X-Burguer + Coca" },
                  { status: "EM PREPARO",cor: "#FF8C00", cliente: "Maria L.", total: "R$ 54,80", hora: "14:45", item: "Pizza Margherita" },
                  { status: "PRONTO",    cor: "#3B82F6", cliente: "Carlos M.", total: "R$ 28,90", hora: "14:50", item: "X-Bacon Duplo" },
                ].map(p => (
                  <div key={p.cliente}
                    className="rounded-xl p-3 border flex flex-col gap-2"
                    style={{ borderColor: `${p.cor}30`, background: `${p.cor}08` }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-zinc-600 font-mono">#1042</span>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${p.cor}22`, color: p.cor }}>{p.status}</span>
                    </div>
                    <p className="text-sm font-semibold text-white">{p.cliente}</p>
                    <p className="text-[10px] text-zinc-500">{p.item}</p>
                    <div className="flex justify-between items-center pt-1 border-t border-white/5">
                      <span className="text-[10px] text-zinc-600">{p.hora}</span>
                      <span className="text-sm font-bold text-emerald-400">{p.total}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Gradiente para escurecer a parte inferior do mockup */}
            <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-[#080808] to-transparent pointer-events-none" />
          </div>
        </Section>
      </div>

      {/* ── PROBLEMA ────────────────────────────────────────────────────── */}
      <Section className="py-16">
        <div className="text-center mb-10">
          <Chip color="#f97316">😩 Reconhece isso?</Chip>
          <h2 className="mt-4 text-2xl sm:text-3xl font-black">
            Gerenciar restaurante hoje é um caos
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: "📱", text: "Pedidos chegando por 5 apps diferentes ao mesmo tempo" },
            { icon: "😤", text: "Clientes mandando mensagem no WhatsApp a toda hora" },
            { icon: "📋", text: "Papel de pedido que se perde antes de chegar na cozinha" },
            { icon: "💸", text: "Comissão de 30% no iFood cortando seu lucro" },
            { icon: "📉", text: "Sem ideia de quais produtos vendem mais ou menos" },
            { icon: "😰", text: "Estoque desatualizado, vende o que não tem" },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/5 border border-red-500/10">
              <span className="text-xl shrink-0">{item.icon}</span>
              <p className="text-sm text-zinc-400 leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <p className="text-xl font-bold text-white">O ZapFome resolve <span style={{ color: "#22c55e" }}>tudo isso</span>.</p>
        </div>
      </Section>

      {/* ── FEATURES ────────────────────────────────────────────────────── */}
      <Section id="features" className="py-16">
        <div className="text-center mb-10">
          <Chip>✨ Tudo que você precisa</Chip>
          <h2 className="mt-4 text-2xl sm:text-3xl font-black">
            Um sistema completo, sem enrolação
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map(f => (
            <div key={f.title}
              className="p-5 rounded-2xl border border-white/8 hover:border-white/15 transition-all hover:bg-white/3 group"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl mb-3 transition-transform group-hover:scale-110"
                style={{ background: `${f.color}18`, border: `1px solid ${f.color}25` }}
              >
                {f.icon}
              </div>
              <h3 className="text-sm font-bold text-white mb-1.5">{f.title}</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── COMO FUNCIONA ────────────────────────────────────────────────── */}
      <Section className="py-16">
        <div className="text-center mb-10">
          <Chip color="#38bdf8">🗺️ Como funciona</Chip>
          <h2 className="mt-4 text-2xl sm:text-3xl font-black">
            Do zero ao funcionando em 30 minutos
          </h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-6">
          {STEPS.map((s, i) => (
            <div key={s.n} className="relative flex flex-col items-center text-center gap-3">
              {/* Linha conectora */}
              {i < STEPS.length - 1 && (
                <div className="hidden sm:block absolute top-8 left-[calc(50%+40px)] right-[calc(-50%+40px)] h-px bg-white/8" />
              )}
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl border border-white/10 relative z-10"
                style={{ background: "#111" }}
              >
                {s.icon}
                <span
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-black"
                  style={{ background: "#22c55e" }}
                >
                  {s.n.slice(-1)}
                </span>
              </div>
              <h3 className="text-base font-bold text-white">{s.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── DEPOIMENTOS ──────────────────────────────────────────────────── */}
      <Section className="py-16">
        <div className="text-center mb-10">
          <Chip color="#a78bfa">💬 Depoimentos</Chip>
          <h2 className="mt-4 text-2xl sm:text-3xl font-black">
            Donos que transformaram o negócio
          </h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-5">
          {TESTIMONIALS.map(t => (
            <div key={t.name}
              className="p-5 rounded-2xl border border-white/8 bg-white/2 flex flex-col gap-3"
            >
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(i => (
                  <span key={i} className="text-amber-400 text-sm">★</span>
                ))}
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">"{t.text}"</p>
              <div className="flex items-center gap-3 mt-auto pt-3 border-t border-white/6">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black"
                  style={{ background: `${t.color}25`, color: t.color }}
                >
                  {t.avatar}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{t.name}</p>
                  <p className="text-xs text-zinc-600">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── PREÇO ────────────────────────────────────────────────────────── */}
      <Section id="preco" className="py-16">
        <div className="text-center mb-10">
          <Chip color="#fbbf24">💰 Preço transparente</Chip>
          <h2 className="mt-4 text-2xl sm:text-3xl font-black">
            Sem mensalidade pra nós
          </h2>
          <p className="text-zinc-500 text-sm mt-2">Você paga só a infraestrutura. Sem cobrança por pedido.</p>
        </div>

        <div className="max-w-md mx-auto">
          <div
            className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center relative overflow-hidden"
            style={{ boxShadow: "0 0 60px rgba(34,197,94,0.08)" }}
          >
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-10 bg-emerald-500" />
            <Chip>⭐ Plano único</Chip>
            <div className="mt-6 mb-2">
              <span className="text-zinc-500 text-sm">A partir de</span>
              <div className="flex items-end justify-center gap-1 mt-1">
                <span className="text-zinc-400 text-lg font-semibold">R$</span>
                <span className="text-6xl font-black text-white">28</span>
                <span className="text-zinc-400 mb-2">/mês</span>
              </div>
            </div>
            <p className="text-xs text-zinc-500">VPS Hetzner CX22 ≈ R$25 + Domínio ≈ R$3</p>

            <div className="mt-8 flex flex-col gap-3 text-left">
              {[
                "✓ Painel operacional completo (pedidos, estoque, financeiro)",
                "✓ Cardápio digital com domínio próprio",
                "✓ CRM + Funil de vendas",
                "✓ Atendente IA (OpenAI por uso — ~R$1-5/mês)",
                "✓ Impressão térmica automática",
                "✓ WebSocket em tempo real",
                "✓ Código-fonte completo (self-hosted)",
                "✓ Atualizações via git push",
              ].map(item => (
                <div key={item} className="flex items-start gap-2 text-sm text-zinc-300">
                  <span className="text-emerald-400 shrink-0 mt-px">✓</span>
                  <span>{item.replace("✓ ", "")}</span>
                </div>
              ))}
            </div>

            <CtaButton href={WA_LINK} className="w-full mt-8 block text-center">
              💬 Quero instalar agora
            </CtaButton>
            <p className="text-xs text-zinc-600 mt-3">Suporte via WhatsApp incluso no setup</p>
          </div>
        </div>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <Section id="faq" className="py-16">
        <div className="text-center mb-10">
          <Chip color="#38bdf8">❓ Dúvidas frequentes</Chip>
          <h2 className="mt-4 text-2xl sm:text-3xl font-black">FAQ</h2>
        </div>
        <div className="max-w-2xl mx-auto flex flex-col gap-3">
          {FAQ_ITEMS.map(item => (
            <FaqItem key={item.q} {...item} />
          ))}
        </div>
      </Section>

      {/* ── CTA FINAL ────────────────────────────────────────────────────── */}
      <Section className="py-20">
        <div
          className="relative rounded-3xl overflow-hidden text-center px-6 py-14"
          style={{ background: "linear-gradient(135deg, #052e16 0%, #0f172a 100%)", border: "1px solid rgba(34,197,94,0.2)" }}
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-[100px] opacity-20 bg-emerald-500" />
          </div>
          <div className="relative z-10">
            <p className="text-4xl mb-4">🚀</p>
            <h2 className="text-3xl sm:text-4xl font-black text-white">
              Pronto para vender mais?
            </h2>
            <p className="mt-3 text-zinc-400 text-base max-w-md mx-auto">
              Fale com a gente agora pelo WhatsApp. Instalamos e configuramos tudo para o seu restaurante.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <CtaButton href={WA_LINK}>
                💬 Falar no WhatsApp agora
              </CtaButton>
              <CtaButton href="/cardapio/demo" secondary>
                👀 Ver demo do cardápio
              </CtaButton>
            </div>
            <p className="mt-5 text-xs text-zinc-600">
              Setup em 30 min · Suporte incluído · Sem fidelidade
            </p>
          </div>
        </div>
      </Section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/6 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🍔</span>
            <span className="font-black text-white">ZapFome</span>
            <span className="text-zinc-600 text-sm">— Sistema de Delivery</span>
          </div>
          <p className="text-xs text-zinc-600">
            © {new Date().getFullYear()} ZapFome · Feito com ❤️ para restaurantes brasileiros
          </p>
        </div>
      </footer>
    </div>
  );
}
