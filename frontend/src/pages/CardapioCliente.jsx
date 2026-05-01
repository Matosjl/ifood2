// Cardápio de um restaurante — app cliente.
// Carrega produtos via services layer e adiciona ao CartContext global.
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { restaurantesService, produtosService, extractError } from "@/services/api";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/hooks/useToast";
import { SkeletonProduto } from "@/components/Skeleton";

export default function CardapioCliente() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { adicionar, decrementar, qtdDoItem, totalItens, totalValor } = useCart();

  const [restaurante, setRestaurante] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catAtiva, setCatAtiva] = useState("Todos");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [rest, prods] = await Promise.all([
          restaurantesService.buscar(id),
          produtosService.porRestaurante(id),
        ]);
        if (!alive) return;
        setRestaurante(rest);
        setProdutos(prods.filter((p) => p.quantidade > 0 || p.quantidade == null));
      } catch (err) {
        if (alive) toast.error(extractError(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const categorias = useMemo(() => {
    const cats = [...new Set(produtos.map((p) => p.categoria || "Geral"))];
    return ["Todos", ...cats];
  }, [produtos]);

  const filtrados = useMemo(() => {
    let list = produtos;
    if (catAtiva !== "Todos") list = list.filter((p) => p.categoria === catAtiva);
    if (busca.trim()) {
      const q = busca.toLowerCase();
      list = list.filter((p) =>
        (p.nome || "").toLowerCase().includes(q) ||
        (p.descricao || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [produtos, catAtiva, busca]);

  const handleAdicionar = (produto) => {
    const ok = adicionar(produto, id, restaurante?.nome || "Restaurante");
    if (ok !== false) toast.success(`${produto.nome} adicionado!`);
  };

  return (
    <div className="max-w-lg mx-auto">
      {/* ── Header do restaurante ── */}
      <div className="relative h-48 bg-gradient-to-br from-emerald-500/30 via-zinc-800 to-black flex items-end">
        {restaurante?.logoUrl && (
          <img src={restaurante.logoUrl} alt={restaurante.nome} className="absolute inset-0 w-full h-full object-cover opacity-40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white">
          ←
        </button>

        <div className="relative px-5 pb-4 w-full">
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
            {restaurante?.categoria || "Restaurante"}
          </span>
          <h1 className="text-xl font-bold text-white mt-0.5">
            {loading ? "Carregando…" : (restaurante?.nome || "Restaurante")}
          </h1>
          {restaurante && (
            <div className="flex items-center gap-3 mt-1 text-[11px]">
              <span className="text-amber-400">⭐ 4.8</span>
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-400">⏱ {restaurante.tempoEstimado || "30-45 min"}</span>
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-400">🛵 R$ {Number(restaurante.taxaEntrega || 0).toFixed(2).replace(".", ",")}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Busca ── */}
      <div className="px-5 mt-4 relative">
        <span className="absolute left-9 top-1/2 -translate-y-1/2 text-zinc-600">🔍</span>
        <input
          type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar no cardápio…"
          className="w-full bg-white/5 border border-white/8 rounded-2xl text-white text-sm pl-11 pr-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
        />
      </div>

      {/* ── Categorias ── */}
      {!loading && categorias.length > 1 && (
        <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar -mx-0 px-5 pb-1">
          {categorias.map((c) => (
            <button key={c} onClick={() => setCatAtiva(c)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                catAtiva === c
                  ? "bg-emerald-500 text-black"
                  : "bg-white/5 text-zinc-400 hover:bg-white/10"
              }`}>
              {c}
            </button>
          ))}
        </div>
      )}

      {/* ── Produtos ── */}
      <div className="px-5 mt-5 mb-32 flex flex-col gap-3">
        {loading ? (
          <>
            <SkeletonProduto /><SkeletonProduto /><SkeletonProduto />
          </>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">🍽</p>
            <p className="text-zinc-500 text-sm">Nenhum item encontrado</p>
          </div>
        ) : (
          filtrados.map((p) => {
            const qtd = qtdDoItem(p.id);
            return (
              <div key={p.id}
                className="flex items-center gap-4 p-4 bg-white/3 rounded-2xl border border-white/5">
                {/* foto */}
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-gradient-to-br from-emerald-500/20 to-zinc-800 shrink-0 flex items-center justify-center">
                  {p.foto
                    ? <img src={p.foto} alt={p.nome} className="w-full h-full object-cover" />
                    : <span className="text-3xl opacity-40">🍽</span>}
                </div>
                {/* info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{p.nome}</h3>
                  {p.descricao && (
                    <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{p.descricao}</p>
                  )}
                  <p className="text-emerald-400 font-bold text-sm mt-1">
                    R$ {p.precoVenda.toFixed(2).replace(".", ",")}
                  </p>
                </div>
                {/* Controle de quantidade */}
                <div className="shrink-0">
                  {qtd === 0 ? (
                    <button onClick={() => handleAdicionar(p)}
                      className="w-9 h-9 rounded-full bg-emerald-500 text-black font-bold flex items-center justify-center text-xl hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20">
                      +
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={() => decrementar(p.id)}
                        className="w-8 h-8 rounded-full bg-white/10 text-white font-bold flex items-center justify-center text-lg hover:bg-white/20 transition-colors">
                        −
                      </button>
                      <span className="text-white font-bold text-sm w-4 text-center">{qtd}</span>
                      <button onClick={() => handleAdicionar(p)}
                        className="w-8 h-8 rounded-full bg-emerald-500 text-black font-bold flex items-center justify-center text-lg hover:bg-emerald-400 transition-colors">
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Barra flutuante do carrinho ── */}
      {totalItens > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-[calc(100%-40px)] max-w-md z-30">
          <button
            onClick={() => navigate("/app/carrinho")}
            className="w-full bg-emerald-500 text-black font-bold rounded-2xl px-5 py-4 flex items-center justify-between shadow-2xl shadow-emerald-500/30 hover:bg-emerald-400 transition-colors active:scale-[0.98]">
            <span className="bg-black/20 text-black rounded-xl w-7 h-7 flex items-center justify-center text-xs font-black">
              {totalItens}
            </span>
            <span className="text-sm">Ver carrinho</span>
            <span className="text-sm font-black">
              R$ {totalValor.toFixed(2).replace(".", ",")}
            </span>
          </button>
        </div>
      )}

      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{scrollbar-width:none}`}</style>
    </div>
  );
}
