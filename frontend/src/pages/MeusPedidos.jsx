// Histórico de pedidos do cliente — armazenado em localStorage.
// (Sem autenticação de cliente, os pedidos são salvos localmente após o checkout.)
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { pedidosService, extractError } from "@/services/api";
import { useToast } from "@/hooks/useToast";

const STORAGE_KEY = "zapfome_meus_pedidos";

const STATUS_COLOR = {
  pendente:  "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  aceito:    "bg-amber-500/20 text-amber-400 border-amber-500/30",
  pronto:    "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  entregue:  "bg-emerald-600/20 text-emerald-300 border-emerald-600/30",
  cancelado: "bg-red-500/20 text-red-400 border-red-500/30",
};

const STATUS_LABEL = {
  pendente:  "Aguardando",
  aceito:    "Em preparo",
  pronto:    "Pronto",
  entregue:  "Entregue",
  cancelado: "Cancelado",
};

export default function MeusPedidos() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pedidosSalvos, setPedidosSalvos] = useState([]);
  const [detalhes, setDetalhes] = useState({});
  const [carregando, setCarregando] = useState(false);

  // Carrega IDs salvos localmente
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPedidosSalvos(JSON.parse(raw));
    } catch {}
  }, []);

  // Busca detalhes de cada pedido na API
  useEffect(() => {
    if (pedidosSalvos.length === 0) return;
    setCarregando(true);
    Promise.allSettled(
      pedidosSalvos.map((id) =>
        pedidosService.buscar(id).then((d) => ({ id, data: d }))
      )
    ).then((results) => {
      const mapa = {};
      results.forEach((r) => {
        if (r.status === "fulfilled") mapa[r.value.id] = r.value.data;
      });
      setDetalhes(mapa);
      setCarregando(false);
    });
  }, [pedidosSalvos]);

  const pedidosOrdenados = pedidosSalvos
    .map((id) => detalhes[id])
    .filter(Boolean)
    .sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0));

  return (
    <div className="max-w-lg mx-auto px-5">
      {/* Header */}
      <header className="pt-8 pb-4">
        <h1 className="text-xl font-bold text-white">Meus Pedidos</h1>
        <p className="text-[11px] text-zinc-500 mt-0.5">Histórico de pedidos deste aparelho</p>
      </header>

      {carregando ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : pedidosSalvos.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-5xl mb-4">📋</p>
          <h2 className="text-lg font-bold text-white mb-2">Nenhum pedido ainda</h2>
          <p className="text-zinc-500 text-sm mb-6">Faça seu primeiro pedido agora!</p>
          <button onClick={() => navigate("/app")}
            className="bg-emerald-500 text-black font-bold px-8 py-3 rounded-2xl">
            Ver restaurantes
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-4">
          {pedidosOrdenados.map((p) => {
            const pedidoId = p.id || p._id;
            const colorClass = STATUS_COLOR[p.status] || STATUS_COLOR.pendente;
            return (
              <button key={pedidoId}
                onClick={() => navigate(`/app/pedido/${pedidoId}`)}
                className="bg-white/3 rounded-2xl p-4 border border-white/5 text-left hover:bg-white/6 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[10px] font-mono text-zinc-500">
                      #{String(pedidoId).slice(-6).toUpperCase()}
                    </p>
                    <p className="text-sm font-bold text-white mt-0.5">
                      {p.restauranteNome || "Restaurante"}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${colorClass}`}>
                    {STATUS_LABEL[p.status] || p.status}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 mb-3">
                  {(p.itens || []).slice(0, 3).map((item, i) => (
                    <span key={i} className="text-[11px] text-zinc-500 bg-white/5 rounded-full px-2.5 py-1">
                      {item.qtd}× {item.nome}
                    </span>
                  ))}
                  {(p.itens || []).length > 3 && (
                    <span className="text-[11px] text-zinc-600 bg-white/5 rounded-full px-2.5 py-1">
                      +{p.itens.length - 3} mais
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-600">
                    {p.criadoEm ? new Date(p.criadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                  </span>
                  <span className="text-emerald-400 font-bold text-sm">
                    R$ {Number(p.total || 0).toFixed(2).replace(".", ",")}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Helper exportado para salvar pedido após criação
export function salvarPedidoLocal(pedidoId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const lista = raw ? JSON.parse(raw) : [];
    if (!lista.includes(pedidoId)) {
      lista.unshift(pedidoId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lista.slice(0, 50)));
    }
  } catch {}
}
