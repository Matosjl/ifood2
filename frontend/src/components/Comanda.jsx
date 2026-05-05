import { useRef, forwardRef, useImperativeHandle } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Printer } from "lucide-react";

/* ─── helpers ─────────────────────────────────────────────────────────────── */

/** Pad two strings so they fill exactly `width` chars (left + right). */
function row(left, right, width = 32) {
  const gap = width - left.length - right.length;
  return left + " ".repeat(Math.max(1, gap)) + right;
}

function center(text, width = 32) {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(pad) + text;
}

function dashes(char = "-", width = 32) {
  return char.repeat(width);
}

const STATUS_LABEL = {
  pending:   "PENDENTE",
  confirmed: "CONFIRMADO",
  preparing: "PREPARANDO",
  delivered: "ENTREGUE",
  cancelled: "CANCELADO",
};

/* ─── Jagged paper edge (SVG) ─────────────────────────────────────────────── */
function TearEdge({ flip = false }) {
  return (
    <svg
      viewBox="0 0 240 12"
      className={`w-full ${flip ? "rotate-180" : ""}`}
      preserveAspectRatio="none"
      aria-hidden
    >
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

/* ─── Main component ───────────────────────────────────────────────────────── */
const Comanda = forwardRef(function Comanda({ order }, ref) {
  const printRef = useRef(null);

  if (!order) return null;

  const createdAt = order.created_at
    ? format(new Date(order.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })
    : "—";

  const shortId = order.id?.slice(-8).toUpperCase() ?? "--------";

  const itemsTotal =
    order.total > 0
      ? order.total
      : (order.items ?? []).reduce((s, i) => s + i.unit_price * i.quantity, 0);

  // Expose print() so parent can trigger it imperatively (e.g. after confirming)
  useImperativeHandle(ref, () => ({ print: handlePrint }));

  function handlePrint() {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const win = window.open("", "_blank", "width=400,height=700");
    win.document.write(`
      <html>
        <head>
          <title>Comanda #${shortId}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: #fff; display: flex; justify-content: center; padding: 16px; }
            .receipt { font-family: 'Courier New', Courier, monospace; font-size: 11px;
                       width: 220px; color: #000; white-space: pre-wrap; line-height: 1.5; }
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

  return (
    <div className="flex flex-col items-center gap-4">

      {/* Receipt */}
      <div
        className="relative"
        style={{ filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.5))" }}
      >
        <TearEdge />

        <div
          ref={printRef}
          className="bg-white text-black px-3 py-1"
          style={{
            width: 240,
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: 11,
            lineHeight: "1.55",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {/* Logo / store name */}
          <p className="text-center font-black text-base tracking-widest mt-2">
            ★ RESTAURANTE ★
          </p>
          <p className="text-center text-xs">www.restaurante.com.br</p>
          <p className="text-center text-xs mb-1">Tel: (11) 9 9999-9999</p>

          <p>{dashes("─")}</p>

          {/* Order number + status */}
          <p className="text-center font-bold text-sm mt-1">
            COMANDA #{shortId}
          </p>
          <p className="text-center text-xs mb-1">{createdAt}</p>

          {/* Status — large, bold */}
          <div className="flex justify-center my-2">
            <span
              className="font-black text-sm tracking-widest px-3 py-0.5 border-2 border-black"
              style={{ letterSpacing: "0.18em" }}
            >
              [ {STATUS_LABEL[order.status] ?? order.status.toUpperCase()} ]
            </span>
          </div>

          <p>{dashes("─")}</p>

          {/* Customer */}
          <p className="font-bold text-xs mt-1">CLIENTE</p>
          <p className="text-xs">{order.customer_name || "—"}</p>
          <p className="text-xs">{order.customer_phone}</p>
          {order.address && (
            <p className="text-xs mb-1">📍 {order.address}</p>
          )}

          <p>{dashes("─")}</p>

          {/* Items header */}
          <p className="font-bold text-xs mt-1">
            {row("ITEM", "QTD   VALOR")}
          </p>
          <p>{dashes("·")}</p>

          {/* Items */}
          {(order.items ?? []).length === 0 ? (
            <p className="text-xs italic text-center my-1">sem itens</p>
          ) : (
            order.items.map((item, i) => {
              const lineTotal = item.unit_price * item.quantity;
              return (
                <div key={i}>
                  <p className="text-xs font-semibold">
                    {row(
                      item.name.slice(0, 18),
                      `${item.quantity}x  ${
                        item.unit_price > 0
                          ? `R$${lineTotal.toFixed(2)}`
                          : "  —   "
                      }`
                    )}
                  </p>
                  {item.notes && (
                    <p className="text-xs italic pl-2 opacity-70">
                      obs: {item.notes}
                    </p>
                  )}
                </div>
              );
            })
          )}

          <p>{dashes("─")}</p>

          {/* Total */}
          {itemsTotal > 0 ? (
            <p className="font-black text-sm">
              {row("TOTAL", `R$ ${itemsTotal.toFixed(2)}`)}
            </p>
          ) : (
            <p className="font-bold text-xs text-center">TOTAL A CONFIRMAR</p>
          )}

          <p>{dashes("─")}</p>

          {/* AI message */}
          {order.ai_response && (
            <>
              <p className="text-xs italic text-center mt-1 leading-snug">
                {order.ai_response}
              </p>
              <p>{dashes("─")}</p>
            </>
          )}

          {/* Footer */}
          <p className="text-center text-xs mt-1">
            {center("Obrigado pela preferencia!")}
          </p>
          <p className="text-center text-xs mb-2">
            {center("Volte sempre :)")}
          </p>
        </div>

        <TearEdge flip />
      </div>

      {/* Print button */}
      <button
        onClick={handlePrint}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black font-bold text-sm
                   hover:bg-gray-100 active:scale-95 transition-all shadow-md"
      >
        <Printer size={16} />
        Imprimir comanda
      </button>
    </div>
  );
});

export default Comanda;
