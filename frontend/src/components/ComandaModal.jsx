import { useState, useRef, useEffect } from "react";
import { CheckCheck, Loader2, Printer, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/* ─── helpers ────────────────────────────────────────────────────────────── */
function row(left, right, width = 32) {
  const gap = width - left.length - right.length;
  return left + " ".repeat(Math.max(1, gap)) + right;
}
function center(text, width = 32) {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(pad) + text;
}
function dashes(char = "─", width = 32) { return char.repeat(width); }

const STATUS_LABEL = {
  pending:   "PENDENTE",
  confirmed: "CONFIRMADO",
  preparing: "PREPARANDO",
  delivered: "ENTREGUE",
  cancelled: "CANCELADO",
};

const STATUS_COLOR = {
  pending:   "bg-yellow-400 text-black",
  confirmed: "bg-blue-400 text-black",
  preparing: "bg-orange-400 text-black",
  delivered: "bg-green-400 text-black",
  cancelled: "bg-red-400 text-white",
};

/* ─── Printer SVG ────────────────────────────────────────────────────────── */
function PrinterIcon({ printing }) {
  return (
    <svg width="80" height="56" viewBox="0 0 80 56" fill="none" className="drop-shadow-lg">
      {/* Body */}
      <rect x="8" y="16" width="64" height="34" rx="6" fill="#27272a" stroke="#3f3f46" strokeWidth="1.5"/>
      {/* Top slot */}
      <rect x="20" y="8" width="40" height="10" rx="3" fill="#18181b" stroke="#3f3f46" strokeWidth="1.5"/>
      {/* Paper slot bottom */}
      <rect x="28" y="46" width="24" height="3" rx="1.5" fill="#52525b"/>
      {/* LED */}
      <circle cx="60" cy="30" r="4" fill={printing ? "#22c55e" : "#3f3f46"}
        className={printing ? "animate-pulse" : ""}/>
      {/* Horizontal lines on body */}
      <line x1="16" y1="36" x2="64" y2="36" stroke="#3f3f46" strokeWidth="1"/>
      <line x1="16" y1="42" x2="64" y2="42" stroke="#3f3f46" strokeWidth="1"/>
    </svg>
  );
}

/* ─── TearEdge ───────────────────────────────────────────────────────────── */
function TearEdge({ flip = false }) {
  return (
    <svg viewBox="0 0 240 12" className={`w-full block ${flip ? "rotate-180" : ""}`}
      preserveAspectRatio="none" aria-hidden>
      <path
        d="M0,0 L0,8 L5,4 L10,10 L15,4 L20,10 L25,4 L30,10 L35,4 L40,10
           L45,4 L50,10 L55,4 L60,10 L65,4 L70,10 L75,4 L80,10 L85,4 L90,10
           L95,4 L100,10 L105,4 L110,10 L115,4 L120,10 L125,4 L130,10 L135,4
           L140,10 L145,4 L150,10 L155,4 L160,10 L165,4 L170,10 L175,4 L180,10
           L185,4 L190,10 L195,4 L200,10 L205,4 L210,10 L215,4 L220,10 L225,4
           L230,10 L235,4 L240,10 L240,0 Z"
        fill="white"
      />
    </svg>
  );
}

/* ─── Receipt paper ──────────────────────────────────────────────────────── */
function Receipt({ order, printRef }) {
  const createdAt = order.created_at
    ? format(new Date(order.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })
    : "—";
  const shortId = order.id?.slice(-8).toUpperCase() ?? "--------";
  const itemsTotal = order.total > 0
    ? order.total
    : (order.items ?? []).reduce((s, i) => {
        const lineTotal = i.sale_type === "kg" && i.weight_kg
          ? i.unit_price * i.weight_kg
          : i.unit_price * i.quantity;
        return s + lineTotal;
      }, 0);

  return (
    <div ref={printRef} className="bg-white text-black"
      style={{ width: 240, fontFamily: "'Courier New', Courier, monospace",
               fontSize: 11, lineHeight: "1.55", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      <TearEdge />
      <div className="px-3 py-1">
        <p className="text-center font-black text-base tracking-widest mt-2">★ RESTAURANTE ★</p>
        <p className="text-center text-xs">www.restaurante.com.br</p>
        <p className="text-center text-xs mb-1">Tel: (11) 9 9999-9999</p>

        <p>{dashes()}</p>
        <p className="text-center font-bold text-sm mt-1">COMANDA #{order.order_number || shortId}</p>
        <p className="text-center text-xs mb-1">{createdAt}</p>

        <div className="flex justify-center my-2">
          <span className="font-black text-sm tracking-widest px-3 py-0.5 border-2 border-black"
            style={{ letterSpacing: "0.18em" }}>
            [ {STATUS_LABEL[order.status] ?? order.status?.toUpperCase()} ]
          </span>
        </div>

        <p>{dashes()}</p>
        <p className="font-bold text-xs mt-1">CLIENTE</p>
        <p className="text-xs">{order.customer_name || "—"}</p>
        <p className="text-xs">{order.customer_phone}</p>
        {order.address && <p className="text-xs mb-1">📍 {order.address}</p>}

        <p>{dashes()}</p>
        <p className="font-bold text-xs mt-1">{row("ITEM", "QTD   VALOR")}</p>
        <p>{dashes("·")}</p>

        {(order.items ?? []).length === 0
          ? <p className="text-xs italic text-center my-1">sem itens</p>
          : order.items.map((item, i) => {
              const qtyLabel = item.sale_type === "kg" && item.weight_kg
                ? `${item.weight_kg}kg`
                : `${item.quantity}x `;
              const lineTotal = item.sale_type === "kg" && item.weight_kg
                ? item.unit_price * item.weight_kg
                : item.unit_price * item.quantity;
              return (
                <div key={i}>
                  <p className="text-xs font-semibold">
                    {row(item.name.slice(0, 16),
                      `${qtyLabel} ${item.unit_price > 0 ? `R$${lineTotal.toFixed(2)}` : "  —  "}`)}
                  </p>
                  {item.notes && <p className="text-xs italic pl-2 opacity-70">obs: {item.notes}</p>}
                </div>
              );
            })
        }

        <p>{dashes()}</p>
        {itemsTotal > 0
          ? <p className="font-black text-sm">{row("TOTAL", `R$ ${itemsTotal.toFixed(2)}`)}</p>
          : <p className="font-bold text-xs text-center">TOTAL A CONFIRMAR</p>
        }
        <p>{dashes()}</p>
        <p className="text-center text-xs mt-1">{center("Obrigado pela preferencia!")}</p>
        <p className="text-center text-xs mb-2">{center("Volte sempre :)")}</p>
      </div>
      <TearEdge flip />
    </div>
  );
}

/* ─── ComandaModal ───────────────────────────────────────────────────────── */
export default function ComandaModal({ order, onClose, onConfirmAndPrint }) {
  const printRef   = useRef(null);
  const [printing, setPrinting]   = useState(false);   // impressora animando
  const [printed, setPrinted]     = useState(false);   // "concluído" flash
  const [confirming, setConfirming] = useState(false);
  const [localOrder, setLocalOrder] = useState(order);

  // Keep localOrder in sync when prop changes (e.g. status update)
  useEffect(() => setLocalOrder(order), [order]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  function triggerPrint() {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const shortId = localOrder.id?.slice(-8).toUpperCase();
    const win = window.open("", "_blank", "width=360,height=720");
    win.document.write(`
      <html>
        <head>
          <title>Comanda #${shortId}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: #fff; display: flex; justify-content: center; padding: 8px; }
            .receipt { font-family: 'Courier New', Courier, monospace; font-size: 11px;
                       width: 220px; color: #000; white-space: pre-wrap; line-height: 1.55; }
            svg { display: none; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body><div class="receipt">${content}</div></body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }

  async function handlePrint() {
    setPrinting(true);
    await new Promise((r) => setTimeout(r, 1200)); // animação
    triggerPrint();
    setPrinting(false);
    setPrinted(true);
    setTimeout(() => setPrinted(false), 2500);
  }

  async function handleConfirmAndPrint() {
    if (confirming) return;
    setConfirming(true);
    try {
      await onConfirmAndPrint(localOrder.id);
      setLocalOrder((p) => ({ ...p, status: "confirmed" }));
      await handlePrint();
    } finally {
      setConfirming(false);
    }
  }

  if (!localOrder) return null;

  const statusCls = STATUS_COLOR[localOrder.status] ?? "bg-gray-400 text-black";
  const isPending = localOrder.status === "pending";

  return (
    /* Overlay */
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}>

      {/* Close */}
      <button onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-zinc-800 text-zinc-400
                   hover:bg-zinc-700 hover:text-white transition-all">
        <X size={18} />
      </button>

      {/* Header strip */}
      <div className="mb-4 text-center">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Preview de impressão</p>
        <div className="flex items-center justify-center gap-2">
          <span className="text-white font-black text-lg">
            #{localOrder.order_number || localOrder.id?.slice(-8).toUpperCase()}
          </span>
          <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${statusCls}`}>
            {STATUS_LABEL[localOrder.status] ?? localOrder.status?.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Printer + receipt */}
      <div className="flex flex-col items-center">

        {/* Printer icon */}
        <PrinterIcon printing={printing} />

        {/* Slot gap — receipt slides "into" printer when printing */}
        <div className="overflow-hidden" style={{ maxHeight: printing ? 0 : 9999,
          transition: printing ? "max-height 0.9s ease-in" : "max-height 0.3s ease-out" }}>

          {/* Receipt wrapper with drop-shadow */}
          <div style={{ filter: "drop-shadow(0 8px 32px rgba(0,0,0,0.7))",
            transform: printing ? "translateY(-20px)" : "translateY(0)",
            transition: "transform 0.9s ease-in",
            maxHeight: "55vh", overflowY: "auto" }}>
            <Receipt order={localOrder} printRef={printRef} />
          </div>
        </div>

        {/* Printing feedback */}
        {printing && (
          <div className="mt-4 flex items-center gap-2 text-green-400 font-semibold text-sm animate-pulse">
            <Loader2 size={16} className="animate-spin" />
            Enviando para impressora…
          </div>
        )}
        {printed && !printing && (
          <div className="mt-4 flex items-center gap-2 text-green-400 font-bold text-sm
                          animate-in fade-in-0 slide-in-from-bottom-2">
            ✓ Comanda impressa com sucesso!
          </div>
        )}
      </div>

      {/* Action buttons */}
      {!printing && (
        <div className="mt-6 flex flex-col items-center gap-3 w-full px-6 max-w-xs">
          {isPending ? (
            <button onClick={handleConfirmAndPrint} disabled={confirming}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                         bg-green-500 text-white font-black text-sm tracking-wide
                         hover:bg-green-400 active:scale-[0.98] disabled:opacity-50
                         transition-all shadow-lg shadow-green-500/30">
              {confirming
                ? <><Loader2 size={16} className="animate-spin" /> Confirmando…</>
                : <><CheckCheck size={16} /> Confirmar e Imprimir</>}
            </button>
          ) : (
            <button onClick={handlePrint}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                         bg-white text-black font-black text-sm tracking-wide
                         hover:bg-zinc-100 active:scale-[0.98] transition-all
                         shadow-lg shadow-black/40">
              <Printer size={16} />
              Imprimir comanda
            </button>
          )}

          <button onClick={onClose}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-1">
            Fechar preview
          </button>
        </div>
      )}
    </div>
  );
}
