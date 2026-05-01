// Página de busca global — restaurantes e pratos.
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { restaurantesService, extractError } from "@/services/api";
import { useToast } from "@/hooks/useToast";
import { SkeletonRestauranteCard } from "@/components/Skeleton";

export default function BuscarPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const inputRef = useRef(null);

  const [busca, setBusca] = useState("");
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
    let alive = true;
    (async () => {
      try {
        const data = await restaurantesService.listar();
        if (alive) setTodos(data.filter((r) => r.ativo !== false));
      } catch (err) {
        if (alive) toast.error(extractError(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const q = busca.toLowerCase().trim();
  const resultados = q
    ? todos.filter(
        (r) =>
          (r.nome || "").toLowerCase().includes(q) ||
          (r.categoria || "").toLowerCase().includes(q) ||
          (r.descricao || "").toLowerCase().includes(q)
      )
    : [];

  const recentes = todos.slice(0, 5);

  return (
    <div className="max-w-lg mx-auto px-5">
      {/* Header + input */}
      <header className="pt-8 pb-2 flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-white shrink-0">
          ←
        </button>
        <div className="relative flex-1">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600">🔍</span>
          <input
            ref={inputRef}
            type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar restaurantes ou culinária…"
            className="w-full bg-white/5 border border-white/8 rounded-2xl text-white text-sm pl-11 pr-10 py-3.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
          />
          {busca && (
            <button onClick={() => setBusca("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
              ✕
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="mt-6 flex flex-col gap-3">
          <SkeletonRestauranteCard /><SkeletonRestauranteCard />
        </div>
      ) : busca === "" ? (
        /* Estado inicial */
        <div className="mt-6">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Populares</p>
          <div className="flex flex-col gap-3">
            {recentes.map((r) => (
              <button key={r.id}
                onClick={() => navigate(`/app/restaurante/${r.id}`)}
                className="flex items-center gap-3 bg-white/3 rounded-2xl p-3 border border-white/5 text-left hover:bg-white/6 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-zinc-800 shrink-0 flex items-center justify-center overflow-hidden">
                  {r.logoUrl
                    ? <img src={r.logoUrl} alt={r.nome} className="w-full h-full object-cover" />
                    : <span className="text-2xl opacity-40">🍽</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{r.nome}</p>
                  <p className="text-[11px] text-zinc-500">{r.categoria || "Restaurante"}</p>
                </div>
                <span className="text-zinc-600 text-xs">→</span>
              </button>
            ))}
          </div>
        </div>
      ) : resultados.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-zinc-400 text-sm">Nenhum resultado para <strong className="text-white">"{busca}"</strong></p>
          <button onClick={() => setBusca("")}
            className="mt-5 text-emerald-400 text-xs font-semibold">
            Limpar busca
          </button>
        </div>
      ) : (
        <div className="mt-5">
          <p className="text-xs text-zinc-500 mb-3">
            {resultados.length} {resultados.length === 1 ? "resultado" : "resultados"} para <span className="text-white font-semibold">"{busca}"</span>
          </p>
          <div className="flex flex-col gap-3">
            {resultados.map((r) => (
              <button key={r.id}
                onClick={() => navigate(`/app/restaurante/${r.id}`)}
                className="flex items-center gap-3 bg-white/3 rounded-2xl p-3 border border-white/5 text-left hover:bg-white/6 transition-colors">
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-emerald-500/20 to-zinc-800 shrink-0 flex items-center justify-center overflow-hidden">
                  {r.logoUrl
                    ? <img src={r.logoUrl} alt={r.nome} className="w-full h-full object-cover" />
                    : <span className="text-3xl opacity-40">🍽</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">
                    {r.categoria || "Restaurante"}
                  </span>
                  <p className="text-sm font-bold text-white truncate">{r.nome}</p>
                  <div className="flex items-center gap-2 mt-1 text-[11px]">
                    <span className="text-amber-400">⭐ 4.8</span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-500">⏱ {r.tempoEstimado || "30-45 min"}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
