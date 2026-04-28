import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";

const WS_BASE = (process.env.REACT_APP_BACKEND_URL || "http://localhost:8000")
  .replace(/^http/, "ws");

const STATUS_COLORS = {
  disponivel: "#00E559",
  ocupado:    "#FFB800",
  offline:    "#FF4444",
};

// ── Card de notificação de pedido ─────────────────────────────────────────────
function PedidoNotificacao({ pedido, onAceitar, onRecusar, aceitando }) {
  const [timer, setTimer] = useState(30); // 30s para responder

  useEffect(() => {
    if (timer <= 0) { onRecusar(pedido.orderId, "timeout"); return; }
    const t = setTimeout(() => setTimer(t => t - 1), 1000);
    return () => clearTimeout(t);
  }, [timer, pedido.orderId, onRecusar]);

  const urgente = timer <= 10;

  return (
    <div className={`fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4`}>
      {/* Pulso de fundo */}
      <div className={`absolute inset-0 ${urgente ? "animate-pulse bg-[#FF4444]/5" : "bg-[#00E559]/5"}`} />

      <div className="relative bg-[#0A0A0A] border-2 border-[#00E559] w-full max-w-sm flex flex-col overflow-hidden">

        {/* Barra de timer */}
        <div
          className="h-1 transition-all duration-1000"
          style={{
            width: `${(timer / 30) * 100}%`,
            background: urgente ? "#FF4444" : "#00E559",
          }}
        />

        {/* Header */}
        <div className="px-4 py-3 border-b border-[#27272A] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl animate-bounce">🛵</span>
            <span className="font-mono text-sm text-[#00E559] font-bold tracking-widest">NOVO PEDIDO!</span>
          </div>
          <span className={`font-mono text-lg font-bold ${urgente ? "text-[#FF4444]" : "text-[#FFB800]"}`}>
            {timer}s
          </span>
        </div>

        {/* Detalhes do pedido */}
        <div className="p-4 flex flex-col gap-3">

          {/* Restaurante → Cliente */}
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <span className="text-base shrink-0">🏪</span>
              <div className="flex flex-col">
                <span className="font-mono text-[10px] text-[#71717A]">RETIRAR EM</span>
                <span className="font-mono text-sm text-[#EDEDED]">{pedido.restaurante}</span>
              </div>
            </div>
            <div className="ml-4 w-px h-4 bg-[#27272A]" />
            <div className="flex items-start gap-2">
              <span className="text-base shrink-0">🏠</span>
              <div className="flex flex-col">
                <span className="font-mono text-[10px] text-[#71717A]">ENTREGAR EM</span>
                <span className="font-mono text-sm text-[#EDEDED]">{pedido.endereco}</span>
                {pedido.referencia && (
                  <span className="font-mono text-[10px] text-[#71717A]">Ref: {pedido.referencia}</span>
                )}
              </div>
            </div>
          </div>

          {/* Distância + Valor */}
          <div className="grid grid-cols-3 gap-2 border-t border-[#27272A] pt-3">
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-mono text-[10px] text-[#71717A]">DISTÂNCIA</span>
              <span className="font-mono text-sm text-[#EDEDED] font-bold">{pedido.distanciaKm ?? "—"} km</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-mono text-[10px] text-[#71717A]">TAXA</span>
              <span className="font-mono text-sm text-[#00E559] font-bold">
                R$ {Number(pedido.taxaEntrega ?? 5).toFixed(2)}
              </span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-mono text-[10px] text-[#71717A]">PAGAMENTO</span>
              <span className="font-mono text-xs text-[#FFB800] font-bold">{pedido.pagamento || "—"}</span>
            </div>
          </div>

          {/* Itens resumidos */}
          <div className="bg-[#111] border border-[#27272A] px-3 py-2 flex flex-col gap-1">
            <span className="font-mono text-[10px] text-[#71717A]">ITENS</span>
            {(pedido.itens || []).slice(0, 3).map((item, i) => (
              <span key={i} className="font-mono text-xs text-[#A1A1AA]">
                › {item.qtd}x {item.name}
              </span>
            ))}
            {(pedido.itens || []).length > 3 && (
              <span className="font-mono text-[10px] text-[#3F3F46]">
                +{pedido.itens.length - 3} itens
              </span>
            )}
          </div>

          {/* Observação */}
          {pedido.observacao && (
            <div className="bg-[#FFB800]/5 border border-[#FFB800]/30 px-3 py-2">
              <span className="font-mono text-xs text-[#FFB800]">📝 {pedido.observacao}</span>
            </div>
          )}
        </div>

        {/* Botões */}
        <div className="grid grid-cols-2 border-t border-[#27272A]">
          <button
            onClick={() => onRecusar(pedido.orderId, "recusado")}
            disabled={aceitando}
            className="py-4 font-mono text-sm font-bold text-[#FF4444] border-r border-[#27272A] hover:bg-[#FF4444]/10 transition-colors disabled:opacity-40"
          >
            ✕ RECUSAR
          </button>
          <button
            onClick={() => onAceitar(pedido.orderId)}
            disabled={aceitando}
            className="py-4 font-mono text-sm font-bold text-black bg-[#00E559] hover:bg-[#00c44d] transition-colors disabled:opacity-40"
          >
            {aceitando ? "..." : "✓ ACEITAR"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tela principal do entregador ──────────────────────────────────────────────
export function EntregadorApp() {
  const { id: entregadorId } = useParams();

  const [status, setStatus]           = useState("disponivel");
  const [conectado, setConectado]     = useState(false);
  const [pedidoPendente, setPedidoPendente] = useState(null);
  const [pedidoAtual, setPedidoAtual] = useState(null);
  const [historico, setHistorico]     = useState([]);
  const [aceitando, setAceitando]     = useState(false);
  const [ganhosDia, setGanhosDia]     = useState(0);
  const [totalEntregas, setTotalEntregas] = useState(0);

  const wsRef = useRef(null);

  const conectar = useCallback(() => {
    if (!entregadorId) return;
    const ws = new WebSocket(`${WS_BASE}/ws/entregador/${entregadorId}`);
    wsRef.current = ws;

    ws.onopen = () => setConectado(true);

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        if (data.type === "novo_pedido") {
          // Toca notificação sonora (se suportado)
          new Audio("/notification.mp3").play().catch(() => {});
          setPedidoPendente(data.pedido);
        }

        if (data.type === "pedido_cancelado") {
          if (pedidoAtual?.orderId === data.orderId) {
            setPedidoAtual(null);
            setStatus("disponivel");
          }
          setPedidoPendente(null);
        }
      } catch {}
    };

    ws.onclose = () => {
      setConectado(false);
      // Reconecta após 1s (mais rápido)
      setTimeout(conectar, 1000);
    };

    ws.onerror = () => ws.close();
  }, [entregadorId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    conectar();
    return () => wsRef.current?.close();
  }, [conectar]);

  // Envia resposta ao backend
  const responder = (orderId, resposta) => {
    wsRef.current?.send(JSON.stringify({ type: "resposta", orderId, resposta, entregadorId }));
  };

  const handleAceitar = async (orderId) => {
    setAceitando(true);
    responder(orderId, "aceito");
    setPedidoAtual(pedidoPendente);
    setStatus("ocupado");
    setPedidoPendente(null);
    setAceitando(false);
  };

  const handleRecusar = (orderId, motivo) => {
    responder(orderId, motivo === "timeout" ? "timeout" : "recusado");
    setPedidoPendente(null);
  };

  const handleConcluir = () => {
    if (!pedidoAtual) return;
    const taxa = Number(pedidoAtual.taxaEntrega ?? 5);
    setGanhosDia(g => g + taxa);
    setTotalEntregas(t => t + 1);
    setHistorico(h => [{
      ...pedidoAtual,
      concluidoEm: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      taxa,
    }, ...h]);
    responder(pedidoAtual.orderId, "entregue");
    setPedidoAtual(null);
    setStatus("disponivel");
  };

  const toggleStatus = () => {
    const next = status === "disponivel" ? "offline" : "disponivel";
    setStatus(next);
    wsRef.current?.send(JSON.stringify({ type: "status", status: next, entregadorId }));
  };

  return (
    <div className="min-h-screen bg-black text-[#EDEDED] flex flex-col">

      {/* Notificação de pedido */}
      {pedidoPendente && (
        <PedidoNotificacao
          pedido={pedidoPendente}
          onAceitar={handleAceitar}
          onRecusar={handleRecusar}
          aceitando={aceitando}
        />
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272A] bg-[#0A0A0A]">
        <div className="flex items-center gap-3">
          <span className="text-xl">🛵</span>
          <div className="flex flex-col">
            <span className="font-mono text-xs text-[#00E559] tracking-widest">ENTREGADOR</span>
            <span className="font-mono text-[10px] text-[#71717A]">ID: {entregadorId}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Indicador WS */}
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${conectado ? "bg-[#00E559] animate-pulse" : "bg-[#FF4444]"}`} />
            <span className="font-mono text-[10px] text-[#71717A]">{conectado ? "ONLINE" : "OFFLINE"}</span>
          </div>

          {/* Toggle disponível/offline */}
          <button
            onClick={toggleStatus}
            disabled={status === "ocupado"}
            className={`font-mono text-[10px] px-3 py-1.5 border transition-colors disabled:opacity-40 ${
              status === "disponivel"
                ? "border-[#00E559] text-[#00E559] hover:bg-[#00E559]/10"
                : status === "ocupado"
                ? "border-[#FFB800] text-[#FFB800]"
                : "border-[#FF4444] text-[#FF4444] hover:bg-[#FF4444]/10"
            }`}
          >
            ● {status.toUpperCase()}
          </button>
        </div>
      </div>

      {/* ── Resumo do dia ── */}
      <div className="grid grid-cols-3 border-b border-[#27272A]">
        {[
          { label: "ENTREGAS HOJE", value: totalEntregas, color: "#EDEDED" },
          { label: "GANHOS HOJE",   value: `R$ ${ganhosDia.toFixed(2)}`, color: "#00E559" },
          { label: "STATUS",        value: status.toUpperCase(), color: STATUS_COLORS[status] },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex flex-col items-center py-3 border-r border-[#27272A] last:border-r-0">
            <span className="font-mono text-[10px] text-[#71717A]">{label}</span>
            <span className="font-mono text-sm font-bold" style={{ color }}>{value}</span>
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col gap-4 p-4 max-w-lg mx-auto w-full">

        {/* ── Pedido em andamento ── */}
        {pedidoAtual ? (
          <div className="bg-[#0A0A0A] border border-[#FFB800] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[#27272A] flex items-center justify-between bg-[#FFB800]/5">
              <span className="font-mono text-xs text-[#FFB800] tracking-widest font-bold">🛵 EM ENTREGA</span>
              <span className="font-mono text-xs text-[#71717A]">{pedidoAtual.orderId}</span>
            </div>

            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <span className="text-base">🏪</span>
                <div>
                  <span className="font-mono text-[10px] text-[#71717A]">RETIRAR EM</span>
                  <p className="font-mono text-sm text-[#EDEDED]">{pedidoAtual.restaurante}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-base">🏠</span>
                <div>
                  <span className="font-mono text-[10px] text-[#71717A]">ENTREGAR EM</span>
                  <p className="font-mono text-sm text-[#EDEDED]">{pedidoAtual.endereco}</p>
                  {pedidoAtual.referencia && (
                    <p className="font-mono text-[10px] text-[#71717A]">Ref: {pedidoAtual.referencia}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[#27272A] pt-3">
                <span className="font-mono text-xs text-[#71717A]">
                  💳 {pedidoAtual.pagamento}
                </span>
                <span className="font-mono text-sm text-[#00E559] font-bold">
                  Taxa: R$ {Number(pedidoAtual.taxaEntrega ?? 5).toFixed(2)}
                </span>
              </div>

              {pedidoAtual.observacao && (
                <div className="bg-[#FFB800]/5 border border-[#FFB800]/30 px-3 py-2">
                  <span className="font-mono text-xs text-[#FFB800]">📝 {pedidoAtual.observacao}</span>
                </div>
              )}
            </div>

            <button
              onClick={handleConcluir}
              className="w-full py-3 bg-[#00E559] text-black font-mono text-sm font-bold hover:bg-[#00c44d] transition-colors"
            >
              ✓ CONFIRMAR ENTREGA
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-4xl">{status === "offline" ? "😴" : "⏳"}</span>
            <span className="font-mono text-xs text-[#3F3F46] text-center">
              {status === "offline"
                ? "VOCÊ ESTÁ OFFLINE\nAltere o status para receber pedidos"
                : "AGUARDANDO PEDIDOS...\nVocê receberá uma notificação"}
            </span>
          </div>
        )}

        {/* ── Histórico do dia ── */}
        {historico.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] text-[#71717A] tracking-widest">HISTÓRICO DE HOJE</span>
            {historico.map((h, i) => (
              <div key={i} className="bg-[#0A0A0A] border border-[#27272A] px-4 py-3 flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-xs text-[#EDEDED]">{h.endereco}</span>
                  <span className="font-mono text-[10px] text-[#71717A]">{h.concluidoEm} · {h.restaurante}</span>
                </div>
                <span className="font-mono text-sm text-[#00E559] font-bold">
                  +R$ {Number(h.taxa).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
