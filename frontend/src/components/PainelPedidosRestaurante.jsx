import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { subscribePush } from "@/lib/pushNotifications";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

const STATUS_LABELS = {
  pendente: { label: "PENDENTE", color: "#FFB000", bg: "#FFB000/10" },
  confirmado: { label: "CONFIRMADO", color: "#00E559", bg: "#00E559/10" },
  em_preparo: { label: "EM PREPARO", color: "#007AFF", bg: "#007AFF/10" },
  pronto: { label: "PRONTO", color: "#00E559", bg: "#00E559/20" },
  em_entrega: { label: "EM ENTREGA", color: "#A855F7", bg: "#A855F7/10" },
  entregue: { label: "ENTREGUE", color: "#71717A", bg: "transparent" },
  cancelado: { label: "CANCELADO", color: "#FF4444", bg: "#FF4444/10" },
};

const STATUS_FLOW = [
  "pendente",
  "confirmado",
  "em_preparo",
  "pronto",
  "em_entrega",
  "entregue",
];

const STATUS_ACTIONS = {
  pendente: [
    { status: "confirmado", label: "✓ ACEITAR", color: "#00E559" },
    { status: "cancelado", label: "✕ REJEITAR", color: "#FF4444" },
  ],
  confirmado: [
    { status: "em_preparo", label: "👨‍🍳 INICIAR PREPARO", color: "#007AFF" },
    { status: "cancelado", label: "✕ CANCELAR", color: "#FF4444" },
  ],
  em_preparo: [
    { status: "pronto", label: "✓ PRONTO", color: "#00E559" },
  ],
  pronto: [
    { status: "em_entrega", label: "🛵 DESPACHAR", color: "#A855F7" },
  ],
  em_entrega: [
    { status: "entregue", label: "✓ ENTREGUE", color: "#71717A" },
  ],
};

// Som de notificação (usando Audio API)
const playNotificationSound = () => {
  try {
    const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleR0NZKrk7rNsGgxJkNTsvXwkDk+L0O+0dSQPUIjN7LVyJQ5MiMzrsnMiD0uGzOuwdyQPS4bL6q12JA9LhsnprnYkD0uGyOerdyQPS4XG5Kl2JA9LhcTkpnYkD0uFv+OkdSQP");
    audio.volume = 0.5;
    audio.play();
  } catch {
    // Fallback: beep usando Web Audio API
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  }
};

const formatTimeAgo = (isoDate) => {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  if (minutes === 0) return `${seconds}s`;
  if (minutes < 60) return `${minutes}min ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}min`;
};

