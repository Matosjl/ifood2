import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MenuItemForm } from "@/components/MenuItemForm";
import { DigitalMenu } from "@/components/DigitalMenu";

const STATUS_OPTIONS = ["TODOS", "PENDENTE", "ACEITO", "EM PREPARO", "ENTREGUE", "CANCELADO"];
const STATUS_COLORS = {
  PENDENTE: "#FFB800",
  ACEITO: "#00BFFF",
  "EM PREPARO": "#FF8C00",
  ENTREGUE: "#00E559",
  CANCELADO: "#FF4444",
};

const PAYMENT_ICONS = { PIX: "◈", DINHEIRO: "₿", CARTÃO: "▣", "VALE REFEIÇÃO": "◉" };

const MOCK_ORDERS = [
  { id: "#1042", client: "João S.", items: ["X-Burguer", "Coca-Cola"], total: 89.7, status: "ENTREGUE", type: "ENTREGA", payment: "PIX", time: "14:32" },
  { id: "#1043", client: "Maria L.", items: ["Pizza Margherita"], total: 54.8, status: "EM PREPARO", type: "ENTREGA", payment: "CARTÃO", time: "14:45" },
  { id: "#1044", client: "Carlos M.", items: ["X-Bacon Duplo"], total: 28.9, status: "PENDENTE", type: "RETIRADA", payment: "DINHEIRO", time: "14:50" },
  { id: "#1045", client: "Ana P.", items: ["Suco de Laranja", "Pizza Margherita"], total: 59.8, status: "ACEITO", type: "ENTREGA", payment: "PIX", time: "14:55" },
  { id: "#1046", client: "Pedro R.", items: ["X-Burguer Especial"], total: 28.9, status: "CANCELADO", type: "RETIRADA", payment: "CARTÃO", time: "15:00" },
];

const TABS = [
  { id: "pedidos", label: "PEDIDOS" },
  { id: "add-item", label: "ADICIONAR ITEM" },
  { id: "cardapio", label: "CARDÁPIO DIGITAL" },
];

