/**
 * NocturnePainel.jsx
 * Painel operacional do restaurante com design nocturne-ops (glassmorphism dark-blue)
 * Porta a interface completa de nocturne-ops usando dados reais do ZapFome.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import {
  ReceiptText, PlusCircle, Package, Wallet, Users, MessageCircle,
  Settings, Search, ShoppingBag, TrendingUp, Clock, TrendingDown,
  LogOut, QrCode, RefreshCw, Power, CheckCircle, AlertTriangle,
  XCircle, Filter, Edit2, Star, Utensils, User, Bell, ChevronRight,
  ArrowUpRight, Wifi, WifiOff, Loader2, Phone, Send,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { CRM } from "@/components/CRM";
import { NovoPedido } from "@/components/NovoPedido";
import { Cardapio } from "@/components/Cardapio";
import { useAuth } from "@/context/AuthContext";

// ── Config ─────────────────────────────────────────────────────────────────────
const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

// ── Nocturne design tokens ─────────────────────────────────────────────────────
const N = {
  surface:          "#051424",
  surfaceLow:       "#0d1c2d",
  surfaceContainer: "#122131",
  surfaceHigh:      "#1c2b3c",
  surfaceHighest:   "#273647",
  onSurface:        "#d4e4fa",
  onSurfaceVar:     "#94a3b8",
  primary:          "#c0c1ff",
  primaryDim:       "#8083ff",
  secondary:        "#4edea3",
  tertiary:         "#ffb783",
  error:            "#ffb4ab",
};

const glass = {
  background: "rgba(30,41,59,0.7)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(51,65,85,0.5)",
  borderTop: "1px solid rgba(148,163,184,0.2)",
  borderLeft: "1px solid rgba(148,163,184,0.2)",
};

// ── Normalisation helpers ──────────────────────────────────────────────────────
const STATUS_API_TO_UI = {
  pendente: "PENDENTE", confirmado: "ACEITO", em_preparo: "EM PREPARO",
  pronto: "PRONTO", em_entrega: "SAIU PARA ENTREGA",
  entregue: "FINALIZADO", cancelado: "CANCELADO",
};
const STATUS_UI_TO_API = {
  ACEITO: "confirmado", "EM PREPARO": "em_preparo", PRONTO: "pronto",
  "SAIU PARA ENTREGA": "em_entrega", FINALIZADO: "entregue", CANCELADO: "cancelado",
};

const normalizeOrder = (o) => ({
  id: o.id || String(Math.random()),
  client: o.clienteNome || "-",
  items: Array.isArray(o.itens) ? o.itens.map((i) => `${i.qtd}x ${i.nome || i.name}`) : [],
  total: Number(o.total || 0),
  status: STATUS_API_TO_UI[o.status] || "PENDENTE",
  type: { retirada: "RETIRADA", entrega: "ENTREGA", comer_aqui: "MESA" }[o.tipo] || "RETIRADA",
  payment: (o.pagamento || "").toUpperCase(),
  time: new Date(o.criadoEm || Date.now()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  telefone: o.clienteTelefone || "",
  mesa: o.mesa || null,
  rawStatus: o.status,
});

const fmtR = (n) => `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
const isToday = (dateStr) => {
  const d = new Date(dateStr);
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
};

// ── Reusable tiny components ───────────────────────────────────────────────────
const GlassCard = ({ children, style = {}, className = "" }) => (
  <div style={{ ...glass, borderRadius: 14, ...style }} className={className}>
    {children}
  </div>
);

const StatsCard = ({ label, value, icon: Icon, trend, trendUp, color = N.primary }) => (
  <GlassCard style={{ padding: 20, display: "flex", alignItems: "center", gap: 16, boxShadow: `0 0 40px -10px ${color}22` }}>
    <div style={{ width: 52, height: 52, borderRadius: 12, background: `${color}1a`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon size={22} style={{ color }} />
    </div>
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: N.onSurfaceVar, textTransform: "uppercase", letterSpacing: 1 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 800, color: N.onSurface, lineHeight: 1.2 }}>{value}</p>
      {trend && (
        <p style={{ fontSize: 11, fontWeight: 700, color: trendUp ? N.secondary : N.error, display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
          {trendUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {trend}
        </p>
      )}
    </div>
  </GlassCard>
);

const StatusBadge = ({ status }) => {
  const cfg = {
    PENDENTE:          { bg: `${N.tertiary}22`, color: N.tertiary,   label: "Pendente" },
    ACEITO:            { bg: `${N.primary}22`,  color: N.primary,    label: "Aceito" },
    "EM PREPARO":      { bg: `${N.primary}22`,  color: N.primary,    label: "Em Preparo" },
    PRONTO:            { bg: `${N.secondary}22`,color: N.secondary,  label: "Pronto" },
    "SAIU PARA ENTREGA":{ bg: `${N.primary}22`, color: N.primary,    label: "Em Entrega" },
    FINALIZADO:        { bg: `${N.secondary}22`,color: N.secondary,  label: "Finalizado" },
    CANCELADO:         { bg: `${N.error}22`,    color: N.error,      label: "Cancelado" },
  }[status] || { bg: "#33333344", color: "#999", label: status };

  return (
    <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}44`, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, padding: "3px 8px", borderRadius: 6 }}>
      {cfg.label}
    </span>
  );
};

// ── PAGE: Pedidos ──────────────────────────────────────────────────────────────
function PedidosPage({ id }) {
  const { authAxios } = useAuth();
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("TODOS");
  const [updating, setUpdating] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await authAxios.get(`${API}/pedidos?restaurante_id=${id}&limit=150`);
      setOrders((data.pedidos || []).map(normalizeOrder));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const todayOrders = orders.filter((o) => true); // all loaded already sorted by date desc
  const active = orders.filter((o) => !["FINALIZADO", "CANCELADO"].includes(o.status));
  const todayRevenue = orders.reduce((s, o) => o.status !== "CANCELADO" ? s + o.total : s, 0);

  const FILTERS = ["TODOS", "PENDENTE", "EM PREPARO", "PRONTO", "SAIU PARA ENTREGA", "FINALIZADO"];
  const visible = filter === "TODOS" ? orders : orders.filter((o) => o.status === filter);

  const nextStatus = {
    PENDENTE: "ACEITO", ACEITO: "EM PREPARO", "EM PREPARO": "PRONTO",
    PRONTO: "SAIU PARA ENTREGA", "SAIU PARA ENTREGA": "FINALIZADO",
  };
  const nextLabel = {
    PENDENTE: "Aceitar", ACEITO: "Iniciar Preparo", "EM PREPARO": "Marcar Pronto",
    PRONTO: "Enviar para Entrega", "SAIU PARA ENTREGA": "Confirmar Entrega",
  };
  const borderColor = {
    PENDENTE: N.tertiary, ACEITO: N.primary, "EM PREPARO": N.primary,
    PRONTO: N.secondary, "SAIU PARA ENTREGA": N.primary,
    FINALIZADO: "#64748b", CANCELADO: N.error,
  };

  const advanceStatus = async (order) => {
    const next = nextStatus[order.status];
    if (!next) return;
    setUpdating(order.id);
    try {
      await authAxios.patch(`${API}/pedidos/${order.id}/status`, { status: STATUS_UI_TO_API[next] });
      setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status: next } : o));
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div style={{ padding: 32 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 32 }}>
        <StatsCard label="Pedidos Ativos" value={active.length} icon={ShoppingBag} trend={`${orders.length} total`} trendUp color={N.primary} />
        <StatsCard label="Receita (carregados)" value={fmtR(todayRevenue)} icon={TrendingUp} trend="+resultado" trendUp color={N.secondary} />
        <StatsCard label="Pendentes" value={orders.filter(o => o.status === "PENDENTE").length} icon={Clock} color={N.tertiary} />
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: N.onSurface }}>
          Pedidos Ativos
          <span style={{ marginLeft: 10, background: N.primary, color: "#1000a9", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>{active.length}</span>
        </h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: filter === f ? N.primary : N.surfaceHigh,
                color: filter === f ? "#1000a9" : N.onSurfaceVar,
                border: filter === f ? "none" : `1px solid rgba(51,65,85,0.5)`,
                transition: "all 0.15s",
              }}
            >
              {f}
            </button>
          ))}
          <button
            onClick={load}
            style={{ padding: "6px 12px", borderRadius: 8, background: N.surfaceHigh, border: `1px solid rgba(51,65,85,0.5)`, cursor: "pointer", color: N.onSurfaceVar, display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
          >
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: N.onSurfaceVar }}>
          <Loader2 size={32} style={{ margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
          <p>Carregando pedidos...</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
          {visible.map((order, idx) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              style={{
                ...glass, borderRadius: 14, padding: 20,
                borderLeft: `4px solid ${borderColor[order.status] || "#64748b"}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: N.primary }}>#{order.id.slice(-6).toUpperCase()}</span>
                  <p style={{ fontSize: 15, fontWeight: 700, color: N.onSurface, marginTop: 2 }}>{order.client}</p>
                </div>
                <StatusBadge status={order.status} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: N.onSurfaceVar }}>
                  <Clock size={13} />
                  <span>{order.time} · {order.type}{order.mesa ? ` · Mesa ${order.mesa}` : ""}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: N.onSurfaceVar }}>
                  <ReceiptText size={13} />
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {order.items.slice(0, 2).join(", ")}{order.items.length > 2 ? `… +${order.items.length - 2}` : ""}
                  </span>
                </div>
                <div style={{ fontWeight: 700, color: N.secondary, fontSize: 15 }}>{fmtR(order.total)}</div>
              </div>

              {nextStatus[order.status] && (
                <button
                  onClick={() => advanceStatus(order)}
                  disabled={updating === order.id}
                  style={{
                    width: "100%", padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer",
                    background: N.primary, color: "#1000a9", fontWeight: 700, fontSize: 12, letterSpacing: 0.5,
                    opacity: updating === order.id ? 0.6 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {updating === order.id ? "Aguarde..." : nextLabel[order.status]}
                </button>
              )}
            </motion.div>
          ))}

          {visible.length === 0 && (
            <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 60, color: N.onSurfaceVar }}>
              <ShoppingBag size={40} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
              <p>Nenhum pedido encontrado.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── PAGE: Estoque ──────────────────────────────────────────────────────────────
function EstoquePage({ id }) {
  const { authAxios } = useAuth();
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    authAxios.get(`${API}/estoque/${id}`)
      .then((r) => setItens(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const baixo = itens.filter((i) => Number(i.quantidade) <= 5);
  const total = itens.length;
  const valorTotal = itens.reduce((s, i) => s + Number(i.precoVenda || 0) * Number(i.quantidade || 0), 0);

  const visible = itens.filter((i) =>
    !search || (i.nome || "").toLowerCase().includes(search.toLowerCase()) ||
    (i.categoria || "").toLowerCase().includes(search.toLowerCase())
  );

  const statusOf = (item) => {
    const q = Number(item.quantidade || 0);
    if (q <= 0) return "critical";
    if (q <= 5) return "warning";
    return "ok";
  };

  const statusCfg = {
    critical: { label: "Crítico", color: N.error, bg: `${N.error}22` },
    warning:  { label: "Alerta",  color: N.tertiary, bg: `${N.tertiary}22` },
    ok:       { label: "OK",      color: N.secondary, bg: `${N.secondary}22` },
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: N.primary }}>Controle de Estoque</h2>
          <p style={{ color: N.onSurfaceVar, fontSize: 13, marginTop: 4 }}>Monitoramento em tempo real de suprimentos e insumos</p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        <StatsCard label="Total de Itens" value={total} icon={Package} color={N.primary} />
        <StatsCard label="Estoque Baixo" value={baixo.length} icon={AlertTriangle} trend={baixo.length > 0 ? "Ação necessária" : "Tudo OK"} trendUp={baixo.length === 0} color={N.error} />
        <StatsCard label="Valor em Estoque" value={fmtR(valorTotal)} icon={Wallet} color={N.tertiary} />
        <StatsCard label="Categorias" value={[...new Set(itens.map((i) => i.categoria))].length} icon={Star} color={N.secondary} />
      </div>

      {/* Search + table */}
      <GlassCard style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: `1px solid rgba(51,65,85,0.4)`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: N.onSurfaceVar }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar item..."
              style={{ width: "100%", background: N.surfaceHigh, border: `1px solid rgba(51,65,85,0.5)`, borderRadius: 8, padding: "7px 10px 7px 30px", color: N.onSurface, fontSize: 12, outline: "none" }}
            />
          </div>
          <span style={{ fontSize: 12, color: N.onSurfaceVar }}>{visible.length} itens</span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: N.onSurfaceVar }}>
            <Loader2 size={24} style={{ margin: "0 auto 8px", animation: "spin 1s linear infinite" }} />
            Carregando...
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "rgba(5,20,36,0.6)", borderBottom: `1px solid rgba(51,65,85,0.4)` }}>
                  {["Item", "Categoria", "Status", "Qtd / Nível", "Preço Venda", "Custo"].map((h) => (
                    <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: 10, fontWeight: 700, color: N.onSurfaceVar, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((item, idx) => {
                  const st = statusOf(item);
                  const cfg = statusCfg[st];
                  const maxQ = Math.max(Number(item.quantidade || 0), 20);
                  const pct = Math.min(100, (Number(item.quantidade || 0) / maxQ) * 100);
                  return (
                    <motion.tr
                      key={item._id || item.id || idx}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      style={{ borderBottom: `1px solid rgba(51,65,85,0.25)`, transition: "background 0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(30,41,59,0.4)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "14px 20px", fontWeight: 700, color: N.onSurface }}>{item.nome}</td>
                      <td style={{ padding: "14px 20px", color: N.onSurfaceVar }}>{item.categoria}</td>
                      <td style={{ padding: "14px 20px" }}>
                        <span style={{ background: cfg.bg, color: cfg.color, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, padding: "3px 8px", borderRadius: 6 }}>
                          {cfg.label}
                        </span>
                      </td>
                      <td style={{ padding: "14px 20px", minWidth: 160 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 12, color: N.onSurfaceVar }}>{item.quantidade} {item.porKg ? "kg" : "un"}</span>
                          <div style={{ height: 5, background: N.surfaceHighest, borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: cfg.color, borderRadius: 3, boxShadow: st === "critical" ? `0 0 6px ${N.error}` : "none", transition: "width 0.8s ease" }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "14px 20px", fontFamily: "monospace", color: N.onSurface, fontWeight: 700 }}>{fmtR(item.precoVenda)}</td>
                      <td style={{ padding: "14px 20px", fontFamily: "monospace", color: N.onSurfaceVar }}>{fmtR(item.precoCusto)}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
            {visible.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: N.onSurfaceVar }}>
                <Package size={32} style={{ margin: "0 auto 8px", opacity: 0.3 }} />
                <p>Nenhum item encontrado.</p>
              </div>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ── PAGE: Financeiro ───────────────────────────────────────────────────────────
function FinanceiroPage({ id }) {
  const { authAxios } = useAuth();
  const [lancamentos, setLancamentos] = useState([]);
  const [caixa, setCaixa] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      authAxios.get(`${API}/financeiro/lancamentos/${id}`).then((r) => r.data),
      authAxios.get(`${API}/financeiro/caixa/${id}/hoje`).then((r) => r.data).catch(() => null),
    ]).then(([lanc, cx]) => {
      setLancamentos(lanc.lancamentos || lanc || []);
      setCaixa(cx);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  // Aggregate revenue chart from lancamentos (group by day)
  const chartMap = {};
  lancamentos.forEach((l) => {
    const d = new Date(l.criadoEm || l.data || Date.now());
    const key = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    if (!chartMap[key]) chartMap[key] = { name: key, receita: 0, despesas: 0 };
    const v = Number(l.valor || l.total || 0);
    if (v >= 0) chartMap[key].receita += v;
    else chartMap[key].despesas += Math.abs(v);
  });
  const chartData = Object.values(chartMap).slice(-10);

  const totalReceita = lancamentos.filter((l) => Number(l.valor || l.total || 0) >= 0).reduce((s, l) => s + Number(l.valor || l.total || 0), 0);
  const totalDespesas = lancamentos.filter((l) => Number(l.valor || l.total || 0) < 0).reduce((s, l) => s + Math.abs(Number(l.valor || l.total || 0)), 0);
  const lucro = totalReceita - totalDespesas;

  const statusCfg = {
    finalizado: { label: "Concluído", bg: `${N.secondary}22`, color: N.secondary },
    pendente:   { label: "Pendente",  bg: `${N.tertiary}22`, color: N.tertiary },
    cancelado:  { label: "Cancelado", bg: `${N.error}22`,    color: N.error },
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: N.onSurface }}>Visão Financeira</h2>
          <p style={{ color: N.onSurfaceVar, fontSize: 13, marginTop: 4 }}>Desempenho operacional em tempo real</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {caixa && (
            <div style={{ ...glass, borderRadius: 10, padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ color: N.secondary, fontSize: 16 }}>●</span>
              <span style={{ color: N.onSurfaceVar }}>Caixa:</span>
              <span style={{ fontWeight: 700, color: N.secondary }}>Aberto</span>
              <span style={{ color: N.onSurfaceVar }}>Fundo: {fmtR(caixa.fundo)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Finance Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 28 }}>
        <StatsCard label="Receita Total" value={fmtR(totalReceita)} icon={TrendingUp} trend="Total carregado" trendUp color={N.primary} />
        <StatsCard label="Despesas" value={fmtR(totalDespesas)} icon={TrendingDown} color={N.error} />
        <StatsCard label="Lucro Líquido" value={fmtR(lucro)} icon={Wallet} trend={lucro >= 0 ? "Positivo" : "Negativo"} trendUp={lucro >= 0} color={N.secondary} />
      </div>

      {/* Chart + Distribution */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 28 }}>
        <GlassCard style={{ padding: 28, display: "flex", flexDirection: "column", height: 340 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: N.onSurface }}>Fluxo de Caixa</h3>
              <p style={{ color: N.onSurfaceVar, fontSize: 12 }}>Receita vs Despesas por dia</p>
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              {[{ color: N.primaryDim, label: "Receita" }, { color: N.tertiary, label: "Despesas" }].map(({ color, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
                  <span style={{ color: N.onSurfaceVar }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="nRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={N.primaryDim} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={N.primaryDim} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="nExpGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={N.tertiary} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={N.tertiary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(30,41,59,1)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10 }} dy={8} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: `1px solid rgba(51,65,85,0.8)`, borderRadius: 8 }}
                    itemStyle={{ color: N.onSurface }}
                    formatter={(v) => fmtR(v)}
                  />
                  <Area type="monotone" dataKey="receita" stroke={N.primaryDim} strokeWidth={2.5} fill="url(#nRevGrad)" />
                  <Area type="monotone" dataKey="despesas" stroke={N.tertiary} strokeWidth={2} strokeDasharray="4 4" fill="url(#nExpGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: N.onSurfaceVar, flexDirection: "column", gap: 8 }}>
                <Wallet size={28} style={{ opacity: 0.3 }} />
                <span>Sem dados de fluxo ainda</span>
              </div>
            )}
          </div>
        </GlassCard>

        <GlassCard style={{ padding: 28, display: "flex", flexDirection: "column" }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: N.onSurface, marginBottom: 20 }}>Resumo</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { label: "Receita bruta", value: fmtR(totalReceita), color: N.primary },
              { label: "Despesas",      value: fmtR(totalDespesas), color: N.error },
              { label: "Lucro líquido", value: fmtR(lucro),         color: lucro >= 0 ? N.secondary : N.error },
              { label: "Transações",    value: lancamentos.length,   color: N.tertiary },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: N.onSurfaceVar, fontSize: 13 }}>{label}</span>
                <span style={{ color, fontWeight: 700, fontFamily: "monospace", fontSize: 13 }}>{value}</span>
              </div>
            ))}
          </div>
          {caixa && (
            <div style={{ marginTop: "auto", paddingTop: 16, borderTop: `1px solid rgba(51,65,85,0.4)` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: N.onSurfaceVar }}>Fundo de caixa</span>
                <span style={{ color: N.onSurface, fontWeight: 700 }}>{fmtR(caixa.fundo)}</span>
              </div>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Transactions table */}
      <GlassCard style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: `1px solid rgba(51,65,85,0.4)`, display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(5,20,36,0.4)" }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: N.onSurface }}>Histórico de Lançamentos</h3>
          <span style={{ fontSize: 12, color: N.onSurfaceVar }}>{lancamentos.length} registros</span>
        </div>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: N.onSurfaceVar }}>
            <Loader2 size={24} style={{ margin: "0 auto 8px", animation: "spin 1s linear infinite" }} />
            Carregando...
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "rgba(5,20,36,0.6)", borderBottom: `1px solid rgba(51,65,85,0.4)` }}>
                  {["Descrição", "Tipo", "Data", "Valor", "Status"].map((h) => (
                    <th key={h} style={{ padding: "12px 24px", textAlign: h === "Valor" ? "right" : "left", fontSize: 10, fontWeight: 700, color: N.onSurfaceVar, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lancamentos.slice(0, 30).map((l, idx) => {
                  const v = Number(l.valor || l.total || 0);
                  const st = statusCfg[l.status] || statusCfg.finalizado;
                  return (
                    <tr
                      key={idx}
                      style={{ borderBottom: `1px solid rgba(51,65,85,0.2)`, transition: "background 0.15s", cursor: "default" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(30,41,59,0.35)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "14px 24px", fontWeight: 600, color: N.onSurface }}>{l.descricao || l.tipo || "Venda"}</td>
                      <td style={{ padding: "14px 24px", color: N.onSurfaceVar, fontSize: 12 }}>{l.categoria || l.tipo || "-"}</td>
                      <td style={{ padding: "14px 24px", color: N.onSurfaceVar, fontSize: 12 }}>
                        {new Date(l.criadoEm || l.data || Date.now()).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ padding: "14px 24px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: v < 0 ? N.error : N.onSurface }}>
                        {v < 0 ? "-" : ""}{fmtR(Math.abs(v))}
                      </td>
                      <td style={{ padding: "14px 24px" }}>
                        <span style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, padding: "3px 8px", borderRadius: 6 }}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {lancamentos.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: N.onSurfaceVar }}>
                <Wallet size={32} style={{ margin: "0 auto 8px", opacity: 0.3 }} />
                <p>Nenhum lançamento encontrado.</p>
              </div>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ── PAGE: WhatsApp ─────────────────────────────────────────────────────────────
function WhatsAppPage({ id }) {
  const { authAxios } = useAuth();
  const [status, setStatus] = useState(null); // null = loading
  const [qr, setQr] = useState(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [msg, setMsg] = useState("");
  const pollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await authAxios.get(`${API}/whatsapp/status`);
      setStatus(data);
    } catch (e) {
      if (e?.response?.status === 503) setStatus({ state: "not_configured" });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 12000);
    return () => clearInterval(pollRef.current);
  }, [fetchStatus]);

  const loadQR = async () => {
    setLoadingQr(true);
    try {
      const { data } = await authAxios.get(`${API}/whatsapp/qr`);
      setQr(data.qrcode || data.base64 || null);
    } catch (e) {
      setQr(null);
    } finally {
      setLoadingQr(false);
    }
  };

  const setupInstance = async () => {
    setLoadingSetup(true);
    try {
      await authAxios.post(`${API}/whatsapp/setup`, { restaurante_id: id });
      await fetchStatus();
      setMsg("Instância criada! Escaneie o QR code.");
      await loadQR();
    } catch (e) {
      setMsg("Erro ao criar instância: " + (e?.response?.data?.detail || e.message));
    } finally {
      setLoadingSetup(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Desconectar o WhatsApp desta instância?")) return;
    try {
      await authAxios.post(`${API}/whatsapp/disconnect`);
      await fetchStatus();
      setQr(null);
      setMsg("Desconectado com sucesso.");
    } catch (e) {
      setMsg("Erro ao desconectar: " + (e?.response?.data?.detail || e.message));
    }
  };

  const stateInfo = {
    open:          { icon: CheckCircle, color: N.secondary, label: "Conectado",       desc: "WhatsApp Business ativo e recebendo mensagens." },
    connecting:    { icon: Loader2,     color: N.tertiary,  label: "Conectando...",   desc: "Aguardando scan do QR code." },
    close:         { icon: WifiOff,     color: N.error,     label: "Desconectado",    desc: "A instância existe mas não está conectada. Escaneie o QR." },
    not_configured:{ icon: AlertTriangle,color: N.onSurfaceVar,label:"Não Configurado", desc: "Configure as variáveis EVOLUTION_API_URL, EVOLUTION_API_KEY no .env para ativar o WhatsApp." },
  };

  const si = stateInfo[status?.state] || stateInfo["connecting"];
  const StateIcon = si.icon;

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: N.onSurface, display: "flex", alignItems: "center", gap: 10 }}>
          <MessageCircle size={24} style={{ color: N.primary }} /> WhatsApp Business
        </h2>
        <p style={{ color: N.onSurfaceVar, fontSize: 13, marginTop: 4 }}>
          Automatize notificações e atendimento via Evolution API
        </p>
      </div>

      {/* Status Card */}
      <GlassCard style={{ padding: 28, marginBottom: 24, display: "flex", alignItems: "center", gap: 20, boxShadow: `0 0 40px -10px ${si.color}22` }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: `${si.color}1a`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <StateIcon size={28} style={{ color: si.color, animation: status?.state === "connecting" ? "spin 1.5s linear infinite" : "none" }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: N.onSurfaceVar, textTransform: "uppercase", letterSpacing: 1 }}>Status da Conexão</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: si.color }}>{si.label}</p>
          <p style={{ fontSize: 13, color: N.onSurfaceVar, marginTop: 4 }}>{si.desc}</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <button
            onClick={fetchStatus}
            style={{ padding: "8px 16px", borderRadius: 10, background: N.surfaceHigh, border: `1px solid rgba(51,65,85,0.5)`, cursor: "pointer", color: N.onSurfaceVar, display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}
          >
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>
      </GlassCard>

      {msg && (
        <div style={{ marginBottom: 20, padding: "12px 16px", background: `${N.primary}15`, border: `1px solid ${N.primary}44`, borderRadius: 10, color: N.primary, fontSize: 13 }}>
          {msg}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* QR Code panel */}
        <GlassCard style={{ padding: 28 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: N.onSurface, marginBottom: 6 }}>
            <QrCode size={16} style={{ display: "inline", marginRight: 8, verticalAlign: "middle" }} />
            Conectar via QR Code
          </h3>
          <p style={{ color: N.onSurfaceVar, fontSize: 12, marginBottom: 20 }}>
            Abra o WhatsApp no celular → Dispositivos Vinculados → Vincular dispositivo → Escanear QR
          </p>

          {status?.state === "not_configured" ? (
            <div style={{ textAlign: "center", padding: 32, color: N.onSurfaceVar }}>
              <AlertTriangle size={40} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
              <p style={{ fontSize: 13 }}>Evolution API não configurada.<br />Veja as instruções ao lado.</p>
            </div>
          ) : qr ? (
            <div style={{ textAlign: "center" }}>
              <img
                src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                alt="QR Code WhatsApp"
                style={{ width: 220, height: 220, borderRadius: 12, margin: "0 auto 16px", display: "block", border: `4px solid ${N.surfaceHighest}` }}
              />
              <p style={{ fontSize: 11, color: N.onSurfaceVar }}>QR expira em ~60s. Atualize se necessário.</p>
              <button
                onClick={loadQR}
                disabled={loadingQr}
                style={{ marginTop: 12, padding: "8px 20px", borderRadius: 10, background: N.surfaceHigh, border: `1px solid rgba(51,65,85,0.5)`, cursor: "pointer", color: N.onSurfaceVar, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, margin: "12px auto 0" }}
              >
                <RefreshCw size={12} /> {loadingQr ? "Carregando..." : "Novo QR"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {status?.state === "open" ? (
                <div style={{ textAlign: "center", padding: 32 }}>
                  <CheckCircle size={48} style={{ margin: "0 auto 12px", color: N.secondary }} />
                  <p style={{ color: N.secondary, fontWeight: 700, fontSize: 15 }}>WhatsApp Conectado!</p>
                  <p style={{ color: N.onSurfaceVar, fontSize: 12, marginTop: 6 }}>Número: {status?.phone || "ativo"}</p>
                </div>
              ) : (
                <>
                  <button
                    onClick={loadQR}
                    disabled={loadingQr}
                    style={{ padding: "12px 20px", borderRadius: 10, background: `${N.primary}22`, border: `1px solid ${N.primary}44`, cursor: "pointer", color: N.primary, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    <QrCode size={16} /> {loadingQr ? "Carregando QR..." : "Ver QR Code"}
                  </button>
                  {(status?.state === "close" || !status?.state) && (
                    <button
                      onClick={setupInstance}
                      disabled={loadingSetup}
                      style={{ padding: "12px 20px", borderRadius: 10, background: N.primary, border: "none", cursor: "pointer", color: "#1000a9", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >
                      <Power size={16} /> {loadingSetup ? "Criando instância..." : "Criar / Reconectar Instância"}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {status?.state === "open" && (
            <button
              onClick={disconnect}
              style={{ marginTop: 16, width: "100%", padding: "10px 0", borderRadius: 10, background: `${N.error}15`, border: `1px solid ${N.error}33`, cursor: "pointer", color: N.error, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <Power size={14} /> Desconectar
            </button>
          )}
        </GlassCard>

        {/* Config guide */}
        <GlassCard style={{ padding: 28 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: N.onSurface, marginBottom: 16 }}>
            <Settings size={15} style={{ display: "inline", marginRight: 8, verticalAlign: "middle" }} />
            Configuração
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { n: "1", label: "No arquivo backend/.env, adicione:", code: `EVOLUTION_API_URL="http://evolution:8080"\nEVOLUTION_API_KEY="sua-chave-aqui"\nEVOLUTION_INSTANCE="zapfome"\nAPP_URL="https://seudominio.com"` },
              { n: "2", label: "Suba o serviço Evolution:", code: "docker-compose -f docker-compose.prod.yml up -d evolution" },
              { n: "3", label: "Reinicie a API:", code: "docker-compose -f docker-compose.prod.yml restart api" },
            ].map(({ n, label, code }) => (
              <div key={n}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: `${N.primary}22`, color: N.primary, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>
                  <span style={{ color: N.onSurfaceVar, fontSize: 12 }}>{label}</span>
                </div>
                <pre style={{ background: N.surfaceLow, border: `1px solid rgba(51,65,85,0.4)`, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: N.secondary, fontFamily: "monospace", overflowX: "auto", margin: 0 }}>
                  {code}
                </pre>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20, padding: "12px 14px", background: `${N.secondary}0d`, border: `1px solid ${N.secondary}33`, borderRadius: 8 }}>
            <p style={{ color: N.secondary, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>✅ Funcionalidades ativas:</p>
            <ul style={{ color: N.onSurfaceVar, fontSize: 11, paddingLeft: 16, margin: 0, lineHeight: 1.8 }}>
              <li>Notificações automáticas por status do pedido</li>
              <li>Atendimento inteligente via IA (LangGraph)</li>
              <li>Webhook em <code style={{ color: N.primary }}>/api/webhook/whatsapp/{"{restaurante_id}"}</code></li>
              <li>Histórico de conversa por telefone</li>
            </ul>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

// ── ROOT COMPONENT ─────────────────────────────────────────────────────────────
export function NocturnePainel() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { authAxios, logout } = useAuth();
  const [activePage, setActivePage] = useState("pedidos");
  const [restaurante, setRestaurante] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!authAxios) return;
    authAxios.get(`${API}/restaurantes/${id}`)
      .then((r) => setRestaurante(r.data))
      .catch(console.error);
  }, [id, authAxios]);

  const NAV = [
    { id: "pedidos",      icon: ReceiptText,   label: "Pedidos" },
    { id: "novo-pedido",  icon: PlusCircle,     label: "Novo Pedido" },
    { id: "cardapio",     icon: Utensils,       label: "Cardápio" },
    { id: "estoque",      icon: Package,        label: "Estoque" },
    { id: "financeiro",   icon: Wallet,         label: "Financeiro" },
    { id: "crm",          icon: Users,          label: "CRM" },
    { id: "whatsapp",     icon: MessageCircle,  label: "WhatsApp" },
  ];

  return (
    <div style={{ background: N.surface, minHeight: "100vh", color: N.onSurface, fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── HEADER ── */}
      <header style={{
        background: "rgba(5,20,36,0.85)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(51,65,85,0.5)",
        padding: "0 24px",
        height: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 50,
        flexShrink: 0,
      }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${N.primary}, ${N.primaryDim})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Utensils size={14} style={{ color: "#1000a9" }} />
          </div>
          <span style={{ fontWeight: 800, fontSize: 15, color: N.primary, letterSpacing: 0.5 }}>ZapFome</span>
          <span style={{ color: N.onSurfaceVar, fontSize: 18, opacity: 0.4 }}>|</span>
          <span style={{ color: N.onSurface, fontSize: 13, fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {restaurante?.nome || "..."}
          </span>
        </div>

        {/* Search */}
        <div style={{ flex: 1, maxWidth: 340, margin: "0 28px", position: "relative" }}>
          <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: N.onSurfaceVar }} />
          <input
            placeholder="Buscar pedido, cliente..."
            style={{ width: "100%", background: N.surfaceHigh, border: "1px solid rgba(51,65,85,0.6)", borderRadius: 10, padding: "7px 12px 7px 32px", color: N.onSurface, fontSize: 12, outline: "none", boxSizing: "border-box" }}
          />
        </div>

        {/* Right */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            title="Ir para painel clássico"
            onClick={() => navigate(`/restaurante/${id}`)}
            style={{ width: 34, height: 34, borderRadius: 8, background: N.surfaceHigh, border: "1px solid rgba(51,65,85,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: N.onSurfaceVar }}
          >
            <Settings size={15} />
          </button>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${N.primary}, ${N.primaryDim})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <User size={14} style={{ color: "#1000a9" }} />
          </div>
        </div>
      </header>

      {/* ── BODY ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── SIDEBAR ── */}
        <nav style={{
          width: sidebarCollapsed ? 60 : 210,
          background: N.surfaceLow,
          borderRight: "1px solid rgba(51,65,85,0.4)",
          display: "flex",
          flexDirection: "column",
          padding: "20px 0",
          flexShrink: 0,
          transition: "width 0.2s ease",
          overflowX: "hidden",
        }}>
          <div style={{ flex: 1, padding: sidebarCollapsed ? "0 8px" : "0 10px", display: "flex", flexDirection: "column", gap: 3 }}>
            {NAV.map(({ id: navId, icon: Icon, label }) => {
              const isActive = activePage === navId;
              return (
                <button
                  key={navId}
                  onClick={() => setActivePage(navId)}
                  title={sidebarCollapsed ? label : ""}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: sidebarCollapsed ? 0 : 11,
                    padding: sidebarCollapsed ? "10px" : "10px 12px",
                    borderRadius: 10,
                    border: "none",
                    cursor: "pointer",
                    width: "100%",
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? N.primary : N.onSurfaceVar,
                    background: isActive ? `rgba(192,193,255,0.08)` : "transparent",
                    borderLeft: isActive ? `3px solid ${N.primary}` : "3px solid transparent",
                    transition: "all 0.15s ease",
                    justifyContent: sidebarCollapsed ? "center" : "flex-start",
                    textAlign: "left",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                  }}
                >
                  <Icon size={17} style={{ flexShrink: 0 }} />
                  {!sidebarCollapsed && <span>{label}</span>}
                </button>
              );
            })}
          </div>

          {/* Bottom: logout + collapse */}
          <div style={{ padding: sidebarCollapsed ? "0 8px" : "0 10px", borderTop: "1px solid rgba(51,65,85,0.3)", paddingTop: 14, marginTop: 14, display: "flex", flexDirection: "column", gap: 3 }}>
            <button
              onClick={() => { logout(); navigate("/login"); }}
              title={sidebarCollapsed ? "Sair" : ""}
              style={{ display: "flex", alignItems: "center", gap: sidebarCollapsed ? 0 : 11, padding: sidebarCollapsed ? "10px" : "10px 12px", borderRadius: 10, border: "none", cursor: "pointer", width: "100%", fontSize: 13, fontWeight: 500, color: "#ffb4ab", background: "transparent", justifyContent: sidebarCollapsed ? "center" : "flex-start", whiteSpace: "nowrap" }}
            >
              <LogOut size={16} style={{ flexShrink: 0 }} />
              {!sidebarCollapsed && <span>Sair</span>}
            </button>
            <button
              onClick={() => setSidebarCollapsed((p) => !p)}
              style={{ display: "flex", alignItems: "center", gap: sidebarCollapsed ? 0 : 11, padding: sidebarCollapsed ? "10px" : "10px 12px", borderRadius: 10, border: "none", cursor: "pointer", width: "100%", fontSize: 13, color: N.onSurfaceVar, background: "transparent", justifyContent: sidebarCollapsed ? "center" : "flex-start" }}
            >
              <ChevronRight size={16} style={{ flexShrink: 0, transform: sidebarCollapsed ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.2s" }} />
              {!sidebarCollapsed && <span style={{ fontSize: 11 }}>Recolher</span>}
            </button>
          </div>
        </nav>

        {/* ── PAGE CONTENT ── */}
        <main style={{ flex: 1, overflowY: "auto", background: N.surface }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              style={{ minHeight: "100%" }}
            >
              {activePage === "pedidos"     && <PedidosPage id={id} />}
              {activePage === "novo-pedido" && (
                <div style={{ height: "100%", overflow: "hidden" }}>
                  <NovoPedido restauranteId={id} />
                </div>
              )}
              {activePage === "cardapio"    && (
                <div style={{ padding: 0, overflow: "auto" }}>
                  <Cardapio restauranteId={id} />
                </div>
              )}
              {activePage === "estoque"     && <EstoquePage id={id} />}
              {activePage === "financeiro"  && <FinanceiroPage id={id} />}
              {activePage === "crm"         && (
                <div style={{ overflowY: "auto" }}>
                  <CRM restauranteId={id} />
                </div>
              )}
              {activePage === "whatsapp"    && <WhatsAppPage id={id} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Spin keyframe (injected once) */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