export function PainelPedidosRestaurante() {
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [novoPedidoAlert, setNovoPedidoAlert] = useState(false);
  const wsRef = useRef(null);
  const prevPedidosRef = useRef([]);
  const audioEnabledRef = useRef(false);
  const [delayAlerts, setDelayAlerts] = useState([]);

  const restauranteId = "teste"; // TODO: pegar do contexto/auth real

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    try {
      const params = { restaurante_id: restauranteId, limit: 100 };
      if (filtroStatus !== "todos") params.status = filtroStatus;
      const res = await axios.get(`${API}/pedidos`, { params });
      const novos = res.data.pedidos || [];
      // Detecta novos pedidos pendentes
      const prevIds = new Set(prevPedidosRef.current.map((p) => p.id));
      const temNovo = novos.some((p) => p.status === "pendente" && !prevIds.has(p.id));
      if (temNovo && audioEnabledRef.current) {
        playNotificationSound();
        setNovoPedidoAlert(true);
        setTimeout(() => setNovoPedidoAlert(false), 5000);
      }
      prevPedidosRef.current = novos;
      setPedidos(novos);
    } catch (err) {
      setError(`Erro ao carregar pedidos: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [filtroStatus, restauranteId]);

  // Conecta WebSocket para updates em tempo real
  useEffect(() => {
    const connectWS = () => {
      const ws = new WebSocket(`ws://localhost:8000/ws/track/${restauranteId}`);
      ws.onopen = () => {
        console.log("[WS] Conectado ao painel de pedidos");
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "pedido_status_update") {
            fetchPedidos();
            if (data.status === "pendente") {
              playNotificationSound();
              setNovoPedidoAlert(true);
              setTimeout(() => setNovoPedidoAlert(false), 5000);
            }
          }
        } catch {}
      };
      ws.onclose = () => {
        console.log("[WS] Desconectado, reconectando em 3s...");
        setTimeout(connectWS, 3000);
      };
      ws.onerror = () => ws.close();
      wsRef.current = ws;
    };
    connectWS();
    return () => wsRef.current?.close();
  }, [fetchPedidos, restauranteId]);

  // Polling de fallback (a cada 10s)
  useEffect(() => {
    fetchPedidos();
    const interval = setInterval(fetchPedidos, 10000);
    return () => clearInterval(interval);
  }, [fetchPedidos]);

  // Inscreve para notificações push do restaurante
  useEffect(() => {
    subscribePush("restaurante", restauranteId, restauranteId);
  }, [restauranteId]);

  // Habilita áudio após primeiro clique do usuário
  const enableAudio = () => {
    audioEnabledRef.current = true;
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const alerts = pedidos.filter(p => p.status === 'pendente' && (Date.now() - new Date(p.criadoEm).getTime()) > 15 * 60 * 1000).map(p => p.id);
      setDelayAlerts(alerts);
    }, 60000);
    return () => clearInterval(interval);
  }, [pedidos]);

  const reimprimirPedido = (pedido) => {
    const html = `
<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: monospace; font-size: 10px; margin: 0; padding: 10mm; max-width: 80mm; }
h2 { text-align: center; margin-bottom: 5mm; }
li { margin: 1mm 0; }
.total { font-weight: bold; font-size: 12px; text-align: right; }
</style>
</head>
<body>
<h2>#${pedido.id.slice(-6).toUpperCase()}</h2>
<p>Cliente: ${pedido.clienteNome}</p>
<p>Tel: ${pedido.clienteTelefone}</p>
<ul>
${pedido.itens.map(i => `<li>${i.qtd}x ${i.nome} <span style='float:right'>R$ ${(i.qtd * i.precoUnitario).toFixed(2).replace('.', ',')}</span></li>`).join('')}
</ul>
<p class="total">Total: R$ ${pedido.total.toFixed(2).replace('.', ',')}</p>
${pedido.observacao ? `<p>Obs: ${pedido.observacao}</p>` : ''}
<script>window.onload = () => { window.print(); setTimeout(() => window.close(), 1000); }</script>
</body>
</html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  };

  const handleStatusChange = async (pedidoId, novoStatus, motivo = null) => {
    try {
      await axios.patch(`${API}/pedidos/${pedidoId}/status`, {
        status: novoStatus,
        motivoCancelamento: motivo,
      });
      fetchPedidos();
    } catch (err) {
      setError(`Erro ao atualizar status: ${err.message}`);
    }
  };

  const pedidosFiltrados =
    filtroStatus === "todos"
      ? pedidos
      : pedidos.filter((p) => p.status === filtroStatus);

  const pedidosAtivos = pedidos.filter((p) =>
    ["pendente", "confirmado", "em_preparo", "pronto", "em_entrega"].includes(p.status)
  );

  const contagemPorStatus = pedidos.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-black text-[#EDEDED]" onClick={enableAudio}>
      {/* Alerta de novo pedido */}
      {novoPedidoAlert && (
        <div className="fixed top-4 right-4 z-50 bg-[#FFB000] text-black px-4 py-3 rounded font-mono text-sm font-bold animate-pulse shadow-lg">
          🔔 NOVO PEDIDO RECEBIDO!
        </div>
      )}

      {/* Header */}
      <div className="h-14 bg-[#0A0A0A] border-b border-[#27272A] flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="font-mono text-xs text-[#71717A] hover:text-[#EDEDED]">
            ← VOLTAR
          </button>
          <span className="font-mono text-sm text-[#00E559] tracking-widest">📋 PAINEL DE PEDIDOS</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-[#71717A]">
            {pedidosAtivos.length} PEDIDO{pedidosAtivos.length !== 1 ? "S" : ""} ATIVO{pedidosAtivos.length !== 1 ? "S" : ""}
          </span>
          <button onClick={fetchPedidos} className="font-mono text-xs px-3 py-1 border border-[#27272A] text-[#71717A] hover:text-[#EDEDED] transition-colors">
            ↻ ATUALIZAR
          </button>
        </div>
      </div>

      <div className="p-4 max-w-7xl mx-auto flex flex-col gap-4">
        {/* Filtros de status */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFiltroStatus("todos")}
            className={`font-mono text-xs px-3 py-1.5 border transition-colors ${
              filtroStatus === "todos"
                ? "border-[#00E559] text-[#00E559] bg-[#00E559]/10"
                : "border-[#27272A] text-[#71717A] hover:border-[#3F3F46]"
            }`}
          >
            TODOS ({pedidos.length})
          </button>
          {STATUS_FLOW.map((s) => (
            <button
              key={s}
              onClick={() => setFiltroStatus(s)}
              className={`font-mono text-xs px-3 py-1.5 border transition-colors ${
                filtroStatus === s
                  ? `border-[${STATUS_LABELS[s].color}] text-[${STATUS_LABELS[s].color}]`
                  : "border-[#27272A] text-[#71717A] hover:border-[#3F3F46]"
              }`}
              style={
                filtroStatus === s
                  ? { borderColor: STATUS_LABELS[s].color, color: STATUS_LABELS[s].color }
                  : {}
              }
            >
              {STATUS_LABELS[s].label} ({contagemPorStatus[s] || 0})
            </button>
          ))}
          <button
            onClick={() => setFiltroStatus("cancelado")}
            className={`font-mono text-xs px-3 py-1.5 border transition-colors ${
              filtroStatus === "cancelado"
                ? "border-[#FF4444] text-[#FF4444] bg-[#FF4444]/10"
                : "border-[#27272A] text-[#71717A] hover:border-[#3F3F46]"
            }`}
          >
            CANCELADOS ({contagemPorStatus.cancelado || 0})
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="font-mono text-xs text-[#FF4444] border border-[#FF4444]/30 bg-[#FF4444]/5 px-3 py-2 flex justify-between">
            {error}
            <button onClick={() => setError("")} className="text-[#71717A] hover:text-[#EDEDED]">✕</button>
          </div>
        )}

        {/* Lista de pedidos */}
        {loading && pedidos.length === 0 ? (
          <div className="text-center font-mono text-xs text-[#71717A] py-12">CARREGANDO PEDIDOS...</div>
        ) : pedidosFiltrados.length === 0 ? (
          <div className="text-center font-mono text-xs text-[#3F3F46] py-12">
            {filtroStatus === "todos" ? "NENHUM PEDIDO ENCONTRADO" : `NENHUM PEDIDO ${STATUS_LABELS[filtroStatus]?.label}`}
          </div>
        ) : (
          <div className="grid gap-3">
            {pedidosFiltrados.map((pedido) => {
              const statusInfo = STATUS_LABELS[pedido.status] || STATUS_LABELS.pendente;
              const acoes = STATUS_ACTIONS[pedido.status] || [];
              const tempoDesdeCriacao = formatTimeAgo(pedido.criadoEm);

              return (
                <div
                  key={pedido.id}
                  className={`bg-[#0A0A0A] border p-4 flex flex-col gap-3 transition-all ${
                    pedido.status === "pendente" ? "border-[#FFB000] animate-pulse" : "border-[#27272A]"
                  }`}
                >
                  {/* Header do pedido */}
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-bold text-[#EDEDED]">
                          #{pedido.id.slice(-6).toUpperCase()}
                        </span>
                        <span
                          className="font-mono text-[10px] px-2 py-0.5 border"
                          style={{ color: statusInfo.color, borderColor: statusInfo.color }}
                        >
                          {statusInfo.label}
                        </span>
                        {pedido.agendado && (
                          <span className="font-mono text-[10px] text-[#A855F7] border border-[#A855F7] px-2 py-0.5">
                            AGENDADO {pedido.horarioAgendado}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 font-mono text-xs text-[#71717A]">
                        <span>👤 {pedido.clienteNome}</span>
                        <span>📞 {pedido.clienteTelefone}</span>
                        <span>🕐 {tempoDesdeCriacao}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-lg font-bold text-[#00E559]">
                        R$ {Number(pedido.total).toFixed(2)}
                      </div>
                      <div className="font-mono text-[10px] text-[#71717A]">
                        {pedido.tipo === "entrega" ? "🛵 Entrega" : "🏪 Retirada"} · {pedido.pagamento}
                      </div>
                    </div>
                  </div>

                  {/* 15min delay alert */}
                  {pedido.status === 'pendente' && delayAlerts.includes(pedido.id) && (
                    <div className="bg-[#FF4444]/20 border border-[#FF4444] p-2 rounded animate-pulse">
                      <span className="font-mono text-xs font-bold text-[#FF4444]">⚠️ PEDIDO ATRASADO >15min!</span>
                    </div>
                  )}

                  {/* Endereço (se entrega) */}
                  {pedido.tipo === "entrega" && pedido.endereco && (
                    <div className="font-mono text-xs text-[#A1A1AA] bg-black p-2 border border-[#27272A]">
                      📍 {pedido.endereco.rua}, {pedido.endereco.numero} — {pedido.endereco.bairro}
                      {pedido.endereco.referencia && ` · Ref: ${pedido.endereco.referencia}`}
                    </div>
                  )}

                  {/* Itens */}
                  <div className="flex flex-col gap-1">
                    {pedido.itens?.map((item, idx) => (
                      <div key={idx} className="flex justify-between font-mono text-sm leading-4">
                        <span className="text-[#EDEDED]">
                          {item.qtd}x {item.nome}
                          {item.tamanho && ` (${item.tamanho})`}
                          {item.observacao && <span className="text-[#71717A]"> — {item.observacao}</span>}
                        </span>
                        <span className="text-[#A1A1AA]">
                          R$ {(item.qtd * item.precoUnitario).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    <div className="border-t border-[#27272A] mt-1 pt-1 flex justify-between font-mono text-xs text-[#71717A]">
                      <span>Subtotal: R$ {Number(pedido.subtotal).toFixed(2)}</span>
                      <span>Taxa: R$ {Number(pedido.taxaEntrega).toFixed(2)}</span>
                      {pedido.desconto > 0 && <span>Desconto: -R$ {Number(pedido.desconto).toFixed(2)}</span>}
                    </div>
                  </div>

                  {/* Observação */}
                  {pedido.observacao && (
                    <div className="font-mono text-[10px] text-[#FFB000] bg-[#FFB000]/5 p-2 border border-[#FFB000]/20">
                      📝 {pedido.observacao}
                    </div>
                  )}

                  {/* Timeline */}
                  {pedido.statusTimeline && pedido.statusTimeline.length > 1 && (
                    <div className="flex gap-1">
                      {pedido.statusTimeline.map((t, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <span
                            className="font-mono text-[9px] px-1.5 py-0.5"
                            style={{ color: STATUS_LABELS[t.status]?.color || "#71717A" }}
                          >
                            {STATUS_LABELS[t.status]?.label || t.status}
                          </span>
                          {i < pedido.statusTimeline.length - 1 && (
                            <span className="text-[#3F3F46]">→</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ações */}
                  {acoes.length > 0 && (
                    <div className="flex gap-2 pt-1">
                      {acoes.map((acao) => (
                        <button
                          key={acao.status}
                          onClick={() => {
                            if (acao.status === "cancelado") {
                              const motivo = window.prompt("Motivo do cancelamento:");
                              if (motivo) handleStatusChange(pedido.id, acao.status, motivo);
                            } else {
                              handleStatusChange(pedido.id, acao.status);
                            }
                          }}
                          className="font-mono text-xs px-4 py-2 font-bold transition-colors"
                          style={{
                            backgroundColor: acao.status === "cancelado" ? "transparent" : acao.color,
                            color: acao.status === "cancelado" ? acao.color : "#000",
                            border: `1px solid ${acao.color}`,
                          }}
                        >
                          {acao.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <button onClick={() => reimprimirPedido(pedido)} className="font-mono text-xs px-4 py-2 bg-[#007AFF] text-white font-bold hover:bg-[#0056b3] transition-colors mt-1">
                    🖨 Reimprimir
                  </button>

                  {/* Motivo cancelamento */}
                  {pedido.status === "cancelado" && pedido.motivoCancelamento && (
                    <div className="font-mono text-[10px] text-[#FF4444]">
                      Motivo: {pedido.motivoCancelamento}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

