import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;
const LM_STUDIO_URL = "http://127.0.0.1:1234";
const LM_MODEL      = "deepseek-r1-distill-qwen-1.5b";

const fmt  = (v) => `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;
const fmtN = (v) => Number(v || 0).toFixed(2).replace(".", ",");

// Paleta de cores para gráficos
const CHART_COLORS = ["#00E559", "#007AFF", "#FFB000", "#A855F7", "#FF4444", "#00BFFF", "#FF8C00"];

// Tooltip customizado no estilo dark
const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0A0A0A] border border-[#27272A] px-3 py-2 shadow-xl">
      {label && <p className="font-mono text-[9px] text-[#71717A] mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="font-mono text-xs font-bold" style={{ color: p.color || "#00E559" }}>
          {p.name ? `${p.name}: ` : ""}{typeof p.value === "number" ? fmt(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

// ── Indicador de sincronização em tempo real ──────────────────────────────────
const SyncIndicator = ({ lastSync, syncing }) => {
  const [ago, setAgo] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setAgo(Math.floor((Date.now() - lastSync) / 1000)), 1000);
    return () => clearInterval(t);
  }, [lastSync]);

  return (
    <div className="flex items-center gap-2">
      <span className={`w-1.5 h-1.5 rounded-full ${syncing ? "bg-[#FFB000] animate-ping" : "bg-[#00E559] animate-pulse"}`} />
      <span className="font-mono text-[9px] text-[#3F3F46]">
        {syncing ? "SINCRONIZANDO..." : `SINCRONIZADO HÁ ${ago}s`}
      </span>
    </div>
  );
};

// ── Abertura de Caixa ─────────────────────────────────────────────────────────
const AberturaCaixa = ({ onAbrir }) => {
  const [fundo, setFundo] = useState("");
  return (
    <div className="flex flex-col gap-3 max-w-sm">
      <span className="font-mono text-xs text-[#71717A] tracking-widest">ABRIR CAIXA</span>
      <div className="flex flex-col gap-1">
        <label className="font-mono text-[10px] text-[#71717A]">VALOR DO FUNDO (R$)</label>
        <input
          type="number" step="0.01" min="0" value={fundo}
          onChange={(e) => setFundo(e.target.value)}
          placeholder="0,00"
          className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559] w-full"
        />
      </div>
      <button
        onClick={() => { if (fundo !== "") onAbrir(parseFloat(fundo) || 0); }}
        disabled={fundo === ""}
        className="bg-[#00E559] text-black font-mono text-xs font-bold py-2 px-6 hover:bg-[#00c44d] transition-colors disabled:opacity-40"
      >
        ✓ CONFIRMAR ABERTURA
      </button>
    </div>
  );
};

// ── Fechamento de Caixa ───────────────────────────────────────────────────────
const FechamentoCaixa = ({ caixa, vendas, onFechar }) => {
  const [dinheiro, setDinheiro] = useState("");
  const [pix, setPix]           = useState("");
  const [cartao, setCartao]     = useState("");

  const totalInformado = (parseFloat(dinheiro) || 0) + (parseFloat(pix) || 0) + (parseFloat(cartao) || 0);
  const totalVendido   = vendas.reduce((s, v) => s + (Number(v.total) || 0), 0);
  const liquido        = totalVendido - (caixa?.fundo || 0);
  const diff           = totalInformado - totalVendido;

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <span className="font-mono text-xs text-[#71717A] tracking-widest">FECHAR CAIXA</span>

      <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-2">
        <span className="font-mono text-[10px] text-[#71717A] mb-1">VALORES RECEBIDOS</span>
        {[
          { label: "💵 DINHEIRO", val: dinheiro, set: setDinheiro },
          { label: "◈ PIX",       val: pix,      set: setPix      },
          { label: "💳 CARTÃO",   val: cartao,   set: setCartao   },
        ].map(({ label, val, set }) => (
          <div key={label} className="flex items-center gap-3">
            <label className="font-mono text-xs text-[#A1A1AA] w-28">{label}</label>
            <input
              type="number" step="0.01" min="0" value={val}
              onChange={(e) => set(e.target.value)}
              placeholder="0,00"
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1.5 focus:outline-none focus:border-[#00E559] w-32"
            />
          </div>
        ))}
      </div>

      <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-2">
        {[
          { label: "FUNDO DE CAIXA",         val: fmt(caixa.fundo),       color: "#71717A" },
          { label: "TOTAL INFORMADO",         val: fmt(totalInformado),    color: "#EDEDED" },
          { label: "TOTAL VENDIDO (SISTEMA)", val: fmt(totalVendido),      color: "#00E559" },
          { label: "LÍQUIDO (- FUNDO)",       val: fmt(liquido),           color: "#FFB800" },
        ].map(({ label, val, color }) => (
          <div key={label} className="flex justify-between">
            <span className="font-mono text-xs text-[#71717A]">{label}</span>
            <span className="font-mono text-xs font-bold" style={{ color }}>{val}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-[#27272A] pt-2">
          <span className="font-mono text-xs text-[#71717A]">DIFERENÇA</span>
          <span className={`font-mono text-xs font-bold ${Math.abs(diff) < 0.01 ? "text-[#00E559]" : "text-[#FF4444]"}`}>
            {diff >= 0 ? "+" : ""}{fmtN(diff)}
          </span>
        </div>
      </div>

      <button
        onClick={() => onFechar({ dinheiro: parseFloat(dinheiro) || 0, pix: parseFloat(pix) || 0, cartao: parseFloat(cartao) || 0, totalInformado, totalVendido, liquido })}
        className="bg-[#FF4444] text-white font-mono text-xs font-bold py-2 px-6 hover:bg-red-600 transition-colors"
      >
        ✓ FECHAR CAIXA
      </button>
    </div>
  );
};

// ── Tabela de Vendas ──────────────────────────────────────────────────────────
const TabelaVendas = ({ vendas }) => {
  const resumo = {};
  vendas.forEach((venda) => {
    venda.itens?.forEach((item) => {
      const key = item.name || item.nome || "?";
      if (!resumo[key]) resumo[key] = { nome: key, qtd: 0, dinheiro: 0, pix: 0, cartao: 0, outros: 0, total: 0, custo: 0 };
      resumo[key].qtd   += item.qtd || 1;
      resumo[key].total += (item.salePrice || item.precoUnitario || 0) * (item.qtd || 1);
      resumo[key].custo += (item.costPrice || item.precoCusto || 0) * (item.qtd || 1);
      const pg  = (venda.pagamento || "").toUpperCase();
      const val = (item.salePrice || item.precoUnitario || 0) * (item.qtd || 1);
      if (pg.includes("DINHEIRO"))   resumo[key].dinheiro += val;
      else if (pg.includes("PIX"))   resumo[key].pix      += val;
      else if (pg.includes("CART"))  resumo[key].cartao   += val;
      else                           resumo[key].outros   += val;
    });
  });

  const rows = Object.values(resumo);
  if (!rows.length) return (
    <div className="font-mono text-xs text-[#3F3F46] py-10 text-center">NENHUMA VENDA REGISTRADA HOJE</div>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px]">
        <thead>
          <tr className="border-b border-[#27272A]">
            {["PRODUTO", "QTD", "DINHEIRO", "PIX", "CARTÃO", "OUTROS", "CUSTO", "TOTAL"].map((h) => (
              <th key={h} className="px-3 py-2 text-left font-mono text-[9px] text-[#3F3F46] tracking-widest">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.nome} className="border-b border-[#27272A] hover:bg-[#111]">
              <td className="px-3 py-2 font-mono text-xs text-[#EDEDED]">{r.nome}</td>
              <td className="px-3 py-2 font-mono text-xs text-[#A1A1AA]">{r.qtd}</td>
              <td className="px-3 py-2 font-mono text-xs text-[#71717A]">{r.dinheiro > 0 ? fmt(r.dinheiro) : "—"}</td>
              <td className="px-3 py-2 font-mono text-xs text-[#71717A]">{r.pix      > 0 ? fmt(r.pix)      : "—"}</td>
              <td className="px-3 py-2 font-mono text-xs text-[#71717A]">{r.cartao   > 0 ? fmt(r.cartao)   : "—"}</td>
              <td className="px-3 py-2 font-mono text-xs text-[#71717A]">{r.outros   > 0 ? fmt(r.outros)   : "—"}</td>
              <td className="px-3 py-2 font-mono text-xs text-[#FF4444]">{fmt(r.custo)}</td>
              <td className="px-3 py-2 font-mono text-xs text-[#00E559] font-bold">{fmt(r.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#27272A] bg-[#0A0A0A]">
            <td className="px-3 py-2 font-mono text-[10px] text-[#71717A] font-bold">TOTAL</td>
            <td className="px-3 py-2 font-mono text-xs text-[#A1A1AA] font-bold">{rows.reduce((s, r) => s + r.qtd, 0)}</td>
            <td className="px-3 py-2 font-mono text-xs text-[#71717A] font-bold">{fmt(rows.reduce((s, r) => s + r.dinheiro, 0))}</td>
            <td className="px-3 py-2 font-mono text-xs text-[#71717A] font-bold">{fmt(rows.reduce((s, r) => s + r.pix, 0))}</td>
            <td className="px-3 py-2 font-mono text-xs text-[#71717A] font-bold">{fmt(rows.reduce((s, r) => s + r.cartao, 0))}</td>
            <td className="px-3 py-2 font-mono text-xs text-[#71717A] font-bold">{fmt(rows.reduce((s, r) => s + r.outros, 0))}</td>
            <td className="px-3 py-2 font-mono text-xs text-[#FF4444] font-bold">{fmt(rows.reduce((s, r) => s + r.custo, 0))}</td>
            <td className="px-3 py-2 font-mono text-xs text-[#00E559] font-bold">{fmt(rows.reduce((s, r) => s + r.total, 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

// ── Aba de Gráficos ───────────────────────────────────────────────────────────
const Graficos = ({ vendas, restauranteId }) => {
  const [lancamentos, setLancamentos] = useState([]);

  // Carrega histórico de lançamentos para o gráfico de linha
  useEffect(() => {
    if (!restauranteId) return;
    axios.get(`${API}/financeiro/lancamentos/${restauranteId}`)
      .then((r) => setLancamentos(r.data || []))
      .catch(() => {});
  }, [restauranteId]);

  // ── Dados: top produtos por receita ──────────────────────────────────────
  const produtoMap = {};
  vendas.forEach((v) => {
    v.itens?.forEach((item) => {
      const nome  = item.name || item.nome || "?";
      const preco = (item.salePrice || item.precoUnitario || 0) * (item.qtd || 1);
      const custo = (item.costPrice || item.precoCusto || 0)  * (item.qtd || 1);
      if (!produtoMap[nome]) produtoMap[nome] = { nome, receita: 0, custo: 0 };
      produtoMap[nome].receita += preco;
      produtoMap[nome].custo   += custo;
    });
  });
  const topProdutos = Object.values(produtoMap)
    .sort((a, b) => b.receita - a.receita)
    .slice(0, 6)
    .map((p) => ({ ...p, margem: p.receita > 0 ? ((p.receita - p.custo) / p.receita * 100) : 0 }));

  // ── Dados: por forma de pagamento ────────────────────────────────────────
  const pgMap = { Dinheiro: 0, PIX: 0, Cartão: 0, Outros: 0 };
  vendas.forEach((v) => {
    const pg  = (v.pagamento || "").toLowerCase();
    const val = Number(v.total) || 0;
    if (pg.includes("dinheiro"))       pgMap["Dinheiro"] += val;
    else if (pg.includes("pix"))       pgMap["PIX"]      += val;
    else if (pg.includes("cart"))      pgMap["Cartão"]   += val;
    else                               pgMap["Outros"]   += val;
  });
  const dadosPagamento = Object.entries(pgMap)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  // ── Dados: fluxo dos últimos 7 dias (lancamentos) ────────────────────────
  const hoje = new Date();
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(hoje);
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const fluxoMap = Object.fromEntries(dias.map((d) => [d, 0]));
  lancamentos.forEach((l) => {
    const dia = (l.criadoEm || l.data || "").slice(0, 10);
    if (dia in fluxoMap && l.tipo === "venda") fluxoMap[dia] += Number(l.valor) || 0;
  });
  const dadosFluxo = dias.map((d) => ({
    dia: d.slice(5),   // "MM-DD"
    receita: fluxoMap[d],
  }));

  // ── Insight: produto com maior margem ────────────────────────────────────
  const melhorMargem = topProdutos.sort((a, b) => b.margem - a.margem)[0];
  const maisVendido  = Object.values(produtoMap).sort((a, b) => b.receita - a.receita)[0];

  return (
    <div className="flex flex-col gap-5">

      {/* ── Insight cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-[#0A0A0A] border border-[#00E559]/20 p-4 flex flex-col gap-1">
          <span className="font-mono text-[9px] text-[#00E559] tracking-widest">🏆 MAIOR RECEITA HOJE</span>
          <span className="font-mono text-sm text-[#EDEDED] font-bold mt-1 truncate">
            {maisVendido?.nome ?? "—"}
          </span>
          <span className="font-mono text-xs text-[#00E559]">{fmt(maisVendido?.receita ?? 0)}</span>
        </div>
        <div className="bg-[#0A0A0A] border border-[#A855F7]/20 p-4 flex flex-col gap-1">
          <span className="font-mono text-[9px] text-[#A855F7] tracking-widest">💎 MAIOR MARGEM</span>
          <span className="font-mono text-sm text-[#EDEDED] font-bold mt-1 truncate">
            {melhorMargem?.nome ?? "—"}
          </span>
          <span className="font-mono text-xs text-[#A855F7]">
            {melhorMargem ? `${melhorMargem.margem.toFixed(0)}% de margem` : "—"}
          </span>
        </div>
      </div>

      {/* ── Gráfico de barras: top produtos ── */}
      <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-3">
        <span className="font-mono text-[10px] text-[#71717A] tracking-widest">RECEITA POR PRODUTO</span>
        {topProdutos.length === 0 ? (
          <div className="font-mono text-xs text-[#3F3F46] text-center py-6">Nenhuma venda ainda</div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={topProdutos} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <XAxis
                dataKey="nome"
                tick={{ fontFamily: "monospace", fontSize: 9, fill: "#3F3F46" }}
                tickFormatter={(v) => v.length > 10 ? v.slice(0, 10) + "…" : v}
                axisLine={false} tickLine={false}
              />
              <YAxis hide />
              <Tooltip content={<DarkTooltip />} cursor={{ fill: "#111" }} />
              <Bar dataKey="receita" name="Receita" radius={[2, 2, 0, 0]}>
                {topProdutos.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Gráfico de pizza: por pagamento ── */}
      <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-3">
        <span className="font-mono text-[10px] text-[#71717A] tracking-widest">FORMAS DE PAGAMENTO</span>
        {dadosPagamento.length === 0 ? (
          <div className="font-mono text-xs text-[#3F3F46] text-center py-6">Nenhuma venda ainda</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={dadosPagamento}
                dataKey="value"
                nameKey="name"
                cx="50%" cy="50%"
                outerRadius={70}
                innerRadius={40}
                paddingAngle={3}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {dadosPagamento.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<DarkTooltip />} />
              <Legend
                iconType="circle"
                iconSize={6}
                formatter={(v) => <span style={{ fontFamily: "monospace", fontSize: 9, color: "#71717A" }}>{v}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Gráfico de linha: fluxo 7 dias ── */}
      <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-3">
        <span className="font-mono text-[10px] text-[#71717A] tracking-widest">FLUXO DE CAIXA — ÚLTIMOS 7 DIAS</span>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={dadosFluxo} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="#141414" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="dia"
              tick={{ fontFamily: "monospace", fontSize: 9, fill: "#3F3F46" }}
              axisLine={false} tickLine={false}
            />
            <YAxis hide />
            <Tooltip content={<DarkTooltip />} cursor={{ stroke: "#27272A" }} />
            <Line
              type="monotone"
              dataKey="receita"
              name="Receita"
              stroke="#00E559"
              strokeWidth={2}
              dot={{ fill: "#00E559", r: 3, strokeWidth: 0 }}
              activeDot={{ fill: "#00E559", r: 5, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ── AJAX Chat Financeiro ──────────────────────────────────────────────────────
const AjaxFinanceiro = ({ vendas, caixa }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const buildContext = () => {
    const resumo = {};
    vendas.forEach((v) => {
      v.itens?.forEach((item) => {
        const k    = item.name || item.nome || "?";
        const pr   = item.salePrice || item.precoUnitario || 0;
        const cu   = item.costPrice || item.precoCusto || 0;
        const qtd  = item.qtd || 1;
        if (!resumo[k]) resumo[k] = { nome: k, qtd: 0, total: 0, custo: 0, dinheiro: 0, pix: 0, cartao: 0 };
        resumo[k].qtd   += qtd;
        resumo[k].total += pr * qtd;
        resumo[k].custo += cu * qtd;
        const pg  = (v.pagamento || "").toUpperCase();
        const val = pr * qtd;
        if (pg.includes("DINHEIRO"))    resumo[k].dinheiro += val;
        else if (pg.includes("PIX"))    resumo[k].pix      += val;
        else                            resumo[k].cartao   += val;
      });
    });
    const rows         = Object.values(resumo);
    const totalVendido = rows.reduce((s, r) => s + r.total, 0);
    const totalCusto   = rows.reduce((s, r) => s + r.custo, 0);
    const lucro        = totalVendido - totalCusto;

    return `Dados financeiros de hoje:
Caixa: ${caixa?.abertoEm ? `aberto às ${new Date(caixa.abertoEm).toLocaleTimeString("pt-BR")}` : "fechado"}
Fundo: R$${(caixa?.fundo || 0).toFixed(2)} | Total vendido: R$${totalVendido.toFixed(2)} | Custo: R$${totalCusto.toFixed(2)} | Lucro bruto: R$${lucro.toFixed(2)}
Pedidos: ${vendas.length}

Itens:
${rows.map((r) => `- ${r.nome}: ${r.qtd} un — vendido R$${r.total.toFixed(2)} — lucro R$${(r.total - r.custo).toFixed(2)}`).join("\n") || "Nenhum item."}`;
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((p) => [...p, { role: "user", content: input }]);
    setInput("");
    setLoading(true);
    setMessages((p) => [...p, { role: "assistant", content: "", streaming: true }]);

    try {
      const res = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: LM_MODEL,
          messages: [
            { role: "system", content: `Você é AJAX, agente financeiro de delivery. Responda em português, direto e objetivo.\n\n${buildContext()}` },
            ...history,
            userMsg,
          ],
          stream: true,
          temperature: 0.5,
        }),
      });

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        decoder.decode(value, { stream: true }).split("\n")
          .filter((l) => l.startsWith("data: "))
          .forEach((line) => {
            const data = line.slice(6);
            if (data === "[DONE]") return;
            try {
              const delta = JSON.parse(data).choices?.[0]?.delta?.content || "";
              full += delta;
              setMessages((p) => { const u = [...p]; u[u.length - 1] = { role: "assistant", content: full, streaming: true }; return u; });
            } catch {}
          });
      }
      setMessages((p) => { const u = [...p]; u[u.length - 1] = { role: "assistant", content: full, streaming: false }; return u; });
    } catch (err) {
      setMessages((p) => { const u = [...p]; u[u.length - 1] = { role: "assistant", content: `[ERRO] ${err.message}`, streaming: false }; return u; });
    } finally {
      setLoading(false);
    }
  };

  const clean = (c) => c.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || c;

  return (
    <div className="bg-[#0A0A0A] border border-[#27272A] flex flex-col h-72">
      <div className="px-4 py-2 border-b border-[#27272A] shrink-0">
        <span className="font-mono text-xs text-[#00E559] tracking-widest">⚡ AJAX — CONSULTA FINANCEIRA</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="font-mono text-xs text-[#3F3F46] text-center mt-6">
            Pergunte: <span className="text-[#71717A]">"Qual produto devo promover hoje?"</span>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`font-mono text-xs ${m.role === "user" ? "text-[#00E559]" : "text-[#EDEDED] bg-[#111] border border-[#27272A] p-2"}`}>
            {m.role === "user" ? `> ${m.content}` : (
              <><span className="text-[#FFB800]">AJAX: </span>{clean(m.content)}{m.streaming && <span className="inline-block w-1.5 h-3 bg-[#FFB800] ml-1 animate-pulse align-middle" />}</>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="border-t border-[#27272A] p-2 flex gap-2 shrink-0">
        <span className="text-[#00E559] font-mono text-sm">{">"}</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Digite sua pergunta..."
          className="flex-1 bg-transparent border-none outline-none text-[#EDEDED] font-mono text-xs placeholder:text-[#3F3F46]"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-3 py-1 bg-[#00E559] text-black font-mono text-xs font-bold disabled:opacity-40 hover:bg-[#00c44d] transition-colors"
        >
          SEND
        </button>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN FINANCEIRO
// ═════════════════════════════════════════════════════════════════════════════
export function Financeiro({ vendas = [], restauranteId }) {
  const [caixa, setCaixa]               = useState(null);
  const [historicoCaixa, setHistoricoCaixa] = useState([]);
  const [subTab, setSubTab]             = useState("caixa");
  const [lastSync, setLastSync]         = useState(Date.now());
  const [syncing, setSyncing]           = useState(false);

  const totalVendido = vendas.reduce((s, v) => s + (Number(v.total) || 0), 0);

  // ── Carrega caixa + polling de 30s ──────────────────────────────────────
  const fetchCaixa = useCallback(async () => {
    if (!restauranteId) return;
    setSyncing(true);
    try {
      const r = await axios.get(`${API}/financeiro/caixa/${restauranteId}/hoje`);
      if (r.data?.status === "aberto") setCaixa(r.data);
      setLastSync(Date.now());
    } catch {}
    finally { setSyncing(false); }
  }, [restauranteId]);

  useEffect(() => {
    fetchCaixa();
    const interval = setInterval(fetchCaixa, 30000);
    return () => clearInterval(interval);
  }, [fetchCaixa]);

  const handleAbrirCaixa = async (fundo) => {
    try {
      await axios.post(`${API}/financeiro/caixa`, { restauranteId, fundo });
      await fetchCaixa();
    } catch (err) {
      console.error("Erro ao abrir caixa:", err?.response?.data?.detail || err.message);
    }
  };

  const handleFecharCaixa = async (resumo) => {
    try {
      const res = await axios.patch(`${API}/financeiro/caixa/${restauranteId}/fechar`, {
        dinheiro: resumo.dinheiro,
        pix:      resumo.pix,
        cartao:   resumo.cartao,
        outros:   resumo.outros || 0,
      });
      setHistoricoCaixa((p) => [{ ...caixa, ...res.data, fechadoEm: new Date().toISOString(), status: "fechado" }, ...p]);
      setCaixa(null);
    } catch (err) {
      console.error("Erro ao fechar caixa:", err?.response?.data?.detail || err.message);
    }
  };

  const TABS = [
    { id: "caixa",   label: "💰 CAIXA"     },
    { id: "vendas",  label: "📋 VENDAS"    },
    { id: "graficos",label: "📈 GRÁFICOS"  },
    { id: "ajax",    label: "⚡ AJAX"      },
  ];

  return (
    <div className="flex flex-col gap-0 h-full overflow-y-auto">

      {/* ── Header com indicador de sync ── */}
      <div className="px-6 py-4 border-b border-[#27272A] flex items-center justify-between">
        <div>
          <h1 className="font-mono text-sm text-[#00E559] tracking-widest">GESTÃO FINANCEIRA</h1>
          <p className="font-mono text-[10px] text-[#3F3F46] mt-0.5">
            {caixa
              ? `Caixa aberto às ${new Date(caixa.abertoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · Fundo: ${fmt(caixa.fundo)}`
              : "Caixa fechado"}
          </p>
        </div>
        <SyncIndicator lastSync={lastSync} syncing={syncing} />
      </div>

      {/* ── Sub-tabs ── */}
      <div className="flex border-b border-[#27272A] overflow-x-auto shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-4 py-2.5 font-mono text-[10px] whitespace-nowrap border-b-2 transition-colors ${
              subTab === t.id
                ? "border-[#00E559] text-[#00E559]"
                : "border-transparent text-[#3F3F46] hover:text-[#71717A]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5 flex flex-col gap-5">

        {/* ── Cards de resumo (sempre visíveis) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "TOTAL VENDIDO",  value: fmt(totalVendido),                      color: "#00E559" },
            { label: "PEDIDOS",        value: vendas.length,                           color: "#A1A1AA" },
            { label: "FUNDO DE CAIXA", value: fmt(caixa?.fundo || 0),                 color: "#FFB800" },
            { label: "LÍQUIDO",        value: fmt(totalVendido - (caixa?.fundo || 0)), color: "#00BFFF" },
          ].map((c) => (
            <div key={c.label} className="bg-[#0A0A0A] border border-[#27272A] p-3 flex flex-col gap-1">
              <span className="font-mono text-[9px] text-[#3F3F46] tracking-widest">{c.label}</span>
              <span className="font-mono text-base font-bold" style={{ color: c.color }}>{c.value}</span>
            </div>
          ))}
        </div>

        {/* ── Caixa ── */}
        {subTab === "caixa" && (
          <div className="bg-[#0A0A0A] border border-[#27272A] p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] text-[#71717A] tracking-widest">STATUS DO CAIXA</span>
              <span className={`font-mono text-[9px] px-2 py-0.5 border ${caixa ? "border-[#00E559] text-[#00E559]" : "border-[#FF4444] text-[#FF4444]"}`}>
                {caixa ? "ABERTO" : "FECHADO"}
              </span>
            </div>

            {!caixa
              ? <AberturaCaixa onAbrir={handleAbrirCaixa} />
              : <FechamentoCaixa caixa={caixa} vendas={vendas} onFechar={handleFecharCaixa} />
            }

            {historicoCaixa.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-[#27272A] pt-4">
                <span className="font-mono text-[9px] text-[#3F3F46] tracking-widest">HISTÓRICO</span>
                {historicoCaixa.map((h, i) => (
                  <div key={i} className="flex justify-between font-mono text-xs text-[#3F3F46] border-b border-[#141414] pb-1">
                    <span>
                      {new Date(h.abertoEm).toLocaleDateString("pt-BR")}{" "}
                      {new Date(h.abertoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} →{" "}
                      {h.fechadoEm ? new Date(h.fechadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </span>
                    <span className="text-[#00E559]">{fmt(h.totalVendido)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Vendas ── */}
        {subTab === "vendas" && (
          <div className="bg-[#0A0A0A] border border-[#27272A]">
            <div className="px-4 py-3 border-b border-[#27272A]">
              <span className="font-mono text-[10px] text-[#71717A] tracking-widest">
                VENDAS DO DIA — {new Date().toLocaleDateString("pt-BR")}
              </span>
            </div>
            <TabelaVendas vendas={vendas} />
          </div>
        )}

        {/* ── Gráficos ── */}
        {subTab === "graficos" && (
          <Graficos vendas={vendas} restauranteId={restauranteId} />
        )}

        {/* ── AJAX ── */}
        {subTab === "ajax" && (
          <AjaxFinanceiro vendas={vendas} caixa={caixa} />
        )}
      </div>
    </div>
  );
}
