import { useState, useEffect, useCallback } from "react";
import { CheckCheck, ChefHat, Loader2, Maximize2, Minimize2, Plus, Receipt, X } from "lucide-react";
import { useSocket } from "@/hooks/useSocket";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import ComandaModal from "@/components/ComandaModal";
import NewOrderModal from "@/components/NewOrderModal";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/* ─── Kanban columns ─────────────────────────────────────────────────────���─ */
const COLUMNS = [
  {
    id: "pending",
    label: "PENDENTE",
    statuses: ["pending", "confirmed"],
    header: "bg-yellow-500/20 border-yellow-500/50 text-yellow-300",
    border: "border-t-4 border-yellow-500",
    glow: "shadow-[0_0_20px_rgba(234,179,8,0.15)]",
    dot: "bg-yellow-400 animate-pulse",
  },
  {
    id: "preparing",
    label: "EM PREPARO",
    statuses: ["preparing"],
    header: "bg-orange-500/20 border-orange-500/50 text-orange-300",
    border: "border-t-4 border-orange-500",
    glow: "shadow-[0_0_20px_rgba(249,115,22,0.15)]",
    dot: "bg-orange-400 animate-pulse",
  },
  {
    id: "delivered",
    label: "CONCLUÍDO",
    statuses: ["delivered"],
    header: "bg-green-500/20 border-green-500/50 text-green-300",
    border: "border-t-4 border-green-500",
    glow: "shadow-[0_0_20px_rgba(34,197,94,0.12)]",
    dot: "bg-green-400",
  },
  {
    id: "cancelled",
    label: "CANCELADO",
    statuses: ["cancelled"],
    header: "bg-red-500/20 border-red-500/50 text-red-300",
    border: "border-t-4 border-red-500",
    glow: "",
    dot: "bg-red-400",
  },
];

const STATUS_CARD = {
  pending:   "border-l-4 border-l-yellow-500 border-yellow-500/20",
  confirmed: "border-l-4 border-l-yellow-500 border-yellow-500/20",
  preparing: "border-l-4 border-l-orange-500 border-orange-500/20",
  delivered: "border-l-4 border-l-green-500 border-green-500/20",
  cancelled: "border-l-4 border-l-red-500 border-red-500/20 opacity-50",
};

const ACTION_BUTTONS = {
  pending: [
    { label: "Iniciar", next: "preparing", icon: ChefHat,   style: "bg-orange-500/20 text-orange-300 border-orange-500/40 hover:bg-orange-500/40" },
    { label: "Cancelar", next: "cancelled", icon: X,         style: "bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/40" },
  ],
  confirmed: [
    { label: "Iniciar", next: "preparing", icon: ChefHat,   style: "bg-orange-500/20 text-orange-300 border-orange-500/40 hover:bg-orange-500/40" },
    { label: "Cancelar", next: "cancelled", icon: X,         style: "bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/40" },
  ],
  preparing: [
    { label: "Concluir", next: "delivered", icon: CheckCheck, style: "bg-green-500/20 text-green-300 border-green-500/40 hover:bg-green-500/40" },
    { label: "Cancelar", next: "cancelled", icon: X,          style: "bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/40" },
  ],
};

