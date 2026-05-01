// Acompanhamento do pedido em tempo real — polling a cada 10s.
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { pedidosService, extractError } from "@/services/api";
import { useToast } from "@/hooks/useToast";

const ETAPAS = [
  { status: "pendente",    label: "Pedido recebido",    icon: "📨", color: "text-zinc-400" },
  { status: "aceito",      label: "Preparando",          icon: "👨‍🍳", color: "text-amber-400" },
  { status: "pronto",      label: "Pronto para retirar", icon: "✅", color: "text-emerald-400" },
  { status: "entregue",    label: "Entregue!",           icon: "🎉", color: "text-emerald-500" },
];

const STATUS_ORDER = ["pendente", "aceito", "pronto", "entregue"];
const STATUS_LABEL = {
  pendente:   "Aguardando confirmação",
  aceito:     "Em preparo",
  pronto:     "Pronto para retirar",
  entregue:   "Entregue!",
  cancelado:  "Cancelado",
};

export default function PedidoAcompanhamento() {
  const { pedidoId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [pedido, setPedido] = useState(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);

  const buscarPedido = async () => {
    try {
      const data = await pedidosService.buscar(pedidoId);
      setPedido(data);
      if (data?.status === "entregue" || data?.status === "cancelado") {
        clearInterval(intervalRef.current);
      }
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    buscarPedido();
    intervalRef.current = setInterval(buscarPedido, 10_000);
    return () => clearInterval(intervalRef.current);
  }, [pedidoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusIdx = STATUS_ORDER.indexOf(pedido?.status);
  const isCancelado = pedido?.status === "cancelado";

  return (
    <div className="max-w-lg mx-auto px-5">
      {/* Header */}
      <header className="pt-8 pb-4 flex items-center gap-3">
        <button onClick={() => navigate("/app")}
          className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-white">
          🏠
        </button>
        <div>
          <h1 className="text-lg font-bold text-white">Meu Pedido</h1>
          {pedido?.id && (
            <p className="text-[11px] text-zinc-500 font-mono">#{String(pedido.id).slice(-6).toUpperCase()}</p>
          )}
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !pedido ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">❓</p>
          <p className="text-zinc-400 text-sm">Pedido não encontrado</p>
          <button onClick={() => navigate("/app")}
            className="mt-6 bg-emerald-500 text-black font-bold px-6 py-3 rounded-2xl text-sm">
            Início
          </button>
        </div>
      ) : (
        <>
          {/* Cancelado */}
          {isCancelado && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 mb-6 text-center">
              <p className="text-4xl mb-2">❌</p>
              <p className="text-red-400 font-bold text-base">Pedido cancelado</p>
              {pedido.motivoCancelamento && (
                <p className="text-red-400/70 text-sm mt-1">{pedido.motivoCancelamento}</p>
              )}
            </div>
          )}

          {/* Status principal */}
          {!isCancelado && (
            <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-900/10 border border-emerald-500/20 rounded-3xl p-6 mb-6 text-center">
              <p className="text-5xl mb-3">{ETAPAS[statusIdx]?.icon || "📋"}</p>
              <h2 className="text-xl font-black text-white">{STATUS_LABEL[pedido.status] || pedido.status}</h2>
              <p className="text-zinc-500 text-xs mt-1">Atualizando automaticamente…</p>
            </div>
          )}

          {/* Timeline */}
          {!isCancelado && (
            <div className="bg-white/3 rounded-2xl p-5 mb-5 border border-white/5">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Status</p>
              <div className="flex flex-col gap-4">
                {ETAPAS.map((etapa, idx) => {
                  const done = idx <= statusIdx;
                  const current = idx === statusIdx;
                  return (
                    <div key={etapa.status} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 transition-all ${
                        done ? "bg-emerald-500 text-black" : "bg-white/5 text-zinc-600"
                      } ${current ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-black scale-110" : ""}`}>
                        {done ? "✓" : idx + 1}
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${done ? "text-white" : "text-zinc-600"}`}>
                          {etapa.label}
                        </p>
                      </div>
                      <span className={`text-lg ${done ? "" : "opacity-30"}`}>{etapa.icon}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Resumo dos itens */}
          <div className="bg-white/3 rounded-2xl p-5 mb-5 border border-white/5">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Resumo</p>
            <div className="flex flex-col gap-2">
              {(pedido.itens || []).map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-zinc-300">{item.qtd}× {item.nome}</span>
                  <span className="text-zinc-400">
                    R$ {(Number(item.precoUnitario || 0) * item.qtd).toFixed(2).replace(".", ",")}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-white/8 mt-3 pt-3 flex justify-between font-bold">
              <span className="text-white text-sm">Total</span>
              <span className="text-emerald-400 text-sm">
                R$ {Number(pedido.total || 0).toFixed(2).replace(".", ",")}
              </span>
            </div>
          </div>

          {/* Pagamento */}
          {pedido.pagamento && (
            <div className="bg-white/3 rounded-2xl px-5 py-4 mb-5 border border-white/5 flex justify-between items-center">
              <span className="text-zinc-400 text-sm">Pagamento</span>
              <span className="text-white text-sm font-bold capitalize">{pedido.pagamento}</span>
            </div>
          )}

          <button onClick={() => navigate("/app")}
            className="w-full bg-white/5 text-zinc-300 font-bold rounded-2xl py-3.5 text-sm hover:bg-white/10 transition-colors border border-white/8">
            Voltar ao início
          </button>
        </>
      )}
    </div>
  );
}
