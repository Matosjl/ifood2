// ── LandingPage.jsx ───────────────────────────────────────────────────────────
// ZapFome Sales Landing Page — converted from Design System (pagina-vendas)
// Light theme. All sections: Nav, Hero, Features, WhatsAppAI, Timeline,
// Devices, Pricing, Testimonials, BrandLogos, StickyBar.

import { useState, useEffect, useRef } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────
const WA_NUM = '5551981521264';
const waLink = (msg = 'Quero começar grátis no ZapFome') =>
  `https://wa.me/${WA_NUM}?text=${encodeURIComponent(msg)}`;

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useReveal(opts = {}) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.15, ...opts });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function useLiveValue(initial, step, intervalMs = 4500) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => {
      setV((prev) => prev + step + Math.floor(Math.random() * step));
    }, intervalMs);
    return () => clearInterval(id);
  }, [step, intervalMs]);
  return v;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtBRL = (n) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt  = (n) => n.toLocaleString('pt-BR');

// ── Reveal wrapper ────────────────────────────────────────────────────────────
function Reveal({ children, delay = 0, className = '', as = 'div' }) {
  const ref = useReveal();
  const Cmp = as;
  return (
    <Cmp ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Cmp>
  );
}

// ── Animated counter ──────────────────────────────────────────────────────────
function Counter({ to, format = (n) => n.toString(), duration = 1400, prefix = '', suffix = '' }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const start = performance.now();
        const tick = (now) => {
          const p = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setVal(Math.round(eased * to));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);
  return <span ref={ref} className="tnum">{prefix}{format(val)}{suffix}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKUP COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function LaptopFrame({ children, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <div className="relative rounded-[14px] md:rounded-[18px] overflow-hidden bg-[#111827] border border-white/[0.08] shadow-[0_60px_120px_-30px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.04)]">
        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-black/60 z-10" />
        <div className="aspect-[16/10] bg-[#030712]">
          {children}
        </div>
      </div>
      <div className="relative mx-auto" style={{ width: '108%', marginLeft: '-4%' }}>
        <div className="h-2.5 md:h-3 bg-gradient-to-b from-[#2a2c30] to-[#16181a] rounded-b-xl shadow-[0_8px_20px_-4px_rgba(0,0,0,0.6)]">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 w-20 h-1 rounded-b-md bg-black/50" />
        </div>
      </div>
    </div>
  );
}

function PhoneFrame({ children, className = '', style }) {
  return (
    <div className={`relative ${className}`} style={style}>
      <div className="relative rounded-[36px] bg-[#0a0a0a] p-2.5 border border-white/[0.10] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.06)]">
        <div className="relative rounded-[28px] overflow-hidden bg-[#111827]" style={{ width: 240, height: 480 }}>
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-5 rounded-full bg-black z-20" />
          {children}
        </div>
      </div>
    </div>
  );
}

const SIDEBAR_ITEMS = [
  ['📊', 'Dashboard', true],
  ['🛒', 'Pedidos'],
  ['👥', 'Clientes'],
  ['📋', 'Cardápio'],
  ['📦', 'Estoque'],
  ['💰', 'Financeiro'],
  ['🛵', 'Entregas'],
  ['📣', 'Marketing'],
  ['📈', 'Relatórios'],
  ['⚙️', 'Configurações'],
];

function DashSidebar() {
  return (
    <aside className="bg-[#111827]/80 border-r border-white/[0.05] p-2 space-y-0.5">
      <div className="flex items-center gap-2 px-2 py-2 mb-2">
        <div className="w-6 h-6 rounded-md bg-brand-500 flex items-center justify-center text-[10px]">⚡</div>
        <span className="text-[10px] font-black text-white">zapfome</span>
      </div>
      {SIDEBAR_ITEMS.map(([e, l, a]) => (
        <div key={l} className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[10px] transition ${
          a ? 'bg-brand-500/15 text-brand-400 font-bold border border-brand-500/20'
            : 'text-gray-400 hover:bg-white/[0.04]'
        }`}>
          <span className="text-[10px]">{e}</span>
          <span className="truncate">{l}</span>
        </div>
      ))}
    </aside>
  );
}

function DashTopbar() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-[#111827] border-b border-white/[0.05]">
      <div className="flex-1 max-w-[260px] flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#1f2937]/70 border border-white/[0.05]">
        <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
        <span className="text-[10px] text-gray-500">Buscar pedido, cliente...</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button className="px-2.5 py-1 rounded-md bg-brand-500 hover:bg-brand-400 text-white text-[10px] font-black inline-flex items-center gap-1">
          <span>+</span> Novo pedido
        </button>
      </div>
    </div>
  );
}

function KpiTile({ label, value, delta, deltaColor = '#22c55e', icon }) {
  return (
    <div className="rounded-lg bg-[#161819]/80 border border-white/[0.05] px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[8px] uppercase tracking-widest text-gray-500 font-bold">{label}</span>
        <span className="text-[10px] opacity-70">{icon}</span>
      </div>
      <div className="mt-1 text-base font-black text-white tnum leading-none">{value}</div>
      <div className="mt-1 text-[9px] tnum font-bold" style={{ color: deltaColor }}>{delta}</div>
    </div>
  );
}

function RevenueChart() {
  const W = 380, H = 130;
  const padL = 24, padR = 10, padT = 8, padB = 18;
  const points = [40, 60, 95, 68, 110, 86, 130, 102, 70, 90, 75, 88, 60, 75, 95, 110];
  const yMax = 140, yMin = 30;
  const sx = (i) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const sy = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);
  const d = points.map((v, i) => (i === 0 ? `M ${sx(i)} ${sy(v)}` : `L ${sx(i)} ${sy(v)}`)).join(' ');
  const peakIdx = 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <defs>
        <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[200, 400, 600].map((v, i) => (
        <g key={v}>
          <line x1={padL} y1={padT + (i + 1) * 30} x2={W - padR} y2={padT + (i + 1) * 30} stroke="#1d1f22" strokeDasharray="2 3" />
          <text x={4} y={padT + (i + 1) * 30 + 3} fontSize="8" fill="#6b7280">{[600, 400, 200][i]}</text>
        </g>
      ))}
      {['00h', '04h', '08h', '12h', '16h', '20h'].map((l, i) => (
        <text key={l} x={padL + (i / 5) * (W - padL - padR) - 6} y={H - 4} fontSize="8" fill="#6b7280">{l}</text>
      ))}
      <path d={`${d} L ${sx(points.length - 1)} ${H - padB} L ${padL} ${H - padB} Z`} fill="url(#revFill)" />
      <path d={d} stroke="#f97316" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 0 6px rgba(249,115,22,0.55))' }} />
      <circle cx={sx(peakIdx)} cy={sy(points[peakIdx])} r="3" fill="#f97316" />
      <circle cx={sx(peakIdx)} cy={sy(points[peakIdx])} r="5" fill="none" stroke="#f97316" strokeWidth="1" opacity="0.5" />
      <g transform={`translate(${sx(peakIdx) + 8}, ${sy(points[peakIdx]) - 18})`}>
        <rect width="62" height="16" rx="3" fill="#1a1c1e" stroke="#f97316" strokeWidth="0.5" />
        <text x="6" y="11" fontSize="8" fill="#fb923c" fontWeight="bold">R$ 4.680,50</text>
      </g>
    </svg>
  );
}

function HeroLaptopDashboard() {
  const pedidos     = useLiveValue(132, 1, 5500);
  const faturamento = useLiveValue(4680.5, 12, 6000);
  const ticket      = useLiveValue(35.46, 0.05, 7000);
  const clientes    = useLiveValue(248, 1, 9000);

  return (
    <div className="grid grid-cols-[80px_1fr] h-full text-white">
      <DashSidebar />
      <div className="flex flex-col min-w-0">
        <DashTopbar />
        <div className="flex-1 p-3 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[12px] font-black text-white">Resumo do dia</h3>
            <span className="text-[9px] text-gray-500">hoje · ao vivo ●</span>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            <KpiTile label="Pedidos"      value={<span key={pedidos}                className="num-tick inline-block">{pedidos}</span>}            delta="+8,0%"  icon="🛒" />
            <KpiTile label="Faturamento"  value={<span key={Math.round(faturamento)} className="num-tick inline-block">{fmtBRL(faturamento)}</span>} delta="+12,5%" icon="💰" />
            <KpiTile label="Ticket médio" value={<span key={Math.round(ticket*100)}  className="num-tick inline-block">{fmtBRL(ticket)}</span>}      delta="+3,1%"  icon="📊" />
            <KpiTile label="Clientes"     value={<span key={clientes}               className="num-tick inline-block">{clientes}</span>}           delta="+7%"    icon="👥" />
          </div>
          <div className="grid grid-cols-[1.6fr_1fr] gap-2 h-[140px]">
            <div className="rounded-lg bg-[#161819]/60 border border-white/[0.05] p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-black text-white">Faturamento</span>
                <span className="text-[9px] text-gray-500">hoje</span>
              </div>
              <RevenueChart />
            </div>
            <div className="rounded-lg bg-[#161819]/60 border border-white/[0.05] p-2.5 flex flex-col">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black text-white">Pedidos recentes</span>
                <span className="text-[10px] opacity-60">⋯</span>
              </div>
              <ul className="text-[9px] divide-y divide-white/[0.04] flex-1">
                {[
                  ['#123', 'Maria Cisa',  '53,40'],
                  ['#122', 'Joao Santos', '47,60'],
                  ['#121', 'Ana Souza',   '31,20'],
                  ['#120', 'Pedro Lima',  '52,90'],
                  ['#119', 'Lucas Costa', '28,30'],
                ].map(([n, who, v]) => (
                  <li key={n} className="flex items-center justify-between py-1.5">
                    <span className="text-gray-500 tnum">{n}</span>
                    <span className="text-gray-200 truncate flex-1 mx-2">{who}</span>
                    <span className="text-white tnum font-bold">R$ {v}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[8px] text-brand-400 mt-1 cursor-pointer hover:underline">Ver todos os pedidos →</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroPhoneOrder() {
  return (
    <PhoneFrame>
      <div className="flex items-center justify-between px-5 pt-2 pb-1 text-[8px] text-gray-300 tnum">
        <span className="font-black">9:41</span>
        <span className="flex items-center gap-1">
          <span className="opacity-70">●●●</span>
          <span>📶</span>
          <span>🔋</span>
        </span>
      </div>
      <div className="px-3 pt-6 pb-4">
        <div className="flex items-center gap-1.5 mb-3">
          <button className="text-gray-400 text-base">‹</button>
          <h4 className="text-[12px] font-black text-white">Novo pedido</h4>
        </div>
        <p className="text-[8px] uppercase tracking-widest text-gray-500 font-bold mb-2">Itens</p>
        <ul className="space-y-1.5 mb-4">
          {[
            ['1x', 'Xis Tradicional', '28,90'],
            ['1x', 'Coca 200ml',      '8,00'],
            ['2x', 'Batata Cheddar',  '16,00'],
          ].map(([q, n, v]) => (
            <li key={n} className="flex items-center justify-between p-2 rounded-lg bg-[#1f2937]/80 border border-white/[0.04]">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-[9px] text-brand-400 font-black tnum">{q}</span>
                <span className="text-[10px] text-white truncate">{n}</span>
              </span>
              <span className="text-[10px] text-white tnum font-bold">R$ {v}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
          <div className="flex justify-between text-[10px] text-gray-400">
            <span>Taxa de entrega</span>
            <span className="tnum">R$ 6,00</span>
          </div>
          <div className="flex justify-between text-[12px] font-black mt-1">
            <span className="text-white">Total</span>
            <span className="text-white tnum">R$ 57,90</span>
          </div>
        </div>
        <button className="mt-4 w-full py-2.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-white font-black text-[11px] transition active:scale-95 shadow-lg shadow-brand-500/30">
          Finalizar pedido
        </button>
      </div>
    </PhoneFrame>
  );
}

function WAHeader() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[#075E54]">
      <button className="text-white text-base opacity-80">‹</button>
      <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-[11px]">⚡</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black text-white">ZapFome IA</p>
        <p className="text-[8px] text-white/60">online</p>
      </div>
      <span className="text-white/70 text-base">📞</span>
      <span className="text-white/70 text-base">⋮</span>
    </div>
  );
}

function WABubble({ from = 'ai', children, time, delay = 0 }) {
  const ref = useReveal();
  const isAi = from === 'ai';
  return (
    <div ref={ref} className={`reveal flex ${isAi ? 'justify-start' : 'justify-end'}`} style={{ transitionDelay: `${delay}ms` }}>
      <div className={`max-w-[80%] rounded-xl px-2.5 py-2 text-[10px] leading-relaxed shadow-md
        ${isAi ? 'bg-[#1f2c34] text-white rounded-tl-sm' : 'bg-[#005c4b] text-white rounded-tr-sm'}`}>
        {children}
        {time && <div className="mt-1 text-[7px] text-white/40 text-right tnum">{time}</div>}
      </div>
    </div>
  );
}

function WATyping() {
  return (
    <div className="flex justify-start">
      <div className="bg-[#1f2c34] rounded-xl rounded-tl-sm px-3 py-2 flex items-center gap-1 shadow-md">
        <span className="w-1.5 h-1.5 rounded-full bg-white/60 typing-dot" style={{ animationDelay: '0s' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-white/60 typing-dot" style={{ animationDelay: '0.2s' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-white/60 typing-dot" style={{ animationDelay: '0.4s' }} />
      </div>
    </div>
  );
}

function WAPhone({ scriptStage }) {
  return (
    <PhoneFrame>
      <WAHeader />
      <div className="px-2.5 py-3 space-y-2 h-[418px] overflow-hidden"
           style={{ background: 'linear-gradient(180deg, #0b141a 0%, #0e1a20 100%)' }}>
        <WABubble from="ai" time="09:41" delay={0}>
          Olá! Aqui é a IA do ZapFome. Estou analisando seu negócio em tempo real. Já te mando um resumo e alertas importantes.
        </WABubble>
        {scriptStage >= 1 && (
          <WABubble from="ai" time="09:42" delay={100}>
            <div className="font-black mb-1">⚠️ Estoque baixo</div>
            <div>Pão de Xis</div>
            <div className="text-white/80">Vendidos na semana passada: 60</div>
            <div className="text-white/80">Disponíveis agora: 30</div>
            <div className="mt-1.5 font-black">💡 Sugestão da IA:</div>
            <div>Comprar <b>40 unidades</b><br/>para os próximos 7 dias.</div>
          </WABubble>
        )}
        {scriptStage >= 2 && (
          <WABubble from="ai" time="09:43" delay={100}>
            <div className="font-black mb-1">📈 Resumo financeiro da semana</div>
            <div>Faturamento: <b>R$ 4.680,50</b></div>
            <div>Lucro líquido: <b>R$ 1.240,00</b></div>
            <div>Ticket médio: <b>R$ 35,46</b></div>
            <div>Pedidos: <b>132</b></div>
            <div className="text-white/70">Forma de pagamento mais usada:</div>
            <div>Pix (40%)</div>
            <div className="mt-1 text-brand-400">Ver relatório completo no painel →</div>
          </WABubble>
        )}
        {scriptStage === 3 && <WATyping />}
      </div>
    </PhoneFrame>
  );
}

function MiniPhone() {
  return (
    <PhoneFrame>
      <div className="flex justify-between px-5 pt-2 text-[8px] text-gray-300 tnum">
        <span className="font-black">9:41</span>
        <span>📶 🔋</span>
      </div>
      <div className="px-3 pt-6 pb-3">
        <div className="flex items-center gap-1.5 mb-3">
          <button className="text-gray-400">‹</button>
          <span className="text-[11px] font-black text-white">Novo pedido</span>
        </div>
        <p className="text-[7px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">Itens</p>
        <ul className="space-y-1.5 mb-3">
          {[['Xis Tradicional', '28,90'], ['Coca 200ml', '8,00'], ['Bat. Cheddar', '16,00']].map(([n, v]) => (
            <li key={n} className="flex justify-between items-center p-1.5 rounded bg-[#1f2937]/80 border border-white/[0.04]">
              <span className="text-[9px] text-white">{n}</span>
              <span className="text-[9px] font-bold tnum text-white">R$ {v}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between text-[10px] font-black pt-2 border-t border-white/5 text-white">
          <span>Total</span><span className="tnum">R$ 57,90</span>
        </div>
        <button className="mt-3 w-full py-2 rounded-md bg-brand-500 text-white font-black text-[10px]">Finalizar pedido</button>
      </div>
    </PhoneFrame>
  );
}

function TabletFrame({ children }) {
  return (
    <div className="rounded-[22px] p-2 bg-[#0a0a0a] border border-white/[0.10] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.4)]"
         style={{ width: 360, height: 245 }}>
      <div className="rounded-[14px] overflow-hidden h-full bg-[#030712]">
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NAV
// ═══════════════════════════════════════════════════════════════════════════════
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`sticky top-0 z-40 transition-all ${
      scrolled ? 'bg-white/90 backdrop-blur-xl border-b border-gray-100 shadow-sm' : 'bg-transparent'
    }`}>
      <div className="max-w-7xl mx-auto px-5 h-16 flex items-center gap-6">
        <a href="#top" className="flex items-center gap-2 shrink-0">
          <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none">
            <path d="M8 14c-2 0-4-1.5-4-4s2-4 4-4c.5-2 2.5-3.5 4.5-3.5 1 0 2 .4 2.7 1C16 2.7 17.3 2 19 2c2.8 0 5 2.2 5 5 0 .3 0 .5-.1.8 1.8.4 3.1 2 3.1 3.9 0 2.2-1.8 4-4 4H8z" fill="#f97316" />
            <rect x="8" y="14" width="16" height="6" rx="1" fill="#f97316" />
            <rect x="8" y="16" width="16" height="1.5" fill="rgba(255,255,255,0.4)" />
          </svg>
          <span className="text-[20px] font-black tracking-tight text-[#0a0a0a]">zapfome</span>
        </a>

        <nav className="hidden md:flex items-center gap-1 mx-auto text-[13px] text-gray-500">
          {[
            ['Recursos',    '#recursos'],
            ['Planos',      '#planos'],
            ['Preços',      '#planos'],
            ['Depoimentos', '#depoimentos'],
            ['Dúvidas',     '#faq'],
          ].map(([l, h]) => (
            <a key={l} href={h} className="px-3 py-2 rounded-md hover:text-[#0a0a0a] transition font-medium">{l}</a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <a href={waLink('Quero entrar no ZapFome')} target="_blank" rel="noopener noreferrer"
             className="hidden sm:inline-flex text-[13px] text-gray-500 hover:text-[#0a0a0a] transition font-medium">
            Entrar
          </a>
          <a href={waLink('Quero começar agora')} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-[13px] font-black transition active:scale-95 shadow-lg shadow-brand-500/30">
            Começar agora
          </a>
        </div>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HERO
// ═══════════════════════════════════════════════════════════════════════════════
function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-10 md:pt-14 pb-20">
      <div className="absolute inset-0 bg-gradient-to-br from-orange-50/40 via-white to-white" />
      <div className="absolute top-0 right-0 w-[700px] h-[500px] opacity-50"
           style={{ background: 'radial-gradient(50% 50% at 70% 30%, rgba(249,115,22,0.20) 0%, transparent 70%)', filter: 'blur(30px)' }} />

      <div className="relative max-w-7xl mx-auto px-5">
        <div className="grid lg:grid-cols-[1fr_1.25fr] gap-12 lg:gap-10 items-center">
          {/* LEFT */}
          <Reveal>
            <h1 className="text-4xl md:text-5xl lg:text-[56px] font-black tracking-tight leading-[1.04] text-[#0a0a0a]">
              <span className="block">Gestão completa</span>
              <span className="block">para restaurantes</span>
              <span className="block">que querem vender</span>
              <span className="block h-orange">mais e ter mais</span>
              <span className="block h-orange">controle.</span>
            </h1>

            <p className="mt-6 text-[15px] text-gray-600 max-w-md leading-relaxed text-pretty">
              O ZapFome é o sistema tudo-em-um que organiza seu restaurante,
              delivery e financeiro em um único lugar.
            </p>

            <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2.5 max-w-md">
              {['Mais controle', 'Menos erros', 'Mais agilidade', 'Mais lucro'].map((t) => (
                <li key={t} className="flex items-center gap-2 text-[14px] text-[#0a0a0a]">
                  <span className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center shrink-0">
                    <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                      <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {t}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <a href={waLink('Quero começar agora grátis')} target="_blank" rel="noopener noreferrer"
                 className="group inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-black text-[14px] transition active:scale-95 shadow-[0_15px_40px_-10px_rgba(249,115,22,0.55)] hover:shadow-[0_20px_50px_-10px_rgba(249,115,22,0.7)]">
                Começar agora grátis
                <span className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center group-hover:translate-x-0.5 transition">
                  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </span>
              </a>
              <a href="#demo" className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 text-[#0a0a0a] font-bold text-[13px] transition">
                Ver demonstração
                <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-3 h-3 text-[#0a0a0a]" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </span>
              </a>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-gray-500">
              {['Teste grátis por 7 dias', 'Sem compromisso', 'Sem cartão'].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-brand-500/15 border border-brand-500/40 flex items-center justify-center text-brand-500 text-[8px]">
                    <svg viewBox="0 0 24 24" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                  </span>
                  {t}
                </span>
              ))}
            </div>
          </Reveal>

          {/* RIGHT — laptop + phone */}
          <Reveal delay={150} className="relative">
            <div className="absolute -top-4 right-2 lg:right-12 z-30 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-wa-500 text-white shadow-[0_15px_40px_-8px_rgba(34,197,94,0.55)] float-y">
              <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0a12 12 0 00-10.4 18l-1.6 6 6.2-1.6A12 12 0 1012 0zm5.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.8 1-1 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5 0-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.5 1.1 2.9 1.2 3 2.1 3.3 5.1 4.6c.7.3 1.3.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.1-1.4-.1-.1-.3-.2-.5-.3z"/>
                </svg>
              </span>
              <span className="text-[13px] font-black">Automação via WhatsApp</span>
            </div>

            <div className="relative">
              <LaptopFrame>
                <HeroLaptopDashboard />
              </LaptopFrame>
              <div className="absolute right-2 sm:right-10 lg:right-14 -bottom-12 lg:-bottom-8 z-20 scale-[0.65] sm:scale-[0.75] origin-bottom-right">
                <HeroPhoneOrder />
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURES
// ═══════════════════════════════════════════════════════════════════════════════
const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.7}>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 7h6M9 11h6M9 15h4" strokeLinecap="round" />
      </svg>
    ),
    title: 'Pedidos e Delivery',
    desc: 'Gerencie pedidos no salão, delivery, balcão e apps de entrega em um só lugar.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.7}>
        <rect x="3" y="3"  width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
    title: 'Cardápio Digital',
    desc: 'Cardápio online com QR Code, personalizável e integrado ao seu sistema.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.7}>
        <path d="M12 3l9 5v8l-9 5-9-5V8l9-5z" strokeLinejoin="round" />
        <path d="M3 8l9 5 9-5M12 13v9" />
      </svg>
    ),
    title: 'Estoque Inteligente',
    desc: 'Controle de estoque em tempo real e receba alertas de produtos.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.7}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9h5a2 2 0 010 4H10l5 2M12 7v10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Financeiro Completo',
    desc: 'Controle contas a pagar/receber, fluxo de caixa e relatórios detalhados.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.7}>
        <rect x="3" y="11" width="4" height="9" rx="0.5" />
        <rect x="10" y="6" width="4" height="14" rx="0.5" />
        <rect x="17" y="3" width="4" height="17" rx="0.5" />
      </svg>
    ),
    title: 'Relatórios Avançados',
    desc: 'Relatórios completos para tomar decisões e aumentar seus lucros.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.7}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2 21c0-3.5 3-6 7-6s7 2.5 7 6" />
        <circle cx="17" cy="6" r="2.5" />
        <path d="M14 13c3-1.5 8 0 8 5" />
      </svg>
    ),
    title: 'Clientes e Fidelidade',
    desc: 'Cadastre clientes, ofereça fidelidade e aumente a recorrência.',
  },
];

function Features() {
  return (
    <section id="recursos" className="relative py-20 md:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-5">
        <Reveal className="text-center mb-12">
          <p className="text-[11px] font-black tracking-widest uppercase text-brand-500 mb-3">Tudo que você precisa</p>
          <h2 className="text-3xl md:text-[42px] font-black tracking-tight leading-[1.05] text-balance max-w-3xl mx-auto text-[#0a0a0a]">
            Um sistema <span className="h-orange">completo</span> para<br className="hidden sm:block"/> gerenciar seu restaurante
          </h2>
          <p className="mt-5 max-w-xl mx-auto text-[15px] text-gray-500 leading-relaxed text-pretty">
            Do pedido à entrega, do estoque ao financeiro. Tudo integrado para você focar no que realmente importa: seus clientes.
          </p>
        </Reveal>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 60} className="h-full">
              <div className="light-card h-full p-5">
                <div className="w-10 h-10 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-brand-500 mb-4">
                  {f.icon}
                </div>
                <h3 className="text-[14px] font-black text-[#0a0a0a] mb-1.5 text-pretty leading-snug">{f.title}</h3>
                <p className="text-[12.5px] text-gray-500 leading-relaxed text-pretty">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WHATSAPP AI
// ═══════════════════════════════════════════════════════════════════════════════
function WhatsAppAI() {
  const [stage, setStage] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let started = false;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !started) {
          started = true;
          io.unobserve(e.target);
          setTimeout(() => setStage(3), 600);
          setTimeout(() => setStage(1), 1600);
          setTimeout(() => setStage(3), 3400);
          setTimeout(() => setStage(2), 4400);
        }
      });
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className="relative py-20 md:py-28 overflow-hidden bg-ink-950 text-white">
      <div className="absolute top-0 left-1/3 w-[700px] h-[500px] hero-blob opacity-50 pointer-events-none" />
      <div className="relative max-w-7xl mx-auto px-5">
        <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-8 md:gap-10 items-center">
          {/* LEFT */}
          <Reveal>
            <p className="text-[11px] font-black tracking-widest uppercase text-brand-400 mb-3">Automação inteligente via WhatsApp</p>
            <h2 className="text-3xl md:text-4xl lg:text-[42px] font-black tracking-tight leading-[1.05] text-balance">
              A IA do ZapFome trabalha{' '}<br className="hidden md:block"/>
              por você no <span className="text-wa-400">WhatsApp</span>
            </h2>
            <p className="mt-5 text-[15px] text-gray-400 leading-relaxed max-w-md text-pretty">
              Receba resumos, alertas e sugestões automaticamente. Você no controle, menos preocupação.
            </p>
            <ul className="mt-7 space-y-3">
              {[
                'Resumo financeiro diário e semanal',
                'Alertas de estoque baixo em tempo real',
                'Sugestões de compras inteligentes',
                'Análise de vendas e oportunidades',
                'Tudo direto no WhatsApp',
              ].map((t, i) => (
                <Reveal key={t} delay={i * 80} as="li" className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-wa-500/15 border border-wa-500/40 flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5 text-wa-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  </span>
                  <span className="text-[14px] text-gray-200">{t}</span>
                </Reveal>
              ))}
            </ul>
          </Reveal>

          {/* CENTER */}
          <Reveal delay={150} className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 hero-blob blur-3xl opacity-90" />
              <div className="relative"><WAPhone scriptStage={stage} /></div>
            </div>
          </Reveal>

          {/* RIGHT */}
          <Reveal delay={300}>
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-black tracking-widest uppercase text-brand-400 mb-3">Exemplo de alerta inteligente</p>
                <div className="dark-card p-5">
                  <p className="text-[13px] text-white font-black mb-2">⚠️ Analisando suas vendas...</p>
                  <p className="text-[13px] text-gray-300 leading-relaxed text-pretty">
                    Na última sexta-feira você vendeu <b className="text-white">60 Xis</b> e possui apenas <b className="text-white">30 pães de Xis</b> em estoque.
                  </p>
                  <p className="mt-3 text-[13px] text-gray-300 leading-relaxed text-pretty">Em base no faturamento da semana passada, você deve comprar:</p>
                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-wa-500/15 border border-wa-500/30">
                    <span className="w-4 h-4 rounded-full bg-wa-500 flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                    </span>
                    <span className="text-white text-[14px] font-black tnum">40 pães de Xis</span>
                  </div>
                  <p className="mt-3 text-[12px] text-gray-400 text-pretty">para atender a demanda dos próximos dias.</p>
                </div>
              </div>
              <ul className="space-y-2.5">
                {[
                  'Controla financeiro e gastos',
                  'Notifica faltas de insumos/produtos',
                  'Prevê demanda com base no histórico',
                  'Sugere compras automaticamente',
                  'Mais organização e mais lucro',
                ].map((t, i) => (
                  <Reveal key={t} delay={i * 70} as="li" className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-brand-500/15 border border-brand-500/30 flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="text-[13.5px] text-gray-200">{t}</span>
                  </Reveal>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMELINE
// ═══════════════════════════════════════════════════════════════════════════════
const STEPS = [
  {
    n: 1, kind: 'wa',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M12 0a12 12 0 00-10.4 18l-1.6 6 6.2-1.6A12 12 0 1012 0zm5.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.8 1-1 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5 0-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.5 1.1 2.9 1.2 3 2.1 3.3 5.1 4.6c.7.3 1.3.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.1-1.4-.1-.1-.3-.2-.5-.3z"/>
      </svg>
    ),
    t: 'Recebe os dados\npelo WhatsApp',
  },
  {
    n: 2,
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3a3 3 0 00-3 3 3 3 0 00-3 3 3 3 0 003 3 3 3 0 003 3 3 3 0 003-3V6a3 3 0 00-3-3z" />
        <path d="M15 3a3 3 0 013 3 3 3 0 013 3 3 3 0 01-3 3 3 3 0 01-3 3 3 3 0 01-3-3V6a3 3 0 013-3z" />
        <path d="M9 15v3M15 15v3M12 18v3" />
      </svg>
    ),
    t: 'A IA analisa vendas,\nestoque e financeiro',
  },
  {
    n: 3,
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12l3 3 5-6" />
      </svg>
    ),
    t: 'Identifica problemas\ne oportunidades',
  },
  {
    n: 4,
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.4 8.4 0 01-9 8.4l-6 1 1-6A8.5 8.5 0 1121 11.5z" />
        <path d="M8 10h8M8 13h5" />
      </svg>
    ),
    t: 'Te avisa com alertas\ne sugestões práticas',
  },
  {
    n: 5,
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 18l5-7 4 4 8-10" />
        <path d="M14 5h6v6" />
      </svg>
    ),
    t: 'Você decide e\nseu negócio cresce',
  },
];

function Timeline() {
  return (
    <section className="relative py-20 md:py-24 bg-ink-950 text-white">
      <div className="max-w-7xl mx-auto px-5">
        <Reveal className="text-center mb-14">
          <h2 className="text-2xl md:text-4xl font-black tracking-tight leading-[1.05] text-balance">
            Como a IA do <span className="h-orange">ZapFome</span> trabalha por você
          </h2>
        </Reveal>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-3 relative">
          <div className="hidden md:block absolute top-9 left-[10%] right-[10%] h-px"
               style={{ borderTop: '2px dashed rgba(249,115,22,0.35)' }} />
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 120} className="relative flex flex-col items-center text-center">
              <div className="relative">
                <span className="absolute -inset-3 rounded-full blur-xl opacity-50"
                      style={{ background: s.kind === 'wa' ? '#22c55e' : '#f97316' }} />
                <div className={`relative w-[72px] h-[72px] rounded-full flex items-center justify-center text-white shadow-[0_15px_30px_-8px_rgba(0,0,0,0.6)] ${
                  s.kind === 'wa'
                    ? 'bg-gradient-to-br from-wa-500 to-wa-600 pulse-wa'
                    : 'bg-gradient-to-br from-brand-500 to-brand-600 pulse-or'
                }`}>
                  {s.icon}
                </div>
                <span className="absolute -bottom-1.5 -right-1 w-6 h-6 rounded-full bg-ink-900 border-2 border-ink-950 flex items-center justify-center text-[11px] font-black text-white tnum">
                  {s.n}
                </span>
              </div>
              <p className="mt-5 text-[13px] text-gray-200 font-medium leading-snug whitespace-pre-line text-pretty max-w-[140px]">
                {s.t}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEVICES
// ═══════════════════════════════════════════════════════════════════════════════
function Devices() {
  return (
    <section className="relative py-20 md:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-5">
        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-12 items-center">
          <Reveal>
            <p className="text-[11px] font-black tracking-widest uppercase text-brand-500 mb-3">Funciona em qualquer lugar</p>
            <h2 className="text-3xl md:text-[42px] font-black tracking-tight leading-[1.05] text-balance text-[#0a0a0a]">
              Acesse de <span className="h-orange">onde estiver</span>
            </h2>
            <p className="mt-5 text-[15px] text-gray-500 leading-relaxed max-w-md text-pretty">
              Sistema 100% online. Acesse pelo computador, tablet ou celular.
              Você no controle do seu negócio, onde quer que esteja.
            </p>
            <ul className="mt-7 space-y-3">
              {[
                'Acesso em qualquer dispositivo',
                'Backup automático e segurança total',
                'Atualizações automáticas',
                'Suporte especializado',
              ].map((t, i) => (
                <Reveal key={t} delay={i * 70} as="li" className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  </span>
                  <span className="text-[14px] text-[#0a0a0a]">{t}</span>
                </Reveal>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#" className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-black hover:bg-[#111827] transition">
                <svg viewBox="0 0 24 24" className="w-7 h-7 text-white" fill="currentColor">
                  <path d="M3 20.5V3.5c0-.7.5-1.2 1.1-1.4l11 8.4-11 10c-.6-.2-1.1-.8-1.1-1.5z"/>
                  <path d="M16.5 14L4.7 22.4l8.7-7.9 3.1.5z" opacity=".9"/>
                  <path d="M20.3 11.2c.9.5 1.1 1.7.3 2.3l-3 1.6-3.4-3 3.4-3 2.7 2.1z" opacity=".85"/>
                  <path d="M15.6 9.9L4.4 1.6l11.9 8.4-.7-.1z" opacity=".75"/>
                </svg>
                <div className="text-left">
                  <p className="text-[8px] uppercase text-gray-400">disponível no</p>
                  <p className="text-[14px] font-black tracking-tight text-white">Google Play</p>
                </div>
              </a>
              <a href="#" className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-black hover:bg-[#111827] transition">
                <svg viewBox="0 0 24 24" className="w-7 h-7 text-white" fill="currentColor">
                  <path d="M16.5 12.4c0-2.4 2-3.6 2-3.6-1.1-1.6-2.8-1.8-3.4-1.9-1.5-.1-2.8.8-3.6.8-.7 0-1.9-.8-3.1-.7-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 3 2.3 1.2 0 1.7-.8 3.2-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.1 3-2.3.9-1.3 1.3-2.6 1.3-2.6s-2-.8-2-3.6zM14 4.9c.6-.8 1.1-2 1-3.2-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.9-1 3.1 1.1.1 2.1-.5 2.8-1.3z"/>
                </svg>
                <div className="text-left">
                  <p className="text-[8px] uppercase text-gray-400">disponível na</p>
                  <p className="text-[14px] font-black tracking-tight text-white">App Store</p>
                </div>
              </a>
            </div>
          </Reveal>

          <Reveal delay={150} className="relative">
            <div className="absolute inset-0 opacity-40"
                 style={{ background: 'radial-gradient(50% 50% at 50% 50%, rgba(249,115,22,0.18) 0%, transparent 70%)', filter: 'blur(30px)' }} />
            <div className="relative h-[460px]">
              <div className="absolute left-0 top-12 z-0 scale-[0.78] origin-top-left float-y" style={{ animationDelay: '1.2s' }}>
                <TabletFrame><HeroLaptopDashboard /></TabletFrame>
              </div>
              <div className="absolute left-[18%] top-0 z-10 w-[520px] max-w-full">
                <LaptopFrame><HeroLaptopDashboard /></LaptopFrame>
              </div>
              <div className="absolute right-0 bottom-0 z-20 scale-[0.72] origin-bottom-right float-y" style={{ animationDelay: '0.4s' }}>
                <MiniPhone />
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRICING
// ═══════════════════════════════════════════════════════════════════════════════
const PLANS = [
  {
    name: 'Starter',
    desc: 'Ideal para quem\nestá começando',
    price: 79,
    annualFull: 'Cobrado anualmente: R$ 65/mês',
    features: ['Pedidos ilimitados', 'Cardápio Digital', 'Controle de Estoque', 'Relatórios Básicos', 'Suporte por WhatsApp'],
    cta: 'Começar agora',
    msg: 'Quero o plano Starter',
  },
  {
    name: 'Pro',
    desc: 'Perfeito para\nrestaurantes em crescimento',
    price: 139,
    annualFull: 'Cobrado anualmente: R$ 158/mês',
    features: ['Tudo do plano Starter', 'Financeiro Completo', 'Relatórios Avançados', 'Integração com Delivery', 'Clientes e Fidelidade', 'Suporte Prioritário'],
    cta: 'Começar agora',
    msg: 'Quero o plano Pro',
    highlight: true,
  },
  {
    name: 'Business',
    desc: 'Para restaurantes\nque querem escalar',
    price: 199,
    annualFull: 'Cobrado anualmente: R$ 228/mês',
    features: ['Tudo do plano Pro', 'Multiunidades', 'Usuários ilimitados', 'API e Integrações', 'Suporte Dedicado'],
    cta: 'Começar agora',
    msg: 'Quero o plano Business',
  },
  {
    name: 'Enterprise',
    desc: 'Solução completa\npara grandes operações',
    priceLabel: 'Sob consulta',
    sub: 'Plano personalizado para\nsua necessidade',
    features: ['Tudo do plano Business', 'Desenvolvimento\nPersonalizado', 'Treinamento Exclusivo', 'Suporte 24/7'],
    cta: 'Falar com especialista',
    msg: 'Quero o plano Enterprise — falar com especialista',
  },
];

function Pricing() {
  return (
    <section id="planos" className="relative py-20 md:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-5">
        <Reveal className="text-center mb-12">
          <p className="text-[11px] font-black tracking-widest uppercase text-brand-500 mb-3">Planos para todos os tamanhos</p>
          <h2 className="text-3xl md:text-[42px] font-black tracking-tight leading-[1.05] text-balance text-[#0a0a0a]">
            Escolha o plano <span className="h-orange">ideal</span> para seu negócio
          </h2>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 100} className="h-full">
              <div className={`relative h-full rounded-2xl p-6 transition ${
                p.highlight
                  ? 'bg-white border-2 border-brand-500 shadow-[0_25px_50px_-15px_rgba(249,115,22,0.25)]'
                  : 'bg-white border border-gray-200'
              }`}>
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-md bg-brand-500 text-white text-[10px] font-black tracking-widest uppercase shadow-lg shadow-brand-500/30">
                    MAIS POPULAR
                  </div>
                )}
                <div className="text-center">
                  <h3 className="text-lg font-black text-[#0a0a0a]">{p.name}</h3>
                  <p className="text-[12px] text-gray-500 mt-1 whitespace-pre-line leading-snug">{p.desc || ''}</p>
                </div>
                <div className="text-center mt-5 mb-4 min-h-[88px] flex flex-col justify-center">
                  {p.priceLabel ? (
                    <>
                      <p className="text-2xl font-black text-[#0a0a0a] tracking-tight">{p.priceLabel}</p>
                      <p className="text-[11px] text-gray-500 mt-2 whitespace-pre-line leading-snug">{p.sub}</p>
                    </>
                  ) : (
                    <>
                      <p className="flex items-baseline justify-center gap-1">
                        <span className="text-[12px] text-gray-500">R$</span>
                        <span className="text-5xl font-black text-[#0a0a0a] tnum tracking-tight leading-none">{p.price}</span>
                        <span className="text-base text-gray-500 font-bold">/mês</span>
                      </p>
                      <p className="text-[10px] text-gray-400 mt-2">{p.annualFull}</p>
                    </>
                  )}
                </div>
                <ul className="space-y-2 mb-6 min-h-[180px]">
                  {p.features.map((f, k) => (
                    <li key={k} className="flex items-start gap-2 text-[13px] text-gray-700">
                      <span className="w-4 h-4 rounded-full bg-brand-500 flex items-center justify-center shrink-0 mt-0.5">
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      </span>
                      <span className="text-pretty whitespace-pre-line leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>
                <a href={waLink(p.msg)} target="_blank" rel="noopener noreferrer"
                   className={`block text-center px-4 py-2.5 rounded-lg font-black text-[13px] transition active:scale-95 ${
                     p.highlight
                       ? 'bg-brand-500 hover:bg-brand-400 text-white shadow-lg shadow-brand-500/30'
                       : 'bg-white hover:bg-gray-50 text-[#0a0a0a] border border-gray-300'
                   }`}>
                  {p.cta}
                </a>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTIMONIALS
// ═══════════════════════════════════════════════════════════════════════════════
const TESTIMONIALS = [
  {
    quote: 'O ZapFome mudou completamente a forma como gerencio meu restaurante. Mais controle, menos dor de cabeça e mais lucro!',
    name: 'Carlos Mendes',
    role: 'Restaurante Sabor Caseiro',
    avatar: 'https://i.pravatar.cc/80?img=12',
  },
  {
    quote: 'Sistema completo e fácil de usar. Meus pedidos nunca mais se perdem e o financeiro está sempre em dia.',
    name: 'Ana Paula Santos',
    role: 'Pizzaria Paulista',
    avatar: 'https://i.pravatar.cc/80?img=47',
  },
  {
    quote: 'O suporte é incrível! Sempre que preciso, eles estão prontos para ajudar. Recomendo demais!',
    name: 'Roberto Lima',
    role: 'Hamburgueria do Rob',
    avatar: 'https://i.pravatar.cc/80?img=68',
  },
];

function Stars() {
  return (
    <div className="flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="#f97316">
          <path d="M12 2l3 7 7 .5-5.5 4.5L18 21l-6-4-6 4 1.5-7L2 9.5 9 9z"/>
        </svg>
      ))}
    </div>
  );
}

function Testimonials() {
  return (
    <section id="depoimentos" className="relative py-20 md:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-5">
        <div className="grid lg:grid-cols-[1fr_1.6fr] gap-10 items-start">
          <Reveal>
            <p className="text-[11px] font-black tracking-widest uppercase text-brand-500 mb-3">O que nossos clientes dizem</p>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-black tracking-tight leading-[1.05] text-balance text-[#0a0a0a]">
              Mais de{' '}
              <span className="h-orange">
                <Counter to={2000} format={fmtInt} />
              </span>{' '}
              restaurantes confiam no ZapFome
            </h2>
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-3">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={i} delay={i * 100} className="h-full">
                <article className="light-card h-full p-5 flex flex-col">
                  <p className="text-[13px] text-gray-700 leading-relaxed flex-1 text-pretty">"{t.quote}"</p>
                  <div className="mt-5 pt-4 border-t border-gray-100 flex items-center gap-3">
                    <img src={t.avatar} alt={t.name}
                         className="w-10 h-10 rounded-full object-cover shrink-0 border border-gray-100" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-black text-[#0a0a0a] truncate">{t.name}</p>
                      <p className="text-[11px] text-gray-500 truncate">{t.role}</p>
                      <div className="mt-1"><Stars /></div>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BRAND LOGOS
// ═══════════════════════════════════════════════════════════════════════════════
const LOGOS = [
  { name: 'iFood', el: <span className="text-[28px] md:text-[32px] font-black italic tracking-tight text-[#EA1D2C]">ifood</span> },
  {
    name: 'Uber Eats',
    el: (
      <span className="text-[22px] md:text-[24px] font-black tracking-tight text-[#0a0a0a] flex items-baseline gap-1">
        Uber <span>Eats</span>
      </span>
    ),
  },
  {
    name: '99 Food',
    el: (
      <span className="flex items-center gap-1.5">
        <span className="text-[26px] md:text-[30px] font-black italic text-[#FFCD00] leading-none">99</span>
        <span className="text-[20px] font-black text-[#0a0a0a] tracking-tight">Food</span>
      </span>
    ),
  },
  { name: 'Rappi', el: <span className="text-[26px] md:text-[30px] font-black tracking-tight text-[#FF1744] italic">rappi</span> },
  {
    name: 'WhatsApp Business',
    el: (
      <span className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
            <path d="M12 0a12 12 0 00-10.4 18l-1.6 6 6.2-1.6A12 12 0 1012 0zm5.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.8 1-1 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5 0-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.5 1.1 2.9 1.2 3 2.1 3.3 5.1 4.6c.7.3 1.3.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.1-1.4-.1-.1-.3-.2-.5-.3z"/>
          </svg>
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[15px] font-black text-[#0a0a0a]">WhatsApp</span>
          <span className="text-[10px] font-bold text-gray-500 tracking-wider uppercase">Business</span>
        </span>
      </span>
    ),
  },
  { name: 'Stone', el: <span className="text-[22px] md:text-[26px] font-black tracking-tight text-[#0a0a0a] lowercase">stone</span> },
  {
    name: 'Mercado Pago',
    el: (
      <span className="flex items-center gap-2">
        <span className="w-8 h-6 rounded-full bg-[#00B1EA] flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-5 h-3.5 text-white" fill="none">
            <ellipse cx="12" cy="12" rx="9" ry="5" stroke="white" strokeWidth="2.5" />
          </svg>
        </span>
        <span className="flex flex-col leading-[1.05]">
          <span className="text-[13px] font-black text-[#00B1EA]">mercado</span>
          <span className="text-[13px] font-black text-[#FFD300]" style={{ WebkitTextStroke: '0.5px #0a0a0a40' }}>pago</span>
        </span>
      </span>
    ),
  },
];

function BrandLogos() {
  return (
    <section className="relative py-12 bg-white border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-5">
        <Reveal>
          <div className="flex flex-wrap items-center justify-around gap-x-8 gap-y-6">
            {LOGOS.map((l) => (
              <div key={l.name} className="opacity-90 hover:opacity-100 transition">{l.el}</div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FOOTER
// ═══════════════════════════════════════════════════════════════════════════════
function Footer() {
  return (
    <footer className="bg-[#0a0a0a] text-white pt-14 pb-8">
      <div className="max-w-7xl mx-auto px-5">
        <div className="grid md:grid-cols-[1.6fr_1fr_1fr_1fr] gap-10 mb-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none">
                <path d="M8 14c-2 0-4-1.5-4-4s2-4 4-4c.5-2 2.5-3.5 4.5-3.5 1 0 2 .4 2.7 1C16 2.7 17.3 2 19 2c2.8 0 5 2.2 5 5 0 .3 0 .5-.1.8 1.8.4 3.1 2 3.1 3.9 0 2.2-1.8 4-4 4H8z" fill="#f97316" />
                <rect x="8" y="14" width="16" height="6" rx="1" fill="#f97316" />
                <rect x="8" y="16" width="16" height="1.5" fill="rgba(255,255,255,0.4)" />
              </svg>
              <span className="text-[20px] font-black tracking-tight">zapfome</span>
            </div>
            <p className="text-[13px] text-gray-400 leading-relaxed max-w-xs">
              O sistema tudo-em-um para restaurantes, lanchonetes, padarias e delivery.
              Gestão completa do pedido ao financeiro.
            </p>
            <div className="mt-5 flex gap-2">
              <a href={waLink()} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-wa-500/15 hover:bg-wa-500/25 border border-wa-500/30 text-wa-400 text-[12px] font-bold transition">
                💬 WhatsApp
              </a>
              <a href="mailto:contato@zapfome.com.br"
                 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-[12px] font-bold transition">
                ✉️ Email
              </a>
            </div>
          </div>

          {/* Links */}
          {[
            { h: 'Produto', l: [['Recursos', '#recursos'], ['Planos', '#planos'], ['Preços', '#planos'], ['Novidades', '#']] },
            { h: 'Pra quem', l: [['Hamburguerias', '#'], ['Pizzarias', '#'], ['Padarias', '#'], ['Cafeterias', '#']] },
            { h: 'Empresa', l: [['Sobre nós', '#'], ['Privacidade', '#'], ['Termos de Uso', '#'], ['LGPD', '#']] },
          ].map((col) => (
            <div key={col.h}>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-4">{col.h}</h4>
              <ul className="space-y-2.5">
                {col.l.map(([t, h]) => (
                  <li key={t}>
                    <a href={h} className="text-[13px] text-gray-400 hover:text-white transition">{t}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-white/[0.08] flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-gray-500">
            © 2026 ZapFome · Torres / RS · Brasil 🇧🇷 · Todos os direitos reservados.
          </p>
          <div className="flex items-center gap-4 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-wa-500 pulse-wa" />
              Status: Operacional
            </span>
            <span>·</span>
            <span>Feito com ⚡ no balcão</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STICKY BAR
// ═══════════════════════════════════════════════════════════════════════════════
function StickyBar() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-brand-500 border-t border-brand-600/40 shadow-[0_-15px_40px_-10px_rgba(249,115,22,0.5)]">
      <div className="max-w-7xl mx-auto px-5 py-3 flex items-center gap-4">
        <span className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center text-base shrink-0">
          🚀
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] md:text-[14px] font-black text-white leading-tight">Teste grátis por 7 dias</p>
          <p className="hidden sm:block text-[11px] text-white/85 leading-snug">
            Sem compromisso. Sem cartão de crédito. Experimente todas as funcionalidades.
          </p>
        </div>
        <a href={waLink('Quero começar teste grátis 7 dias')} target="_blank" rel="noopener noreferrer"
           className="shrink-0 inline-flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-lg bg-black hover:bg-[#111827] text-white font-black text-[12px] md:text-[13px] transition active:scale-95">
          <span className="hidden sm:inline">Começar teste grátis</span>
          <span className="sm:hidden">Começar grátis</span>
          <span className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-3 h-3 text-white" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </span>
        </a>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-[#0a0a0a] relative overflow-x-hidden">
      <Nav />
      <main>
        <Hero />
        <Features />
        <WhatsAppAI />
        <Timeline />
        <Devices />
        <Pricing />
        <Testimonials />
        <BrandLogos />
      </main>
      <Footer />
      <StickyBar />
    </div>
  );
}
