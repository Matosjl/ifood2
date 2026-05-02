/**
 * CardapioPublico.jsx — Página pública do restaurante (domínio próprio)
 * ────────────────────────────────────────────────────────────────────────────
 * Design premium com:
 *  • Hero fullscreen com gradiente baseado na cor do restaurante
 *  • Foto de capa e logo do restaurante
 *  • Info-bar (rating, tempo, taxa de entrega, categoria)
 *  • Sticky nav de categorias com pill ativo
 *  • Cards de produto com foto, descrição e controle de quantidade
 *  • Carrinho flutuante animado
 *  • Drawer de checkout completo (nome, tel, pagamento)
 *  • Tela de sucesso animada
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

const fmtR = (n) => `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;

// ── Paletas por categoria ────────────────────────────────────────────────────
const PALETTE = {
  pizza:     { from: "#7c2d12", to: "#1c1917", accent: "#f97316" },
  burger:    { from: "#713f12", to: "#1c1917", accent: "#f59e0b" },
  sushi:     { from: "#0c4a6e", to: "#0f172a", accent: "#38bdf8" },
  japonesa:  { from: "#0c4a6e", to: "#0f172a", accent: "#38bdf8" },
  árabe:     { from: "#064e3b", to: "#0f172a", accent: "#34d399" },
  arabe:     { from: "#064e3b", to: "#0f172a", accent: "#34d399" },
  italiana:  { from: "#7f1d1d", to: "#1c1917", accent: "#fca5a5" },
  brasileira:{ from: "#14532d", to: "#052e16", accent: "#4ade80" },
  lanches:   { from: "#713f12", to: "#1c1917", accent: "#fbbf24" },
  default:   { from: "#18181b", to: "#09090b", accent: "#22c55e" },
};

const getPalette = (categoria) => {
  if (!categoria) return PALETTE.default;
  const key = categoria.toLowerCase();
  return Object.entries(PALETTE).find(([k]) => key.includes(k))?.[1] ?? PALETTE.default;
};

// ── Estrelas ────────────────────────────────────────────────────────────────
const Stars = ({ rating = 4.8 }) => (
  <span className="flex items-center gap-0.5">
    {[1,2,3,4,5].map(i => (
      <svg key={i} className="w-3 h-3" viewBox="0 0 20 20" fill={i <= Math.round(rating) ? "#fbbf24" : "#3f3f46"}>
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
      </svg>
    ))}
    <span className="text-[11px] text-zinc-400 ml-0.5">{rating}</span>
  </span>
);

// ── Pill de info ─────────────────────────────────────────────────────────────
const InfoPill = ({ icon, text, accent }) => (
  <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-white/8 border border-white/10 text-zinc-300">
    <span style={{ color: accent }}>{icon}</span>
    {text}
  </span>
);

// ── Badge de desconto ────────────────────────────────────────────────────────
const DiscountBadge = ({ pct }) => (
  <span className="absolute top-2 left-2 text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500 text-white z-10">
    -{pct}% OFF
  </span>
);

// ── Card de item ─────────────────────────────────────────────────────────────
const ItemCard = ({ item, qtd, onAdd, onDec, accent }) => {
  const esgotado = (item.quantidade ?? item.stock ?? Infinity) <= 0;
  const preco    = item.salePrice || item.precoVenda || 0;
  const [imgErr, setImgErr] = useState(false);
  const foto = !imgErr && (item.foto || item.photo);

  return (
    <div className={`group relative flex gap-3 p-3 rounded-2xl border transition-all cursor-default ${
      esgotado
        ? "border-white/5 opacity-40"
        : qtd > 0
          ? "border-white/15 bg-white/4 shadow-lg"
          : "border-white/8 hover:border-white/15 hover:bg-white/3"
    }`}>
      {/* Foto */}
      <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-white/5">
        {foto ? (
          <img
            src={foto}
            alt={item.name || item.nome}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl">🍽</div>
        )}
        {item.destaque && <DiscountBadge pct={10} />}
        {esgotado && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-[10px] font-bold text-red-400 border border-red-400/40 rounded-full px-2 py-0.5">ESGOTADO</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <div className="flex items-start justify-between gap-1">
            <p className="text-sm font-semibold text-white leading-tight truncate pr-1">
              {item.name || item.nome}
            </p>
            {item.destaque && (
              <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: `${accent}20`, color: accent, border: `1px solid ${accent}30` }}>
                ⭐ Destaque
              </span>
            )}
          </div>
          {item.descricao && (
            <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed line-clamp-2">{item.descricao}</p>
          )}
        </div>

        <div className="flex items-center justify-between mt-1.5">
          <span className="text-sm font-bold" style={{ color: accent }}>{fmtR(preco)}</span>

          {!esgotado && (
            qtd > 0 ? (
              <div className="flex items-center gap-0 border border-white/15 rounded-xl overflow-hidden">
                <button
                  onClick={onDec}
                  className="w-8 h-7 flex items-center justify-center text-zinc-300 hover:bg-white/10 text-base font-light transition-colors"
                >−</button>
                <span className="w-7 text-center text-sm font-bold text-white">{qtd}</span>
                <button
                  onClick={onAdd}
                  className="w-8 h-7 flex items-center justify-center hover:bg-white/10 text-base font-light transition-colors"
                  style={{ color: accent }}
                >+</button>
              </div>
            ) : (
              <button
                onClick={onAdd}
                className="h-7 px-3 rounded-xl text-xs font-bold transition-all active:scale-95 border"
                style={{
                  borderColor: `${accent}50`,
                  color: accent,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = accent;
                  e.currentTarget.style.color = "#000";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = accent;
                }}
              >
                + Adicionar
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
};

// ── Drawer do carrinho ───────────────────────────────────────────────────────
const CartDrawer = ({
  carrinho, onClose, onFinalizar, accent,
  clienteNome, setClienteNome,
  clienteTel, setClienteTel,
  tipo, setTipo,
  pagamento, setPagamento,
  observacao, setObservacao,
  enviando, erroEnvio,
}) => {
  const total    = carrinho.reduce((s, i) => s + (i.salePrice || 0) * i.qtd, 0);
  const PGTOS    = [
    { id: "pix",      icon: "◈", label: "PIX" },
    { id: "dinheiro", icon: "💵", label: "Dinheiro" },
    { id: "cartão de crédito", icon: "💳", label: "Crédito" },
    { id: "cartão de débito",  icon: "💳", label: "Débito" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md mx-auto flex flex-col shadow-2xl"
        style={{ maxHeight: "92vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="absolute -top-4 inset-x-0 flex justify-center pointer-events-none">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="bg-[#111] border border-white/10 rounded-t-3xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
            <div>
              <h2 className="text-base font-bold text-white">Seu pedido</h2>
              <p className="text-xs text-zinc-500">{carrinho.length} ite{carrinho.length === 1 ? "m" : "ns"}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/8 text-zinc-400 hover:bg-white/15 flex items-center justify-center transition-colors">✕</button>
          </div>

          <div className="overflow-y-auto flex-1">
            {/* Itens */}
            <div className="px-5 pt-4 flex flex-col gap-3">
              {carrinho.map(item => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-lg shrink-0 overflow-hidden">
                    {item.foto || item.photo
                      ? <img src={item.foto || item.photo} alt="" className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display="none"; }}/>
                      : "🍽"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.name || item.nome}</p>
                    <p className="text-xs text-zinc-500">{fmtR(item.salePrice || 0)} × {item.qtd}</p>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: accent }}>
                    {fmtR((item.salePrice || 0) * item.qtd)}
                  </span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="mx-5 my-4 flex justify-between items-center border-t border-white/10 pt-3">
              <span className="text-sm text-zinc-400">Total</span>
              <span className="text-xl font-bold" style={{ color: accent }}>{fmtR(total)}</span>
            </div>

            <div className="px-5 pb-5 flex flex-col gap-4">
              {/* Tipo de pedido */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Tipo de pedido</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "retirada", label: "🏪 Retirada" },
                    { id: "entrega",  label: "🛵 Entrega" },
                  ].map(t => (
                    <button key={t.id} onClick={() => setTipo(t.id)}
                      className={`py-2 rounded-xl text-sm font-semibold transition-all border ${
                        tipo === t.id
                          ? "text-black border-transparent"
                          : "bg-white/5 border-white/10 text-zinc-400 hover:border-white/25"
                      }`}
                      style={tipo === t.id ? { background: accent } : {}}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dados do cliente */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Seus dados</p>
                <input
                  type="text" value={clienteNome} onChange={e => setClienteNome(e.target.value)}
                  placeholder="Seu nome (opcional)"
                  className="w-full bg-white/5 border border-white/10 rounded-xl text-white text-sm px-4 py-2.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
                />
                <input
                  type="tel" value={clienteTel} onChange={e => setClienteTel(e.target.value)}
                  placeholder="Telefone para contato"
                  className="w-full bg-white/5 border border-white/10 rounded-xl text-white text-sm px-4 py-2.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
                />
                <textarea
                  value={observacao} onChange={e => setObservacao(e.target.value)}
                  placeholder="Observações (opcional)"
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl text-white text-sm px-4 py-2.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600 resize-none"
                />
              </div>

              {/* Pagamento */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Pagamento</p>
                <div className="grid grid-cols-2 gap-2">
                  {PGTOS.map(p => (
                    <button key={p.id} onClick={() => setPagamento(p.id)}
                      className={`py-2 rounded-xl text-xs font-semibold transition-all border flex items-center justify-center gap-1.5 ${
                        pagamento === p.id
                          ? "text-black border-transparent"
                          : "bg-white/5 border-white/10 text-zinc-400 hover:border-white/25"
                      }`}
                      style={pagamento === p.id ? { background: accent } : {}}>
                      <span>{p.icon}</span>{p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Erro */}
              {erroEnvio && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                  <p className="text-xs text-red-400">{erroEnvio}</p>
                </div>
              )}
            </div>
          </div>

          {/* CTA fixo no fundo */}
          <div className="px-5 pb-6 pt-3 border-t border-white/8 shrink-0">
            <button
              onClick={onFinalizar}
              disabled={enviando}
              className="w-full py-4 rounded-2xl text-black text-base font-bold transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg"
              style={{ background: accent, boxShadow: `0 8px 24px ${accent}30` }}
            >
              {enviando ? "Enviando…" : `Pedir agora · ${fmtR(total)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Tela de sucesso ──────────────────────────────────────────────────────────
const SuccessScreen = ({ accent, onReset }) => (
  <div className="min-h-screen bg-[#080808] flex items-center justify-center">
    <div className="text-center flex flex-col items-center gap-5 px-6">
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center text-5xl animate-bounce"
        style={{ background: `${accent}20`, border: `2px solid ${accent}40` }}
      >
        🎉
      </div>
      <div>
        <h2 className="text-2xl font-bold text-white">Pedido enviado!</h2>
        <p className="text-zinc-500 text-sm mt-2">Aguarde a confirmação do restaurante.<br/>Você receberá as atualizações em breve.</p>
      </div>
      <div
        className="flex flex-col gap-2 bg-white/4 border border-white/10 rounded-2xl px-6 py-4 text-sm text-zinc-400 w-full max-w-xs text-left"
      >
        <div className="flex items-center gap-2"><span style={{ color: accent }}>✓</span> Pedido recebido pelo restaurante</div>
        <div className="flex items-center gap-2 opacity-50"><span>⏳</span> Em preparo</div>
        <div className="flex items-center gap-2 opacity-50"><span>🛵</span> Saindo para entrega</div>
      </div>
      <button
        onClick={onReset}
        className="px-6 py-2.5 rounded-xl border border-white/10 text-zinc-400 text-sm hover:border-white/25 hover:text-white transition-colors"
      >
        Fazer outro pedido
      </button>
    </div>
  </div>
);

// ── Skeleton de loading ──────────────────────────────────────────────────────
const LoadingSkeleton = () => (
  <div className="min-h-screen bg-[#080808] animate-pulse">
    <div className="h-56 sm:h-72 bg-zinc-800" />
    <div className="max-w-xl mx-auto px-4 mt-6 flex flex-col gap-4">
      <div className="h-5 bg-zinc-800 rounded-xl w-1/2" />
      <div className="h-4 bg-zinc-800 rounded-xl w-3/4" />
      <div className="h-10 bg-zinc-800 rounded-xl mt-2" />
      {[1,2,3,4].map(i => (
        <div key={i} className="h-24 bg-zinc-800 rounded-2xl" />
      ))}
    </div>
  </div>
);

// ── Página principal ──────────────────────────────────────────────────────────
export function CardapioPublico() {
  const { id } = useParams();
  const [restaurante, setRestaurante]   = useState(null);
  const [itens, setItens]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [erro, setErro]                 = useState(null);
  const [carrinho, setCarrinho]         = useState([]);
  const [showCart, setShowCart]         = useState(false);
  const [catAtiva, setCatAtiva]         = useState(null);
  const [busca, setBusca]               = useState("");
  const [pedidoEnviado, setPedidoEnviado] = useState(false);
  const [enviando, setEnviando]         = useState(false);
  const [erroEnvio, setErroEnvio]       = useState(null);
  const [clienteNome, setClienteNome]   = useState("");
  const [clienteTel, setClienteTel]     = useState("");
  const [tipo, setTipo]                 = useState("retirada");
  const [pagamento, setPagamento]       = useState("pix");
  const [observacao, setObservacao]     = useState("");
  const catRefs = useRef({});

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const r = await axios.get(`${API}/restaurantes/${id}`);
        setRestaurante(r.data);
        const e = await axios.get(`${API}/estoque/${r.data.id || id}`);
        const arr = Array.isArray(e.data) ? e.data : (e.data?.itens || []);
        const mapped = arr
          .filter(i => (i.ativo !== false))
          .map(i => ({
            ...i,
            name: i.nome,
            salePrice: i.precoVenda,
            category: i.categoria,
          }));
        setItens(mapped);
      } catch {
        setErro("Cardápio não encontrado ou restaurante indisponível.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const categorias = [...new Set(itens.map(i => i.category || i.categoria || "Geral"))];
  const itensFiltrados = busca.trim()
    ? itens.filter(i => (i.name || i.nome || "").toLowerCase().includes(busca.toLowerCase()))
    : itens;
  const grouped = categorias.reduce((acc, cat) => {
    acc[cat] = itensFiltrados.filter(i => (i.category || i.categoria || "Geral") === cat);
    return acc;
  }, {});

  const qtdItem  = (itemId) => carrinho.find(i => i.id === itemId)?.qtd || 0;
  const totalQtd = carrinho.reduce((s, i) => s + i.qtd, 0);
  const totalVal = carrinho.reduce((s, i) => s + (i.salePrice || 0) * i.qtd, 0);

  const addItem = useCallback((item) => {
    setCarrinho(p => {
      const ex = p.find(i => i.id === item.id);
      if (ex) return p.map(i => i.id === item.id ? { ...i, qtd: i.qtd + 1 } : i);
      return [...p, { ...item, qtd: 1 }];
    });
  }, []);

  const decItem = useCallback((item) => {
    setCarrinho(p => {
      const ex = p.find(i => i.id === item.id);
      if (!ex) return p;
      if (ex.qtd === 1) return p.filter(i => i.id !== item.id);
      return p.map(i => i.id === item.id ? { ...i, qtd: i.qtd - 1 } : i);
    });
  }, []);

  const scrollToCat = (cat) => {
    setCatAtiva(cat);
    catRefs.current[cat]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleFinalizar = async () => {
    if (enviando) return;
    setErroEnvio(null);
    setEnviando(true);
    try {
      await axios.post(`${API}/pedidos`, {
        restauranteId:   restaurante?.id || id,
        clienteNome:     clienteNome.trim() || "Cliente Balcão",
        clienteTelefone: clienteTel.trim(),
        tipo,
        pagamento,
        observacao:      observacao.trim(),
        itens: carrinho.map(item => ({
          id:            item.id,
          nome:          item.name || item.nome || "",
          qtd:           item.qtd,
          precoUnitario: item.salePrice || item.precoVenda || 0,
        })),
      });
      setShowCart(false);
      setPedidoEnviado(true);
      setCarrinho([]);
      setClienteNome(""); setClienteTel(""); setObservacao("");
    } catch (err) {
      const msg = err?.response?.data?.detail || "Erro ao enviar pedido.";
      setErroEnvio(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setEnviando(false);
    }
  };

  // ── Estados de loading / erro ──
  if (loading) return <LoadingSkeleton />;

  if (erro) return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center">
      <div className="text-center px-6">
        <p className="text-5xl mb-4">🍽</p>
        <p className="text-white font-semibold text-lg">Restaurante não encontrado</p>
        <p className="text-zinc-500 text-sm mt-2">{erro}</p>
      </div>
    </div>
  );

  if (pedidoEnviado) return (
    <SuccessScreen accent={palette.accent} onReset={() => setPedidoEnviado(false)} />
  );

  const palette = getPalette(restaurante?.categoria);

  // Itens em destaque
  const destaques = itens.filter(i => i.destaque && (i.quantidade ?? Infinity) > 0).slice(0, 6);

  return (
    <div className="min-h-screen text-white pb-32" style={{ background: "#080808" }}>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          minHeight: "280px",
          background: `linear-gradient(135deg, ${palette.from} 0%, ${palette.to} 100%)`,
        }}
      >
        {/* Noise texture overlay */}
        <div className="absolute inset-0 opacity-30"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.4'/%3E%3C/svg%3E\")" }}
        />

        {/* Blur circles decorativos */}
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl opacity-20"
          style={{ background: palette.accent }} />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full blur-3xl opacity-15"
          style={{ background: palette.accent }} />

        {/* Foto de capa do restaurante (se disponível) */}
        {restaurante?.fotoCapa && (
          <img
            src={restaurante.fotoCapa}
            alt="capa"
            className="absolute inset-0 w-full h-full object-cover opacity-25"
          />
        )}

        {/* Gradiente para escurecer na parte inferior */}
        <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-[#080808] to-transparent" />

        {/* Conteúdo do hero */}
        <div className="relative z-10 max-w-xl mx-auto px-5 pt-10 pb-6">
          {/* Logo */}
          <div
            className="w-20 h-20 rounded-2xl border-2 border-white/20 flex items-center justify-center text-4xl shadow-xl overflow-hidden"
            style={{ background: `${palette.to}cc` }}
          >
            {restaurante?.logo
              ? <img src={restaurante.logo} alt="logo" className="w-full h-full object-cover" />
              : <span>🍽</span>
            }
          </div>

          {/* Nome e info */}
          <div className="mt-4">
            <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
              {restaurante?.nome || id}
            </h1>
            {restaurante?.descricao && (
              <p className="text-sm text-white/60 mt-1 leading-relaxed line-clamp-2">
                {restaurante.descricao}
              </p>
            )}
          </div>

          {/* Info pills */}
          <div className="flex flex-wrap gap-2 mt-4">
            <Stars rating={4.8} />
            {restaurante?.tempoEstimado && (
              <InfoPill icon="⏱" text={restaurante.tempoEstimado} accent={palette.accent} />
            )}
            {restaurante?.taxaEntrega != null && (
              <InfoPill
                icon="🛵"
                text={Number(restaurante.taxaEntrega) === 0 ? "Entrega grátis" : `Taxa ${fmtR(restaurante.taxaEntrega)}`}
                accent={palette.accent}
              />
            )}
            {restaurante?.categoria && (
              <InfoPill icon="🍴" text={restaurante.categoria} accent={palette.accent} />
            )}
          </div>
        </div>
      </div>

      {/* ── BUSCA + CATEGORIAS (sticky) ─────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[#080808]/95 backdrop-blur-xl border-b border-white/6">
        {/* Busca */}
        <div className="max-w-xl mx-auto px-4 pt-3 pb-2">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600">🔍</span>
            <input
              type="text" value={busca} onChange={e => { setBusca(e.target.value); setCatAtiva(null); }}
              placeholder={`Buscar em ${restaurante?.nome || "cardápio"}…`}
              className="w-full bg-white/5 border border-white/10 rounded-xl text-white text-sm pl-10 pr-4 py-2.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
            />
            {busca && (
              <button
                onClick={() => setBusca("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 text-sm transition-colors"
              >✕</button>
            )}
          </div>
        </div>

        {/* Nav de categorias */}
        {!busca && categorias.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 px-4 no-scrollbar max-w-xl mx-auto">
            {categorias.map(cat => (
              <button
                key={cat}
                onClick={() => scrollToCat(cat)}
                className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all border"
                style={catAtiva === cat ? {
                  background: `${palette.accent}20`,
                  borderColor: `${palette.accent}50`,
                  color: palette.accent,
                } : {
                  background: "transparent",
                  borderColor: "rgba(255,255,255,0.08)",
                  color: "#71717a",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── DESTAQUES ────────────────────────────────────────────────────── */}
      {!busca && destaques.length > 0 && (
        <div className="max-w-xl mx-auto px-4 mt-6">
          <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: palette.accent }}>
            ⭐ Destaques
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar -mx-1 px-1">
            {destaques.map(item => (
              <div key={item.id} className="shrink-0 w-36">
                <div
                  className="relative w-36 h-28 rounded-2xl overflow-hidden border border-white/8 cursor-pointer active:scale-95 transition-transform"
                  onClick={() => addItem(item)}
                >
                  {item.foto || item.photo
                    ? <img src={item.foto || item.photo} alt={item.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-4xl bg-white/5">🍽</div>
                  }
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <div className="absolute bottom-0 inset-x-0 p-2">
                    <p className="text-[11px] font-semibold text-white leading-tight line-clamp-2">{item.name || item.nome}</p>
                    <p className="text-[11px] font-bold mt-0.5" style={{ color: palette.accent }}>{fmtR(item.salePrice)}</p>
                  </div>
                  {qtdItem(item.id) > 0 && (
                    <div
                      className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-black"
                      style={{ background: palette.accent }}
                    >
                      {qtdItem(item.id)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CARDÁPIO POR CATEGORIA ─────────────────────────────────────── */}
      <div className="max-w-xl mx-auto px-4 pt-6 flex flex-col gap-10">
        {busca && itensFiltrados.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-zinc-500 text-sm">Nenhum item encontrado para "{busca}"</p>
            <button onClick={() => setBusca("")} className="mt-3 text-xs text-zinc-600 hover:text-zinc-400 underline transition-colors">
              Limpar busca
            </button>
          </div>
        ) : (
          Object.entries(grouped)
            .filter(([, arr]) => arr.length > 0)
            .map(([cat, arr]) => (
              <section
                key={cat}
                ref={el => { catRefs.current[cat] = el; }}
                className="scroll-mt-32"
              >
                <div className="flex items-center gap-3 mb-4">
                  <h2
                    className="text-sm font-black uppercase tracking-wider"
                    style={{ color: palette.accent }}
                  >
                    {cat}
                  </h2>
                  <div className="flex-1 h-px bg-white/6" />
                  <span className="text-[10px] text-zinc-600">{arr.length} iten{arr.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {arr.map(item => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      qtd={qtdItem(item.id)}
                      onAdd={() => addItem(item)}
                      onDec={() => decItem(item)}
                      accent={palette.accent}
                    />
                  ))}
                </div>
              </section>
            ))
        )}

        {/* Rodapé */}
        {!busca && (
          <div className="text-center py-6 border-t border-white/5">
            <p className="text-xs text-zinc-700">Powered by <span className="text-zinc-500 font-semibold">ZapFome</span> 🍔</p>
          </div>
        )}
      </div>

      {/* ── BOTÃO FLUTUANTE DO CARRINHO ─────────────────────────────────── */}
      {totalQtd > 0 && (
        <div className="fixed bottom-6 inset-x-4 z-40 max-w-md mx-auto">
          <button
            onClick={() => setShowCart(true)}
            className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-between px-5 transition-all active:scale-[0.98] shadow-2xl"
            style={{ background: palette.accent, color: "#000", boxShadow: `0 8px 32px ${palette.accent}40` }}
          >
            <span
              className="w-7 h-7 rounded-full bg-black/20 flex items-center justify-center text-xs font-black"
            >{totalQtd}</span>
            <span>Ver carrinho</span>
            <span className="font-black">{fmtR(totalVal)}</span>
          </button>
        </div>
      )}

      {/* ── DRAWER DO CARRINHO ───────────────────────────────────────────── */}
      {showCart && (
        <CartDrawer
          carrinho={carrinho}
          onClose={() => { setShowCart(false); setErroEnvio(null); }}
          onFinalizar={handleFinalizar}
          accent={palette.accent}
          clienteNome={clienteNome}    setClienteNome={setClienteNome}
          clienteTel={clienteTel}      setClienteTel={setClienteTel}
          tipo={tipo}                  setTipo={setTipo}
          pagamento={pagamento}        setPagamento={setPagamento}
          observacao={observacao}      setObservacao={setObservacao}
          enviando={enviando}
          erroEnvio={erroEnvio}
        />
      )}
    </div>
  );
}
