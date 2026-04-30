import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { subscribePush } from "@/lib/pushNotifications";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

const STATUS_FLOW = [
  { key: "pendente", label: "Pedido Recebido", icon: "📝", desc: "Aguardando confirmação do restaurante" },
  { key: "confirmado", label: "Confirmado", icon: "✓", desc: "Restaurante aceitou seu pedido" },
  { key: "em_preparo", label: "Em Preparo", icon: "👨‍🍳", desc: "Sua comida está sendo preparada" },
  { key: "pronto", label: "Pronto", icon: "🍽️", desc: "Pedido pronto para entrega/retirada" },
  { key: "em_entrega", label: "Saiu para Entrega", icon: "🛵", desc: "O entregador está a caminho" },
  { key: "entregue", label: "Entregue", icon: "✅", desc: "Pedido entregue com sucesso" },
];

const STATUS_COLORS = {
  pendente: "#FFB000",
  confirmado: "#00E559",
  em_preparo: "#007AFF",
  pronto: "#00E559",
  em_entrega: "#A855F7",
  entregue: "#71717A",
  cancelado: "#FF4444",
};

const formatDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatTimeAgo = (isoDate) => {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  if (minutes === 0) return `${seconds}s atrás`;
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}min atrás`;
};

export function AcompanhamentoPedido() {
  const { pedidoId } = useParams();
  const navigate = useNavigate();
  const [pedido, setPedido] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [mostrarAvaliacao, setMostrarAvaliacao] = useState(false);
  const [nota, setNota] = useState(5);
  const [comentario, setComentario] = useState("");
  const [avaliado, setAvaliado] = useState(false);
  const wsRef = useRef(null);

  const fetchPedido = async () => {
    try {
      const res = await axios.get(`${API}/pedidos/${pedidoId}`);
      setPedido(res.data);
      setLoading(false);
      if (res.data.status === "entregue" && !res.data.avaliacao && !avaliado) {
        setMostrarAvaliacao(true);
      }
    } catch (err) {
      setError("Pedido não encontrado.");
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPedido();
  }, [pedidoId]);

  // WebSocket para atualizações em tempo real
  useEffect(() => {
    if (!pedidoId) return;
    const connectWS = () => {
      const ws = new WebSocket(`ws://localhost:8000/ws/track/${pedidoId}`);
      ws.onopen = () => setWsConnected(true);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "pedido_status_update") {
            setPedido((prev) => (prev ? { ...prev, ...data.data } : prev));
            if (data.status === "entregue" && !avaliado) {
              setMostrarAvaliacao(true);
            }
          }
        } catch {}
      };
      ws.onclose = () => {
        setWsConnected(false);
        setTimeout(connectWS, 3000);
      };
      ws.onerror = () => ws.close();
      wsRef.current = ws;
    };
    connectWS();
    return () => wsRef.current?.close();
  }, [pedidoId, avaliado]);

  // Polling fallback
  useEffect(() => {
    const interval = setInterval(fetchPedido, 10000);
    return () => clearInterval(interval);
  }, [pedidoId]);

  // Inscreve para notificações push do pedido
  useEffect(() => {
    subscribePush("cliente", pedidoId, null);
  }, [pedidoId]);

  const handleAvaliar = async () => {
    try {
      await axios.post(`${API}/pedidos/${pedidoId}/avaliar`, {
        nota,
        comentario,
      });
      setAvaliado(true);
      setMostrarAvaliacao(false);
      fetchPedido();
    } catch (err) {
      setError("Erro ao enviar avaliação.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-[#EDEDED] flex items-center justify-center font-mono text-sm">
        Carregando pedido...
      </div>
    );
  }

  if (error || !pedido) {
    return (
      <div className="min-h-screen bg-black text-[#EDEDED] flex flex-col items-center justify-center gap-4">
        <span className="font-mono text-sm text-[#FF4444]">{error || "Erro ao carregar pedido."}</span>
        <button onClick={() => navigate("/")} className="font-mono text-xs text-[#00E559] hover:underline">
          ← Voltar para o início
        </button>
      </div>
    );
  }

  const currentStatusIndex = STATUS_FLOW.findIndex((s) => s.key === pedido.status);
  const isCancelado = pedido.status === "cancelado";

  return (
    <div className="min-h-screen bg-black text-[#EDEDED]">
      {/* Header */}
      <div className="h-14 bg-[#0A0A0A] border-b border-[#27272A] flex items-center justify-between px-4">
        <button onClick={() => navigate("/")} className="font-mono text-xs text-[#71717A] hover:text-[#EDEDED]">
          ← VOLTAR
        </button>
        <span className="font-mono text-sm text-[#00E559] tracking-widest">📦 ACOMPANHAR PEDIDO</span>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-[#00E559]" : "bg-[#FF4444]"}`} />
          <span className="font-mono text-[10px] text-[#71717A]">{wsConnected ? "AO VIVO" : "RECONECTANDO..."}</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 flex flex-col gap-6">
        {/* Número do pedido */}
        <div className="text-center">
          <div className="font-mono text-xs text-[#71717A]">PEDIDO</div>
          <div className="font-mono text-2xl font-bold text-[#EDEDED]">#{pedido.id.slice(-8).toUpperCase()}</div>
          <div className="font-mono text-xs text-[#71717A] mt-1">
            {formatDate(pedido.criadoEm)} · {formatTimeAgo(pedido.criadoEm)}
          </div>
        </div>

        {/* Status atual */}
        <div
          className="text-center py-4 border"
          style={{ borderColor: STATUS_COLORS[pedido.status] || "#71717A" }}
        >
          <div className="font-mono text-xs mb-1" style={{ color: STATUS_COLORS[pedido.status] || "#71717A" }}>
            STATUS ATUAL
          </div>
          <div className="font-mono text-xl font-bold">
            {isCancelado ? "❌ CANCELADO" : STATUS_FLOW[currentStatusIndex]?.label || pedido.status.toUpperCase()}
          </div>
          {pedido.motivoCancelamento && (
            <div className="font-mono text-[10px] text-[#FF4444] mt-1">{pedido.motivoCancelamento}</div>
          )}
        </div>

        {/* Timeline visual */}
        {!isCancelado && (
          <div className="flex flex-col gap-0">
            {STATUS_FLOW.map((step, idx) => {
              const isCompleted = idx <= currentStatusIndex;
              const isCurrent = idx === currentStatusIndex;
              return (
                <div key={step.key} className="flex items-start gap-3">
                  {/* Linha + Bolinha */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 flex items-center justify-center rounded-full border-2 text-sm ${
                        isCompleted
                          ? "border-[#00E559] text-[#00E559]"
                          : "border-[#27272A] text-[#3F3F46]"
                      }`}
                    >
                      {isCompleted ? "✓" : step.icon}
                    </div>
                    {idx < STATUS_FLOW.length - 1 && (
                      <div
                        className={`w-0.5 h-10 ${
                          idx < currentStatusIndex ? "bg-[#00E559]" : "bg-[#27272A]"
                        }`}
                      />
                    )}
                  </div>
                  {/* Texto */}
                  <div className="pt-1 pb-6">
                    <div
                      className={`font-mono text-sm font-bold ${
                        isCurrent ? "text-[#00E559]" : isCompleted ? "text-[#EDEDED]" : "text-[#3F3F46]"
                      }`}
                    >
                      {step.label}
                    </div>
                    <div
                      className={`font-mono text-xs ${
                        isCurrent || isCompleted ? "text-[#71717A]" : "text-[#3F3F46]"
                      }`}
                    >
                      {step.desc}
                    </div>
                    {isCurrent && pedido.statusTimeline && (
                      <div className="font-mono text-[10px] text-[#00E559] mt-1">
                        {formatTimeAgo(
                          pedido.statusTimeline.find((t) => t.status === step.key)?.timestamp || pedido.criadoEm
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Detalhes do pedido */}
        <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-3">
          <span className="font-mono text-xs text-[#71717A] tracking-widest">DETALHES</span>
          <div className="flex justify-between font-mono text-xs">
            <span className="text-[#71717A]">Cliente</span>
            <span className="text-[#EDEDED]">{pedido.clienteNome}</span>
          </div>
          <div className="flex justify-between font-mono text-xs">
            <span className="text-[#71717A]">Telefone</span>
            <span className="text-[#EDEDED]">{pedido.clienteTelefone}</span>
          </div>
          <div className="flex justify-between font-mono text-xs">
            <span className="text-[#71717A]">Tipo</span>
            <span className="text-[#EDEDED]">{pedido.tipo === "entrega" ? "🛵 Entrega" : "🏪 Retirada"}</span>
          </div>
          <div className="flex justify-between font-mono text-xs">
            <span className="text-[#71717A]">Pagamento</span>
            <span className="text-[#EDEDED]">{pedido.pagamento}</span>
          </div>
          {pedido.endereco && (
            <div className="font-mono text-xs text-[#A1A1AA] bg-black p-2 border border-[#27272A]">
              📍 {pedido.endereco.rua}, {pedido.endereco.numero} — {pedido.endereco.bairro}
              {pedido.endereco.referencia && ` · Ref: ${pedido.endereco.referencia}`}
            </div>
          )}
          <div className="border-t border-[#27272A] pt-2 flex flex-col gap-1">
            {pedido.itens?.map((item, idx) => (
              <div key={idx} className="flex justify-between font-mono text-xs">
                <span className="text-[#EDEDED]">
                  {item.qtd}x {item.nome}
                </span>
                <span className="text-[#A1A1AA]">R$ {(item.qtd * item.precoUnitario).toFixed(2)}</span>
              </div>
            ))}
            <div className="border-t border-[#27272A] mt-1 pt-1 flex flex-col gap-0.5">
              <div className="flex justify-between font-mono text-xs text-[#71717A]">
                <span>Subtotal</span>
                <span>R$ {Number(pedido.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-mono text-xs text-[#71717A]">
                <span>Taxa de entrega</span>
                <span>R$ {Number(pedido.taxaEntrega).toFixed(2)}</span>
              </div>
              {pedido.desconto > 0 && (
                <div className="flex justify-between font-mono text-xs text-[#00E559]">
                  <span>Desconto</span>
                  <span>-R$ {Number(pedido.desconto).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-mono text-sm font-bold text-[#00E559]">
                <span>TOTAL</span>
                <span>R$ {Number(pedido.total).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Avaliação */}
        {mostrarAvaliacao && (
          <div className="bg-[#0A0A0A] border border-[#00E559] p-4 flex flex-col gap-3">
            <span className="font-mono text-sm text-[#00E559]">⭐ AVALIE SEU PEDIDO</span>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setNota(n)}
                  className="text-2xl transition-transform hover:scale-110"
                >
                  {n <= nota ? "⭐" : "☆"}
                </button>
              ))}
            </div>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Como foi sua experiência? (opcional)"
              rows={3}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-3 py-2 focus:outline-none focus:border-[#00E559] resize-none"
            />
            <button
              onClick={handleAvaliar}
              className="bg-[#00E559] text-black font-mono text-xs font-bold py-2 hover:bg-[#00c44d] transition-colors"
            >
              ENVIAR AVALIAÇÃO
            </button>
          </div>
        )}

        {pedido.avaliacao && (
          <div className="bg-[#0A0A0A] border border-[#27272A] p-4 text-center">
            <div className="font-mono text-xs text-[#71717A]">SUA AVALIAÇÃO</div>
            <div className="text-xl mt-1">
              {"⭐".repeat(pedido.avaliacao.nota)}{"☆".repeat(5 - pedido.avaliacao.nota)}
            </div>
            {pedido.avaliacao.comentario && (
              <div className="font-mono text-xs text-[#A1A1AA] mt-2">"{pedido.avaliacao.comentario}"</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

