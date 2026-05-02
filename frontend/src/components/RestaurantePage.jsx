import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { DigitalMenu } from "@/components/DigitalMenu";
import { NovoPedido } from "@/components/NovoPedido";
import { Estoque } from "@/components/Estoque";
import { Financeiro } from "@/components/Financeiro";
import { Cardapio } from "@/components/Cardapio";
import { CRM } from "@/components/CRM";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;
const OWNER_TOKEN = process.env.REACT_APP_OWNER_API_TOKEN || "";

// Instância axios com token de autenticação para rotas protegidas
const authAxios = axios.create({
  headers: { "X-Owner-Token": OWNER_TOKEN },
});

const STATUS_OPTIONS = ["TODOS", "PENDENTE", "ACEITO", "EM PREPARO", "SAIU PARA ENTREGA", "FINALIZADO", "CANCELADO"];
const STATUS_COLORS = {
  PENDENTE:           "#FFB800",
  ACEITO:             "#00BFFF",
  "EM PREPARO":       "#FF8C00",
  PRONTO:             "#3B82F6",
  "SAIU PARA ENTREGA":"#A855F7",
  FINALIZADO:         "#00E559",
  CANCELADO:          "#FF4444",
};
const PAYMENT_ICONS = { PIX: "◈", DINHEIRO: "₿", CARTÃO: "▣", "VALE REFEIÇÃO": "◉" };

const MOCK_ORDERS = [
  { id: "#1042", client: "João S.", items: ["X-Burguer", "Coca-Cola"], total: 89.7, status: "FINALIZADO", type: "ENTREGA", payment: "PIX", time: "14:32", agendado: false, horarioAgendado: "", observacao: "", telefone: "(11) 99999-0001", endereco: { rua: "Rua das Flores", numero: "123", cep: "01310-100", referencia: "Próximo ao mercado" } },
  { id: "#1043", client: "Maria L.", items: ["Pizza Margherita"], total: 54.8, status: "EM PREPARO", type: "ENTREGA", payment: "CARTÃO", time: "14:45", agendado: true, horarioAgendado: new Date(Date.now() + 25 * 60000).toISOString(), observacao: "Sem cebola", telefone: "(11) 98888-0002", endereco: { rua: "Av. Paulista", numero: "900", cep: "01310-200", referencia: "" } },
  { id: "#1044", client: "Carlos M.", items: ["X-Bacon Duplo"], total: 28.9, status: "PENDENTE", type: "RETIRADA", payment: "DINHEIRO", time: "14:50", agendado: false, horarioAgendado: "", observacao: "Troco para R$50", telefone: "(11) 97777-0003", endereco: null },
  { id: "#1045", client: "Ana P.", items: ["Suco de Laranja", "Pizza Margherita"], total: 59.8, status: "ACEITO", type: "ENTREGA", payment: "PIX", time: "14:55", agendado: true, horarioAgendado: new Date(Date.now() + 8 * 60000).toISOString(), observacao: "", telefone: "(11) 96666-0004", endereco: { rua: "Rua Augusta", numero: "500", cep: "01305-000", referencia: "Portão azul" } },
  { id: "#1046", client: "Pedro R.", items: ["X-Burguer Especial"], total: 28.9, status: "CANCELADO", type: "RETIRADA", payment: "CARTÃO", time: "15:00", agendado: false, horarioAgendado: "", observacao: "", telefone: "(11) 95555-0005", endereco: null },
];

// ── Normalização API → UI ──────────────────────────────────────────────────────
const STATUS_API_TO_UI = {
  pendente: "PENDENTE", confirmado: "ACEITO", em_preparo: "EM PREPARO",
  pronto: "PRONTO", em_entrega: "SAIU PARA ENTREGA",
  entregue: "FINALIZADO", cancelado: "CANCELADO",
};
const STATUS_UI_TO_API = {
  ACEITO: "confirmado", "EM PREPARO": "em_preparo", PRONTO: "pronto",
  "SAIU PARA ENTREGA": "em_entrega", FINALIZADO: "entregue", CANCELADO: "cancelado",
};
const TIPO_API_TO_UI = { retirada: "RETIRADA", entrega: "ENTREGA", comer_aqui: "COMER AQUI" };

