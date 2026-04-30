import { useState, useEffect, useRef } from "react";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;
const fmtPrice = (v) => `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;

// ── Mapeamento de ícones por categoria ────────────────────────────────────────
const CAT_ICONS = {
  Lanches: "🍔", Hambúrguer: "🍔", Burguer: "🍔",
  Pizzas: "🍕", Pizza: "🍕",
  Bebidas: "🥤", Sucos: "🧃", Drinks: "🍹",
  Sobremesas: "🍰", Doces: "🍬", Açaí: "🫐",
  Japonês: "🍱", Sushi: "🍣",
  "Frutos do Mar": "🦞", Peixes: "🐟",
  Saladas: "🥗", Vegano: "🥦",
  Combos: "🎯", Promoções: "🔥",
  Brasileira: "🥘", Árabe: "🧆", Italiana: "🍝", Mexicana: "🌮",
  Marmita: "🍱",
};
const getCatIcon = (cat) => CAT_ICONS[cat] || "🍽";

// ── Lógica de upsell: itens de outra categoria com maior margem ───────────────
const getUpsells = (item, allItems) =>
  allItems
    .filter((i) => i.categoria !== item.categoria && i.id !== item.id && i.quantidade > 0)
    .map((i) => ({
      ...i,
      margem: i.precoVenda > 0 ? (i.precoVenda - (i.precoCusto || 0)) / i.precoVenda : 0,
    }))
    .sort((a, b) => b.margem - a.margem)
    .slice(0, 2);

// ── Normaliza itens de ambos formatos (estoque API ou props legados) ──────────
const normalizeItem = (i) => ({
  id:        i.id        || String(Math.random()),
  nome:      i.nome      || i.name       || "Item",
  categoria: i.categoria || i.category   || "Geral",
  precoVenda:i.precoVenda|| i.salePrice  || 0,
  precoCusto:i.precoCusto|| i.costPrice  || 0,
  quantidade:i.quantidade ?? 99,
  foto:      i.foto      || i.photo      || null,
  descricao: i.descricao || i.description|| "",
  porKg:     i.porKg     || false,
});

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════
export function DigitalMenu({
  restauranteId,
  items: itemsProp,
  restaurantName = "Cardápio",
  previewMode = false,   // true = sem carrinho (aba do restaurante)
}) {
  const [items, setItems]               = useState([]);
  const [loading, setLoading]           = useState(false);
  const [activeCategory, setActiveCategory] = useState("");
  const [cart, setCart]                 = useState([]);
  const [cartOpen, setCartOpen]         = useState(false);
  const [upsell, setUpsell]             = useState(null);
  const [search, setSearch]             = useState("");

  const categoryRefs     = useRef({});
  const scrollContainerRef = useRef();

  // ── Carrega itens ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (itemsProp?.length) {
      setItems(itemsProp.map(normalizeItem));
      return;
    }
    if (!restauranteId) return;
    setLoading(true);
    fetch(`${API_BASE}/estoque/${restauranteId}`)
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data.map(normalizeItem) : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [restauranteId, itemsProp]);

  // ── Categorias ────────────────────────────────────────────────────────────
  const categories = [...new Set(items.map((i) => i.categoria))];

  useEffect(() => {
    if (categories.length && !activeCategory) setActiveCategory(categories[0]);
  }, [categories.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll spy ────────────────────────────────────────────────────────────
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      let current = categories[0] || "";
      for (const cat of categories) {
        const el = categoryRefs.current[cat];
        if (el && el.offsetTop - 130 <= container.scrollTop) current = cat;
      }
      setActiveCategory(current);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [categories.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToCategory = (cat) => {
    const el = categoryRefs.current[cat];
    const container = scrollContainerRef.current;
    if (el && container) {
      container.scrollTo({ top: el.offsetTop - 108, behavior: "smooth" });
      setActiveCategory(cat);
    }
  };

  // ── Filtro de busca ───────────────────────────────────────────────────────
  const filteredItems = search.trim()
    ? items.filter((i) => i.nome.toLowerCase().includes(search.toLowerCase()))
    : items;

  const grouped = filteredItems.reduce((acc, item) => {
    const cat = item.categoria || "Outros";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  // ── Carrinho ──────────────────────────────────────────────────────────────
  const addToCart = (item) => {
    if (previewMode) return;
    setCart((prev) => {
      const ex = prev.find((c) => c.item.id === item.id);
      return ex
        ? prev.map((c) => c.item.id === item.id ? { ...c, qtd: c.qtd + 1 } : c)
        : [...prev, { item, qtd: 1 }];
    });
    // Upsell: sugere itens de outra categoria com maior margem
    const suggestions = getUpsells(item, items);
    if (suggestions.length) {
      setUpsell({ item, suggestions });
      const t = setTimeout(() => setUpsell(null), 5000);
      return () => clearTimeout(t);
    }
  };

  const removeFromCart = (itemId) => {
    setCart((prev) => {
      const ex = prev.find((c) => c.item.id === itemId);
      return ex?.qtd === 1
        ? prev.filter((c) => c.item.id !== itemId)
        : prev.map((c) => c.item.id === itemId ? { ...c, qtd: c.qtd - 1 } : c);
    });
  };

  const cartTotal = cart.reduce((s, c) => s + c.item.precoVenda * c.qtd, 0);
  const cartCount = cart.reduce((s, c) => s + c.qtd, 0);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="font-mono text-[#71717A] text-xs animate-pulse">CARREGANDO CARDÁPIO...</span>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full bg-[#080808] overflow-hidden">

      {/* ────────── HEADER ────────── */}
      <div className="bg-[#0A0A0A] border-b border-[#141414] px-5 pt-4 pb-0 shrink-0">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="font-mono text-base font-bold text-[#EDEDED] tracking-tight leading-tight">
              {restaurantName.toUpperCase()}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="font-mono text-[9px] text-[#00E559]">● ABERTO</span>
              <span className="font-mono text-[9px] text-[#1E1E1E]">·</span>
              <span className="font-mono text-[9px] text-[#3F3F46]">⏱ 30-45 min</span>
              <span className="font-mono text-[9px] text-[#1E1E1E]">·</span>
              <span className="font-mono text-[9px] text-[#3F3F46]">🛵 Taxa R$ 5,00</span>
            </div>
          </div>
          {!previewMode && (
            <button
              onClick={() => setCartOpen(true)}
              className="relative bg-[#00E559] text-black w-10 h-10 flex items-center justify-center hover:bg-[#00c44d] transition-colors shrink-0"
            >
              <span className="text-base">🛒</span>
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#FF4444] text-white font-mono text-[8px] font-bold flex items-center justify-center rounded-full">
                  {cartCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Barra de busca */}
        <div className="relative mb-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3F3F46] text-xs pointer-events-none">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar no cardápio..."
            className="w-full bg-[#111] border border-[#1E1E1E] text-[#EDEDED] font-mono text-xs pl-8 pr-3 py-2 focus:outline-none focus:border-[#00E559] transition-colors placeholder:text-[#2A2A2A]"
          />
        </div>

        {/* Navegação horizontal sticky por categoria */}
        {!search && (
          <div className="flex gap-0 overflow-x-auto scrollbar-hide -mx-5 px-5 mt-3">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => scrollToCategory(cat)}
                className={`flex items-center gap-1.5 px-3 py-2.5 font-mono text-[9px] whitespace-nowrap border-b-2 transition-all shrink-0 ${
                  activeCategory === cat
                    ? "border-[#00E559] text-[#00E559] bg-[#00E559]/5"
                    : "border-transparent text-[#3F3F46] hover:text-[#71717A]"
                }`}
              >
                <span>{getCatIcon(cat)}</span>
                <span className="tracking-widest">{cat.toUpperCase()}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ────────── CONTEÚDO ROLÁVEL ────────── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">

        {/* Estado vazio */}
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <span className="text-5xl opacity-20">🍽</span>
            <span className="font-mono text-xs text-[#2A2A2A] tracking-widest">NENHUM ITEM NO CARDÁPIO</span>
          </div>
        )}

        {/* Seções por categoria */}
        {Object.entries(grouped).map(([cat, catItems]) => (
          <div
            key={cat}
            ref={(el) => { categoryRefs.current[cat] = el; }}
            className="pt-6 px-5"
          >
            {/* Cabeçalho da categoria */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-base">{getCatIcon(cat)}</span>
              <span className="font-mono text-[10px] font-bold text-[#EDEDED] tracking-widest">
                {cat.toUpperCase()}
              </span>
              <div className="flex-1 h-px bg-[#141414]" />
              <span className="font-mono text-[9px] text-[#2A2A2A]">{catItems.length}</span>
            </div>

            {/* Grid de cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
              {catItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onAdd={addToCart}
                  cartQtd={cart.find((c) => c.item.id === item.id)?.qtd || 0}
                  onRemove={removeFromCart}
                  previewMode={previewMode}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Espaço para o botão flutuante */}
        <div className="h-24" />
      </div>

      {/* ────────── UPSELL TOAST ────────── */}
      {upsell && (
        <div className="absolute bottom-20 left-4 right-4 bg-[#111] border border-[#1E1E1E] shadow-2xl shadow-black/80 p-4 z-40">
          <div className="flex items-start justify-between mb-3">
            <div>
              <span className="font-mono text-[9px] text-[#00E559] tracking-widest">✨ COMBINA PERFEITAMENTE COM</span>
              <p className="font-mono text-[10px] text-[#3F3F46] mt-0.5 truncate">{upsell.item.nome}</p>
            </div>
            <button
              onClick={() => setUpsell(null)}
              className="text-[#2A2A2A] hover:text-[#71717A] font-mono text-xs transition-colors ml-2"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-2">
            {upsell.suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => { addToCart(s); setUpsell(null); }}
                className="flex-1 bg-[#0D0D0D] border border-[#1E1E1E] hover:border-[#00E559] p-2.5 text-left transition-colors group"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs">{getCatIcon(s.categoria)}</span>
                  <span className="font-mono text-[9px] text-[#3F3F46] group-hover:text-[#71717A] transition-colors truncate">
                    {s.categoria}
                  </span>
                </div>
                <p className="font-mono text-[10px] text-[#EDEDED] group-hover:text-[#00E559] transition-colors truncate font-bold">
                  {s.nome}
                </p>
                <p className="font-mono text-xs text-[#00E559] font-bold mt-1">{fmtPrice(s.precoVenda)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ────────── BOTÃO FLUTUANTE DO CARRINHO ────────── */}
      {!previewMode && cartCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="absolute bottom-5 left-5 right-5 bg-[#00E559] text-black font-mono text-xs font-bold px-5 py-3 flex items-center gap-3 shadow-2xl shadow-black/60 hover:bg-[#00c44d] transition-colors z-30"
        >
          <span className="bg-black/20 px-2 py-0.5 text-[10px] font-bold">{cartCount}</span>
          VER CARRINHO
          <span className="ml-auto font-bold">{fmtPrice(cartTotal)}</span>
        </button>
      )}

      {/* ────────── DRAWER DO CARRINHO ────────── */}
      {cartOpen && !previewMode && (
        <div className="absolute inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="flex-1 bg-black/70 backdrop-blur-sm"
            onClick={() => setCartOpen(false)}
          />
          {/* Painel */}
          <div className="w-80 bg-[#0A0A0A] border-l border-[#141414] flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-[#141414] flex items-center justify-between">
              <span className="font-mono text-sm text-[#EDEDED] font-bold">CARRINHO</span>
              <button
                onClick={() => setCartOpen(false)}
                className="font-mono text-xs text-[#3F3F46] hover:text-[#EDEDED] transition-colors"
              >
                ✕ FECHAR
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 opacity-40">
                  <span className="text-3xl">🛒</span>
                  <span className="font-mono text-xs text-[#3F3F46]">Carrinho vazio</span>
                </div>
              ) : (
                cart.map(({ item, qtd }) => (
                  <div key={item.id} className="flex items-center gap-3 border-b border-[#141414] pb-3">
                    {/* Mini foto */}
                    <div className="w-10 h-10 bg-[#111] border border-[#1A1A1A] flex items-center justify-center shrink-0 overflow-hidden">
                      {item.foto
                        ? <img src={item.foto} alt={item.nome} className="w-full h-full object-cover" />
                        : <span className="text-lg opacity-40">{getCatIcon(item.categoria)}</span>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-[10px] text-[#EDEDED] truncate">{item.nome}</p>
                      <p className="font-mono text-xs text-[#00E559] font-bold">{fmtPrice(item.precoVenda * qtd)}</p>
                    </div>
                    {/* Contador */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="w-6 h-6 border border-[#1E1E1E] font-mono text-xs text-[#3F3F46] hover:border-[#FF4444] hover:text-[#FF4444] transition-colors flex items-center justify-center"
                      >
                        −
                      </button>
                      <span className="font-mono text-xs text-[#EDEDED] w-5 text-center">{qtd}</span>
                      <button
                        onClick={() => addToCart(item)}
                        className="w-6 h-6 bg-[#00E559] font-mono text-xs text-black font-bold flex items-center justify-center hover:bg-[#00c44d] transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-4 border-t border-[#141414] flex flex-col gap-3 shrink-0">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[10px] text-[#71717A] tracking-widest">SUBTOTAL</span>
                  <span className="font-mono text-sm text-[#00E559] font-bold">{fmtPrice(cartTotal)}</span>
                </div>
                <button className="w-full bg-[#00E559] text-black font-mono text-xs font-bold py-3 hover:bg-[#00c44d] transition-colors tracking-widest">
                  FAZER PEDIDO →
                </button>
                <button
                  onClick={() => setCart([])}
                  className="w-full font-mono text-[9px] text-[#2A2A2A] hover:text-[#FF4444] transition-colors tracking-widest"
                >
                  LIMPAR CARRINHO
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CARD DE PRODUTO — estilo OxyFood: foto grande no topo, CTA sempre visível
// ═════════════════════════════════════════════════════════════════════════════
function ItemCard({ item, onAdd, cartQtd, onRemove, previewMode }) {
  const margem = item.precoVenda > 0
    ? (item.precoVenda - (item.precoCusto || 0)) / item.precoVenda
    : 0;
  const isDestaque = margem > 0.5;
  const esgotado   = item.quantidade <= 0;

  return (
    <div
      className={`bg-[#0D0D0D] border flex flex-col overflow-hidden group transition-all duration-200 ${
        esgotado
          ? "border-[#141414] opacity-40 cursor-not-allowed"
          : isDestaque
            ? "border-[#1E1E1E] hover:border-[#00E559]/20 hover:shadow-lg hover:shadow-[#00E559]/5"
            : "border-[#141414] hover:border-[#1E1E1E]"
      }`}
    >
      {/* ── Foto (60% da altura do card) ── */}
      <div className="relative h-36 bg-[#111] overflow-hidden shrink-0">
        {item.foto ? (
          <img
            src={item.foto}
            alt={item.nome}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-[#141414] to-[#0D0D0D]">
            <span className="text-5xl opacity-10">{getCatIcon(item.categoria)}</span>
          </div>
        )}

        {/* Badge destaque */}
        {isDestaque && !esgotado && (
          <span className="absolute top-2 left-2 bg-[#00E559] text-black font-mono text-[8px] font-bold px-2 py-0.5 tracking-wider">
            🔥 DESTAQUE
          </span>
        )}
        {/* Badge esgotado */}
        {esgotado && (
          <div className="absolute inset-0 bg-black/75 flex items-center justify-center">
            <span className="font-mono text-[10px] text-[#FF4444] tracking-widest border border-[#FF4444]/30 px-3 py-1">
              ESGOTADO
            </span>
          </div>
        )}
        {/* Badge por kg */}
        {item.porKg && !esgotado && (
          <span className="absolute top-2 right-2 bg-[#111]/90 text-[#71717A] font-mono text-[8px] px-1.5 py-0.5">
            /kg
          </span>
        )}
      </div>

      {/* ── Informações + CTA ── */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex-1">
          <p className="font-mono text-xs font-bold text-[#EDEDED] leading-snug">{item.nome}</p>
          {item.descricao && (
            <p className="font-mono text-[10px] text-[#2A2A2A] mt-1 line-clamp-2 leading-relaxed">
              {item.descricao}
            </p>
          )}
        </div>

        {/* Preço + botão — sempre visíveis (padrão OxyFood) */}
        <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-[#141414]">
          <span className="font-mono text-sm font-bold text-[#00E559]">
            {fmtPrice(item.precoVenda)}
          </span>

          {!previewMode && !esgotado && (
            cartQtd === 0 ? (
              <button
                onClick={() => onAdd(item)}
                className="bg-[#00E559] text-black font-mono text-[9px] font-bold px-3 py-1.5 hover:bg-[#00c44d] transition-colors shrink-0 tracking-wider"
              >
                + ADICIONAR
              </button>
            ) : (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => onRemove(item.id)}
                  className="w-6 h-6 border border-[#1E1E1E] font-mono text-xs text-[#3F3F46] hover:border-[#FF4444] hover:text-[#FF4444] flex items-center justify-center transition-colors"
                >
                  −
                </button>
                <span className="font-mono text-xs text-[#00E559] font-bold w-4 text-center">{cartQtd}</span>
                <button
                  onClick={() => onAdd(item)}
                  className="w-6 h-6 bg-[#00E559] font-mono text-xs text-black font-bold flex items-center justify-center hover:bg-[#00c44d] transition-colors"
                >
                  +
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
