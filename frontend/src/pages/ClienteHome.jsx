// Home do cliente — visual inspirado no Dribbble da DeviceBee.
// Lista de restaurantes, categorias, busca e destaques.
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { restaurantesService, extractError } from "@/services/api";
import { SkeletonRestauranteCard } from "@/components/Skeleton";
import { useToast } from "@/hooks/useToast";

const CATEGORIAS = [
  { id: "todos",      label: "Todos",       icon: "🍽" },
  { id: "pizza",      label: "Pizza",       icon: "🍕" },
  { id: "burguer",    label: "Burguer",     icon: "🍔" },
  { id: "japones",    label: "Japonês",     icon: "🍱" },
  { id: "doces",      label: "Doces",       icon: "🍰" },
  { id: "saudavel",   label: "Saudável",    icon: "🥗" },
  { id: "bebidas",    label: "Bebidas",     icon: "🥤" },
];

export default function ClienteHome() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [restaurantes, setRestaurantes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [catAtiva, setCatAtiva] = useState("todos");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await restaurantesService.listar();
        if (alive) setRestaurantes(data.filter((r) => r.ativo !== false));
      } catch (err) {
        toast.error(extractError(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtrados = useMemo(() => {
    let list = restaurantes;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      list = list.filter((r) =>
        (r.nome || "").toLowerCase().includes(q) ||
        (r.categoria || "").toLowerCase().includes(q)
      );
    }
    if (catAtiva !== "todos") {
      list = list.filter((r) => (r.categoria || "").toLowerCase().includes(catAtiva));
    }
    return list;
  }, [restaurantes, busca, catAtiva]);

  const destaques = restaurantes.slice(0, 3);

  return (
    <div className="max-w-lg mx-auto px-5">
      {/* ── Header ── */}
      <header className="pt-8 pb-2 flex items-center justify-between">
        <div>
          <p className="text-[11px] text-zinc-500 uppercase tracking-widest">Entregar em</p>
          <button className="flex items-center gap-1 mt-1">
            <span className="text-base font-bold text-white">📍 Casa</span>
            <span className="text-zinc-500 text-xs">▾</span>
          </button>
        </div>
        <button onClick={() => navigate("/app/perfil")}
          className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-black font-bold shadow-lg">
          🙂
        </button>
      </header>

      {/* ── Saudação ── */}
      <div className="mt-4">
        <h1 className="text-2xl font-bold text-white leading-tight">
          O que vamos pedir <span className="text-emerald-400">hoje?</span>
        </h1>
      </div>

      {/* ── Busca ── */}
      <div className="mt-5 relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600">🔍</span>
        <input
          type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar restaurantes ou pratos…"
          className="w-full bg-white/5 border border-white/8 rounded-2xl text-white text-sm pl-11 pr-4 py-3.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
        />
      </div>

      {/* ── Categorias ── */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-white">Categorias</h2>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
          {CATEGORIAS.map((c) => {
            const active = catAtiva === c.id;
            return (
              <button key={c.id} onClick={() => setCatAtiva(c.id)}
                className={`shrink-0 flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl transition-all min-w-[78px] ${
                  active ? "bg-emerald-500 text-black scale-105 shadow-lg shadow-emerald-500/20" : "bg-white/5 text-zinc-400 hover:bg-white/10"
                }`}>
                <span className="text-2xl">{c.icon}</span>
                <span className="text-[11px] font-bold">{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Destaques (Hero carousel horizontal) ── */}
      {!loading && destaques.length > 0 && busca === "" && catAtiva === "todos" && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">⭐ Em alta</h2>
            <button className="text-xs text-emerald-400 font-semibold">Ver todos →</button>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
            {destaques.map((r) => (
              <button key={r.id}
                onClick={() => navigate(`/app/restaurante/${r.id}`)}
                className="shrink-0 w-64 rounded-3xl overflow-hidden bg-gradient-to-br from-emerald-500/20 to-emerald-900/20 border border-emerald-500/20 relative">
                <div className="h-32 bg-gradient-to-br from-emerald-500/30 to-zinc-900 flex items-center justify-center text-5xl">
                  🍽
                </div>
                <div className="p-3 text-left">
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">{r.categoria || "Restaurante"}</p>
                  <h3 className="text-sm font-bold text-white mt-0.5 truncate">{r.nome}</h3>
                  <p className="text-[10px] text-zinc-500 mt-0.5">⏱ {r.tempoEstimado || "30-45 min"}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Lista de restaurantes ── */}
      <div className="mt-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-white">
            {busca ? `Resultados para "${busca}"` : "Restaurantes"}
          </h2>
          <span className="text-[11px] text-zinc-600">{filtrados.length} {filtrados.length === 1 ? "lugar" : "lugares"}</span>
        </div>

        <div className="flex flex-col gap-3">
          {loading ? (
            <>
              <SkeletonRestauranteCard />
              <SkeletonRestauranteCard />
              <SkeletonRestauranteCard />
            </>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-zinc-400 text-sm">Nenhum restaurante encontrado</p>
              {busca && (
                <button onClick={() => { setBusca(""); setCatAtiva("todos"); }}
                  className="mt-4 text-emerald-400 text-xs font-semibold">
                  Limpar filtros
                </button>
              )}
            </div>
          ) : (
            filtrados.map((r) => (
              <RestauranteCard key={r.id} restaurante={r}
                onClick={() => navigate(`/app/restaurante/${r.id}`)} />
            ))
          )}
        </div>
      </div>

      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{scrollbar-width:none}`}</style>
    </div>
  );
}

// ── Card de restaurante — estilo Dribbble ──────────────────────────────────────
function RestauranteCard({ restaurante: r, onClick }) {
  return (
    <button onClick={onClick}
      className="bg-[#111] rounded-3xl overflow-hidden text-left transition-all hover:scale-[1.01] active:scale-[0.99] border border-white/5">
      {/* foto / hero */}
      <div className="relative h-40 bg-gradient-to-br from-emerald-500/20 via-zinc-800 to-black flex items-center justify-center">
        {r.logoUrl ? (
          <img src={r.logoUrl} alt={r.nome} className="w-full h-full object-cover" />
        ) : (
          <span className="text-6xl opacity-50">🍽</span>
        )}
        {/* badge categoria */}
        <span className="absolute top-3 left-3 text-[9px] font-bold uppercase tracking-widest bg-black/60 backdrop-blur text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/30">
          {r.categoria || "Restaurante"}
        </span>
        {/* botão favoritar */}
        <button onClick={(e) => e.stopPropagation()}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 backdrop-blur text-white text-sm flex items-center justify-center hover:bg-emerald-500 hover:text-black transition-colors">
          ♡
        </button>
      </div>

      {/* info */}
      <div className="p-4">
        <h3 className="text-base font-bold text-white truncate">{r.nome}</h3>
        {r.descricao && <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">{r.descricao}</p>}

        <div className="flex items-center gap-3 mt-3 text-[11px]">
          <span className="flex items-center gap-1 text-amber-400">⭐ <span className="text-white font-semibold">4.8</span></span>
          <span className="text-zinc-600">·</span>
          <span className="text-zinc-400">⏱ {r.tempoEstimado || "30-45 min"}</span>
          <span className="text-zinc-600">·</span>
          <span className="text-zinc-400">🛵 R$ {Number(r.taxaEntrega || 0).toFixed(2).replace(".", ",")}</span>
        </div>
      </div>
    </button>
  );
}
