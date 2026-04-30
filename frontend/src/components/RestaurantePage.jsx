import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { DigitalMenu } from "@/components/DigitalMenu";
import { NovoPedido } from "@/components/NovoPedido";
import { Estoque } from "@/components/Estoque";
import { Financeiro } from "@/components/Financeiro";
import { Cardapio } from "@/components/Cardapio";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

const STATUS_OPTIONS = ["TODOS", "PENDENTE", "ACEITO", "EM PREPARO", "SAIU PARA ENTREGA", "FINALIZADO", "CANCELADO"];
const STATUS_COLORS = {
  PENDENTE: "#FFB800",
  ACEITO: "#00BFFF",
  "EM PREPARO": "#FF8C00",
  "SAIU PARA ENTREGA": "#A855F7",
  FINALIZADO: "#00E559",
  CANCELADO: "#FF4444",
};
const PAYMENT_ICONS = { PIX: "◈", DINHEIRO: "₿", CARTÃO: "▣", "VALE REFEIÇÃO": "◉" };
const OWNER_TOKEN = process.env.REACT_APP_OWNER_API_TOKEN || "ifood2-token-super-seguro-2026";

const MOCK_ORDERS = [
  { id: "#1042", client: "João S.", items: ["X-Burguer", "Coca-Cola"], total: 89.7, status: "FINALIZADO", type: "ENTREGA", payment: "PIX", time: "14:32", agendado: false, horarioAgendado: "", observacao: "", telefone: "(11) 99999-0001", endereco: { rua: "Rua das Flores", numero: "123", cep: "01310-100", referencia: "Próximo ao mercado" } },
  { id: "#1043", client: "Maria L.", items: ["Pizza Margherita"], total: 54.8, status: "EM PREPARO", type: "ENTREGA", payment: "CARTÃO", time: "14:45", agendado: true, horarioAgendado: new Date(Date.now() + 25 * 60000).toISOString(), observacao: "Sem cebola", telefone: "(11) 98888-0002", endereco: { rua: "Av. Paulista", numero: "900", cep: "01310-200", referencia: "" } },
  { id: "#1044", client: "Carlos M.", items: ["X-Bacon Duplo"], total: 28.9, status: "PENDENTE", type: "RETIRADA", payment: "DINHEIRO", time: "14:50", agendado: false, horarioAgendado: "", observacao: "Troco para R$50", telefone: "(11) 97777-0003", endereco: null },
  { id: "#1045", client: "Ana P.", items: ["Suco de Laranja", "Pizza Margherita"], total: 59.8, status: "ACEITO", type: "ENTREGA", payment: "PIX", time: "14:55", agendado: true, horarioAgendado: new Date(Date.now() + 8 * 60000).toISOString(), observacao: "", telefone: "(11) 96666-0004", endereco: { rua: "Rua Augusta", numero: "500", cep: "01305-000", referencia: "Portão azul" } },
  { id: "#1046", client: "Pedro R.", items: ["X-Burguer Especial"], total: 28.9, status: "CANCELADO", type: "RETIRADA", payment: "CARTÃO", time: "15:00", agendado: false, horarioAgendado: "", observacao: "", telefone: "(11) 95555-0005", endereco: null },
];

const TABS = [
  { id: "pedidos", label: "PEDIDOS" },
  { id: "novo-pedido", label: "NOVO PEDIDO", highlight: true },
  { id: "cardapio", label: "CARDÁPIO DIGITAL" },
  { id: "estoque", label: "ESTOQUE" },
  { id: "financeiro", label: "💰 FINANCEIRO" },
];

