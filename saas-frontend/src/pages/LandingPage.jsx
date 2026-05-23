// ── LandingPage.jsx — ZapFome (Design System v2, light theme) ─────
import { useState, useEffect, useMemo } from 'react';

const WA_NUM = '5551981521264';
const waLink = (msg = 'Quero testar 10 dias grátis no ZapFome') =>
  `https://wa.me/${WA_NUM}?text=${encodeURIComponent(msg)}`;

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function GreenBlob({ size = 120, seed = 1, className = '' }) {
  const dots = [
    [size * 0.78, size * 0.22, size * 0.06, '#86efac'],
    [size * 0.18, size * 0.78, size * 0.04, '#22c55e'],
    [size * 0.92, size * 0.62, size * 0.05, '#4ade80'],
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className}>
      <defs>
        <radialGradient id={`blob-g-${seed}`} cx="35%" cy="30%">
          <stop offset="0%" stopColor="#86efac" />
          <stop offset="60%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#16a34a" />
        </radialGradient>
        <filter id={`blob-blur-${seed}`}><feGaussianBlur stdDeviation="2" /></filter>
      </defs>
      <path d={`M ${size*0.5} ${size*0.12} Q ${size*0.85} ${size*0.18} ${size*0.82} ${size*0.5} Q ${size*0.88} ${size*0.78} ${size*0.55} ${size*0.85} Q ${size*0.22} ${size*0.9} ${size*0.18} ${size*0.55} Q ${size*0.1} ${size*0.25} ${size*0.5} ${size*0.12} Z`}
            fill={`url(#blob-g-${seed})`} filter={`url(#blob-blur-${seed})`} />
      {dots.map(([x, y, r, c], i) => <circle key={i} cx={x} cy={y} r={r} fill={c} />)}
    </svg>
  );
}

function HeatBars({ data, height = 60, max }) {
  const M = max ?? Math.max(...data);
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {data.map((v, i) => {
        const ratio = v / M;
        const color = ratio >= 0.75 ? '#22c55e' : ratio >= 0.55 ? '#65a30d' : ratio >= 0.40 ? '#eab308' : ratio >= 0.25 ? '#f59e0b' : '#ef4444';
        return <div key={i} className="flex-1 rounded-[2px] bar-rise" style={{ height: `${ratio * 100}%`, background: color, animationDelay: `${i * 30}ms` }} />;
      })}
    </div>
  );
}

function Sparkline({ data, color = '#22c55e', width = 100, height = 28, fill = true }) {
  const min = Math.min(...data), max = Math.max(...data);
  const range = Math.max(0.0001, max - min);
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => [i * step, height - ((v - min) / range) * (height - 4) - 2]);
  const d = pts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {fill && <path d={`${d} L ${width} ${height} L 0 ${height} Z`} fill={color} opacity="0.12" />}
      <path d={d} stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={color} />
    </svg>
  );
}

function SegBar({ segments, height = 6 }) {
  const total = segments.reduce((a, b) => a + b.v, 0);
  return (
    <div className="flex gap-1 w-full" style={{ height }}>
      {segments.map((s, i) => <div key={i} className="rounded-full" style={{ width: `${(s.v / total) * 100}%`, background: s.c }} />)}
    </div>
  );
}

function SectionHeader({ tag, bold, gray, kicker }) {
  return (
    <div className="text-center mb-12">
      {tag && (
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-gray-200 text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> {tag}
        </span>
      )}
      <h2 className="text-3xl md:text-5xl lg:text-[56px] font-black tracking-tight leading-[1.02] text-balance max-w-4xl mx-auto">
        <span className="text-[#0a0a0a]">{bold}</span>{' '}
        <span className="text-gray-400">{gray}</span>
      </h2>
      {kicker && <p className="mt-5 max-w-2xl mx-auto text-[15px] text-gray-500 leading-relaxed text-pretty">{kicker}</p>}
    </div>
  );
}