// ── View: Cards ──────────────────────────────────────────────────────────────
const CardView = ({ orders }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
    {orders.map((o) => (
      <div key={o.id} className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-2 hover:border-[#3F3F46] transition-colors">
        <div className="flex justify-between items-center">
          <span className="font-mono text-xs text-[#71717A]">{o.id}</span>
          <span className="font-mono text-xs px-2 py-0.5 border" style={{ color: STATUS_COLORS[o.status] || "#71717A", borderColor: STATUS_COLORS[o.status] || "#27272A" }}>{o.status}</span>
        </div>
        <span className="font-mono text-sm text-[#EDEDED]">{o.client}</span>
        <div className="font-mono text-xs text-[#71717A]">{o.items.join(", ")}</div>
        <div className="flex justify-between items-center mt-1">
          <span className="font-mono text-xs text-[#A1A1AA]">{PAYMENT_ICONS[o.payment]} {o.payment}</span>
          <span className="font-mono text-xs px-2 py-0.5 bg-[#1A1A1A] text-[#A1A1AA]">{o.type}</span>
        </div>
        <div className="flex justify-between items-center border-t border-[#27272A] pt-2 mt-1">
          <span className="font-mono text-xs text-[#71717A]">{o.time}</span>
          <span className="font-mono text-sm text-[#00E559]">R$ {o.total.toFixed(2).replace(".", ",")}</span>
        </div>
      </div>
    ))}
  </div>
);

// ── View: Lista ───────────────────────────────────────────────────────────────
const ListView = ({ orders }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[600px]">
      <thead>
        <tr className="border-b border-[#27272A]">
          {["#", "CLIENTE", "ITENS", "PAGAMENTO", "TIPO", "TOTAL", "STATUS"].map((h) => (
            <th key={h} className="px-4 py-2 text-left font-mono text-xs text-[#71717A]">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id} className="border-b border-[#27272A] hover:bg-[#111]">
            <td className="px-4 py-3 font-mono text-xs text-[#71717A]">{o.id}</td>
            <td className="px-4 py-3 font-mono text-sm text-[#EDEDED]">{o.client}</td>
            <td className="px-4 py-3 font-mono text-xs text-[#71717A]">{o.items.join(", ")}</td>
            <td className="px-4 py-3 font-mono text-xs text-[#A1A1AA]">{PAYMENT_ICONS[o.payment]} {o.payment}</td>
            <td className="px-4 py-3 font-mono text-xs text-[#A1A1AA]">{o.type}</td>
            <td className="px-4 py-3 font-mono text-sm text-[#00E559]">R$ {o.total.toFixed(2).replace(".", ",")}</td>
            <td className="px-4 py-3 font-mono text-xs" style={{ color: STATUS_COLORS[o.status] || "#71717A" }}>{o.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ── View: Kanban ──────────────────────────────────────────────────────────────
const KanbanView = ({ orders }) => {
  const cols = STATUS_OPTIONS.filter((s) => s !== "TODOS");
  return (
    <div className="flex gap-3 p-4 overflow-x-auto min-h-[300px]">
      {cols.map((col) => {
        const colOrders = orders.filter((o) => o.status === col);
        return (
          <div key={col} className="min-w-[200px] flex flex-col gap-2">
            <div className="font-mono text-xs px-2 py-1 border-b" style={{ color: STATUS_COLORS[col], borderColor: STATUS_COLORS[col] }}>
              {col} <span className="text-[#71717A]">({colOrders.length})</span>
            </div>
            {colOrders.map((o) => (
              <div key={o.id} className="bg-[#0A0A0A] border border-[#27272A] p-3 flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="font-mono text-xs text-[#71717A]">{o.id}</span>
                  <span className="font-mono text-xs text-[#A1A1AA]">{o.time}</span>
                </div>
                <span className="font-mono text-sm text-[#EDEDED]">{o.client}</span>
                <span className="font-mono text-xs text-[#71717A]">{o.items[0]}{o.items.length > 1 ? ` +${o.items.length - 1}` : ""}</span>
                <div className="flex justify-between items-center mt-1">
                  <span className="font-mono text-xs text-[#A1A1AA]">{o.type}</span>
                  <span className="font-mono text-xs text-[#00E559]">R$ {o.total.toFixed(2).replace(".", ",")}</span>
                </div>
              </div>
            ))}
            {colOrders.length === 0 && <div className="font-mono text-xs text-[#3F3F46] text-center py-4">vazio</div>}
          </div>
        );
      })}
    </div>
  );
};

// ── View: Compacto ────────────────────────────────────────────────────────────
const CompactView = ({ orders }) => (
  <div className="flex flex-col divide-y divide-[#27272A]">
    {orders.map((o) => (
      <div key={o.id} className="flex items-center gap-3 px-4 py-2 hover:bg-[#111]">
        <span className="font-mono text-xs text-[#71717A] w-14">{o.id}</span>
        <span className="font-mono text-sm text-[#EDEDED] flex-1 truncate">{o.client}</span>
        <span className="font-mono text-xs text-[#A1A1AA] hidden sm:block">{PAYMENT_ICONS[o.payment]} {o.payment}</span>
        <span className="font-mono text-xs text-[#A1A1AA] hidden sm:block">{o.type}</span>
        <span className="font-mono text-xs text-[#00E559] w-20 text-right">R$ {o.total.toFixed(2).replace(".", ",")}</span>
        <span className="font-mono text-xs w-20 text-right" style={{ color: STATUS_COLORS[o.status] || "#71717A" }}>{o.status}</span>
      </div>
    ))}
  </div>
);

// ── Pedidos Tab ───────────────────────────────────────────────────────────────
const PedidosTab = () => {
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [typeFilter, setTypeFilter] = useState("TODOS");
  const [viewMode, setViewMode] = useState("cards");

  const filtered = MOCK_ORDERS.filter(
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

  return (
    <div className="flex flex-col gap-0">
      {/* Filters bar */}
      <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-[#27272A] bg-[#0A0A0A]">
        {/* Status filter */}
        <div className="flex flex-wrap gap-1">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="font-mono text-xs px-2 py-1 border transition-colors"
              style={{
                borderColor: statusFilter === s ? (STATUS_COLORS[s] || "#00E559") : "#27272A",
                color: statusFilter === s ? (STATUS_COLORS[s] || "#00E559") : "#71717A",
                background: statusFilter === s ? "rgba(0,0,0,0.4)" : "transparent",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="w-px bg-[#27272A] hidden sm:block" />

        {/* Delivery type filter */}
        <div className="flex gap-1">
          {["TODOS", "ENTREGA", "RETIRADA"].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className="font-mono text-xs px-2 py-1 border transition-colors"
              style={{
                borderColor: typeFilter === t ? "#00BFFF" : "#27272A",
                color: typeFilter === t ? "#00BFFF" : "#71717A",
              }}
            >
              {t === "ENTREGA" ? "🛵 " : t === "RETIRADA" ? "🏪 " : ""}{t}
            </button>
          ))}
        </div>

        {/* View mode */}
        <div className="flex gap-1 ml-auto">
          {views.map((v) => (
            <button
              key={v.id}
              onClick={() => setViewMode(v.id)}
              className="font-mono text-xs px-2 py-1 border transition-colors"
              style={{
                borderColor: viewMode === v.id ? "#00E559" : "#27272A",
                color: viewMode === v.id ? "#00E559" : "#71717A",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div className="px-4 py-2 font-mono text-xs text-[#71717A] border-b border-[#27272A]">
        {filtered.length} pedido{filtered.length !== 1 ? "s" : ""}
        {statusFilter !== "TODOS" && ` · ${statusFilter}`}
        {typeFilter !== "TODOS" && ` · ${typeFilter}`}
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 font-mono text-xs text-[#3F3F46]">NENHUM PEDIDO ENCONTRADO</div>
      ) : (
        <>
          {viewMode === "cards" && <CardView orders={filtered} />}
          {viewMode === "lista" && <ListView orders={filtered} />}
          {viewMode === "kanban" && <KanbanView orders={filtered} />}
          {viewMode === "compacto" && <CompactView orders={filtered} />}
        </>
      )}
    </div>
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
  const [activeTab, setActiveTab] = useState("pedidos");
  const [menuItems, setMenuItems] = useState([]);

  const restaurantName = `Restaurante ${id || ""}`;
  const handleAddItem = (item) => setMenuItems((prev) => [item, ...prev]);

  return (
    <div className="min-h-screen w-full bg-black text-[#EDEDED] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-[#27272A]">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="font-mono text-xs text-[#71717A] hover:text-[#EDEDED] transition-colors">
            ← VOLTAR
          </button>
          <span className="font-mono text-sm text-[#00E559]">{restaurantName.toUpperCase()}</span>
        </div>
        <span className="font-mono text-xs text-[#71717A] hidden sm:block">PAINEL DO RESTAURANTE</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#27272A] overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2 font-mono text-xs border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "border-[#00E559] text-[#00E559]"
                : "border-transparent text-[#71717A] hover:text-[#A1A1AA]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "pedidos" && <PedidosTab />}
        {activeTab === "add-item" && <MenuItemForm onAdd={handleAddItem} />}
        {activeTab === "cardapio" && <DigitalMenu items={menuItems} restaurantName={restaurantName} />}
      </div>

      <Footer />
    </div>
  );
}