/* ─── API ────────────────────────────────────────────────────────────────── */
async function patchStatus(orderId, status) {
  const res = await fetch(`${BACKEND_URL}/api/orders/${orderId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/* ─── Timer ──────────────────────────────────────────────────────────────── */
function OrderTimer({ createdAt }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(createdAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [createdAt]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const late = elapsed > 900; // >15min vira vermelho

  return (
    <span className={`font-mono text-xs tabular-nums ${late ? "text-red-400 animate-pulse font-bold" : "text-muted-foreground"}`}>
      ⏱ {mm}:{ss}
    </span>
  );
}

/* ─── OrderCard ──────────────────────────────────────────────────────────── */
function OrderCard({ order, onOpenComanda, onStatusChange, onAcknowledge }) {
  const [loadingAction, setLoadingAction] = useState(null);
  const cardStyle = STATUS_CARD[order.status] ?? "border-l-4 border-l-gray-500 border-gray-500/20";
  const actions = ACTION_BUTTONS[order.status] ?? [];

  async function handleAction(e, nextStatus) {
    e.stopPropagation();
    if (loadingAction) return;
    setLoadingAction(nextStatus);
    try {
      await patchStatus(order.id, nextStatus);
      onStatusChange(order.id, nextStatus);
      onAcknowledge(order.id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div
      className={`rounded-xl bg-card border ${cardStyle} transition-all duration-300
                  animate-in fade-in-0 slide-in-from-top-3`}
    >
      {/* Header */}
      <div className="px-3 pt-3 pb-1 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-black text-muted-foreground tracking-widest">
            #{order.order_number || "—"}
          </p>
          <p className="text-sm font-bold leading-tight">
            {order.customer_name || order.customer_phone}
          </p>
        </div>
        {order.created_at && <OrderTimer createdAt={order.created_at} />}
      </div>

      {/* Items */}
      {order.items?.length > 0 && (
        <>
          <Separator className="mx-3 my-1" />
          <div className="px-3 py-1.5 space-y-0.5">
            {order.items.map((item, i) => {
              const lineTotal = item.sale_type === "kg" && item.weight_kg
                ? item.unit_price * item.weight_kg
                : item.unit_price * item.quantity;
              const qtyLabel = item.sale_type === "kg" && item.weight_kg
                ? `${item.weight_kg}kg`
                : `${item.quantity}×`;
              return (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-foreground/80">
                    <span className="font-bold text-foreground">{qtyLabel}</span> {item.name}
                    {item.sale_type === "kg" && (
                      <span className="ml-1 text-blue-400 font-semibold">KG</span>
                    )}
                    {item.notes && <span className="ml-1 opacity-50">({item.notes})</span>}
                  </span>
                  {item.unit_price > 0 && (
                    <span className="ml-2 shrink-0 text-foreground/70">
                      R$ {lineTotal.toFixed(2)}
                    </span>
                  )}
                </div>
              );
            })}
            {order.total > 0 && (
              <div className="flex justify-between pt-1 mt-1 border-t border-border text-xs font-bold">
                <span>Total</span>
                <span>R$ {order.total.toFixed(2)}</span>
              </div>
            )}
          </div>
        </>
      )}

      {order.address && (
        <p className="px-3 pb-1 text-xs text-muted-foreground">📍 {order.address}</p>
      )}

      {/* Actions */}
      <Separator className="mx-3 mt-1" />
      <div className="flex flex-wrap gap-1.5 px-3 py-2">
        <button
          onClick={() => { onAcknowledge(order.id); onOpenComanda(order); }}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold
                     bg-zinc-700/40 text-zinc-300 border border-zinc-600/50
                     hover:bg-zinc-600/60 transition-all active:scale-95"
        >
          <Receipt size={11} /> Comanda
        </button>

        {actions.map(({ label, next, icon: Icon, style }) => (
          <button
            key={next}
            onClick={(e) => handleAction(e, next)}
            disabled={!!loadingAction}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold
                        border transition-all active:scale-95
                        disabled:opacity-40 disabled:cursor-not-allowed ${style}`}
          >
            {loadingAction === next
              ? <Loader2 size={11} className="animate-spin" />
              : <Icon size={11} />}
            {loadingAction === next ? "…" : label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── KanbanColumn ───────────────────────────────────────────────────────── */
function KanbanColumn({ col, orders, flash, onOpenComanda, onStatusChange, onAcknowledge }) {
  return (
    <div className={`flex flex-col rounded-xl bg-card/30 border border-border ${col.border} ${col.glow} min-w-[260px] w-[260px] max-h-full`}>
      {/* Column header */}
      <div className={`flex items-center justify-between px-4 py-3 rounded-t-xl border-b border-border ${col.header}
                       ${flash ? "animate-pulse ring-2 ring-yellow-400/60" : ""} transition-all`}>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${col.dot}`} />
          <span className="text-xs font-black tracking-widest">{col.label}</span>
        </div>
        <span className="text-xs font-bold bg-black/30 px-2 py-0.5 rounded-full">
          {orders.length}
        </span>
      </div>

      {/* Cards */}
      <ScrollArea className="flex-1 p-3">
        {orders.length === 0 ? (
          <p className="text-xs text-muted-foreground/40 text-center py-8">vazio</p>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onOpenComanda={onOpenComanda}
                onStatusChange={onStatusChange}
                onAcknowledge={onAcknowledge}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

/* ─── OrdersPanel (Kanban) ───────────────────────────────────────────────── */
function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  const toggle = useCallback(() => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  }, []);
  return { isFullscreen, toggle };
}

export default function OrdersPanel() {
  const { orders, connected, updateStatus, newOrderFlash, acknowledgeOrder } = useSocket();
  const [selected, setSelected] = useState(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

  function handleStatusChange(orderId, nextStatus) {
    updateStatus(orderId, nextStatus);
    setSelected((prev) =>
      prev?.id === orderId ? { ...prev, status: nextStatus } : prev
    );
  }

  // Called by ComandaModal when user clicks "Confirmar e Imprimir"
  async function handleConfirmOrder(orderId) {
    await patchStatus(orderId, "confirmed");
    handleStatusChange(orderId, "confirmed");
    acknowledgeOrder(orderId);
  }

  const total = orders.length;

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card/50 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-black tracking-wide">PAINEL DE PEDIDOS</h1>
          <span className="text-xs text-muted-foreground">{total} {total === 1 ? "pedido" : "pedidos"}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewOrder(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-300
                       border border-green-500/40 hover:bg-green-500/30 transition-all text-xs font-bold"
          >
            <Plus size={13} /> Novo Pedido
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-card/80 transition-all"
            title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border">
            <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            <span className="text-xs font-medium">{connected ? "Ao vivo" : "Desconectado"}</span>
          </div>
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-4 h-full">
          {COLUMNS.map((col) => {
            const colOrders = orders
              .filter((o) => col.statuses.includes(o.status))
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            return (
              <KanbanColumn
                key={col.id}
                col={col}
                orders={colOrders}
                flash={col.id === "pending" && newOrderFlash}
                onOpenComanda={setSelected}
                onStatusChange={handleStatusChange}
                onAcknowledge={acknowledgeOrder}
              />
            );
          })}
        </div>
      </div>

      {/* Comanda modal */}
      {selected && (
        <ComandaModal
          order={selected}
          onClose={() => setSelected(null)}
          onConfirmAndPrint={handleConfirmOrder}
        />
      )}

      {/* New order modal */}
      {showNewOrder && (
        <NewOrderModal
          onClose={() => setShowNewOrder(false)}
          onCreated={() => setShowNewOrder(false)}
        />
      )}
    </div>
  );
}