function StockRow({ name, pct, color }) {
  return (
    <div>
      <div className="flex justify-between text-[10px]">
        <span className="truncate text-gray-600">{name}</span>
        <span className="tnum font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1 rounded-full bg-gray-100 overflow-hidden mt-0.5">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// HERO DASHBOARD MOCKUP
// ─────────────────────────────────────────────

const MOCK_ORDERS = [
  { id: '#1041', name: 'Mesa 3',     total: '92,50', ch: 'mesa',     time: '04:12', tCls: 'text-gray-400', status: 'PENDENTE',  sCls: 'bg-yellow-100 text-yellow-700' },
  { id: '#1042', name: 'João P.',    total: '58,00', ch: 'whatsapp', time: '08:31', tCls: 'text-yellow-500', status: 'PREPARO',   sCls: 'bg-blue-100 text-blue-700' },
  { id: '#1043', name: 'Ana C.',     total: '22,00', ch: 'ifood',    time: '15:44', tCls: 'text-red-500',   status: 'PREPARO',   sCls: 'bg-blue-100 text-blue-700' },
  { id: '#1044', name: 'Bruno R.',   total: '33,00', ch: 'whatsapp', time: '28:14', tCls: 'text-red-500',   status: 'PRONTO',    sCls: 'bg-green-100 text-green-700' },
];

const WEEK = [3.1, 4.2, 3.8, 5.1, 6.4, 5.9, 7.2];

function HeroDashboard() {
  return (
    <div className="cz-card cz-card-lg overflow-hidden">
      {/* top bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-[#0a0a0a] text-white flex items-center justify-center text-sm font-black">⚡</span>
          <span className="text-[14px] font-black text-[#0a0a0a]">ZapFome</span>
          <span className="text-gray-300 text-xs">·</span>
          <span className="text-[11px] text-gray-400">Restaurante Klebson</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 pulse-glow-g" />
          <span className="text-[11px] text-gray-500">Ao vivo</span>
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_220px] divide-y md:divide-y-0 md:divide-x divide-gray-100">
        {/* left — orders */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Pedidos ativos</p>
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-black">4 pendentes</span>
          </div>
          <div className="space-y-2">
            {MOCK_ORDERS.map((o) => (
              <div key={o.id} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-[#fafafa] border border-gray-100">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-black text-[#0a0a0a] tnum">{o.id}</span>
                    <span className="text-[11px] text-gray-500 truncate">{o.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${o.sCls}`}>{o.status}</span>
                    <span className="text-[10px] text-gray-400">{o.ch}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] font-black tnum text-[#0a0a0a]">R$ {o.total}</p>
                  <p className={`text-[10px] tnum ${o.tCls}`}>{o.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* right — mini stats */}
        <div className="p-4 space-y-3">
          <div className="rounded-2xl bg-[#fafafa] border border-gray-100 p-3">
            <p className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">Faturamento · semana</p>
            <p className="text-[22px] font-black tnum text-[#0a0a0a] leading-none">R$ 3.240</p>
            <p className="text-[10px] text-green-600 font-bold mt-0.5">+24% vs semana passada</p>
            <div className="mt-2">
              <HeatBars data={WEEK} height={36} />
            </div>
          </div>
          <div className="rounded-2xl bg-green-50 border border-green-200 p-3">
            <p className="text-[9px] uppercase tracking-widest text-green-700 font-bold">Caixa · hoje</p>
            <p className="text-[18px] font-black tnum text-green-700 leading-none mt-1">+R$ 840</p>
          </div>
          <div className="rounded-2xl bg-[#fafafa] border border-gray-100 p-3">
            <p className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-2">Estoque crítico</p>
            <StockRow name="Pão brioche" pct={12} color="#ef4444" />
            <div className="mt-1.5">
              <StockRow name="Queijo cheddar" pct={28} color="#eab308" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`sticky top-0 z-40 transition-all ${scrolled ? 'bg-[#ededed]/85 backdrop-blur-md border-b border-gray-200' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-5 h-16 flex items-center gap-4">
        <a href="#top" className="flex items-center gap-2 shrink-0">
          <span className="w-8 h-8 rounded-xl bg-[#0a0a0a] text-white flex items-center justify-center text-sm font-black">⚡</span>
          <span className="text-base font-black tracking-tight text-[#0a0a0a]">ZapFome</span>
        </a>
        <nav className="hidden md:flex items-center gap-1 ml-4 text-[13px] text-gray-500">
          {[['Produto','#solucao'],['Benefícios','#beneficios'],['Planos','#planos'],['Garantia','#garantia'],['FAQ','#faq']].map(([l,h]) => (
            <a key={l} href={h} className="px-3 py-1.5 rounded-md hover:bg-white hover:text-[#0a0a0a] transition">{l}</a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 pulse-glow-g" />
            <span className="tnum">53 / 100 vagas grátis</span>
          </span>
          <a href={waLink('Quero ativar meu trial de 10 dias')} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0a0a0a] hover:bg-gray-800 text-white text-[13px] font-black transition active:scale-95">
            Trial 10 dias grátis →
          </a>
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────
// HERO
// ─────────────────────────────────────────────

function Hero() {
  return (
    <section id="top" className="relative pt-12 pb-10">
      <div className="max-w-7xl mx-auto px-5">
        <div className="flex justify-center mb-6">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200 shadow-sm text-[11px] font-bold uppercase tracking-widest text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 pulse-glow-g" />
            Rodando há 30 dias em restaurante real · Torres / RS
          </span>
        </div>

        <h1 className="text-center text-4xl sm:text-5xl lg:text-[80px] font-black leading-[0.98] tracking-tight max-w-5xl mx-auto text-balance">
          <span className="text-[#0a0a0a]">Automatize seu restaurante</span>
          <br />
          <span className="text-[#0a0a0a]">em </span>
          <span className="relative inline-block">
            <span className="text-[#0a0a0a]">10 minutos.</span>
            <svg className="absolute -bottom-1 left-0 w-full" height="10" viewBox="0 0 200 10" preserveAspectRatio="none">
              <path d="M2 7 Q 50 1, 100 5 T 198 6" stroke="#22c55e" strokeWidth="3" fill="none" strokeLinecap="round" />
            </svg>
          </span>
          <br className="hidden sm:block" />
          <span className="text-gray-400 font-black">Pedidos, estoque e financeiro </span>
          <span className="text-gray-400 font-black">no piloto automático.</span>
        </h1>

        <p className="mt-8 max-w-2xl mx-auto text-center text-[17px] text-gray-500 leading-relaxed text-pretty">
          O sistema completo pra quem quer mais controle, menos caos e tempo de volta —
          com app de pedidos, gestão financeira automática, alerta de estoque e
          painel exclusivo pro motoboy. <b className="text-[#0a0a0a]">Trial de 10 dias grátis.</b> Sem cartão de crédito.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a href={waLink('Quero testar 10 dias grátis')} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-[#0a0a0a] hover:bg-gray-800 text-white font-black text-[15px] transition active:scale-95">
            🚀 Quero testar 10 dias grátis
          </a>
          <a href="#solucao"
             className="inline-flex items-center gap-2 px-6 py-4 rounded-full bg-white border border-gray-200 hover:border-gray-300 text-[#0a0a0a] font-bold text-[14px] transition">
            Ver como funciona →
          </a>
        </div>

        <div className="mt-5 flex flex-wrap justify-center items-center gap-x-5 gap-y-1.5 text-[12px] text-gray-500">
          {['10 dias de trial','Sem cartão de crédito','Implementação gratuita','Cancela quando quiser'].map(t => (
            <span key={t} className="flex items-center gap-1.5"><span className="text-green-500 font-black">✓</span> {t}</span>
          ))}
        </div>

        <div className="mt-16 relative">
          <div className="hidden lg:flex absolute -left-10 top-1/3 z-20 items-center gap-2.5 cz-card pl-3 pr-4 py-2.5 shadow-lg lp-float-y" style={{ borderRadius: 18 }}>
            <span className="text-xl">⏱️</span>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Tempo recuperado</p>
              <p className="text-[15px] font-black tnum text-[#0a0a0a]">3 horas / dia</p>
            </div>
          </div>
          <div className="hidden lg:flex absolute -right-6 top-1/2 z-20 items-center gap-2.5 cz-card pl-3 pr-4 py-2.5 shadow-lg lp-float-y" style={{ borderRadius: 18, animationDelay: '0.8s' }}>
            <span className="text-xl">💸</span>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Economia · 1º mês</p>
              <p className="text-[15px] font-black tnum text-[#0a0a0a]">R$ 1.200</p>
            </div>
          </div>
          <HeroDashboard />
        </div>

        <div className="mt-16 cz-card px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <p className="text-[12px] text-gray-400 font-medium max-w-[200px] leading-snug shrink-0">
              Já melhora a operação<br /> de quem opera no balcão:
            </p>
            <div className="flex-1 flex flex-wrap items-center justify-around gap-x-6 gap-y-4">
              {[['🍔','BURGER'],['☕','CAFÉ'],['🍕','PIZZA'],['🥖','PADARIA'],['🍦','AÇAÍ'],['🥗','LANCHE']].map(([e,w]) => (
                <span key={w} className="flex items-center gap-2 text-gray-400">
                  <span className="text-lg grayscale opacity-70">{e}</span>
                  <span className="text-[13px] font-black tracking-widest">{w}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// PAIN
// ─────────────────────────────────────────────

const PAINS = [
  { e:'📝', t:'Pedidos que somem entre cozinha e salão', s:'O cliente sai reclamando, você nem entende o que aconteceu' },
  { e:'🕐', t:'2 a 3 horas todo dia fechando caixa', s:'Conferindo bloquinho por bloquinho, brigando com letra de garçom' },
  { e:'📦', t:'Geladeira que acaba no meio do sábado', s:'Esqueceu de comprar ingrediente-chave porque não tinha controle' },
  { e:'📱', t:'Concorrente com cardápio online, você não', s:'Site, WhatsApp automatizado e ainda aparece no iFood' },
  { e:'🤷', t:'Conferência de estoque que demora 30 min', s:'E o número que o funcionário te dá nem é confiável' },
  { e:'🧮', t:'Você não sabe quanto ganha em cada produto', s:'As contas nunca batem no final do mês' },
];

function Pain() {
  return (
    <section className="relative py-24">
      <div className="max-w-7xl mx-auto px-5">
        <SectionHeader tag="01 · O problema" bold="Você acorda cedo, trabalha até tarde, e ainda gasta" gray="3 horas fechando caixa de madrugada." />
        <div className="grid lg:grid-cols-[1fr_460px] gap-5 items-start">
          <div className="cz-card p-7 md:p-10">
            <p className="text-[15px] text-gray-500 leading-relaxed mb-7 text-pretty">
              Se você é dono de restaurante, cafeteria, hamburgueria, lanchonete ou padaria,
              você já viveu essas dores — <span className="text-[#0a0a0a] font-bold">todo dia, várias vezes ao dia:</span>
            </p>
            <ul className="grid sm:grid-cols-2 gap-3">
              {PAINS.map((p, i) => (
                <li key={i} className="flex gap-3 p-4 rounded-2xl bg-[#fafafa] border border-gray-100 hover:bg-white hover:border-gray-200 transition">
                  <div className="shrink-0 w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-lg">{p.e}</div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-[10px] font-black text-gray-300 tnum tracking-widest">0{i+1}</span>
                      <p className="text-[14px] font-black text-[#0a0a0a] text-pretty leading-snug">{p.t}</p>
                    </div>
                    <p className="text-[12px] text-gray-500 leading-relaxed">{p.s}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:sticky lg:top-24 space-y-4">
            <div className="cz-card p-6 relative overflow-hidden">
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] uppercase tracking-widest text-rose-400 font-bold">Prejuízo estimado · este mês</p>
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-500 text-[9px] font-black uppercase tracking-widest">Alerta</span>
                </div>
                <p className="text-[40px] font-black tnum text-[#0a0a0a] leading-none">−R$ 4.180</p>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {[{l:'Pedidos perdidos',v:'37',c:'#ef4444'},{l:'Validade vencida',v:'R$ 920',c:'#eab308'},{l:'Fiado aberto',v:'R$ 1.840',c:'#fda4af'}].map(s => (
                    <div key={s.l} className="rounded-xl bg-[#fafafa] border border-gray-100 p-2.5">
                      <p className="text-[9px] uppercase tracking-wider text-gray-400 font-bold leading-tight">{s.l}</p>
                      <p className="mt-1 text-[13px] font-black tnum" style={{ color: s.c }}>{s.v}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl bg-[#fafafa] border border-gray-100 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Tempo no caixa · 14 dias</span>
                    <span className="text-[10px] tnum text-rose-500 font-bold">média 2h47/dia</span>
                  </div>
                  <HeatBars data={[2.4,2.8,3.1,2.5,3.0,3.4,2.7,2.9,3.2,2.6,2.8,3.5,2.9,3.1]} height={50} max={3.5} />
                </div>
              </div>
            </div>
            <div className="cz-card p-5 bg-gradient-to-br from-green-50 to-white border-green-200">
              <div className="flex items-start gap-3">
                <span className="text-2xl">💡</span>
                <p className="text-[13.5px] text-[#0a0a0a] leading-relaxed text-pretty">
                  Quando você soma tudo, o <b>"custo" de não ter controle</b> é muito maior que{' '}
                  <span className="tnum font-black">R$ 97 / mês</span>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// SOLUTION
// ─────────────────────────────────────────────

const STEPS = [
  { n:'01', e:'📲', t:'Você se cadastra em 2 minutos', d:'Cria a conta, escolhe o plano e entra no painel. Sem baixar app, sem configuração complexa.' },
  { n:'02', e:'🍔', t:'A gente monta seu cardápio em 24h', d:'Você envia fotos e preços, a gente cadastra tudo. Em 24h seu cardápio digital tá no ar com QR Code.' },
  { n:'03', e:'📦', t:'Coloca o estoque inicial', d:'5 minutos pra lançar o que você tem na geladeira. O sistema começa a baixar automaticamente a cada pedido.' },
  { n:'04', e:'🚀', t:'Começa a receber pedidos', d:'Seu cardápio tá online. Cliente escaneia, pede, paga. O pedido cai direto no painel — sem intermediário.' },
];

function Solution() {
  return (
    <section id="solucao" className="relative py-24 bg-[#f5f5f5]">
      <div className="max-w-7xl mx-auto px-5">
        <SectionHeader tag="02 · Como funciona" bold="Do cadastro ao primeiro pedido" gray="em menos de 24h." />
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map((s, i) => (
            <div key={i} className="cz-card p-6 relative overflow-hidden">
              <div className="absolute -right-3 -top-3 blob-float opacity-70">
                <GreenBlob size={70} seed={10 + i} />
              </div>
              <div className="relative">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-10 h-10 rounded-2xl bg-[#fafafa] border border-gray-200 flex items-center justify-center text-xl">{s.e}</span>
                  <span className="text-[11px] font-black tnum text-gray-300 tracking-widest">{s.n}</span>
                </div>
                <h3 className="text-[15px] font-black text-[#0a0a0a] leading-snug mb-2 text-pretty">{s.t}</h3>
                <p className="text-[13px] text-gray-500 leading-relaxed text-pretty">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// BENEFITS
// ─────────────────────────────────────────────

function BenefitCard({ title, body, blobSeed = 1, children, big = false }) {
  return (
    <div className={`cz-card p-7 relative overflow-hidden flex flex-col ${big ? 'md:p-9' : ''}`}>
      <div className="absolute -right-6 -top-6 opacity-95 blob-float">
        <GreenBlob size={big ? 110 : 80} seed={blobSeed} />
      </div>
      <div className="relative">
        <h3 className={`${big ? 'text-2xl md:text-3xl' : 'text-xl'} font-black tracking-tight leading-[1.1] mb-3 text-pretty`}>
          <span className="text-[#0a0a0a]">{title.bold}</span>{' '}
          <span className="text-gray-400">{title.gray}</span>
        </h3>
        <p className="text-[13.5px] text-gray-500 leading-relaxed text-pretty">{body}</p>
        {children && <div className="mt-5">{children}</div>}
      </div>
    </div>
  );
}

function Benefits() {
  return (
    <section id="beneficios" className="relative py-24">
      <div className="max-w-7xl mx-auto px-5">
        <SectionHeader tag="03 · Benefícios" bold="O que muda na sua operação" gray="a partir de hoje." />
        <div className="grid md:grid-cols-2 gap-4">
          <BenefitCard big blobSeed={1} title={{ bold:'Estoque inteligente', gray:'que trabalha pra você.' }} body="Chega de mandar funcionário conferir geladeira por 30 minutos. O sistema baixa sozinho quando sai pedido e te avisa 2 dias antes de acabar.">
            <div className="rounded-2xl bg-[#fafafa] border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Estoque ao vivo</span>
                <span className="text-[10px] text-green-600 tnum font-bold">12 itens monitorados</span>
              </div>
              <div className="space-y-2">
                <StockRow name="Pão brioche · acaba sábado" pct={12} color="#ef4444" />
                <StockRow name="Queijo cheddar · 2 dias" pct={28} color="#eab308" />
                <StockRow name="Bacon · 5 dias" pct={64} color="#22c55e" />
                <StockRow name="Coca 2L · 7 dias" pct={82} color="#16a34a" />
              </div>
            </div>
          </BenefitCard>
          <BenefitCard big blobSeed={2} title={{ bold:'Controle financeiro real,', gray:'não Excel bagunçado.' }} body="Você vai saber exatamente quanto tá ganhando em cada hambúrguer, cada café, cada pão. No final do mês, as contas batem.">
            <div className="rounded-2xl bg-[#fafafa] border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Lucro · 14 dias</span>
                <span className="text-[10px] text-green-600 tnum font-bold">+24% vs mês passado</span>
              </div>
              <HeatBars data={[2.4,2.9,2.6,3.1,3.8,4.0,4.4,3.9,4.2,4.5,4.1,4.7,4.6,4.9]} height={64} />
            </div>
          </BenefitCard>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <BenefitCard blobSeed={3} title={{ bold:'3 horas / dia', gray:'de volta.' }} body="O sistema fecha o caixa por você. Sobra tempo pra pensar no negócio.">
            <div className="space-y-1.5 text-[10px]">
              {[['Antes','2h 47min','text-rose-500'],['Agora','11 min','text-green-600']].map(([l,v,c])=>(
                <div key={l} className="flex justify-between"><span className="text-gray-500">{l}</span><span className={`tnum font-bold ${c}`}>{v}</span></div>
              ))}
              <div className="flex justify-between text-[11px] border-t border-gray-100 pt-1">
                <span className="text-[#0a0a0a] font-black">Sobra</span>
                <span className="tnum text-green-600 font-black">2h 36min</span>
              </div>
            </div>
          </BenefitCard>

          <BenefitCard blobSeed={4} title={{ bold:'Painel do motoboy.', gray:'Ele não te liga 10x.' }} body="Mapa com todas as entregas organizadas, melhor rota. Pega o pedido e vai.">
            <div className="rounded-xl bg-[#fafafa] border border-gray-100 p-2.5">
              <svg viewBox="0 0 160 60" className="w-full h-[60px]">
                <defs><pattern id="mapgrid2" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M 12 0 L 0 0 0 12" fill="none" stroke="#e5e7eb" strokeWidth="0.5"/></pattern></defs>
                <rect width="160" height="60" fill="url(#mapgrid2)" />
                <path d="M 12 50 Q 30 36, 50 40 T 90 26 Q 110 18, 130 30 L 148 20" stroke="#22c55e" strokeWidth="1.8" fill="none" strokeDasharray="3 2" />
                {[[12,50],[50,40],[90,26],[130,30],[148,20]].map(([cx,cy],i)=>(
                  <circle key={i} cx={cx} cy={cy} r={i===0?3.5:2.5} fill={i===0?'#0a0a0a':'#22c55e'} />
                ))}
              </svg>
              <p className="text-[10px] text-gray-500 mt-1.5">7 entregas · rota otimizada</p>
            </div>
          </BenefitCard>

          <BenefitCard blobSeed={5} title={{ bold:'Cardápio online', gray:'pronto em 24h.' }} body="A gente implementa fotos, preços, descrições. Cliente acessa, escolhe, paga.">
            <div className="space-y-1.5">
              {[['🍔','X-Tudo Especial','28,90'],['🍕','Pizza Calabresa','54,00'],['🥤','Combo família','89,90']].map(([e,n,p])=>(
                <div key={n} className="flex items-center gap-2 p-1.5 rounded-md bg-[#fafafa] border border-gray-100">
                  <span className="text-base shrink-0">{e}</span>
                  <span className="text-[11px] text-[#0a0a0a] flex-1 truncate font-bold">{n}</span>
                  <span className="text-[10px] text-gray-500 tnum">R$ {p}</span>
                </div>
              ))}
            </div>
          </BenefitCard>

          <BenefitCard blobSeed={6} title={{ bold:'iFood integrado.', gray:'1 tela só.' }} body="Pedidos caem direto no ZapFome, vão pra impressora, baixam do estoque. Sem trocar de app.">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1.5"><span className="text-base">🛵</span><span className="text-[#0a0a0a] font-bold">iFood</span></span>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /><span className="text-green-600 font-bold">Sincronizado</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-1 rounded-full bg-gradient-to-r from-pink-400 to-rose-500" />
                <span className="text-[9px] text-gray-400">→</span>
                <div className="w-7 h-7 rounded-lg bg-[#0a0a0a] flex items-center justify-center text-xs text-white">⚡</div>
                <span className="text-[9px] text-gray-400">→</span>
                <span className="text-base">🖨️</span>
              </div>
              <p className="text-[10px] text-gray-400 italic">#4821 · há 12s · auto-impresso</p>
            </div>
          </BenefitCard>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-4">
          <BenefitCard blobSeed={7} title={{ bold:'Suporte real.', gray:'Gente, não bot.' }} body="Surgiu dúvida? Resposta rápida no WhatsApp. Não é robô, não é fila de 2 horas.">
            <div className="space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="w-6 h-6 rounded-full bg-[#0a0a0a] text-white flex items-center justify-center text-[9px] font-black shrink-0">VC</span>
                <div className="rounded-2xl rounded-tl-sm bg-[#fafafa] border border-gray-100 px-2.5 py-1.5">
                  <p className="text-[11px] text-[#0a0a0a]">Travou o pedido #1042</p>
                </div>
              </div>
              <div className="flex items-start gap-2 flex-row-reverse">
                <span className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-[10px] shrink-0">⚡</span>
                <div className="rounded-2xl rounded-tr-sm bg-green-50 border border-green-200 px-2.5 py-1.5">
                  <p className="text-[11px] text-green-900">Já tô olhando — 2 min!</p>
                  <p className="text-[9px] text-green-600 tnum mt-0.5">14:32 · respondido em 47s</p>
                </div>
              </div>
            </div>
          </BenefitCard>

          <BenefitCard blobSeed={8} title={{ bold:'Direto ao ponto.', gray:'Aprende em 1 dia.' }} body="Sem 10 telas escondidas. Tudo a 1 ou 2 cliques.">
            <div className="flex items-center justify-around">
              {[['10','min p/ aprender','text-[#0a0a0a]'],['1-2','cliques / ação','text-green-600'],['0','telas escondidas','text-[#0a0a0a]']].map(([v,l,c],i,arr)=>(
                <div key={l} className="flex items-center gap-3">
                  <div className="text-center"><p className={`text-2xl font-black tnum ${c}`}>{v}</p><p className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">{l}</p></div>
                  {i < arr.length - 1 && <div className="w-px h-10 bg-gray-100" />}
                </div>
              ))}
            </div>
          </BenefitCard>

          <BenefitCard blobSeed={9} title={{ bold:'Mix de pagamentos', gray:'pra fechar mais.' }} body="Aceita tudo: Pix, cartão, dinheiro, fiado, vale. Conciliação automática em 1 lugar.">
            <ul className="space-y-1.5 text-[10px]">
              {[['Pix',64,'#22c55e'],['Cartão',24,'#65a30d'],['Dinheiro',9,'#eab308'],['Fiado',3,'#fda4af']].map(([l,v,c])=>(
                <li key={l}>
                  <div className="flex justify-between"><span className="flex items-center gap-1.5 text-gray-600"><span className="w-1.5 h-1.5 rounded-full" style={{background:c}}/>{l}</span><span className="tnum text-[#0a0a0a] font-bold">{v}%</span></div>
                  <div className="h-1 rounded-full bg-gray-100 mt-0.5 overflow-hidden"><div className="h-full rounded-full" style={{width:`${v}%`,background:c}}/></div>
                </li>
              ))}
            </ul>
          </BenefitCard>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// STATS (light theme)
// ─────────────────────────────────────────────

const STATS = [
  { v:'30',    u:'dias',  l:'rodando no restaurante real',    sub:'testado no fogo cruzado do dia a dia',              c:'#22c55e' },
  { v:'-80',   u:'%',     l:'erros de pedido',                sub:'desde que automatizamos no meu restaurante',        c:'#f97316' },
  { v:'1.200', u:'R$',    l:'economizados no 1º mês',         sub:'só por controle de validade e compra repetida',     c:'#3b82f6' },
  { v:'3',     u:'h/dia', l:'recuperadas no fechamento',      sub:'comparado ao caixa manual no papel',                c:'#a855f7' },
];

function Stats() {
  return (
    <section className="relative py-20 bg-[#f5f5f5]">
      <div className="max-w-7xl mx-auto px-5">
        <SectionHeader tag="04 · Números reais" bold="Sem promessa inflada." gray="Só o que aconteceu de verdade." />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {STATS.map((s, i) => (
            <div key={i} className="cz-card p-6 relative overflow-hidden">
              <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-10" style={{ background: s.c }} />
              <div className="relative">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-black tnum text-[#0a0a0a] leading-none">{s.v}</span>
                  <span className="text-2xl font-black" style={{ color: s.c }}>{s.u}</span>
                </div>
                <p className="mt-3 text-[13px] font-bold text-[#0a0a0a] leading-tight text-pretty">{s.l}</p>
                <p className="mt-1 text-[11px] text-gray-500 leading-relaxed text-pretty">{s.sub}</p>
                <div className="mt-3 h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width:`${85-i*8}%`, background: s.c }} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-[11px] text-gray-400 italic max-w-2xl mx-auto">
          * números medidos no meu próprio restaurante em Torres/RS, durante os primeiros 30 dias de operação automatizada.
        </p>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// TESTIMONIAL (light theme)
// ─────────────────────────────────────────────

const TESTIMONIALS = [
  {
    name:'Klebson', role:'Dono · Restaurante Klebson', city:'Torres / RS', avatar:'👨‍🍳', accent:'#f97316', real:true,
    quote:'Antes eu gastava quase 3 horas todo dia fechando caixa e conferindo os pedidos no papel. Agora, em 10 minutos eu sei exatamente quanto entrou, quanto gastei e quanto lucrei.',
    stat:{ l:'tempo recuperado / dia', v:'2h 36min' },
  },
  {
    placeholder:true, name:'[ NOME DO CLIENTE ]', role:'Hamburgueria / Cafeteria', city:'Cidade / UF', avatar:'👤', accent:'#22c55e',
    focus:'foco em economia de tempo e redução de erro', stat:{ l:'erros de pedido', v:'- 80%' },
  },
  {
    placeholder:true, name:'[ NOME DO CLIENTE ]', role:'Padaria / Lanchonete', city:'Cidade / UF', avatar:'👤', accent:'#3b82f6',
    focus:'foco em controle financeiro e facilidade de uso', stat:{ l:'reconciliação caixa', v:'11 min' },
  },
];

function Testimonial() {
  return (
    <section className="relative py-24">
      <div className="max-w-7xl mx-auto px-5">
        <SectionHeader tag="05 · Quem usa" bold="Feito por quem sentiu a dor." gray="Testado por quem ainda sente." />
        <div className="grid lg:grid-cols-3 gap-4">
          {TESTIMONIALS.map((t, i) => (
            <article key={i} className={`cz-card p-6 flex flex-col relative ${t.placeholder ? 'border-dashed' : ''}`}>
              {!t.placeholder && (
                <span className="absolute top-4 right-4 px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-[9px] font-black uppercase tracking-widest text-green-600">
                  ✓ Real
                </span>
              )}
              {t.placeholder && (
                <span className="absolute top-4 right-4 px-2 py-0.5 rounded-full bg-yellow-50 border border-yellow-200 text-[9px] font-black uppercase tracking-widest text-yellow-600">
                  ⚠ a inserir
                </span>
              )}
              {t.placeholder ? (
                <div className="flex-1 space-y-3 mt-8">
                  <p className="text-[14px] text-gray-400 italic leading-relaxed text-pretty">
                    "Espaço reservado pro depoimento — {t.focus}. Mantenha o tom direto, fala de balcão, conte um caso concreto."
                  </p>
                  <div className="space-y-1.5">{[78,92,64].map((w,j)=><div key={j} className="h-2 rounded-full bg-gray-100" style={{width:`${w}%`}}/>)}</div>
                </div>
              ) : (
                <p className="flex-1 text-[14.5px] text-gray-700 leading-relaxed text-pretty mt-2">"{t.quote}"</p>
              )}
              <div className="mt-6 pt-4 border-t border-gray-100 flex items-center gap-3">
                <span className="w-11 h-11 rounded-full flex items-center justify-center text-xl" style={{background:`${t.accent}20`,border:`1px solid ${t.accent}50`}}>{t.avatar}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-black text-[#0a0a0a] truncate">{t.name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{t.role} · {t.city}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">{t.stat.l}</p>
                  <p className="text-base font-black tnum" style={{color:t.accent}}>{t.stat.v}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// OFFER
// ─────────────────────────────────────────────

const OFFER_ITEMS = [
  { e:'🖥️', t:'Sistema completo de gestão',          d:'Pedidos, estoque, financeiro, relatórios, painel do motoboy', v:'1.200' },
  { e:'🍔', t:'Implementação gratuita do cardápio',   d:'A gente monta seu cardápio completo em até 24h', v:'350' },
  { e:'🔗', t:'Integração com iFood inclusa',         d:'Conecta automático — sem custo extra', v:'200' },
  { e:'🎓', t:'Treinamento personalizado',            d:'Te ensinamos tudo por chamada ou vídeo até dominar', v:'300' },
  { e:'💬', t:'Suporte prioritário no WhatsApp',      d:'Resposta rápida sempre que precisar', vFree:'não tem preço' },
  { e:'🎁', t:'10 dias de trial grátis',              d:'3 dias Premium + 7 dias Pro · sem cartão de crédito', vFree:'incluso' },
];

function Offer() {
  return (
    <section className="relative py-24 bg-[#f5f5f5]">
      <div className="max-w-5xl mx-auto px-5">
        <SectionHeader tag="06 · A oferta" bold="O que você recebe hoje" gray="por menos que uma diária." />
        <div className="cz-card cz-card-lg p-7 md:p-10 relative overflow-hidden">
          <div className="hidden md:block absolute -right-4 -top-4 blob-float opacity-80">
            <GreenBlob size={140} seed={30} />
          </div>
          <div className="relative">
            <div className="flex items-center justify-between pb-5 border-b border-dashed border-gray-200">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-[#0a0a0a] text-white flex items-center justify-center text-sm">⚡</span>
                <span className="text-base font-black text-[#0a0a0a]">ZapFome · pacote completo</span>
              </div>
              <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Pedido #001</span>
            </div>
            <ul className="divide-y divide-gray-100">
              {OFFER_ITEMS.map((it, i) => (
                <li key={i} className="py-4 flex items-start gap-4">
                  <span className="shrink-0 w-11 h-11 rounded-2xl bg-[#fafafa] border border-gray-100 flex items-center justify-center text-lg">{it.e}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[14px] font-black text-[#0a0a0a] leading-tight text-pretty"><span className="text-green-500 mr-1">✓</span>{it.t}</p>
                      {it.vFree
                        ? <span className="shrink-0 px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-[10px] font-black uppercase tracking-widest">{it.vFree}</span>
                        : <span className="shrink-0 text-[13px] font-bold tnum text-gray-400 line-through">R$ {it.v}</span>
                      }
                    </div>
                    <p className="text-[12.5px] text-gray-500 mt-1 text-pretty leading-relaxed">{it.d}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-2 pt-5 border-t-2 border-dashed border-gray-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] uppercase tracking-widest text-gray-400 font-bold">Valor total</span>
                <span className="text-2xl font-black text-gray-400 line-through tnum">R$ 2.050</span>
              </div>
              <div className="flex items-end justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-[12px] uppercase tracking-widest text-green-600 font-bold">Você paga, a partir de</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-6xl md:text-[72px] font-black tnum text-[#0a0a0a] leading-none tracking-tight">R$ 97</span>
                    <span className="text-xl font-black text-gray-400">/ mês</span>
                  </div>
                  <p className="text-[12px] text-gray-500 mt-2">no plano Básico · sem fidelidade · cancela quando quiser</p>
                </div>
                <a href={waLink('Quero o pacote completo do ZapFome')} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full bg-[#0a0a0a] hover:bg-gray-800 text-white font-black text-[13px] transition active:scale-95">
                  Quero esse pacote →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// PRICING
// ─────────────────────────────────────────────

const PLANS = [
  { name:'Básico', medal:'🥉', price:97, cap:'Até 1.000 pedidos / mês', desc:'Ideal pra lanchonetes e cafeterias pequenas', accent:'#84cc16', cta:'Começar com Básico',
    features:['Sistema completo de gestão','Cardápio digital com QR Code','Painel do motoboy','Suporte por WhatsApp','Implementação gratuita'] },
  { name:'Pro', medal:'🥈', price:197, cap:'Até 3.000 pedidos / mês', desc:'Ideal pra restaurantes com movimento médio', accent:'#22c55e', cta:'Quero o Pro', highlight:true,
    features:['Tudo do Básico','Integração iFood automática','Relatórios financeiros completos','Alerta de estoque inteligente','Treinamento personalizado','Suporte prioritário em até 30 min'] },
  { name:'Premium', medal:'🥇', price:297, cap:'Até 6.000 pedidos / mês', desc:'Ideal pra redes com múltiplas unidades', accent:'#0a0a0a', cta:'Quero o Premium',
    features:['Tudo do Pro','Múltiplas unidades / filiais','Dashboard de previsão de vendas','Campanhas WhatsApp automáticas','Suporte premium em até 15 min','Onboarding 1-a-1 com o time'] },
];

function Pricing() {
  return (
    <section id="planos" className="relative py-24">
      <div className="max-w-7xl mx-auto px-5">
        <SectionHeader tag="07 · Planos" bold="Planos simples e honestos." gray="Sem letrinha pequena."
          kicker="Pagamento via Stripe ou WhatsApp. Sem fidelidade. Cancela direto no painel. Todos os planos começam com 10 dias de trial grátis." />
        <div className="grid md:grid-cols-3 gap-5 items-stretch pt-3">
          {PLANS.map((p) => (
            <div key={p.name} className={`relative ${p.highlight ? '-mt-3 md:-mt-6' : ''}`}>
              {p.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-[#0a0a0a] text-white text-[10px] font-black uppercase tracking-widest">
                  🔥 Mais escolhido
                </div>
              )}
              <div className={`cz-card cz-card-lg p-7 flex flex-col h-full relative overflow-hidden ${p.highlight ? 'shadow-lg ring-2 ring-green-500 ring-offset-2 ring-offset-[#ededed]' : ''}`}>
                {p.highlight && <div className="absolute -right-8 -top-8 blob-float opacity-90"><GreenBlob size={120} seed={50} /></div>}
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1"><span className="text-xl">{p.medal}</span><h3 className="text-xl font-black tracking-tight text-[#0a0a0a]">{p.name}</h3></div>
                  <p className="text-[12px] text-gray-500 mb-5">{p.desc}</p>
                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className="text-sm font-bold text-gray-400">R$</span>
                    <span className="text-5xl font-black tnum text-[#0a0a0a] tracking-tight">{p.price}</span>
                    <span className="text-sm text-gray-400">/ mês</span>
                  </div>
                  <p className="text-[11px] uppercase tracking-widest font-black mb-5" style={{color:p.accent}}>{p.cap}</p>
                  <ul className="space-y-2 mb-6 flex-1">
                    {p.features.map((f,i)=><li key={i} className="flex items-start gap-2 text-[13px] text-gray-700"><span className="text-green-500 shrink-0 mt-0.5 font-black">✓</span><span className="text-pretty">{f}</span></li>)}
                  </ul>
                  <a href={waLink(`Quero assinar o plano ${p.name} do ZapFome`)} target="_blank" rel="noopener noreferrer"
                     className={`block text-center px-4 py-3.5 rounded-full font-black text-[13px] transition active:scale-95 ${p.highlight ? 'bg-[#0a0a0a] hover:bg-gray-800 text-white' : 'bg-[#fafafa] hover:bg-gray-100 text-[#0a0a0a] border border-gray-200'}`}>
                    {p.cta} →
                  </a>
                  <p className="text-center text-[10px] text-gray-400 mt-3">💳 Stripe ou Pix · sem fidelidade</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-10 cz-card px-6 py-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-gray-500">
          {['🔒 Pagamento seguro Stripe','✓ Dados protegidos (LGPD)','✓ Servidores no Brasil','✓ Suporte 100% em PT-BR'].map(t=><span key={t} className="flex items-center gap-1.5">{t}</span>)}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// OBJECTIONS
// ─────────────────────────────────────────────

const OBJECTIONS = [
  { q:'"Mas é muito caro pra mim..."', short:'É caro?', e:'💰', metric:{l:'Sistema se pagou em',v:'7 dias'},
    a:['Entendo. Mas pensa comigo: você tá perdendo quanto por mês em produto que estraga no estoque? Quanto em pedido que se perde?',
       'No meu restaurante, só o controle de estoque economizou R$ 1.200 no primeiro mês. O sistema se pagou 4x.',
       'E você testa 10 dias grátis. Se não valer a pena, é só cancelar — sem burocracia, sem pegadinha.'] },
  { q:'"Não tenho movimento suficiente..."', short:'Pouco movimento', e:'📉', metric:{l:'Plano Básico',v:'R$ 97'},
    a:['Justamente por isso você precisa. Quando o movimento é pequeno, cada pedido perdido dói muito mais.',
       'O ZapFome não é pra quem já tá ganhando R$ 100k/mês — é pra quem quer chegar lá sem virar escravo do próprio negócio.',
       'O plano Básico custa R$ 97/mês — menos que o prejuízo de UM ÚNICO sábado sem controle.'] },
  { q:'"É mais um custo fixo que eu não posso ter agora..."', short:'Custo fixo', e:'🧾', metric:{l:'Custo real do caos',v:'~R$4.180/mês'},
    a:['Eu pensava assim também. Até perceber que o verdadeiro custo tava nas 3 horas por dia que eu perdia.',
       'Quando você soma tudo isso, o "custo" de não ter controle é muito maior que R$ 97/mês.',
       'E se você testar e sentir que não vale, cancela no trial — sem compromisso.'] },
  { q:'"E se der problema no meio do expediente?"', short:'E se travar?', e:'⚡', metric:{l:'Uptime · 30 dias',v:'99,8%'},
    a:['O ZapFome foi construído pra ser rápido e estável — já roda no meu restaurante há 30 dias, inclusive em sábado à noite.',
       'E se algo travar, você tem suporte prioritário por WhatsApp. Não é chatbot. É gente que entende de restaurante.'] },
  { q:'"Meu time não vai saber usar..."', short:'Time não usa', e:'🧑‍🍳', metric:{l:'Tempo de treinamento',v:'10–15 min'},
    a:['Essa foi minha maior preocupação. Por isso o ZapFome é direto ao ponto — sem tela escondida.',
       'Se o seu time sabe usar WhatsApp, ele vai saber usar o ZapFome.',
       'E a gente faz treinamento gratuito com você e sua equipe até todo mundo dominar.'] },
];

function Objections() {
  const [active, setActive] = useState(0);
  const o = OBJECTIONS[active];
  return (
    <section className="relative py-24 bg-[#f5f5f5]">
      <div className="max-w-7xl mx-auto px-5">
        <SectionHeader tag="08 · Objeções" bold={`"Mas e se...?"`} gray="Sem rodeio, vamos falar disso." />
        <div className="grid lg:grid-cols-[300px_1fr] gap-4">
          <div className="space-y-2">
            {OBJECTIONS.map((it, i) => (
              <button key={i} onClick={() => setActive(i)}
                className={`w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition ${active === i ? 'bg-[#0a0a0a] border-[#0a0a0a] text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}>
                <span className="text-lg shrink-0">{it.e}</span>
                <span className="flex-1 text-[13px] font-bold truncate">{it.short}</span>
                <span className="text-[10px] font-black tnum tracking-widest opacity-60">0{i+1}</span>
              </button>
            ))}
          </div>
          <div className="cz-card cz-card-lg p-7 md:p-10 min-h-[360px] flex flex-col relative overflow-hidden">
            <div className="absolute -right-8 -top-8 blob-float opacity-80"><GreenBlob size={120} seed={60 + active} /></div>
            <div className="relative">
              <div className="flex items-start justify-between gap-4 mb-6 pb-5 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <span className="w-12 h-12 rounded-2xl bg-[#fafafa] border border-gray-100 flex items-center justify-center text-2xl">{o.e}</span>
                  <h3 className="text-xl md:text-2xl font-black text-[#0a0a0a] leading-tight text-pretty">{o.q}</h3>
                </div>
                <div className="hidden sm:block text-right shrink-0">
                  <p className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">{o.metric.l}</p>
                  <p className="text-xl font-black text-green-600 tnum">{o.metric.v}</p>
                </div>
              </div>
              <div className="space-y-4 text-[15px] text-gray-600 leading-relaxed text-pretty">
                {o.a.map((p, i) => <p key={i} className={i === 0 ? 'text-[#0a0a0a]' : ''}>{p}</p>)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// GUARANTEE
// ─────────────────────────────────────────────

function Guarantee() {
  return (
    <section id="garantia" className="relative py-20">
      <div className="max-w-5xl mx-auto px-5">
        <div className="cz-card cz-card-lg p-8 md:p-12 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 blob-float opacity-95"><GreenBlob size={260} seed={70} /></div>
          <div className="absolute right-32 top-24 blob-float opacity-80" style={{animationDelay:'1.5s'}}><GreenBlob size={90} seed={71} /></div>
          <div className="relative grid md:grid-cols-[180px_1fr] gap-8 items-center">
            <div className="flex justify-center md:justify-start">
              <div className="w-40 h-40">
                <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-[0_8px_30px_rgba(34,197,94,0.3)]">
                  <defs>
                    <linearGradient id="shieldGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" /><stop offset="100%" stopColor="#16a34a" />
                    </linearGradient>
                  </defs>
                  <path d="M80 8 L140 32 L140 80 Q140 130 80 152 Q20 130 20 80 L20 32 Z" fill="url(#shieldGrad2)" stroke="#86efac" strokeWidth="1.5" />
                  <path d="M80 16 L132 36 L132 80 Q132 124 80 144 Q28 124 28 80 L28 36 Z" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="3 2" />
                  <text x="80" y="78" textAnchor="middle" fontSize="40" fontWeight="900" fill="#ffffff" fontFamily="Inter">10</text>
                  <text x="80" y="98" textAnchor="middle" fontSize="11" fontWeight="900" fill="#dcfce7" letterSpacing="3" fontFamily="Inter">DIAS</text>
                  <text x="80" y="118" textAnchor="middle" fontSize="9" fontWeight="700" fill="#bbf7d0" letterSpacing="2" fontFamily="Inter">GARANTIA</text>
                </svg>
              </div>
            </div>
            <div>
              <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-[10px] font-black uppercase tracking-widest text-green-600 mb-4">
                🛡️ Garantia total
              </span>
              <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-[1.05] text-balance">
                <span className="text-[#0a0a0a]">Teste por 10 dias.</span><br/>
                <span className="text-gray-400">Sem risco. Sem pegadinha.</span>
              </h2>
              <p className="mt-4 text-[15px] text-gray-600 leading-relaxed text-pretty max-w-xl">
                <b className="text-[#0a0a0a]">3 dias no Premium</b> + <b className="text-[#0a0a0a]">7 dias no Pro</b>.
                Se não valer a pena, cancela pelo próprio painel. Sem ligação de retenção, sem pressão.
                <b className="text-green-600"> Simples assim.</b>
              </p>
              <div className="mt-5 grid grid-cols-3 gap-2 text-[11px]">
                {[['🚫','Sem cartão'],['🚫','Sem fidelidade'],['🚫','Sem pegadinha']].map(([e,l])=>(
                  <div key={l} className="rounded-2xl bg-[#fafafa] border border-gray-100 p-3 text-center">
                    <p className="text-2xl">{e}</p><p className="font-bold text-[#0a0a0a] mt-1">{l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// URGENCY (light theme)
// ─────────────────────────────────────────────

function useCountdown(targetMs) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, targetMs - now);
  const totalSec = Math.floor(diff / 1000);
  return { h: Math.floor(totalSec / 3600), m: Math.floor((totalSec % 3600) / 60), s: totalSec % 60 };
}

function Urgency() {
  const target = useMemo(() => {
    const key = 'zf_urgency_target';
    const saved = Number(localStorage.getItem(key));
    if (saved && saved > Date.now()) return saved;
    const t = Date.now() + 48 * 3600 * 1000;
    localStorage.setItem(key, String(t));
    return t;
  }, []);
  const { h, m, s } = useCountdown(target);

  return (
    <section className="relative py-20 bg-[#f5f5f5]">
      <div className="max-w-5xl mx-auto px-5">
        <div className="cz-card cz-card-lg p-8 md:p-10 overflow-hidden border-orange-200 relative">
          <div className="absolute -right-8 -top-8 blob-float opacity-70"><GreenBlob size={140} seed={80} /></div>
          <div className="relative grid md:grid-cols-[1fr_280px] gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-orange-50 border border-orange-200 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 pulse-glow-g" />
                <span className="text-[10px] font-black uppercase tracking-widest text-orange-500">⏰ Bônus 48h</span>
              </div>
              <h2 className="text-2xl md:text-4xl font-black tracking-tight leading-[1.05] text-balance text-[#0a0a0a]">
                Ativando o trial nas próximas 48h,{' '}
                <span className="text-green-600">você ganha 3 extras.</span>
              </h2>
              <ul className="mt-6 space-y-2.5 text-[14px] text-gray-700">
                {[['🚀','Implementação expressa do cardápio em 12h (em vez de 24h)'],['💬','1 mês de suporte premium estendido (resposta em até 15min)'],['🔮','Acesso antecipado: dashboard de previsão de vendas + campanhas WhatsApp automáticas']].map(([e,t],i)=>(
                  <li key={i} className="flex items-start gap-3"><span className="text-lg shrink-0">{e}</span><span className="text-pretty leading-relaxed">{t}</span></li>
                ))}
              </ul>
              <p className="mt-5 text-[12.5px] text-gray-400 italic text-pretty">
                Depois desse prazo, a implementação volta ao padrão de 24h e o suporte estendido sai da oferta.
              </p>
            </div>
            <div className="cz-card p-5 border-orange-200">
              <p className="text-center text-[10px] font-black uppercase tracking-widest text-orange-500 mb-3">Tempo restante</p>
              <div className="grid grid-cols-3 gap-2 mb-5">
                {[['HORAS',h],['MIN',m],['SEG',s]].map(([l,v])=>(
                  <div key={l} className="rounded-xl bg-[#fafafa] border border-gray-200 p-3 text-center">
                    <div className="text-4xl font-black tnum text-[#0a0a0a] leading-none">{String(v).padStart(2,'0')}</div>
                    <div className="mt-1.5 text-[8px] font-black uppercase tracking-widest text-gray-400">{l}</div>
                  </div>
                ))}
              </div>
              <a href={waLink('Quero o bônus de 48h do ZapFome')} target="_blank" rel="noopener noreferrer"
                 className="block text-center px-4 py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-black text-sm transition shadow-lg shadow-orange-200 active:scale-95">
                Garantir bônus →
              </a>
              <p className="text-center text-[10px] text-gray-400 mt-2.5">relógio tá correndo</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// FAQ
// ─────────────────────────────────────────────

const FAQS = [
  { q:'Quanto tempo eu preciso pra aprender o sistema?', a:'10 a 15 minutos pra entender o básico. A gente faz um treinamento rápido por vídeo ou chamada, e você já sai usando.' },
  { q:'Serve pra quem tá começando do zero ou só pra quem já tem sistema?', a:'Serve pra ambos. Se você ainda anota pedido no papel, o ZapFome vai ser um salto gigante. Se você já usa outro sistema, a gente te ajuda a migrar.' },
  { q:'E se eu não gostar? Como funciona o cancelamento?', a:'Cancela direto no painel — sem burocracia, sem ligação, sem pressão. Durante os 10 dias de trial, você não paga nada.' },
  { q:'Como funciona o acesso? Já começo a usar no mesmo dia?', a:'Sim. Você se cadastra, acessa o painel, e a gente agenda a implementação do cardápio nas próximas 24h. A partir daí, é só começar a receber pedidos.' },
  { q:'Tem suporte? Como funciona?', a:'Suporte prioritário por WhatsApp. Não é chatbot, não é fila de horas. É gente que entende de restaurante respondendo rápido.' },
  { q:'Funciona sem internet?', a:'O sistema precisa de internet pra funcionar. Mas você pode usar dados móveis se a internet cair — o app é leve e funciona até em 3G.' },
  { q:'Quais formas de pagamento vocês aceitam?', a:'Cartão de crédito via Stripe (parcelado em até 12x) ou pagamento direto via WhatsApp (Pix à vista).' },
  { q:'O sistema integra com iFood? E outros apps de delivery?', a:'Sim. A integração com iFood já vem inclusa. Integrações com Rappi e Uber Eats estão no roadmap pra próximos 60 dias.' },
];

function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="relative py-24">
      <div className="max-w-4xl mx-auto px-5">
        <SectionHeader tag="09 · FAQ" bold="Perguntas" gray="que todo mundo faz." />
        <div className="space-y-2">
          {FAQS.map((f, i) => (
            <div key={i} className={`cz-card transition ${open === i ? 'border-green-300' : 'hover:border-gray-300'}`}>
              <button onClick={() => setOpen(open === i ? -1 : i)} className="w-full px-6 py-5 flex items-center gap-4 text-left">
                <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition ${open === i ? 'bg-green-500 text-white rotate-45' : 'bg-[#fafafa] border border-gray-200 text-gray-500'}`}>+</span>
                <span className="flex-1 text-[15px] font-black text-[#0a0a0a] leading-snug text-pretty">{f.q}</span>
              </button>
              {open === i && <div className="px-6 pb-5 pl-[68px] text-[14px] text-gray-600 leading-relaxed text-pretty">{f.a}</div>}
            </div>
          ))}
        </div>
        <div className="mt-8 cz-card p-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💬</span>
            <p className="text-[13px] text-gray-700">Ficou alguma dúvida? Fala com a gente direto no WhatsApp.</p>
          </div>
          <a href={waLink('Tenho uma dúvida sobre o ZapFome')} target="_blank" rel="noopener noreferrer"
             className="px-4 py-2.5 rounded-full bg-[#0a0a0a] hover:bg-gray-800 text-white font-black text-[13px] transition active:scale-95">
            Falar no WhatsApp →
          </a>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// CTA FINAL
// ─────────────────────────────────────────────

function CTAFinal() {
  return (
    <section className="relative py-28">
      <div className="max-w-5xl mx-auto px-5">
        <SectionHeader tag="10 · Sua escolha" bold="Você tem duas escolhas" gray="agora." />
        <div className="grid md:grid-cols-2 gap-4">
          <div className="cz-card cz-card-lg p-8 relative overflow-hidden">
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-xl">😩</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-rose-500">Opção 1 · seguir igual</span>
              </div>
              <h3 className="text-xl font-black text-[#0a0a0a] leading-tight mb-5">Continuar do jeito que tá.</h3>
              <ul className="space-y-2 text-[13.5px] text-gray-600 leading-relaxed">
                {['Perdendo pedido entre cozinha e salão','Gastando 3 horas/dia fechando caixa','Sem saber quanto ganha em cada produto','Brigando com letra de garçom','Esquecendo de comprar mantimento'].map((t,i)=>(
                  <li key={i} className="flex gap-2"><span className="text-rose-400 shrink-0 font-black">✗</span><span>{t}</span></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="cz-card cz-card-lg p-8 relative overflow-hidden ring-2 ring-green-500 ring-offset-2 ring-offset-[#ededed]">
            <div className="absolute -right-10 -top-10 blob-float"><GreenBlob size={160} seed={90} /></div>
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-10 h-10 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center text-xl">🚀</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-green-600">Opção 2 · 10 dias grátis</span>
              </div>
              <h3 className="text-xl font-black text-[#0a0a0a] leading-tight mb-5">Testar o ZapFome — sem cartão.</h3>
              <ul className="space-y-2 text-[13.5px] text-gray-700 leading-relaxed">
                {['Pedidos organizados em tempo real','Estoque que baixa e avisa sozinho','Financeiro que fecha automaticamente','Cardápio digital pronto em 24h','3 horas de volta no seu dia'].map((t,i)=>(
                  <li key={i} className="flex gap-2"><span className="text-green-500 shrink-0 font-black">✓</span><span>{t}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-14 text-center">
          <p className="text-[15px] text-gray-600 max-w-2xl mx-auto leading-relaxed text-pretty mb-8">
            Você não precisa decidir agora se vai ficar com o sistema. Só precisa decidir se{' '}
            <b className="text-[#0a0a0a]">vale a pena testar</b>. E o teste é grátis, sem cartão, sem compromisso.
          </p>
          <a href={waLink('Quero testar 10 dias grátis agora')} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center justify-center gap-3 px-10 py-5 rounded-full bg-[#0a0a0a] hover:bg-gray-800 text-white font-black text-[17px] transition active:scale-95">
            🚀 Quero testar 10 dias grátis agora →
          </a>
          <div className="mt-5 flex flex-wrap justify-center items-center gap-x-5 gap-y-1.5 text-[12px] text-gray-500">
            {['Acesso imediato','Implementação gratuita','Sem cartão de crédito'].map(t=>(
              <span key={t} className="flex items-center gap-1.5"><span className="text-green-500 font-black">✓</span> {t}</span>
            ))}
          </div>
        </div>

        <div className="mt-16 cz-card cz-card-lg p-8 md:p-10 relative overflow-hidden">
          <div className="absolute -left-4 -top-2 text-[180px] font-black text-gray-100 leading-none select-none pointer-events-none">PS</div>
          <div className="relative flex items-start gap-5">
            <div className="hidden sm:block shrink-0">
              <div className="w-14 h-14 rounded-2xl bg-[#0a0a0a] flex items-center justify-center text-2xl shadow-lg">⚡</div>
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-green-600 mb-3">PS · Carta do fundador</p>
              <div className="space-y-3 text-[15px] text-gray-700 leading-relaxed text-pretty">
                <p>Eu criei o ZapFome porque vivi o caos de não ter controle. Sábado de restaurante lotado, pedido perdido, estoque que acaba no meio do expediente, 3 horas fechando caixa de madrugada.</p>
                <p>Quando automatizei tudo, economizei <b className="text-[#0a0a0a]">R$ 1.200 no primeiro mês</b> só de controle de estoque. Parei de perder pedido. Ganhei <b className="text-[#0a0a0a]">3 horas por dia de volta</b>.</p>
                <p className="text-[#0a0a0a]">Esse sistema existe porque <b>EU precisava dele.</b></p>
                <p>Se você também precisa, testa. 10 dias grátis. Sem risco. Sem enrolação. E se começar nas próximas 48 horas, ganha implementação expressa + suporte estendido. <span className="text-green-600 font-bold">O relógio tá correndo.</span></p>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center text-base">👨‍🍳</span>
                <div>
                  <p className="text-[13px] font-black text-[#0a0a0a]">Klebson</p>
                  <p className="text-[11px] text-gray-500">Fundador · ZapFome · Torres / RS</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// FOOTER + STICKY WA
// ─────────────────────────────────────────────

function Footer() {
  return (
    <footer className="relative pt-12 pb-10">
      <div className="max-w-7xl mx-auto px-5">
        <div className="cz-card cz-card-lg p-8 md:p-10">
          <div className="grid md:grid-cols-[1.5fr_1fr_1fr_1fr] gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-9 h-9 rounded-xl bg-[#0a0a0a] text-white flex items-center justify-center text-base">⚡</span>
                <span className="text-lg font-black tracking-tight text-[#0a0a0a]">ZapFome</span>
              </div>
              <p className="text-[13px] text-gray-500 leading-relaxed max-w-xs">
                Sistema brasileiro de gestão pra restaurantes, lanchonetes, padarias, cafeterias e açaiterias. Feito por quem opera no balcão.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <a href={waLink()} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 text-[12px] font-bold transition">
                  💬 WhatsApp
                </a>
                <a href="mailto:contato@zapfome.com.br"
                   className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#fafafa] hover:bg-gray-100 border border-gray-200 text-gray-700 text-[12px] font-bold transition">
                  ✉️ Email
                </a>
              </div>
            </div>
            {[
              { h:'Produto', l:[['Recursos','#beneficios'],['Como funciona','#solucao'],['Planos','#planos'],['FAQ','#faq']] },
              { h:'Pra quem', l:[['Hamburguerias','#'],['Cafeterias','#'],['Padarias','#'],['Pizzarias','#'],['Açaiterias','#']] },
              { h:'Empresa', l:[['Sobre','#'],['Política de Privacidade','#'],['Termos de Uso','#'],['LGPD','#']] },
            ].map(col => (
              <div key={col.h}>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">{col.h}</h4>
                <ul className="space-y-2">
                  {col.l.map(([t,h])=><li key={t}><a href={h} className="text-[13px] text-gray-700 hover:text-green-600 transition">{t}</a></li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-gray-400">© 2026 ZapFome · Torres / RS · Brasil 🇧🇷 · Todos os direitos reservados.</p>
            <div className="flex items-center gap-4 text-[11px] text-gray-400">
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500 pulse-glow-g" />Status: Operacional</span>
              <span>·</span>
              <span>Feito com ⚡ no balcão</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function StickyWA() {
  const [tip, setTip] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setTip(true), 4000);
    return () => clearTimeout(id);
  }, []);
  return (
    <a href={waLink()} target="_blank" rel="noopener noreferrer"
       className="fixed bottom-5 right-5 z-50 flex items-center gap-3">
      {tip && (
        <span className="cz-card shadow-xl px-3 py-2 text-[12px] text-[#0a0a0a] font-bold fade-slide-in whitespace-nowrap" style={{ borderRadius: 16 }}>
          💬 Fale com a gente
        </span>
      )}
      <span className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-400 transition flex items-center justify-center shadow-[0_10px_30px_-5px_rgba(34,197,94,0.6)] active:scale-95">
        <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0a12 12 0 00-10.4 18l-1.6 6 6.2-1.6A12 12 0 1012 0zm5.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.8 1-1 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5 0-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.5 1.1 2.9 1.2 3 2.1 3.3 5.1 4.6c.7.3 1.3.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.1-1.4-.1-.1-.3-.2-.5-.3z"/>
        </svg>
      </span>
    </a>
  );
}

// ─────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: '#ededed', color: '#0a0a0a', fontFamily: "Inter, 'SF Pro Display', -apple-system, sans-serif" }}>
      <Nav />
      <main>
        <Hero />
        <Pain />
        <Solution />
        <Benefits />
        <Stats />
        <Testimonial />
        <Offer />
        <Pricing />
        <Objections />
        <Guarantee />
        <Urgency />
        <FAQ />
        <CTAFinal />
      </main>
      <Footer />
      <StickyWA />
    </div>
  );
}
