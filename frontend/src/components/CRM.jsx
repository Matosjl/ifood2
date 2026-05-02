/**
 * CRM.jsx — Gestão de Clientes + Funil de Vendas
 * ─────────────────────────────────────────────────
 * • 4 métricas no topo (clientes, faturado, ticket médio, VIPs)
 * • Funil visual: Novo → Recorrente → Fiel → VIP
 * • Tabela de clientes com busca, ordenação e badge de estágio
 * • Botão WhatsApp (abre chat diretamente se tiver telefone)
 */
import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const API  = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;
const OWNER = process.env.REACT_APP_OWNER_API_TOKEN || "";
const auth  = axios.create({ headers: { "X-Owner-Token": OWNER } });

const fmtR  = (n) => `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
const fmtDt = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return "—"; }
};
const diasAtras = (iso) => {
  if (!iso) return null;
  const diff = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (diff === 0) return "hoje";
  if (diff === 1) return "ontem";
  return `${diff}d atrás`;
};

// ── Funil config ──────────────────────────────────────────────────────────────
const STAGES = [
  {
    id: "novo",
    label: "Novo",
    desc: "1 pedido",
    color: "#60a5fa",      // blue-400
    bg: "rgba(96,165,250,0.10)",
    border: "rgba(96,165,250,0.30)",
    icon: "🌱",
  },
  {
    id: "recorrente",
    label: "Recorrente",
    desc: "2–4 pedidos",
    color: "#fbbf24",      // amber-400
    bg: "rgba(251,191,36,0.10)",
    border: "rgba(251,191,36,0.30)",
    icon: "🔄",
  },
  {
    id: "fiel",
    label: "Fiel",
    desc: "5–9 pedidos",
    color: "#f97316",      // orange-500
    bg: "rgba(249,115,22,0.10)",
    border: "rgba(249,115,22,0.30)",
    icon: "❤️",
  },
  {
    id: "vip",
    label: "VIP",
    desc: "10+ pedidos",
    color: "#22c55e",      // green-500
    bg: "rgba(34,197,94,0.10)",
    border: "rgba(34,197,94,0.30)",
    icon: "👑",
  },
];

const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.id, s]));

// ── Metric Card ───────────────────────────────────────────────────────────────
const MetricCard = ({ icon, label, value, sub, color = "#00e559" }) => (
  <div className="flex flex-col gap-1.5 p-4 rounded-2xl bg-white/3 border border-white/8 min-w-0">
    <div className="flex items-center gap-2">
      <span className="text-xl">{icon}</span>
      <span className="text-[11px] text-zinc-500 uppercase tracking-widest">{label}</span>
    </div>
    <p className="text-2xl font-bold leading-none" style={{ color }}>{value}</p>
    {sub && <p className="text-[11px] text-zinc-600">{sub}</p>}
  </div>
);

// ── Funnel Bar ────────────────────────────────────────────────────────────────
const FunnelBar = ({ funil, total }) => (
  <div className="flex flex-col gap-3 p-4 rounded-2xl bg-white/3 border border-white/8">
    <span className="text-[11px] text-zinc-500 uppercase tracking-widest">Funil de clientes</span>
    <div className="flex flex-col gap-2">
      {STAGES.map((stage, idx) => {
        const count  = funil?.[stage.id] || 0;
        const pct    = total > 0 ? Math.round((count / total) * 100) : 0;
        // funil gets narrower as we go deeper
        const widths = ["100%", "80%", "60%", "45%"];
        return (
          <div key={stage.id} className="flex items-center gap-3">
            {/* funil visual */}
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2 transition-all"
              style={{
                width: widths[idx],
                background: stage.bg,
                border: `1px solid ${stage.border}`,
              }}
            >
              <span className="text-sm">{stage.icon}</span>
              <span className="text-xs font-semibold flex-1" style={{ color: stage.color }}>
                {stage.label}
              </span>
              <span className="font-mono text-xs" style={{ color: stage.color }}>
                {count}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="font-mono text-[11px] text-zinc-600">{pct}%</span>
              <span className="text-[10px] text-zinc-700">{stage.desc}</span>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

// ── Stage Badge ───────────────────────────────────────────────────────────────
const StageBadge = ({ stage }) => {
  const s = STAGE_MAP[stage] || STAGE_MAP["novo"];
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {s.icon} {s.label}
    </span>
  );
};

// ── Main CRM ──────────────────────────────────────────────────────────────────
export function CRM({ restauranteId }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca]     = useState("");
  const [stageFilter, setStageFilter] = useState("todos");
  const [sortBy, setSortBy]   = useState("total_gasto"); // total_gasto | total_pedidos | ultimo_pedido
  const [sortDir, setSortDir] = useState(-1);            // -1 desc, 1 asc

  const carregar = useCallback(async () => {
    if (!restauranteId) return;
    setLoading(true);
    try {
      const { data: d } = await auth.get(`${API}/crm/${restauranteId}`);
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [restauranteId]);

  useEffect(() => { carregar(); }, [carregar]);

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir(d => d * -1);
    else { setSortBy(field); setSortDir(-1); }
  };

  const clientes = (data?.clientes || [])
    .filter(c => {
      if (stageFilter !== "todos" && c.stage !== stageFilter) return false;
      if (!busca.trim()) return true;
      const q = busca.toLowerCase();
      return (
        c.nome.toLowerCase().includes(q) ||
        (c.telefone || "").includes(q)
      );
    })
    .sort((a, b) => {
      const va = a[sortBy] ?? 0;
      const vb = b[sortBy] ?? 0;
      if (typeof va === "string") return sortDir * va.localeCompare(vb);
      return sortDir * (vb - va);
    });

  const total = data?.clientes?.length || 0;

  // ── Loading ──
  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        <p className="text-zinc-600 text-sm">Carregando CRM…</p>
      </div>
    </div>
  );

  if (!data) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <p className="text-3xl mb-3">📊</p>
        <p className="text-zinc-500 text-sm">Nenhum dado de clientes ainda.</p>
        <p className="text-zinc-700 text-xs mt-1">Os dados aparecerão conforme os pedidos chegarem.</p>
      </div>
    </div>
  );

  const { resumo, funil } = data;

  return (
    <div className="flex flex-col gap-5 p-4 pb-10 max-w-5xl mx-auto">

      {/* ── Cabeçalho ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-white">CRM — Clientes</h2>
          <p className="text-xs text-zinc-500">Funil de vendas e gestão de relacionamento</p>
        </div>
        <button
          onClick={carregar}
          className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:border-emerald-500/40 hover:text-emerald-400 transition-colors"
        >
          ↻ Atualizar
        </button>
      </div>

      {/* ── Métricas ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          icon="👤"
          label="Clientes"
          value={resumo.total_clientes}
          sub={`+${resumo.novos_hoje || 0} hoje`}
          color="#60a5fa"
        />
        <MetricCard
          icon="💰"
          label="Faturado (CRM)"
          value={fmtR(resumo.total_faturado)}
          sub="todos os pedidos"
          color="#22c55e"
        />
        <MetricCard
          icon="🧾"
          label="Ticket Médio"
          value={fmtR(resumo.ticket_medio_geral)}
          sub="por cliente"
          color="#fbbf24"
        />
        <MetricCard
          icon="👑"
          label="VIPs"
          value={resumo.vips}
          sub="10+ pedidos"
          color="#f97316"
        />
      </div>

      {/* ── Funil ── */}
      <FunnelBar funil={funil} total={total} />

      {/* ── Filtros ── */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Busca */}
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm">🔍</span>
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone…"
            className="w-full bg-white/5 border border-white/10 rounded-xl text-white text-sm pl-9 pr-4 py-2 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
          />
        </div>

        {/* Stage filter pills */}
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setStageFilter("todos")}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
              stageFilter === "todos"
                ? "bg-white/10 border-white/30 text-white"
                : "border-white/10 text-zinc-500 hover:border-white/20"
            }`}
          >
            Todos
          </button>
          {STAGES.map(s => (
            <button
              key={s.id}
              onClick={() => setStageFilter(stageFilter === s.id ? "todos" : s.id)}
              className="text-xs px-3 py-1.5 rounded-full border transition-all"
              style={{
                background: stageFilter === s.id ? s.bg : "transparent",
                borderColor: stageFilter === s.id ? s.border : "rgba(255,255,255,0.08)",
                color: stageFilter === s.id ? s.color : "#71717a",
              }}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-zinc-600 ml-auto">{clientes.length} cliente{clientes.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── Tabela ── */}
      <div className="rounded-2xl border border-white/8 overflow-hidden">
        {/* Header */}
        <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-0 bg-white/3 border-b border-white/8">
          {[
            { label: "Cliente",       field: null },
            { label: "Pedidos",       field: "total_pedidos" },
            { label: "Gasto Total",   field: "total_gasto" },
            { label: "Ticket Médio",  field: "ticket_medio" },
            { label: "Último Pedido", field: "ultimo_pedido" },
            { label: "",              field: null },
          ].map((col, i) => (
            <button
              key={i}
              onClick={col.field ? () => toggleSort(col.field) : undefined}
              className={`px-4 py-3 text-left font-mono text-[10px] text-zinc-500 uppercase tracking-widest transition-colors ${
                col.field ? "hover:text-zinc-300 cursor-pointer" : "cursor-default"
              } ${sortBy === col.field ? "text-emerald-400" : ""}`}
            >
              {col.label}
              {sortBy === col.field && (
                <span className="ml-1 opacity-70">{sortDir === -1 ? "↓" : "↑"}</span>
              )}
            </button>
          ))}
        </div>

        {/* Rows */}
        <div className="flex flex-col divide-y divide-white/5">
          {clientes.length === 0 ? (
            <div className="text-center py-14 text-zinc-600 text-sm">
              Nenhum cliente encontrado.
            </div>
          ) : clientes.map((c, i) => (
            <div
              key={`${c.nome}-${c.telefone}-${i}`}
              className="grid sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] grid-cols-1 gap-0 hover:bg-white/3 transition-colors"
            >
              {/* Nome + badge */}
              <div className="px-4 py-3 flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: STAGE_MAP[c.stage]?.bg, color: STAGE_MAP[c.stage]?.color }}
                >
                  {(c.nome || "?")[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate leading-tight">{c.nome}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {c.telefone && (
                      <span className="text-[10px] text-zinc-600">{c.telefone}</span>
                    )}
                    <StageBadge stage={c.stage} />
                  </div>
                </div>
              </div>

              {/* Pedidos */}
              <div className="px-4 py-3 flex sm:flex-col items-center sm:items-start gap-1 sm:gap-0">
                <span className="sm:hidden text-[10px] text-zinc-600 w-28 shrink-0">Pedidos:</span>
                <div>
                  <p className="text-sm font-bold text-white">{c.total_pedidos}</p>
                  {c.pedidos_cancelados > 0 && (
                    <p className="text-[10px] text-red-400">{c.pedidos_cancelados} cancelado{c.pedidos_cancelados > 1 ? "s" : ""}</p>
                  )}
                </div>
              </div>

              {/* Gasto Total */}
              <div className="px-4 py-3 flex sm:flex-col items-center sm:items-start gap-1 sm:gap-0">
                <span className="sm:hidden text-[10px] text-zinc-600 w-28 shrink-0">Total gasto:</span>
                <p className="text-sm font-semibold text-emerald-400">{fmtR(c.total_gasto)}</p>
              </div>

              {/* Ticket Médio */}
              <div className="px-4 py-3 flex sm:flex-col items-center sm:items-start gap-1 sm:gap-0">
                <span className="sm:hidden text-[10px] text-zinc-600 w-28 shrink-0">Ticket médio:</span>
                <p className="text-sm text-zinc-300">{fmtR(c.ticket_medio)}</p>
              </div>

              {/* Último Pedido */}
              <div className="px-4 py-3 flex sm:flex-col items-center sm:items-start gap-1 sm:gap-0">
                <span className="sm:hidden text-[10px] text-zinc-600 w-28 shrink-0">Último pedido:</span>
                <p className="text-sm text-zinc-400">{fmtDt(c.ultimo_pedido)}</p>
                <p className="text-[10px] text-zinc-600">{diasAtras(c.ultimo_pedido)}</p>
              </div>

              {/* Ações */}
              <div className="px-4 py-3 flex items-center justify-end sm:justify-center">
                {c.telefone ? (
                  <a
                    href={`https://wa.me/55${c.telefone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir WhatsApp"
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-sm"
                  >
                    💬
                  </a>
                ) : (
                  <div className="w-8 h-8" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Dica ── */}
      <div className="rounded-2xl border border-blue-500/15 bg-blue-500/5 px-4 py-3 flex items-start gap-3">
        <span className="text-xl shrink-0">💡</span>
        <div>
          <p className="text-sm font-semibold text-blue-300">Como usar o CRM</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Clientes <strong className="text-amber-400">Recorrentes</strong> e <strong className="text-orange-400">Fiéis</strong> são
            os mais receptivos a promoções. Mande ofertas pelo WhatsApp para quem não comprou nos últimos 7 dias.
            Clientes <strong className="text-green-400">VIP</strong> merecem um programa de fidelidade exclusivo!
          </p>
        </div>
      </div>
    </div>
  );
}