// ── Countdown ─────────────────────────────────────────────────────────────────
const Countdown = ({ horario }) => {
  const [diff, setDiff] = useState(0);

  useEffect(() => {
    const calc = () => setDiff(new Date(horario) - Date.now());
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [horario]);

  if (diff <= 0) return <span className="font-mono text-xs text-[#FF4444]">⚠ ATRASADO</span>;

  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const color = diff < 5 * 60000 ? "#FF4444" : diff < 15 * 60000 ? "#FFB800" : "#00E559";

  return (
    <span className="font-mono text-xs font-bold" style={{ color }}>
      ⏱ {h > 0 ? `${h}h ` : ""}{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
};

// ── Modal de Detalhes ─────────────────────────────────────────────────────────
const OrderModal = ({ order, onClose, onStatusChange, onDespachar }) => {
  const [erroPagamento, setErroPagamento] = useState(false);
  const [showPaymentSelect, setShowPaymentSelect] = useState(false);
  const [pagamentoTemp, setPagamentoTemp] = useState("");
  const [despachando, setDespachando] = useState(false);
  const [entregadorId, setEntregadorId] = useState("");
  const [entregadoresOnline, setEntregadoresOnline] = useState([]);
  const [showDespachar, setShowDespachar] = useState(false);
  const [erroDespacho, setErroDespacho] = useState("");

  // Poll entregadores online enquanto modal de despacho está aberto
  // ← DEVE ficar ANTES de qualquer early return (regra de hooks do React)
  useEffect(() => {
    if (!showDespachar) return;
    const fetchOnline = async () => {
      try {
        const r = await axios.get(`${API}/entregador/online`);
        setEntregadoresOnline(r.data?.online || []);
      } catch { setEntregadoresOnline([]); }
    };
    fetchOnline();
    const interval = setInterval(fetchOnline, 2000);
    return () => clearInterval(interval);
  }, [showDespachar]);

  // ← hooks ANTES do early return
  if (!order) return null;

  const confirmarDespacho = async () => {
    if (!entregadorId.trim()) return;
    setDespachando(true);
    setErroDespacho("");
    try {
      await onDespachar(order, entregadorId.trim());
    } catch {
      // falha na API do entregador não bloqueia o avanço do status
    }
    setShowDespachar(false);
    setEntregadorId("");
    onStatusChange(order.id, "SAIU PARA ENTREGA");
    setDespachando(false);
  };

  const PAYMENT_METHODS = ["Dinheiro", "Cartão de Crédito", "Cartão de Débito", "PIX", "Vale Refeição"];

  const nextStatus = {
    PENDENTE: "ACEITO",
    ACEITO: "EM PREPARO",
  };

  const handleAvancar = (id, novoStatus) => {
    setErroPagamento(false);
    onStatusChange(id, novoStatus);
  };

  const handleFinalizar = () => {
    const pg = (order.payment || "").trim();
    const semPagamento = !pg || pg === "NÃO REGISTRADO" || pg === "NAO REGISTRADO";
    if (semPagamento) {
      setErroPagamento(true);
      setShowPaymentSelect(true);
      return;
    }
    onStatusChange(order.id, "FINALIZADO");
  };

  const handleEnviarParaEntrega = async () => {
    setErroDespacho("");
    try {
      const r = await axios.get(`${API}/entregador/online`);
      setEntregadoresOnline(r.data?.online || []);
    } catch { setEntregadoresOnline([]); }
    setShowDespachar(true);
  };

  const confirmarPagamentoEFinalizar = () => {
    if (!pagamentoTemp) return;
    onStatusChange(order.id, "FINALIZADO", pagamentoTemp);
    setShowPaymentSelect(false);
    setErroPagamento(false);
  };

  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[#0A0A0A] border border-[#27272A] w-full max-w-lg flex flex-col gap-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272A]"
          style={{ borderLeftWidth: 3, borderLeftColor: STATUS_COLORS[order.status] || "#27272A" }}>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-[#EDEDED] font-bold">{order.id}</span>
            <span className="font-mono text-xs px-2 py-0.5 border"
              style={{ color: STATUS_COLORS[order.status], borderColor: STATUS_COLORS[order.status] }}>
              {order.status}
            </span>
            <span className="font-mono text-xs text-[#71717A]">{order.type}</span>
          </div>
          <button onClick={onClose} className="font-mono text-xs text-[#71717A] hover:text-[#EDEDED]">✕</button>
        </div>

        <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
          {/* Agendamento countdown */}
          {order.agendado && order.horarioAgendado && (
            <div className="bg-[#111] border border-[#27272A] px-3 py-2 flex items-center justify-between">
              <span className="font-mono text-xs text-[#71717A]">AGENDADO PARA {new Date(order.horarioAgendado).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              <Countdown horario={order.horarioAgendado} />
            </div>
          )}

          {/* Cliente */}
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] text-[#71717A] tracking-widest">CLIENTE</span>
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-[#EDEDED]">{order.client}</span>
              {order.telefone && (
                <span className="font-mono text-xs text-[#A1A1AA]">📞 {order.telefone}</span>
              )}
            </div>
          </div>

          {/* Itens */}
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] text-[#71717A] tracking-widest">ITENS</span>
            <div className="flex flex-col gap-1">
              {order.items.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[#00E559] font-mono text-xs">›</span>
                  <span className="font-mono text-xs text-[#EDEDED]">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Endereço */}
          {order.endereco && (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] text-[#71717A] tracking-widest">ENDEREÇO DE ENTREGA</span>
              <div className="bg-[#111] border border-[#27272A] p-3 flex flex-col gap-1">
                <span className="font-mono text-xs text-[#EDEDED]">{order.endereco.rua}, {order.endereco.numero}</span>
                {order.endereco.cep && <span className="font-mono text-xs text-[#71717A]">CEP: {order.endereco.cep}</span>}
                {order.endereco.referencia && <span className="font-mono text-xs text-[#A1A1AA]">Ref: {order.endereco.referencia}</span>}
              </div>
            </div>
          )}

          {/* Observação */}
          {order.observacao && (
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[10px] text-[#71717A] tracking-widest">OBSERVAÇÃO</span>
              <span className="font-mono text-xs text-[#FFB800] bg-[#FFB800]/5 border border-[#FFB800]/20 px-3 py-2">{order.observacao}</span>
            </div>
          )}

          {/* Pagamento + Total */}
          <div className="flex items-center justify-between border-t border-[#27272A] pt-3">
            <span className="font-mono text-xs text-[#A1A1AA]">{PAYMENT_ICONS[order.payment]} {order.payment}</span>
            <span className="font-mono text-lg text-[#00E559] font-bold">R$ {order.total.toFixed(2).replace(".", ",")}</span>
          </div>

          {/* Erro de pagamento */}
          {erroPagamento && (
            <div className="bg-[#FF4444]/10 border border-[#FF4444] px-3 py-2 font-mono text-xs text-[#FF4444]">
              ⚠ Pedido sem pagamento registrado. Selecione a forma de pagamento para finalizar.
            </div>
          )}

          {/* Seleção de pagamento ao finalizar */}
          {showPaymentSelect && (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] text-[#71717A] tracking-widest">FORMA DE PAGAMENTO</span>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map(m => (
                  <button key={m} onClick={() => setPagamentoTemp(m)}
                    className={`py-2 border font-mono text-xs transition-colors ${
                      pagamentoTemp === m ? "border-[#00E559] text-[#00E559] bg-[#00E559]/10" : "border-[#27272A] text-[#71717A] hover:border-[#00E559] hover:text-[#00E559]"
                    }`}>
                    {m}
                  </button>
                ))}
              </div>
              <button
                onClick={confirmarPagamentoEFinalizar}
                disabled={!pagamentoTemp}
                className="w-full py-2 bg-[#00E559] text-black font-mono text-xs font-bold disabled:opacity-40 hover:bg-[#00c44d] transition-colors"
              >
                ✓ CONFIRMAR E FINALIZAR
              </button>
            </div>
          )}

          {/* Painel de despacho */}
          {showDespachar && (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] text-[#00BFFF] tracking-widest">SELECIONAR ENTREGADOR</span>
              {entregadoresOnline.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {entregadoresOnline.map(eid => (
                    <button key={eid} onClick={() => setEntregadorId(eid)}
                      className={`font-mono text-xs px-2 py-1 border transition-colors ${
                        entregadorId === eid ? "border-[#00E559] text-[#00E559] bg-[#00E559]/10" : "border-[#27272A] text-[#71717A] hover:border-[#00BFFF]"
                      }`}>
                      🟢 {eid}
                    </button>
                  ))}
                </div>
              )}
              {entregadoresOnline.length === 0 && (
                <span className="font-mono text-[10px] text-[#FF4444]">Nenhum entregador online. Digite o ID manualmente (atualizando a cada 2s...):</span>
              )}
              <input
                value={entregadorId}
                onChange={e => setEntregadorId(e.target.value)}
                placeholder="Ex: carlos, moto01, joao..."
                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-3 py-2 focus:outline-none focus:border-[#00BFFF]"
              />
              {erroDespacho && (
                <div className="font-mono text-xs text-[#FF4444] bg-[#FF4444]/10 border border-[#FF4444]/30 px-3 py-2">
                  ⚠ {erroDespacho}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setShowDespachar(false); setEntregadorId(""); setErroDespacho(""); }}
                  className="py-2 border border-[#27272A] text-[#71717A] font-mono text-xs hover:border-[#FF4444] hover:text-[#FF4444] transition-colors">
                  CANCELAR
                </button>
                <button onClick={confirmarDespacho} disabled={despachando || !entregadorId.trim()}
                  className="py-2 bg-[#00BFFF] text-black font-mono text-xs font-bold disabled:opacity-40 hover:bg-[#00a8e0] transition-colors">
                  {despachando ? "ENVIANDO..." : "🛵 DESPACHAR"}
                </button>
              </div>
            </div>
          )}

          {/* Botão principal de ação por status */}
          {!showPaymentSelect && !showDespachar && (
            <>
              {/* PENDENTE / ACEITO: avança normalmente */}
              {nextStatus[order.status] && (
                <button
                  onClick={() => handleAvancar(order.id, nextStatus[order.status])}
                  className="w-full py-2 font-mono text-xs font-bold text-black transition-colors"
                  style={{ backgroundColor: STATUS_COLORS[nextStatus[order.status]] }}
                >
                  AVANÇAR → {nextStatus[order.status]}
                </button>
              )}

              {/* EM PREPARO + ENTREGA: despachar para entregador */}
              {order.status === "EM PREPARO" && order.type === "ENTREGA" && (
                <button
                  onClick={handleEnviarParaEntrega}
                  className="w-full py-2 font-mono text-xs font-bold border-2 border-[#A855F7] text-[#A855F7] hover:bg-[#A855F7]/10 transition-colors"
                >
                  🛵 DESPACHAR PARA ENTREGA
                </button>
              )}

              {/* EM PREPARO + RETIRADA: finalizar direto */}
              {order.status === "EM PREPARO" && order.type === "RETIRADA" && (
                <button
                  onClick={handleFinalizar}
                  className="w-full py-2 font-mono text-xs font-bold text-black bg-[#00E559] hover:bg-[#00c44d] transition-colors"
                >
                  ✓ FINALIZAR
                </button>
              )}

              {/* SAIU PARA ENTREGA: finalizar */}
              {order.status === "SAIU PARA ENTREGA" && (
                <button
                  onClick={handleFinalizar}
                  className="w-full py-2 font-mono text-xs font-bold text-black bg-[#00E559] hover:bg-[#00c44d] transition-colors"
                >
                  ✓ FINALIZAR
                </button>
              )}

              {order.status === "PENDENTE" && (
                <button
                  onClick={() => onStatusChange(order.id, "CANCELADO")}
                  className="w-full py-2 font-mono text-xs font-bold border border-[#FF4444] text-[#FF4444] hover:bg-[#FF4444]/10 transition-colors"
                >
                  CANCELAR PEDIDO
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Views ─────────────────────────────────────────────────────────────────────
const CardView = ({ orders, onSelect, onReimprimir }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
    {orders.map((o) => (
      <div key={o.id}
        className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-2 hover:border-[#3F3F46] cursor-pointer transition-colors">
        <div className="flex justify-between items-center">
          <span className="font-mono text-xs text-[#71717A]">{o.id}</span>
          <span className="font-mono text-xs px-2 py-0.5 border"
            style={{ color: STATUS_COLORS[o.status] || "#71717A", borderColor: STATUS_COLORS[o.status] || "#27272A" }}>
            {o.status}
          </span>
        </div>
        <span className="font-mono text-sm text-[#EDEDED]">{o.client}</span>
        <div className="font-mono text-xs text-[#71717A]">{o.items.join(", ")}</div>
        {o.agendado && o.horarioAgendado && <Countdown horario={o.horarioAgendado} />}
        <div className="flex justify-between items-center border-t border-[#27272A] pt-2 mt-1">
          <span className="font-mono text-xs text-[#A1A1AA]">{PAYMENT_ICONS[o.payment]} {o.payment}</span>
          <span className="font-mono text-sm text-[#00E559]">R$ {o.total.toFixed(2).replace(".", ",")}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onReimprimir(o); }}
          className="mt-2 w-7 h-7 inline-flex items-center justify-center rounded border border-[#00E559] text-[#EDEDED] bg-[#00E559]/12 hover:bg-[#00E559]/24 transition-colors"
          title="Reimprimir"
          aria-label="Reimprimir"
        >
          🖨
        </button>
      </div>
    ))}
  </div>
);

const ListView = ({ orders, onSelect, onReimprimir }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[600px]">
      <thead>
        <tr className="border-b border-[#27272A]">
          {["#", "CLIENTE", "ITENS", "PAGAMENTO", "TIPO", "TOTAL", "STATUS", "TEMPO", "IMP"].map((h) => (
            <th key={h} className="px-4 py-2 text-left font-mono text-xs text-[#71717A]">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id} onClick={() => onSelect(o)} className="border-b border-[#27272A] hover:bg-[#111] cursor-pointer">
            <td className="px-4 py-3 font-mono text-xs text-[#71717A]">{o.id}</td>
            <td className="px-4 py-3 font-mono text-sm text-[#EDEDED]">{o.client}</td>
            <td className="px-4 py-3 font-mono text-xs text-[#71717A]">{o.items.join(", ")}</td>
            <td className="px-4 py-3 font-mono text-xs text-[#A1A1AA]">{PAYMENT_ICONS[o.payment]} {o.payment}</td>
            <td className="px-4 py-3 font-mono text-xs text-[#A1A1AA]">{o.type}</td>
            <td className="px-4 py-3 font-mono text-sm text-[#00E559]">R$ {o.total.toFixed(2).replace(".", ",")}</td>
            <td className="px-4 py-3 font-mono text-xs" style={{ color: STATUS_COLORS[o.status] || "#71717A" }}>{o.status}</td>
            <td className="px-4 py-3">{o.agendado && o.horarioAgendado ? <Countdown horario={o.horarioAgendado} /> : <span className="font-mono text-xs text-[#3F3F46]">—</span>}</td>
            <td className="px-4 py-3">
              <button
                onClick={(e) => { e.stopPropagation(); onReimprimir(o); }}
                className="w-7 h-7 inline-flex items-center justify-center rounded border border-[#00E559] text-[#EDEDED] bg-[#00E559]/12 hover:bg-[#00E559]/24 transition-colors"
                title="Reimprimir"
                aria-label="Reimprimir"
              >
                🖨
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const KanbanView = ({ orders, onSelect, onReimprimir }) => {
  const cols = STATUS_OPTIONS.filter((s) => s !== "TODOS");
  return (
    <div className="flex gap-3 p-4 overflow-x-auto min-h-[300px]">
      {cols.map((col) => {
        const colOrders = orders.filter((o) => o.status === col);
        return (
          <div key={col} className="min-w-[200px] flex flex-col gap-2">
            <div className="font-mono text-xs px-2 py-1 border-b"
              style={{ color: STATUS_COLORS[col], borderColor: STATUS_COLORS[col] }}>
              {col} <span className="text-[#71717A]">({colOrders.length})</span>
            </div>
            {colOrders.map((o) => (
              <div key={o.id} onClick={() => onSelect(o)}
                className="bg-[#0A0A0A] border border-[#27272A] p-3 flex flex-col gap-1 cursor-pointer hover:border-[#3F3F46] transition-colors">
                <div className="flex justify-between">
                  <span className="font-mono text-xs text-[#71717A]">{o.id}</span>
                  <span className="font-mono text-xs text-[#A1A1AA]">{o.time}</span>
                </div>
                <span className="font-mono text-sm text-[#EDEDED]">{o.client}</span>
                <span className="font-mono text-xs text-[#71717A]">{o.items[0]}{o.items.length > 1 ? ` +${o.items.length - 1}` : ""}</span>
                {o.agendado && o.horarioAgendado && <Countdown horario={o.horarioAgendado} />}
                <div className="flex justify-between items-center mt-1">
                  <span className="font-mono text-xs text-[#A1A1AA]">{o.type}</span>
                  <span className="font-mono text-xs text-[#00E559]">R$ {o.total.toFixed(2).replace(".", ",")}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onReimprimir(o); }}
                  className="mt-1 w-7 h-7 inline-flex items-center justify-center rounded border border-[#00E559] text-[#EDEDED] bg-[#00E559]/12 hover:bg-[#00E559]/24 transition-colors"
                  title="Reimprimir"
                  aria-label="Reimprimir"
                >
                  🖨
                </button>
              </div>
            ))}
            {colOrders.length === 0 && <div className="font-mono text-xs text-[#3F3F46] text-center py-4">vazio</div>}
          </div>
        );
      })}
    </div>
  );
};

const CompactView = ({ orders, onSelect, onReimprimir }) => (
  <div className="flex flex-col divide-y divide-[#27272A]">
    {orders.map((o) => (
      <div key={o.id} onClick={() => onSelect(o)}
        className="flex items-center gap-3 px-4 py-2 hover:bg-[#111] cursor-pointer">
        <span className="font-mono text-xs text-[#71717A] w-14">{o.id}</span>
        <span className="font-mono text-sm text-[#EDEDED] flex-1 truncate">{o.client}</span>
        {o.agendado && o.horarioAgendado
          ? <Countdown horario={o.horarioAgendado} />
          : <span className="font-mono text-xs text-[#A1A1AA] hidden sm:block">{o.time}</span>}
        <span className="font-mono text-xs text-[#00E559] w-20 text-right">R$ {o.total.toFixed(2).replace(".", ",")}</span>
        <span className="font-mono text-xs w-20 text-right" style={{ color: STATUS_COLORS[o.status] || "#71717A" }}>{o.status}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onReimprimir(o); }}
          className="w-7 h-7 inline-flex items-center justify-center rounded border border-[#00E559] text-[#EDEDED] bg-[#00E559]/12 hover:bg-[#00E559]/24 transition-colors"
          title="Reimprimir"
          aria-label="Reimprimir"
        >
          🖨
        </button>
      </div>
    ))}
  </div>
);

// ── Pedidos Tab ───────────────────────────────────────────────────────────────
const PedidosTab = ({ orders, onStatusChange, onDespachar, onReimprimir }) => {
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [typeFilter, setTypeFilter] = useState("TODOS");
  const [viewMode, setViewMode] = useState("cards");
  const [selectedOrder, setSelectedOrder] = useState(null);

  const filtered = orders.filter(
    (o) =>
      (statusFilter === "TODOS" || o.status === statusFilter) &&
      (typeFilter === "TODOS" || o.type === typeFilter)
  );

  const views = [
    { id: "cards", label: "⊞ CARDS" },
    { id: "lista", label: "☰ LISTA" },
    { id: "kanban", label: "⊟ KANBAN" },
    { id: "compacto", label: "≡ COMPACTO" },
  ];

  const handleStatusChange = (id, newStatus, novoPagamento) => {
    onStatusChange(id, newStatus, novoPagamento);
    setSelectedOrder((prev) => prev ? { ...prev, status: newStatus, ...(novoPagamento ? { payment: novoPagamento } : {}) } : null);
    if (newStatus === "FINALIZADO" || newStatus === "CANCELADO" || newStatus === "SAIU PARA ENTREGA") setSelectedOrder(null);
  };

  return (
    <>
      <div className="flex flex-col gap-0">
        <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-[#27272A] bg-[#0A0A0A]">
          <div className="flex flex-wrap gap-1">
            {STATUS_OPTIONS.map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className="font-mono text-xs px-2 py-1 border transition-colors"
                style={{
                  borderColor: statusFilter === s ? (STATUS_COLORS[s] || "#00E559") : "#27272A",
                  color: statusFilter === s ? (STATUS_COLORS[s] || "#00E559") : "#71717A",
                  background: statusFilter === s ? "rgba(0,0,0,0.4)" : "transparent",
                }}>
                {s}
              </button>
            ))}
          </div>
          <div className="w-px bg-[#27272A] hidden sm:block" />
          <div className="flex gap-1">
            {["TODOS", "ENTREGA", "RETIRADA", "COMER AQUI"].map((t) => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className="font-mono text-xs px-2 py-1 border transition-colors"
                style={{ borderColor: typeFilter === t ? "#00BFFF" : "#27272A", color: typeFilter === t ? "#00BFFF" : "#71717A" }}>
                {t === "ENTREGA" ? "🛵 " : t === "RETIRADA" ? "🏪 " : ""}{t}
              </button>
            ))}
          </div>
          <div className="flex gap-1 ml-auto">
            {views.map((v) => (
              <button key={v.id} onClick={() => setViewMode(v.id)}
                className="font-mono text-xs px-2 py-1 border transition-colors"
                style={{ borderColor: viewMode === v.id ? "#00E559" : "#27272A", color: viewMode === v.id ? "#00E559" : "#71717A" }}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-2 font-mono text-xs text-[#71717A] border-b border-[#27272A]">
          {filtered.length} pedido{filtered.length !== 1 ? "s" : ""}
          {statusFilter !== "TODOS" && ` · ${statusFilter}`}
          {typeFilter !== "TODOS" && ` · ${typeFilter}`}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 font-mono text-xs text-[#3F3F46]">NENHUM PEDIDO ENCONTRADO</div>
        ) : (
          <>
            {viewMode === "cards" && <CardView orders={filtered} onSelect={setSelectedOrder} onReimprimir={onReimprimir} />}
            {viewMode === "lista" && <ListView orders={filtered} onSelect={setSelectedOrder} onReimprimir={onReimprimir} />}
            {viewMode === "kanban" && <KanbanView orders={filtered} onSelect={setSelectedOrder} onReimprimir={onReimprimir} />}
            {viewMode === "compacto" && <CompactView orders={filtered} onSelect={setSelectedOrder} onReimprimir={onReimprimir} />}
          </>
        )}
      </div>

      <OrderModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onStatusChange={handleStatusChange}
        onDespachar={onDespachar}
      />
    </>
  );
};

// ── Footer ────────────────────────────────────────────────────────────────────
const Footer = () => (
  <footer className="border-t border-[#27272A] bg-[#0A0A0A] px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-[#71717A] font-mono text-xs">
    <span>Dev: J.Lorenzo De Matos · <span className="text-[#3F3F46]">(número em breve)</span></span>
    <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center">
      <span>CNPJ: <span className="text-[#A1A1AA]">XX.XXX.XXX/0001-XX</span></span>
      <span>Tel: <span className="text-[#A1A1AA]">(XX) XXXXX-XXXX</span></span>
      <span>ID: <span className="text-[#A1A1AA]">RESTAURANTE-001</span></span>
    </div>
  </footer>
);

// ── Main Page ─────────────────────────────────────────────────────────────────
export function RestaurantePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [theme, setTheme] = useState("light");
  const [activeTab, setActiveTab] = useState("pedidos");
  const [menuItems, setMenuItems] = useState([]);
  const [orders, setOrders] = useState(MOCK_ORDERS);
  const [estoqueItens, setEstoqueItens] = useState([]);
  const [vendasFinanceiro, setVendasFinanceiro] = useState([]);
  const [lojaAtiva, setLojaAtiva] = useState(true);
  const [mesas] = useState(Array.from({ length: 20 }, (_, i) => ({ id: `Mesa ${i + 1}`, status: i % 3 === 0 ? "ocupada" : "livre" })));
  const [impressoras, setImpressoras] = useState([{ nome: "EPSON-TM-T20", ativa: true }]);
  const [novaImpressora, setNovaImpressora] = useState("");
  const [showQrWpp, setShowQrWpp] = useState(false);

  const restaurantName = `Restaurante ${id || ""}`;

  // Ao adicionar item no estoque: atualiza cardápio e redireciona
  const handleItemAdicionado = (item, categoria) => {
    const itemCardapio = {
      id: item.id,
      name: item.nome,
      description: "",
      category: categoria,
      salePrice: item.precoVenda,
      costPrice: item.precoCusto,
      photo: item.foto || null,
      variacoes: item.variacoes || [],
    };
    setMenuItems(prev => [...prev, itemCardapio]);
    setActiveTab("cardapio");
  };

  // Diminui estoque ao criar pedido
  const diminuirEstoque = (itensPedido) => {
    setEstoqueItens(prev => prev.map(item => {
      const vendido = itensPedido.find(i => i.id === item.id || i.name === item.nome || i.name === item.name);
      if (!vendido) return item;
      const novaQtd = Math.max(0, (item.quantidade ?? item.stock ?? 0) - vendido.qtd);
      return { ...item, quantidade: novaQtd };
    }));
  };

  const buildPrintText = (order) => {
    const lines = [
      "================================",
      `PEDIDO ${order.id}`,
      "================================",
      `Cliente: ${order.client || "-"}`,
      `Tipo: ${order.type || "-"}`,
      `Pagamento: ${order.payment || "-"}`,
      "--------------------------------",
      "ITENS:",
      ...(order.items || []).map((it) => `- ${it}`),
      "--------------------------------",
      `TOTAL: R$ ${Number(order.total || 0).toFixed(2).replace(".", ",")}`,
    ];
    if (order.observacao) lines.push(`Obs: ${order.observacao}`);
    lines.push(`Hora: ${new Date().toLocaleString("pt-BR")}`);
    lines.push("================================");
    return lines.join("\n");
  };

  const printOrder = async (order) => {
    try {
      const token = OWNER_TOKEN || window.localStorage.getItem("owner_api_token") || "";
      await axios.post(
        `${API}/print/direct`,
        {
          content: buildPrintText(order),
          printer_name: impressoras?.[0]?.nome || "HPRT MPT-II",
        },
        {
          headers: {
            "X-Owner-Token": token,
          },
        }
      );
    } catch (err) {
      console.error("Falha impressão direta", err);
      window.alert("Falha ao imprimir direto. Verifique token, backend e impressora.");
    }
  };

  const handleNovoPedido = async (pedido) => {
    try {
      const payload = {
        restauranteId: id || "teste",
        clienteNome: pedido.cliente,
        clienteTelefone: pedido.telefone || "",
        tipo: pedido.tipo,
        itens: pedido.itens.map(i => ({
          nome: i.name,
          qtd: i.qtd,
          precoUnitario: i.precoUnitario || i.salePrice,
          observacao: i.observacao || ""
        })),
        pagamento: pedido.pagamento || "dinheiro",
        pago: pedido.pago || true,
        agendado: pedido.agendado || false,
        horarioAgendado: pedido.horarioAgendado || null,
        observacao: pedido.observacao || "",
        mesa: pedido.mesa || null,
        endereco: pedido.endereco || null
      };
      const res = await axios.post(`${API}/pedidos`, payload);
      const pedidoId = res.data.id;
      
      // Abate estoque
      await axios.post(`${API}/estoque/deduzir`, {
        restauranteId: id || "teste",
        itens: pedido.itens.map(i => ({ itemId: i.id, qtd: i.qtd }))
      });
      
      // Refresh panels
      fetchPedidos();
      
      printOrder({ id: pedidoId, ...payload }); // print com ID real
    } catch (err) {
      console.error("Erro salvar pedido:", err);
      // Fallback local
      const novo = {
        id: `#${1047 + orders.length}`,
        client: pedido.cliente,
        items: pedido.itens.map((i) => i.name),
        itensCompletos: pedido.itens,
        total: pedido.total,
        status: "PENDENTE",
        type: pedido.tipo === "entrega" ? "ENTREGA" : pedido.tipo === "comer_aqui" ? "COMER AQUI" : "RETIRADA",
        payment: pedido.pagamento || "",
        pago: pedido.pago || false,
        time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        agendado: pedido.agendado,
        horarioAgendado: pedido.horarioAgendado || "",
        observacao: pedido.observacao || "",
        telefone: pedido.telefone || "",
        endereco: pedido.endereco,
      };
      setOrders((prev) => [novo, ...prev]);
      diminuirEstoque(pedido.itens);
    }
    setActiveTab("pedidos");
  };

  const fetchPedidos = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/pedidos?restaurante_id=${id}`);
      setOrders(data.pedidos || []);
    } catch {}
  }, [id]);

  useEffect(() => {
    fetchPedidos();
    const interval = setInterval(fetchPedidos, 10000);
    return () => clearInterval(interval);
  }, [fetchPedidos]);

  // Ao finalizar (ENTREGUE), envia para financeiro
  const registrarVendaFinanceiro = (order, pagamento) => {
    const venda = {
      numeroPedido: order.id,
      cliente: order.client,
      itens: order.itensCompletos || order.items.map(name => ({ name, qtd: 1, salePrice: 0, costPrice: 0 })),
      total: order.total,
      pagamento: pagamento || order.payment,
      tipo: order.type,
      finalizadoEm: new Date().toISOString(),
      restauranteId: id || "",
    };
    setVendasFinanceiro(prev => [...prev, venda]);
    // Persiste no backend
    axios.post(`${API}/financeiro/venda`, venda).catch(() => {});
  };

  const handleStatusChange = (orderId, newStatus, novoPagamento) => {
    setOrders((prev) => prev.map((o) => {
      if (o.id !== orderId) return o;
      const updated = { ...o, status: newStatus };
      if (novoPagamento) updated.payment = novoPagamento;
      if (newStatus === "FINALIZADO") registrarVendaFinanceiro(updated, novoPagamento);
      return updated;
    }));
  };

  const handleDespachar = async (order, entregadorId) => {
    const payload = {
      entregadorId,
      orderId: order.id,
      restaurante: restaurantName,
      endereco: order.endereco ? `${order.endereco.rua}, ${order.endereco.numero}` : "Endereço não informado",
      referencia: order.endereco?.referencia || "",
      itens: order.itensCompletos || order.items.map(name => ({ name, qtd: 1 })),
      pagamento: order.payment || "",
      observacao: order.observacao || "",
      taxaEntrega: 5.0,
    };
    await axios.post(`${API}/entregador/despachar`, payload);
  };

  const addImpressora = () => {
    const nome = novaImpressora.trim();
    if (!nome) return;
    setImpressoras(prev => [...prev, { nome, ativa: true }]);
    setNovaImpressora("");
  };

  const isDark = theme === "dark";
  const pageClass = isDark ? "bg-black text-[#EDEDED]" : "bg-[#F8FAFC] text-[#0F172A]";
  const panelClass = isDark ? "bg-[#0A0A0A] border-[#27272A]" : "bg-white border-[#E2E8F0]";
  const subtleText = isDark ? "text-[#71717A]" : "text-[#475569]";
  const borderClass = isDark ? "border-[#27272A]" : "border-[#E2E8F0]";

  return (
    <div className={`min-h-screen w-full flex flex-col ${pageClass}`}>
      <div className={`flex items-center justify-between px-4 sm:px-6 py-3 border-b ${borderClass}`}>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="font-mono text-xs text-[#71717A] hover:text-[#EDEDED] transition-colors">
            ← VOLTAR
          </button>
          <span className="font-mono text-sm text-[#00E559]">{restaurantName.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            className={`font-mono text-xs px-3 py-1.5 border transition-colors ${
              isDark
                ? "border-[#27272A] text-[#EDEDED] hover:border-[#00E559]"
                : "border-[#CBD5E1] text-[#0F172A] hover:border-[#0EA5E9]"
            }`}
          >
            {isDark ? "☀️ TEMA CLARO" : "🌙 MODERN-DARK"}
          </button>
          <span className={`font-mono text-xs hidden sm:block ${subtleText}`}>PAINEL DO RESTAURANTE</span>
        </div>
      </div>

      <div className={`flex border-b overflow-x-auto ${borderClass}`}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const isHighlight = tab.highlight && !isActive;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2 font-mono text-xs border-b-2 whitespace-nowrap transition-colors ${
                isActive
                  ? (isDark ? "border-[#00E559] text-[#00E559]" : "border-[#0EA5E9] text-[#0284C7] bg-[#E0F2FE]")
                  : isHighlight
                    ? (isDark ? "border-transparent text-[#FFB800] hover:text-[#FFD700] animate-pulse font-bold" : "border-transparent text-[#B45309] hover:text-[#92400E] font-bold")
                    : (isDark ? "border-transparent text-[#71717A] hover:text-[#A1A1AA]" : "border-transparent text-[#64748B] hover:text-[#334155]")
              }`}>
              {tab.highlight && <span className="mr-1">✨</span>}{tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 min-w-0">
          {activeTab === "pedidos" && <div className="h-full overflow-y-auto"><PedidosTab orders={orders} onStatusChange={handleStatusChange} onDespachar={handleDespachar} onReimprimir={printOrder} /></div>}
          {activeTab === "novo-pedido" && <div className="h-full"><NovoPedido onPedidoCriado={handleNovoPedido} itensEstoque={estoqueItens} /></div>}
          {activeTab === "cardapio" && (
            <div className="h-full overflow-y-auto flex flex-col gap-0">
              <Cardapio restauranteId={id} />
              <div className="border-t border-[#27272A] px-6 pb-2 pt-4">
                <span className="font-mono text-[10px] text-[#71717A] tracking-widest">PRÉ-VISUALIZAÇÃO</span>
              </div>
              <div className="px-6 pb-6">
                <DigitalMenu items={menuItems} restaurantName={restaurantName} />
              </div>
            </div>
          )}
          {activeTab === "estoque" && <div className="h-full overflow-y-auto"><Estoque restauranteId={id} onEstoqueAtualizado={setEstoqueItens} onItemAdicionado={handleItemAdicionado} /></div>}
          {activeTab === "financeiro" && <div className="h-full overflow-y-auto"><Financeiro vendas={vendasFinanceiro} restauranteId={id} /></div>}
        </div>

        <aside className={`w-[320px] border-l p-4 overflow-y-auto flex flex-col gap-4 ${panelClass}`}>
          <div className={`border p-3 flex flex-col gap-2 ${borderClass}`}>
            <span className={`font-mono text-[10px] tracking-widest ${subtleText}`}>LOJA DE PEDIDOS</span>
            <button
              onClick={() => setLojaAtiva(v => !v)}
              className={`py-2 font-mono text-xs border ${
                lojaAtiva
                  ? "border-[#00E559] text-[#00E559] bg-[#00E559]/10"
                  : "border-[#FF4444] text-[#FF4444] bg-[#FF4444]/10"
              }`}
            >
              {lojaAtiva ? "🟢 RESTAURANTE ATIVO" : "🔴 RESTAURANTE DESATIVADO"}
            </button>
          </div>

          <div className={`border p-3 flex flex-col gap-2 ${borderClass}`}>
            <span className={`font-mono text-[10px] tracking-widest ${subtleText}`}>MESAS</span>
            <div className="grid grid-cols-2 gap-2">
              {mesas.map((m) => (
                <div key={m.id} className={`px-2 py-1 border font-mono text-[10px] ${m.status === "ocupada" ? "border-[#FFB800] text-[#FFB800]" : "border-[#27272A] text-[#A1A1AA]"}`}>
                  {m.id} · {m.status}
                </div>
              ))}
            </div>
          </div>

          <div className={`border p-3 flex flex-col gap-2 ${borderClass}`}>
            <span className={`font-mono text-[10px] tracking-widest ${subtleText}`}>INTEGRAÇÃO WHATSAPP (EVOLUTION)</span>
            <button
              onClick={() => setShowQrWpp(v => !v)}
              className="py-2 border border-[#00BFFF] text-[#00BFFF] font-mono text-xs hover:bg-[#00BFFF]/10"
            >
              {showQrWpp ? "OCULTAR QR CODE" : "ABRIR QR CODE"}
            </button>
            {showQrWpp && (
              <div className="border border-[#27272A] p-3 text-center">
                <div className="w-40 h-40 mx-auto bg-white text-black flex items-center justify-center font-mono text-xs">
                  QR CODE
                </div>
                <span className="font-mono text-[10px] text-[#71717A] block mt-2">
                  Escaneie no WhatsApp (mock Evolution API)
                </span>
              </div>
            )}
          </div>

          <div className={`border p-3 flex flex-col gap-2 ${borderClass}`}>
            <span className={`font-mono text-[10px] tracking-widest ${subtleText}`}>IMPRESSÕES</span>
            <input
              defaultValue={OWNER_TOKEN}
              onChange={(e) => window.localStorage.setItem("owner_api_token", e.target.value)}
              placeholder="Owner token (fallback)"
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-[10px] px-2 py-1.5"
            />
            <div className="flex gap-2">
              <input
                value={novaImpressora}
                onChange={(e) => setNovaImpressora(e.target.value)}
                placeholder="Nome da impressora"
                className="flex-1 bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1.5"
              />
              <button onClick={addImpressora} className="px-2 border border-[#00E559] text-[#00E559] font-mono text-xs">
                +
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {impressoras.map((imp, idx) => (
                <div key={`${imp.nome}-${idx}`} className="flex items-center justify-between border border-[#27272A] px-2 py-1">
                  <span className="font-mono text-[10px] text-[#EDEDED]">{imp.nome}</span>
                  <span className={`font-mono text-[10px] ${imp.ativa ? "text-[#00E559]" : "text-[#71717A]"}`}>
                    {imp.ativa ? "ATIVA" : "INATIVA"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <Footer />
    </div>
  );
}
