import { useState } from "react";
import axios from "axios";
import { TrackingScreen } from "./TrackingScreen";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

const MOCK_ENTREGADORES = [
  { id: "e1", nome: "Carlos Silva", status: "disponível", distancia: "0.8km", placa: "ABC-1234", telefone: "" },
  { id: "e2", nome: "Ana Souza",   status: "disponível", distancia: "1.2km", placa: "DEF-5678", telefone: "" },
  { id: "e3", nome: "Pedro Lima",  status: "em entrega", distancia: "2.1km", placa: "GHI-9012", telefone: "" },
];

export function EntregadorPage({ pedidosEntrega = [], onAtribuir, onConcluir, restaurante }) {
  const [selecionado, setSelecionado] = useState({});
  const [rastreando, setRastreando] = useState(null); // pedido sendo rastreado

  const [despachando, setDespachando] = useState({});
  const [feedbacks, setFeedbacks]     = useState({});

  const despachar = async (pedido) => {
    const entregadorId = selecionado[pedido.id];
    if (!entregadorId) return;
    const entregador = MOCK_ENTREGADORES.find(e => e.id === entregadorId);
    setDespachando(d => ({ ...d, [pedido.id]: true }));
    try {
      await axios.post(`${API}/entregador/despachar`, {
        entregadorId,
        orderId: pedido.id,
        restaurante: restaurante?.nome || "Restaurante",
        endereco: pedido.endereco ? `${pedido.endereco.rua}, ${pedido.endereco.numero}` : "",
        referencia: pedido.endereco?.referencia || "",
        itens: (pedido.itensCompletos || pedido.items?.map(name => ({ name, qtd: 1 })) || []),
        pagamento: pedido.payment || "",
        observacao: pedido.observacao || "",
        taxaEntrega: 5.0,
      });
      setFeedbacks(f => ({ ...f, [pedido.id]: "ok" }));
      onAtribuir?.(pedido.id, entregadorId);
    } catch (err) {
      const detail = err.response?.data?.detail || "Erro ao despachar";
      setFeedbacks(f => ({ ...f, [pedido.id]: detail }));
    } finally {
      setDespachando(d => ({ ...d, [pedido.id]: false }));
      setTimeout(() => setFeedbacks(f => { const n = { ...f }; delete n[pedido.id]; return n; }), 4000);
    }
  };

  if (rastreando) {
    const entregadorId = selecionado[rastreando.id];
    const entregador = MOCK_ENTREGADORES.find(e => String(e.id) === String(entregadorId)) || MOCK_ENTREGADORES[0];
    return (
      <TrackingScreen
        orderId={rastreando.id}
        entregador={{
          nome: entregador.nome,
          placa: entregador.placa || "ABC-1234",
          telefone: entregador.telefone || "",
          foto: entregador.foto || null,
        }}
        restaurante={{
          nome: restaurante?.nome || "Restaurante",
          coords: restaurante?.coords || { lat: -23.5505, lng: -46.6333 },
        }}
        cliente={{
          endereco: rastreando.endereco ? `${rastreando.endereco.rua}, ${rastreando.endereco.numero}` : "Cliente",
          coords: rastreando.coords || { lat: -23.5605, lng: -46.6433 },
        }}
        onFechar={() => setRastreando(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto w-full">
      <h2 className="font-mono text-[#00E559] text-sm tracking-widest">PAINEL DO ENTREGADOR</h2>

      {/* Entregadores disponíveis */}
      <div className="bg-[#0A0A0A] border border-[#27272A] p-4">
        <span className="font-mono text-xs text-[#71717A] tracking-widest">ENTREGADORES</span>
        <div className="flex flex-wrap gap-3 mt-3">
          {MOCK_ENTREGADORES.map(e => (
            <div key={e.id} className="border border-[#27272A] px-3 py-2 flex flex-col gap-1">
              <span className="font-mono text-xs text-[#EDEDED]">{e.nome}</span>
              <div className="flex gap-2">
                <span className={`font-mono text-[10px] ${e.status === "disponível" ? "text-[#00E559]" : "text-[#FFB800]"}`}>
                  ● {e.status.toUpperCase()}
                </span>
                <span className="font-mono text-[10px] text-[#71717A]">{e.distancia}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pedidos aguardando entregador */}
      {pedidosEntrega.length === 0 ? (
        <div className="font-mono text-xs text-[#3F3F46] text-center py-8">
          NENHUMA ENTREGA PENDENTE
        </div>
      ) : (
        pedidosEntrega.map(pedido => (
          <div key={pedido.id} className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div>
                <span className="font-mono text-sm text-[#EDEDED]">#{pedido.id} — {pedido.cliente}</span>
                <div className="font-mono text-xs text-[#71717A] mt-1">
                  {pedido.endereco?.rua}, {pedido.endereco?.numero}
                  {pedido.endereco?.referencia && ` · ${pedido.endereco.referencia}`}
                </div>
              </div>
              <span className="font-mono text-sm text-[#00E559]">R$ {pedido.total?.toFixed(2)}</span>
            </div>

            {pedido.endereco?.foto && (
              <img src={pedido.endereco.foto} alt="frente da casa" className="w-24 h-24 object-cover border border-[#27272A]" />
            )}

            <div className="flex items-center gap-3">
              <select
                value={selecionado[pedido.id] || ""}
                onChange={e => setSelecionado(s => ({ ...s, [pedido.id]: e.target.value }))}
                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-3 py-2 focus:outline-none focus:border-[#00E559] flex-1"
              >
                <option value="">Selecionar entregador...</option>
                {MOCK_ENTREGADORES.filter(e => e.status === "disponível").map(e => (
                  <option key={e.id} value={e.id}>{e.nome} — {e.distancia}</option>
                ))}
              </select>
              <button
                onClick={() => despachar(pedido)}
                disabled={!selecionado[pedido.id] || despachando[pedido.id]}
                className="font-mono text-xs px-4 py-2 bg-[#00E559] text-black font-bold hover:bg-[#00c44d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {despachando[pedido.id] ? "..." : "🛵 DESPACHAR"}
              </button>
              {pedido.status === "em entrega" && (
                <>
                  <button onClick={() => setRastreando(pedido)}
                    className="font-mono text-xs px-4 py-2 border border-[#00BFFF] text-[#00BFFF] hover:bg-[#00BFFF]/10 transition-colors">
                    📍 RASTREAR
                  </button>
                  <button onClick={() => onConcluir?.(pedido.id)}
                    className="font-mono text-xs px-4 py-2 border border-[#00E559] text-[#00E559] hover:bg-[#00E559]/10 transition-colors">
                    ✓ CONCLUIR
                  </button>
                </>
              )}
            </div>

            {feedbacks[pedido.id] && (
              <div className={`font-mono text-xs px-3 py-2 border ${
                feedbacks[pedido.id] === "ok"
                  ? "border-[#00E559]/40 text-[#00E559] bg-[#00E559]/5"
                  : "border-[#FF4444]/40 text-[#FF4444] bg-[#FF4444]/5"
              }`}>
                {feedbacks[pedido.id] === "ok" ? "✓ Pedido enviado ao entregador" : `⚠ ${feedbacks[pedido.id]}`}
              </div>
            )}
            {pedido.status === "em entrega" && (
              <span className="font-mono text-xs text-[#FFB800]">
                🛵 EM ENTREGA — {MOCK_ENTREGADORES.find(e => String(e.id) === String(selecionado[pedido.id]))?.nome || "Entregador atribuído"}
              </span>
            )}
          </div>
        ))
      )}
    </div>
  );
}