const normalizeApiOrder = (o) => ({
  id: o.id || String(Math.random()),
  client: o.clienteNome || o.client || "-",
  items: Array.isArray(o.itens)
    ? o.itens.map(i => `${i.qtd}x ${i.nome || i.name}`)
    : (o.items || []),
  itensCompletos: o.itens || [],
  total: Number(o.total || 0),
  status: STATUS_API_TO_UI[o.status] || "PENDENTE",
  type: TIPO_API_TO_UI[o.tipo] || "RETIRADA",
  payment: (o.pagamento || "NÃO REGISTRADO").toUpperCase(),
  time: new Date(o.criadoEm || Date.now()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  agendado: o.agendado || false,
  horarioAgendado: o.horarioAgendado || "",
  observacao: o.observacao || "",
  telefone: o.clienteTelefone || o.telefone || "",
  endereco: o.endereco || null,
  mesa: o.mesa || null,
  pagamentosDetalhados: o.pagamentosDetalhados || o.pagamentos || null,
});

// ── Helpers de formatação (cupom) ─────────────────────────────────────────────
const fmtMoney = (n) => `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;

// ── HTML do cupom térmico 58mm ────────────────────────────────────────────────
const buildReceiptHTML = (order, restInfo = {}) => {
  const dataHora = new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const oid = String(order.id || "").replace(/-/g, "").slice(-6).toUpperCase() || "??????";

  // ── Itens ──────────────────────────────────────────────────────────────────
  const itemRows = (order.itensCompletos && order.itensCompletos.length > 0
    ? order.itensCompletos.map(i => {
        const preco = Number(i.precoUnitario || i.salePrice || 0);
        return `
          <tr>
            <td class="qtd">${i.qtd}x</td>
            <td class="nome">${i.nome || i.name || ""}</td>
            <td class="val">${fmtMoney(preco * i.qtd)}</td>
          </tr>
          ${i.observacao ? `<tr><td></td><td colspan="2" class="obs-item">↳ ${i.observacao}</td></tr>` : ""}`;
      }).join("")
    : (order.items || []).map(it => `<tr><td colspan="3" class="nome" style="padding:2px 0">${it}</td></tr>`).join("")
  );

  // ── Pagamentos ─────────────────────────────────────────────────────────────
  const pgtoRows = (Array.isArray(order.pagamentosDetalhados) && order.pagamentosDetalhados.length > 0)
    ? order.pagamentosDetalhados.map(p => `
        <tr>
          <td class="pgto-met">${p.metodo}</td>
          <td class="pgto-val">${fmtMoney(p.valor)}</td>
        </tr>
        ${Number(p.troco) > 0 ? `<tr><td class="pgto-troco">↳ Troco</td><td class="pgto-troco" style="text-align:right">${fmtMoney(p.troco)}</td></tr>` : ""}`
      ).join("")
    : `<tr><td class="pgto-met">${order.payment || "—"}</td><td class="pgto-val">${fmtMoney(order.total)}</td></tr>`;

  // ── Agendamento ────────────────────────────────────────────────────────────
  const agendamentoBloco = (order.agendado && order.horarioAgendado) ? (() => {
    try {
      const dt = new Date(order.horarioAgendado);
      return `
        <div class="agend-box">
          <div class="agend-label">AGENDADO PARA</div>
          <div class="agend-hora">${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
          <div class="agend-data">${dt.toLocaleDateString("pt-BR")}</div>
        </div>
        <div class="sep-dash"></div>`;
    } catch { return ""; }
  })() : "";

  // ── Endereço ───────────────────────────────────────────────────────────────
  const endBloco = order.endereco ? `
    <div class="sep-dash"></div>
    <div class="section-title">ENDEREÇO</div>
    <div class="info-line">${order.endereco.rua || ""}, ${order.endereco.numero || ""}</div>
    ${order.endereco.bairro ? `<div class="info-sub">${order.endereco.bairro}</div>` : ""}
    ${order.endereco.referencia ? `<div class="info-sub">Ref: ${order.endereco.referencia}</div>` : ""}` : "";

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box;color:#000!important;
    -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
  @page{margin:0;size:58mm auto;}
  body{
    font-family:'Courier New',Courier,monospace;
    font-size:10px;line-height:1.45;
    background:#fff!important;
    width:58mm;
    padding:3mm 3mm 0 3mm;
  }

  /* ── utilidades ── */
  .c{text-align:center;}
  .b{font-weight:bold;}
  .sep-solid{border-top:2px solid #000;margin:5px 0;}
  .sep-dash {border-top:1px dashed #000;margin:4px 0;}

  /* ── cabeçalho ── */
  .rest-nome{font-size:13px;font-weight:bold;text-align:center;letter-spacing:.5px;margin-bottom:1px;}
  .rest-sub  {font-size:7.5px;text-align:center;color:#222;}
  .data-hora {font-size:8px;text-align:center;margin-top:2px;}
  .pedido-num{font-size:16px;font-weight:bold;text-align:center;letter-spacing:2px;margin:3px 0 1px;}

  /* ── tipo badge ── */
  .tipo-badge{
    display:inline-block;font-size:7.5px;font-weight:bold;
    border:1px solid #000;padding:1px 5px;margin:2px auto 0;
    letter-spacing:.8px;
  }
  .tipo-wrap{text-align:center;}

  /* ── agendamento ── */
  .agend-box{border:2px solid #000;padding:5px 4px;margin:5px 0;text-align:center;}
  .agend-label{font-size:7px;font-weight:bold;letter-spacing:1px;margin-bottom:2px;}
  .agend-hora{font-size:22px;font-weight:bold;letter-spacing:3px;line-height:1.1;}
  .agend-data{font-size:8px;margin-top:1px;}

  /* ── info cliente ── */
  .info-grid{width:100%;border-collapse:collapse;margin:3px 0;}
  .info-grid td{padding:1.5px 0;font-size:9px;vertical-align:top;}
  .info-grid .lbl{font-weight:bold;width:40px;color:#333;}
  .info-line{font-size:9px;margin:1px 0;}
  .info-sub {font-size:7.5px;color:#444;margin:1px 0;}
  .section-title{font-size:7.5px;font-weight:bold;letter-spacing:.8px;margin-bottom:2px;}

  /* ── itens ── */
  .itens-tbl{width:100%;border-collapse:collapse;}
  .itens-tbl th{font-size:8px;font-weight:bold;padding:1px 0 2px;border-bottom:1px dashed #000;}
  .itens-tbl td{vertical-align:top;padding:2px 0;}
  .qtd{width:22px;font-size:9px;}
  .nome{font-size:9px;}
  .val{text-align:right;white-space:nowrap;font-size:9px;width:38px;}
  .obs-item{font-size:7.5px;color:#555;padding-left:4px;}

  /* ── total ── */
  .total-row{width:100%;border-collapse:collapse;margin:2px 0;}
  .total-row td{font-size:14px;font-weight:bold;padding:2px 0;}
  .total-row .tval{text-align:right;}

  /* ── pagamento ── */
  .pgto-tbl{width:100%;border-collapse:collapse;}
  .pgto-tbl td{padding:1.5px 0;font-size:9px;}
  .pgto-met{} .pgto-val{text-align:right;}
  .pgto-troco{font-size:7.5px;color:#444;}

  /* ── rodapé ── */
  .footer-txt{font-size:7.5px;text-align:center;margin-top:2px;}
  .cut-space{height:20mm;}
</style></head><body>

  <!-- CABEÇALHO -->
  <div class="rest-nome">${restInfo.nome || "ZapFome"}</div>
  ${restInfo.cnpj    ? `<div class="rest-sub">CNPJ: ${restInfo.cnpj}</div>` : ""}
  ${restInfo.endereco? `<div class="rest-sub">${restInfo.endereco}</div>`  : ""}
  ${restInfo.telefone? `<div class="rest-sub">Tel: ${restInfo.telefone}</div>` : ""}

  <div class="sep-dash"></div>
  <div class="data-hora">${dataHora}</div>
  <div class="pedido-num">#${oid}</div>
  <div class="tipo-wrap">
    <span class="tipo-badge">${order.type || "—"}</span>
  </div>

  <div class="sep-solid"></div>

  <!-- AGENDAMENTO (condicional) -->
  ${agendamentoBloco}

  <!-- CLIENTE -->
  <table class="info-grid">
    <tr><td class="lbl">Cliente</td><td>${order.client || "—"}</td></tr>
    ${order.telefone ? `<tr><td class="lbl">Tel</td><td>${order.telefone}</td></tr>` : ""}
    ${order.mesa     ? `<tr><td class="lbl">Mesa</td><td><b>${order.mesa}</b></td></tr>` : ""}
  </table>

  <!-- ENDEREÇO (condicional) -->
  ${endBloco}

  <!-- ITENS -->
  <div class="sep-dash"></div>
  <div class="section-title c">ITENS DO PEDIDO</div>
  <table class="itens-tbl">
    <thead>
      <tr>
        <th class="qtd">Qtd</th>
        <th style="text-align:left">Produto</th>
        <th style="text-align:right">Vlr</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <!-- TOTAL -->
  <div class="sep-solid"></div>
  <table class="total-row">
    <tr>
      <td>TOTAL</td>
      <td class="tval">${fmtMoney(order.total)}</td>
    </tr>
  </table>
  <div class="sep-solid"></div>

  <!-- PAGAMENTO -->
  <div class="section-title" style="margin-top:4px;">PAGAMENTO</div>
  <table class="pgto-tbl">${pgtoRows}</table>

  <!-- OBSERVAÇÃO -->
  ${order.observacao ? `
  <div class="sep-dash"></div>
  <div class="section-title">OBSERVAÇÕES</div>
  <div class="info-line">${order.observacao}</div>` : ""}

  <!-- RODAPÉ -->
  <div class="sep-dash" style="margin-top:6px;"></div>
  <div class="footer-txt">Obrigado pela preferência!</div>
  <div class="footer-txt" style="font-size:7px;color:#666;">ZapFome · Sistema de Delivery</div>
  <div class="cut-space"></div>
</body></html>`;
};

const TABS = [
  { id: "pedidos",    label: "PEDIDOS" },
  { id: "novo-pedido",label: "NOVO PEDIDO", highlight: true },
  { id: "cardapio",   label: "CARDÁPIO DIGITAL" },
  { id: "estoque",    label: "ESTOQUE" },
  { id: "financeiro", label: "💰 FINANCEIRO" },
  { id: "crm",        label: "📊 CRM" },
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

// ── Fluxo de status ────────────────────────────────────────────────────────────
// Pendente → Aceito → Em Preparo → Pronto → Finalizado
const STATUS_FLOW = {
  PENDENTE:    { next: "ACEITO",     label: "Aceitar Pedido",     cls: "bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600" },
  ACEITO:      { next: "EM PREPARO", label: "Iniciar Preparo",    cls: "bg-amber-500   hover:bg-amber-400   active:bg-amber-600"   },
  "EM PREPARO":{ next: "PRONTO",     label: "Marcar como Pronto", cls: "bg-blue-500    hover:bg-blue-400    active:bg-blue-600"    },
  PRONTO:      { next: "FINALIZADO", label: "Finalizar Pedido",   cls: "bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600" },
  FINALIZADO:  { next: null,         label: null,                 cls: null },
  CANCELADO:   { next: null,         label: null,                 cls: null },
};

// Stepper visual do progresso
const STATUS_STEPS = ["PENDENTE", "ACEITO", "EM PREPARO", "PRONTO", "FINALIZADO"];

// ── Modal de Detalhes ─────────────────────────────────────────────────────────
const OrderModal = ({ order, onClose, onStatusChange }) => {
  const [loading, setLoading] = useState(false);

  if (!order) return null;

  const flow   = STATUS_FLOW[order.status] || {};
  const stepIdx = STATUS_STEPS.indexOf(order.status);

  const handleAvancar = async () => {
    if (!flow.next || loading) return;
    setLoading(true);
    await onStatusChange(order.id, flow.next); // persiste via API dentro de handleStatusChange
    setLoading(false);
    if (flow.next === "FINALIZADO") onClose();
  };

  const handleCancelar = async () => {
    setLoading(true);
    await onStatusChange(order.id, "CANCELADO");
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}>
      <div
        className="bg-[#111] border border-white/10 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-zinc-500 uppercase tracking-widest">Pedido</span>
              <span className="text-base font-bold text-white font-mono">{order.id?.slice(0, 8)}…</span>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
              style={{ backgroundColor: (STATUS_COLORS[order.status] || "#3f3f46") + "22", color: STATUS_COLORS[order.status] || "#a1a1aa" }}>
              {order.status}
            </span>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/8 hover:bg-white/15 text-zinc-400 transition-colors">
            ✕
          </button>
        </div>

        {/* ── Stepper de progresso ── */}
        {order.status !== "CANCELADO" && (
          <div className="flex items-center px-5 py-3 border-b border-white/8 gap-0">
            {STATUS_STEPS.map((s, i) => {
              const done    = i < stepIdx;
              const current = i === stepIdx;
              const last    = i === STATUS_STEPS.length - 1;
              return (
                <div key={s} className="flex items-center flex-1">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 transition-colors ${
                    done    ? "bg-emerald-500 text-black" :
                    current ? "bg-white text-black" :
                              "bg-white/10 text-zinc-600"
                  }`}>
                    {done ? "✓" : i + 1}
                  </div>
                  {!last && (
                    <div className={`flex-1 h-px mx-1 transition-colors ${done ? "bg-emerald-500" : "bg-white/10"}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Corpo ── */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[55vh]">
          {/* Agendamento */}
          {order.agendado && order.horarioAgendado && (
            <div className="flex items-center justify-between bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-2.5">
              <span className="text-xs text-zinc-400">
                Agendado {new Date(order.horarioAgendado).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <Countdown horario={order.horarioAgendado} />
            </div>
          )}

          {/* Cliente + tipo */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-white">{order.client}</p>
              {order.telefone && <p className="text-xs text-zinc-500">📞 {order.telefone}</p>}
            </div>
            <span className="text-xs px-3 py-1 bg-white/8 rounded-full text-zinc-300">{order.type}</span>
          </div>

          {/* Itens */}
          <div className="bg-white/4 rounded-xl p-3 flex flex-col gap-1.5">
            <p className="text-[11px] text-zinc-500 uppercase tracking-widest mb-1">Itens</p>
            {(order.items || []).map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-emerald-500 text-xs">›</span>
                <span className="text-sm text-zinc-200">{item}</span>
              </div>
            ))}
          </div>

          {/* Endereço */}
          {order.endereco && (
            <div className="bg-white/4 rounded-xl p-3 flex flex-col gap-1">
              <p className="text-[11px] text-zinc-500 uppercase tracking-widest mb-1">Entrega</p>
              <p className="text-sm text-zinc-200">{order.endereco.rua}, {order.endereco.numero}</p>
              {order.endereco.bairro && <p className="text-xs text-zinc-500">{order.endereco.bairro}</p>}
              {order.endereco.referencia && <p className="text-xs text-zinc-500">Ref: {order.endereco.referencia}</p>}
            </div>
          )}

          {/* Observação */}
          {order.observacao && (
            <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-2.5">
              <p className="text-[11px] text-zinc-500 uppercase tracking-widest mb-1">Obs</p>
              <p className="text-sm text-amber-300">{order.observacao}</p>
            </div>
          )}

          {/* Total */}
          <div className="flex items-center justify-between border-t border-white/8 pt-3">
            <span className="text-sm text-zinc-400">{order.payment || "Pagamento não registrado"}</span>
            <span className="text-xl font-bold text-emerald-400">
              R$ {Number(order.total || 0).toFixed(2).replace(".", ",")}
            </span>
          </div>
        </div>

        {/* ── Botões de ação ── */}
        <div className="p-5 border-t border-white/8 flex flex-col gap-3">
          {/* Botão principal — avança o status */}
          {flow.next && (
            <button
              onClick={handleAvancar}
              disabled={loading}
              className={`w-full py-4 rounded-xl text-base font-bold text-black transition-all disabled:opacity-40 active:scale-[0.98] ${flow.cls}`}
            >
              {loading ? "Salvando…" : flow.label}
            </button>
          )}

          {/* Finalizado — desabilitado */}
          {order.status === "FINALIZADO" && (
            <div className="w-full py-4 rounded-xl text-center text-sm font-semibold text-zinc-600 bg-white/4">
              ✓ Pedido Finalizado
            </div>
          )}

          {/* Cancelado */}
          {order.status === "CANCELADO" && (
            <div className="w-full py-4 rounded-xl text-center text-sm font-semibold text-red-400 bg-red-500/8">
              ✕ Pedido Cancelado
            </div>
          )}

          {/* Cancelar — apenas para pedidos não finais */}
          {order.status === "PENDENTE" && (
            <button
              onClick={handleCancelar}
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/8 transition-colors disabled:opacity-40"
            >
              Cancelar pedido
            </button>
          )}

          <button onClick={onClose} className="w-full py-2 text-sm text-zinc-600 hover:text-zinc-400 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Views ─────────────────────────────────────────────────────────────────────
const CardView = ({ orders, onSelect, onReimprimir }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
    {orders.map((o) => {
      const cor = STATUS_COLORS[o.status] || "#3f3f46";
      return (
        <div key={o.id}
          onClick={() => onSelect(o)}
          className="relative bg-[#111] rounded-2xl overflow-hidden cursor-pointer transition-all hover:scale-[1.01] hover:shadow-xl active:scale-[0.99]"
          style={{ border: `1px solid ${cor}33` }}>
          {/* borda-status lateral */}
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: cor }} />

          <div className="pl-4 pr-3 pt-3 pb-3 flex flex-col gap-2">
            {/* topo: id + status badge */}
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-zinc-600">#{String(o.id).slice(-6).toUpperCase()}</span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${cor}22`, color: cor }}>
                {o.status}
              </span>
            </div>

            {/* cliente */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center text-xs font-bold text-white shrink-0">
                {(o.client || "?")[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate leading-tight">{o.client}</p>
                <p className="text-[10px] text-zinc-500 leading-tight">{o.type}{o.mesa ? ` · Mesa ${o.mesa}` : ""}</p>
              </div>
            </div>

            {/* itens */}
            <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2">
              {o.items.join(" · ")}
            </p>

            {/* countdown se agendado */}
            {o.agendado && o.horarioAgendado && (
              <div className="flex items-center gap-1.5 bg-amber-500/8 rounded-xl px-2.5 py-1.5 border border-amber-500/20">
                <Countdown horario={o.horarioAgendado} />
              </div>
            )}

            {/* rodapé: pagamento + total + reimprimir */}
            <div className="flex items-center justify-between pt-2 mt-0.5 border-t border-white/6">
              <span className="text-[10px] text-zinc-500">{o.payment}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-emerald-400">
                  R$ {Number(o.total).toFixed(2).replace(".", ",")}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onReimprimir(o); }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/6 hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-400 transition-colors text-sm"
                  title="Reimprimir comanda"
                >🖨</button>
              </div>
            </div>
          </div>
        </div>
      );
    })}
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
    <div className="flex gap-3 p-4 overflow-x-auto min-h-[300px] pb-6">
      {cols.map((col) => {
        const cor = STATUS_COLORS[col] || "#3f3f46";
        const colOrders = orders.filter((o) => o.status === col);
        return (
          <div key={col} className="min-w-[190px] flex flex-col gap-2">
            {/* header coluna */}
            <div className="flex items-center justify-between px-2 py-1.5 rounded-xl mb-0.5"
              style={{ background: `${cor}14`, border: `1px solid ${cor}30` }}>
              <span className="text-[10px] font-bold" style={{ color: cor }}>{col}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${cor}25`, color: cor }}>
                {colOrders.length}
              </span>
            </div>

            {colOrders.map((o) => (
              <div key={o.id} onClick={() => onSelect(o)}
                className="bg-[#111] rounded-xl p-3 flex flex-col gap-1.5 cursor-pointer hover:bg-white/4 transition-all active:scale-[0.98]"
                style={{ border: `1px solid ${cor}22` }}>
                <div className="flex justify-between items-center">
                  <span className="text-[9px] text-zinc-600 font-mono">#{String(o.id).slice(-4).toUpperCase()}</span>
                  <span className="text-[9px] text-zinc-500">{o.time}</span>
                </div>
                <span className="text-sm font-semibold text-white leading-tight">{o.client}</span>
                <span className="text-[10px] text-zinc-500 leading-tight">{o.items[0]}{o.items.length > 1 ? ` +${o.items.length - 1}` : ""}</span>
                {o.agendado && o.horarioAgendado && <Countdown horario={o.horarioAgendado} />}
                <div className="flex justify-between items-center mt-0.5 pt-1.5 border-t border-white/5">
                  <span className="text-[10px] text-zinc-600">{o.type}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-emerald-400">R$ {Number(o.total).toFixed(2).replace(".", ",")}</span>
                    <button onClick={(e) => { e.stopPropagation(); onReimprimir(o); }}
                      className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/6 hover:bg-emerald-500/20 text-[11px] transition-colors"
                      title="Reimprimir">🖨</button>
                  </div>
                </div>
              </div>
            ))}
            {colOrders.length === 0 && (
              <div className="flex items-center justify-center py-8 rounded-xl border border-dashed border-white/6">
                <span className="text-[10px] text-zinc-700">vazio</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const CompactView = ({ orders, onSelect, onReimprimir }) => (
  <div className="flex flex-col">
    {orders.map((o) => {
      const cor = STATUS_COLORS[o.status] || "#3f3f46";
      return (
        <div key={o.id} onClick={() => onSelect(o)}
          className="flex items-center gap-3 px-4 py-3 hover:bg-white/3 cursor-pointer border-b border-white/5 transition-colors">
          {/* dot status */}
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: cor }} />
          {/* id */}
          <span className="font-mono text-[10px] text-zinc-600 w-12 shrink-0">#{String(o.id).slice(-4).toUpperCase()}</span>
          {/* cliente */}
          <span className="text-sm text-white font-medium flex-1 truncate">{o.client}</span>
          {/* tipo */}
          <span className="text-[10px] text-zinc-500 hidden sm:block w-20 shrink-0">{o.type}</span>
          {/* countdown ou hora */}
          <div className="w-20 shrink-0 flex justify-end">
            {o.agendado && o.horarioAgendado
              ? <Countdown horario={o.horarioAgendado} />
              : <span className="text-[10px] text-zinc-600">{o.time}</span>}
          </div>
          {/* total */}
          <span className="text-sm font-bold text-emerald-400 w-20 text-right shrink-0">
            R$ {Number(o.total).toFixed(2).replace(".", ",")}
          </span>
          {/* status */}
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full w-24 text-center shrink-0"
            style={{ background: `${cor}20`, color: cor }}>{o.status}</span>
          {/* reimprimir */}
          <button
            onClick={(e) => { e.stopPropagation(); onReimprimir(o); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/6 hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-400 transition-colors text-sm shrink-0"
            title="Reimprimir">🖨</button>
        </div>
      );
    })}
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
        onStatusChange={async (id, status) => {
          await handleStatusChange(id, status);
          // Atualiza o pedido selecionado localmente para o stepper re-renderizar
          setSelectedOrder(prev => prev ? { ...prev, status } : null);
        }}
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
  // ── Integração 1: Inicializa do localStorage para sobreviver offline ──────────
  const [orders, setOrders] = useState(() => {
    try {
      const cached = localStorage.getItem(`zapfome_orders_${id}`);
      if (cached) return JSON.parse(cached);
    } catch {}
    return []; // array vazio em produção — API carrega os pedidos reais
  });
  const [estoqueItens, setEstoqueItens] = useState([]);
  const [vendasFinanceiro, setVendasFinanceiro] = useState([]);
  const [lojaAtiva, setLojaAtiva] = useState(true);
  const [mesas] = useState(Array.from({ length: 20 }, (_, i) => ({ id: `Mesa ${i + 1}`, status: i % 3 === 0 ? "ocupada" : "livre" })));
  const [impressoras, setImpressoras] = useState([{ nome: "Knup KP-IM607", ativa: true }]);
  const [novaImpressora, setNovaImpressora] = useState("");
  const [showQrWpp, setShowQrWpp] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const knownPendentRef  = useRef(new Set());
  const [restauranteInfo, setRestauranteInfo] = useState({});

  // Carrega dados do restaurante (CNPJ, endereço) para o cupom
  useEffect(() => {
    if (!id) return;
    axios.get(`${API}/restaurantes/${id}`)
      .then(({ data }) => setRestauranteInfo(data || {}))
      .catch(() => {});
  }, [id]);

  // ── Integração 1: Persiste pedidos no localStorage sempre que mudam ──────────
  useEffect(() => {
    localStorage.setItem(`zapfome_orders_${id}`, JSON.stringify(orders));
  }, [orders, id]);

  // ── Auto-load estoque ao montar (NovoPedido já tem dados desde o início) ─────
  useEffect(() => {
    if (!id) return;
    axios.get(`${API}/estoque/${id}`)
      .then(({ data }) => {
        const arr = Array.isArray(data) ? data : (data.itens || []);
        const normalized = arr.map(i => ({
          ...i,
          id: i.id || i._id,
          category: i.categoria,
          name: i.nome,
          salePrice: i.precoVenda,
          costPrice: i.precoCusto,
        }));
        setEstoqueItens(normalized);
      })
      .catch(() => {/* silencioso — Estoque tab vai tentar novamente */});
  }, [id]);

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

  // ── Técnica iframe: impressão USB silenciosa sem folha em branco ─────────────
  // Injeta HTML completo num iframe invisível → chama iframe.contentWindow.print()
  // após 800ms (garante renderização CSS antes do print dialog)
  const printViaIframe = useCallback((order) => {
    const old = document.getElementById("zapfome-thermal-iframe");
    if (old) old.remove();

    const html = buildReceiptHTML(order, restauranteInfo);

    const iframe = document.createElement("iframe");
    iframe.id = "zapfome-thermal-iframe";
    // NÃO usar visibility:hidden — impede renderização antes do print
    // Posiciona fora da tela sem ocultar do motor de renderização
    iframe.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;width:58mm;height:1px;border:0;pointer-events:none;";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    // 800ms: garante que CSS e layout renderizem antes do diálogo de impressão
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();           // --kiosk-printing → impressão silenciosa
      } catch { /* fallback ignorado — kiosk já imprime direto */ }
      setTimeout(() => { try { iframe.remove(); } catch {} }, 4000);
    }, 800);
  }, [restauranteInfo]);

  // ── Impressão: backend GDI (silenciosa) → fallback iframe ───────────────────
  const imprimirComprovante = useCallback((order) => {
    const printer = impressoras?.[0]?.nome || "Knup KP-IM607";

    // Tenta backend GDI — sem diálogo, sem nova janela
    authAxios.post(`${API}/print/receipt`, {
      impressora: printer,
      pedido: {
        id:                   order.id,
        client:               order.client,
        clienteNome:          order.client,
        type:                 order.type,
        tipo:                 order.type,
        telefone:             order.telefone,
        mesa:                 order.mesa,
        total:                order.total,
        payment:              order.payment,
        pagamento:            order.payment,
        pagamentosDetalhados: order.pagamentosDetalhados,
        itensCompletos:       order.itensCompletos,
        items:                order.items,
        observacao:           order.observacao,
        endereco:             order.endereco,
        agendado:             order.agendado,
        horarioAgendado:      order.horarioAgendado,
      },
      restaurante: restauranteInfo || {},
    }).catch(() => {
      // Fallback: iframe (--kiosk-printing no Chrome evita diálogo)
      printViaIframe(order);
    });
  }, [impressoras, restauranteInfo, printViaIframe]);

  const printOrder = imprimirComprovante;

  const handleNovoPedido = async (pedido) => {
    // Normaliza pagamento: array de métodos → string separada por "+"
    const pagamentoStr = Array.isArray(pedido.pagamentos) && pedido.pagamentos.length > 0
      ? pedido.pagamentos.map(p => p.metodo).join("+").toLowerCase()
      : (pedido.pagamento || "dinheiro").toLowerCase();

    const payload = {
      restauranteId: id || "teste",
      clienteNome: pedido.cliente || "Cliente",
      clienteTelefone: pedido.telefone || "",
      tipo: pedido.tipo || "retirada",
      itens: (pedido.itens || []).map(i => ({
        nome: i.name || i.nome || "",
        qtd: i.qtd || 1,
        precoUnitario: i.precoUnitario || i.salePrice || 0,
        observacao: i.observacao || "",
      })),
      pagamento: pagamentoStr,
      pago: pedido.pago ?? true,
      agendado: pedido.agendado || false,
      horarioAgendado: pedido.horarioAgendado || null,
      observacao: pedido.observacao || "",
      mesa: pedido.mesa || null,
      endereco: pedido.endereco || null,
    };

    try {
      // ① Salva no banco ANTES de qualquer outra ação
      const res = await axios.post(`${API}/pedidos`, payload);
      const pedidoId = res.data.id;

      // ② Cria objeto normalizado para o estado local (aparece instantaneamente)
      const novoOrder = normalizeApiOrder({
        ...payload,
        id: pedidoId,
        status: "pendente",
        total: pedido.total || 0,
        criadoEm: new Date().toISOString(),
        pagamentosDetalhados: pedido.pagamentos || [],   // array completo {metodo, valor, troco}
      });
      setOrders(prev => [novoOrder, ...prev.filter(o => o.id !== pedidoId)]);
      knownPendentRef.current.add(pedidoId); // evita auto-print duplo no próximo poll

      // ③ Imprime comprovante automaticamente
      imprimirComprovante(novoOrder);

      // ④ Sincroniza lista no background
      setTimeout(fetchPedidos, 1500);
    } catch (err) {
      console.error("Erro ao salvar pedido na API:", err);
      // Fallback local se API falhar
      const fallback = {
        id: `#${Date.now()}`,
        client: pedido.cliente,
        items: (pedido.itens || []).map(i => `${i.qtd}x ${i.name}`),
        itensCompletos: pedido.itens || [],
        total: pedido.total || 0,
        status: "PENDENTE",
        type: TIPO_API_TO_UI[pedido.tipo] || "RETIRADA",
        payment: pagamentoStr.toUpperCase(),
        time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        agendado: pedido.agendado || false,
        horarioAgendado: pedido.horarioAgendado || "",
        observacao: pedido.observacao || "",
        telefone: pedido.telefone || "",
        endereco: pedido.endereco || null,
      };
      setOrders(prev => [fallback, ...prev]);
    }
    setActiveTab("pedidos");
  };

  const fetchPedidos = useCallback(async () => {
    try {
      const { data } = await authAxios.get(`${API}/pedidos?restaurante_id=${id}`);
      const normalized = (data.pedidos || []).map(normalizeApiOrder);
      setOrders(normalized);

      // Detecta novos pedidos PENDENTES
      const novos = normalized.filter(
        o => o.status === "PENDENTE" && !knownPendentRef.current.has(o.id)
      );

      novos.forEach(o => {
        knownPendentRef.current.add(o.id);

        // 🔔 Alerta sonoro via Web Audio API (sem arquivo externo)
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          [0, 0.18, 0.36].forEach(delay => {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = 880; osc.type = "sine";
            gain.gain.setValueAtTime(0.4, ctx.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.15);
            osc.start(ctx.currentTime + delay);
            osc.stop(ctx.currentTime + delay + 0.15);
          });
        } catch { /* navegador bloqueou AudioContext antes de interação */ }

        // 🖨 A impressão acontece quando o operador aceitar o pedido (status ACEITO)
      });

      // Notificação do browser para novos pedidos
      if (novos.length > 0 && "Notification" in window && Notification.permission === "granted") {
        new Notification(`🍔 ${novos.length} novo(s) pedido(s)!`, {
          body: novos.map(o => o.client).join(", "),
          icon: "/favicon.ico",
        });
      }
    } catch { /* API offline — mantém estado atual */ }
  }, [id]);

  useEffect(() => {
    // Solicita permissão para notificações do browser
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    fetchPedidos();
    const interval = setInterval(fetchPedidos, 15000); // polling a cada 15s
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
    authAxios.post(`${API}/financeiro/venda`, venda).catch(() => {});
  };

  // Avança status de um pedido (UI + API)
  const avancarStatus = useCallback(async (pedidoId, novoStatusUI) => {
    const apiStatus = STATUS_UI_TO_API[novoStatusUI];
    if (!apiStatus) return;
    try {
      await authAxios.patch(`${API}/pedidos/${pedidoId}/status`, { status: apiStatus });
    } catch (err) {
      console.error("Erro ao atualizar status na API:", err);
    }
  }, []);

  // Retorna Promise para o modal poder await e mostrar loading
  const handleStatusChange = async (orderId, newStatus, novoPagamento) => {
    // ① Persiste primeiro (AJAX)
    await avancarStatus(orderId, newStatus);

    // ② Captura pedido atualizado para side-effects (closure com orders atual)
    const currentOrder = orders.find(o => o.id === orderId);
    const updatedOrder = currentOrder
      ? { ...currentOrder, status: newStatus, ...(novoPagamento ? { payment: novoPagamento } : {}) }
      : null;

    // ③ Atualiza estado local
    setOrders((prev) => prev.map((o) => {
      if (o.id !== orderId) return o;
      const updated = { ...o, status: newStatus };
      if (novoPagamento) updated.payment = novoPagamento;
      return updated;
    }));

    // ④ Integração 3: Impressão automática ao aceitar pedido
    if (newStatus === "ACEITO" && updatedOrder) {
      imprimirComprovante(updatedOrder);
    }

    // ⑤ Integrações 3+4: Ao finalizar — imprime comprovante + debita estoque
    if (newStatus === "FINALIZADO" && updatedOrder) {
      registrarVendaFinanceiro(updatedOrder, novoPagamento);
      imprimirComprovante(updatedOrder);

      // Integração 4: Deducão de estoque via API
      const itensParaDebitar = (updatedOrder.itensCompletos || [])
        .filter(i => i.id || i.nome)
        .map(i => ({ itemId: i.id || i.nome, qtd: i.qtd || 1 }));

      if (itensParaDebitar.length > 0) {
        authAxios.post(`${API}/estoque/deduzir`, {
          restauranteId: id,
          itens: itensParaDebitar,
        }).catch(err => console.warn("Falha ao debitar estoque:", err?.response?.data || err.message));
      }
    }
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
    try {
      await authAxios.post(`${API}/entregador/despachar`, payload);
    } catch (err) {
      console.error("Erro ao despachar entregador:", err?.response?.data || err.message);
    }
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
            onClick={() => setSidebarOpen(v => !v)}
            className={`font-mono text-xs px-3 py-1.5 border transition-colors ${
              sidebarOpen
                ? "border-[#00E559] text-[#00E559] bg-[#00E559]/10"
                : isDark ? "border-[#27272A] text-[#71717A] hover:border-[#00E559]" : "border-[#CBD5E1] text-[#64748B]"
            }`}
            title="Painel lateral (mesas, impressoras)"
          >
            ⊟ LATERAL
          </button>
          <button
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            className={`font-mono text-xs px-3 py-1.5 border transition-colors ${
              isDark
                ? "border-[#27272A] text-[#EDEDED] hover:border-[#00E559]"
                : "border-[#CBD5E1] text-[#0F172A] hover:border-[#0EA5E9]"
            }`}
          >
            {isDark ? "☀️ CLARO" : "🌙 DARK"}
          </button>
          <span className={`font-mono text-xs hidden sm:block ${subtleText}`}>PAINEL</span>
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
          {activeTab === "novo-pedido" && (() => {
            // Mesas com pedidos ativos (não finalizados) — para validação de ocupação
            const mesasOcupadas = orders
              .filter(o => !["FINALIZADO", "CANCELADO"].includes(o.status) && o.mesa)
              .map(o => o.mesa);
            return (
              <div className="h-full">
                <NovoPedido
                  onPedidoCriado={handleNovoPedido}
                  itensEstoque={estoqueItens}
                  restauranteId={id}
                  mesasOcupadas={mesasOcupadas}
                />
              </div>
            );
          })()}
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
          {activeTab === "crm" && <div className="h-full overflow-y-auto bg-[#0A0A0A]"><CRM restauranteId={id} /></div>}
        </div>

        {sidebarOpen && <aside className={`w-[300px] border-l p-4 overflow-y-auto flex flex-col gap-4 shrink-0 ${panelClass}`}>
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
        </aside>}
      </div>

      <Footer />

      {/* iframe de impressão é criado/removido dinamicamente por printViaIframe() */}
    </div>
  );
}
