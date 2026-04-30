import { useState, useEffect, useRef } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;
const LM_STUDIO_URL = "http://127.0.0.1:1234";
const LM_MODEL = "deepseek-r1-distill-qwen-1.5b";

const fmt = (v) => `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;
const fmtN = (v) => Number(v || 0).toFixed(2).replace(".", ",");

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
          onChange={e => setFundo(e.target.value)}
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
  const [pix, setPix] = useState("");
  const [cartao, setCartao] = useState("");

  const totalInformado = (parseFloat(dinheiro) || 0) + (parseFloat(pix) || 0) + (parseFloat(cartao) || 0);
  // Suporta objetos do backend (campo "total") e do mock local (campo "total" ou "salePrice")
  const totalVendido = vendas.reduce((s, v) => s + (Number(v.total) || 0), 0);
  const liquido = totalVendido - (caixa?.fundo || 0);

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <span className="font-mono text-xs text-[#71717A] tracking-widest">FECHAR CAIXA</span>

      <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-2">
        <span className="font-mono text-[10px] text-[#71717A]">VALORES RECEBIDOS</span>
        {[
          { label: "💵 DINHEIRO (R$)", val: dinheiro, set: setDinheiro },
          { label: "◈ PIX (R$)", val: pix, set: setPix },
          { label: "💳 CARTÃO (R$)", val: cartao, set: setCartao },
        ].map(({ label, val, set }) => (
          <div key={label} className="flex items-center gap-3">
            <label className="font-mono text-xs text-[#A1A1AA] w-36">{label}</label>
            <input
              type="number" step="0.01" min="0" value={val}
              onChange={e => set(e.target.value)}
              placeholder="0,00"
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1.5 focus:outline-none focus:border-[#00E559] w-32"
            />
          </div>
        ))}
      </div>

      <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-2">
        <div className="flex justify-between">
          <span className="font-mono text-xs text-[#71717A]">FUNDO DE CAIXA</span>
          <span className="font-mono text-xs text-[#A1A1AA]">{fmt(caixa.fundo)}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-mono text-xs text-[#71717A]">TOTAL INFORMADO</span>
          <span className="font-mono text-xs text-[#EDEDED]">{fmt(totalInformado)}</span>
        </div>
        <div className="flex justify-between border-t border-[#27272A] pt-2">
          <span className="font-mono text-xs text-[#71717A]">TOTAL VENDIDO (SISTEMA)</span>
          <span className="font-mono text-xs text-[#00E559]">{fmt(totalVendido)}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-mono text-xs text-[#71717A]">LÍQUIDO (- FUNDO)</span>
          <span className="font-mono text-xs text-[#FFB800]">{fmt(liquido)}</span>
        </div>
        <div className="flex justify-between border-t border-[#27272A] pt-2">
          <span className="font-mono text-xs text-[#71717A]">DIFERENÇA (BATER CAIXA)</span>
          <span className={`font-mono text-xs font-bold ${Math.abs(totalInformado - totalVendido) < 0.01 ? "text-[#00E559]" : "text-[#FF4444]"}`}>
            {totalInformado - totalVendido >= 0 ? "+" : ""}{fmtN(totalInformado - totalVendido)}
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
  // Agrupa por produto
  const resumo = {};
  vendas.forEach(venda => {
    venda.itens?.forEach(item => {
      const key = item.name;
      if (!resumo[key]) resumo[key] = { nome: key, qtd: 0, dinheiro: 0, pix: 0, cartao: 0, outros: 0, total: 0, custo: 0 };
      resumo[key].qtd += item.qtd;
      resumo[key].total += item.salePrice * item.qtd;
      resumo[key].custo += (item.costPrice || 0) * item.qtd;
      const pg = (venda.pagamento || "").toUpperCase();
      const val = item.salePrice * item.qtd;
      if (pg.includes("DINHEIRO")) resumo[key].dinheiro += val;
      else if (pg.includes("PIX")) resumo[key].pix += val;
      else if (pg.includes("CART")) resumo[key].cartao += val;
      else resumo[key].outros += val;
    });
  });

  const rows = Object.values(resumo);

  if (rows.length === 0) {
    return <div className="font-mono text-xs text-[#3F3F46] py-8 text-center">NENHUMA VENDA REGISTRADA HOJE</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px]">
        <thead>
          <tr className="border-b border-[#27272A]">
            {["PRODUTO", "QTD", "DINHEIRO", "PIX", "CARTÃO", "OUTROS", "CUSTO TOTAL", "TOTAL"].map(h => (
              <th key={h} className="px-3 py-2 text-left font-mono text-[10px] text-[#71717A]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.nome} className="border-b border-[#27272A] hover:bg-[#111]">
              <td className="px-3 py-2 font-mono text-xs text-[#EDEDED]">{r.nome}</td>
              <td className="px-3 py-2 font-mono text-xs text-[#A1A1AA]">{r.qtd}</td>
              <td className="px-3 py-2 font-mono text-xs text-[#71717A]">{r.dinheiro > 0 ? fmt(r.dinheiro) : "—"}</td>
              <td className="px-3 py-2 font-mono text-xs text-[#71717A]">{r.pix > 0 ? fmt(r.pix) : "—"}</td>
              <td className="px-3 py-2 font-mono text-xs text-[#71717A]">{r.cartao > 0 ? fmt(r.cartao) : "—"}</td>
              <td className="px-3 py-2 font-mono text-xs text-[#71717A]">{r.outros > 0 ? fmt(r.outros) : "—"}</td>
              <td className="px-3 py-2 font-mono text-xs text-[#FF4444]">{fmt(r.custo)}</td>
              <td className="px-3 py-2 font-mono text-xs text-[#00E559] font-bold">{fmt(r.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#27272A]">
            <td className="px-3 py-2 font-mono text-xs text-[#71717A] font-bold">TOTAL</td>
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

// ── AJAX Chat Financeiro ──────────────────────────────────────────────────────
const AjaxFinanceiro = ({ vendas, caixa }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const buildContext = () => {
    const resumo = {};
    vendas.forEach(v => {
      v.itens?.forEach(item => {
        const k = item.name;
        if (!resumo[k]) resumo[k] = { nome: k, qtd: 0, total: 0, custo: 0, dinheiro: 0, pix: 0, cartao: 0 };
        resumo[k].qtd += item.qtd;
        resumo[k].total += item.salePrice * item.qtd;
        resumo[k].custo += (item.costPrice || 0) * item.qtd;
        const pg = (v.pagamento || "").toUpperCase();
        const val = item.salePrice * item.qtd;
        if (pg.includes("DINHEIRO")) resumo[k].dinheiro += val;
        else if (pg.includes("PIX")) resumo[k].pix += val;
        else resumo[k].cartao += val;
      });
    });
    const rows = Object.values(resumo);
    const totalVendido = rows.reduce((s, r) => s + r.total, 0);
    const totalCusto = rows.reduce((s, r) => s + r.custo, 0);
    const lucro = totalVendido - totalCusto;

    const itensStr = rows.map(r =>
      `- ${r.nome}: ${r.qtd} un, custo R$${r.custo.toFixed(2)}, vendido R$${r.total.toFixed(2)}, lucro R$${(r.total - r.custo).toFixed(2)}, pagamentos: dinheiro R$${r.dinheiro.toFixed(2)} / pix R$${r.pix.toFixed(2)} / cartão R$${r.cartao.toFixed(2)}`
    ).join("\n");

    return `Dados financeiros de hoje:\nCaixa aberto às: ${caixa?.abertoEm ? new Date(caixa.abertoEm).toLocaleTimeString("pt-BR") : "não aberto"}\nFundo: R$${(caixa?.fundo || 0).toFixed(2)}\nTotal vendido: R$${totalVendido.toFixed(2)}\nTotal custo: R$${totalCusto.toFixed(2)}\nLucro bruto: R$${lucro.toFixed(2)}\nTotal de pedidos: ${vendas.length}\n\nItens vendidos:\n${itensStr || "Nenhum item vendido ainda."}`;
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input };
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(p => [...p, { role: "user", content: input }]);
    setInput("");
    setLoading(true);
    setMessages(p => [...p, { role: "assistant", content: "", streaming: true }]);

    try {
      const res = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: LM_MODEL,
          messages: [
            { role: "system", content: `Você é AJAX, agente financeiro de delivery. Responda em português, direto e objetivo. Use os dados abaixo para responder perguntas sobre vendas, lucro e caixa.\n\n${buildContext()}` },
            ...history,
            userMsg,
          ],
          stream: true,
          temperature: 0.5,
        }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split("\n").filter(l => l.startsWith("data: "));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content || "";
            full += delta;
            setMessages(p => { const u = [...p]; u[u.length - 1] = { role: "assistant", content: full, streaming: true }; return u; });
          } catch {}
        }
      }
      setMessages(p => { const u = [...p]; u[u.length - 1] = { role: "assistant", content: full, streaming: false }; return u; });
    } catch (err) {
      setMessages(p => { const u = [...p]; u[u.length - 1] = { role: "assistant", content: `[ERRO] ${err.message}`, streaming: false }; return u; });
    } finally {
      setLoading(false);
    }
  };

  const fmt2 = c => c.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || c;

  return (
    <div className="bg-[#0A0A0A] border border-[#27272A] flex flex-col h-72">
      <div className="px-4 py-2 border-b border-[#27272A] shrink-0">
        <span className="font-mono text-xs text-[#00E559] tracking-widest">⚡ AJAX — CONSULTA FINANCEIRA</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="font-mono text-xs text-[#3F3F46] text-center mt-6">
            Pergunte: <span className="text-[#71717A]">"Ajax quanto vendi hoje?"</span>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`font-mono text-xs ${m.role === "user" ? "text-[#00E559]" : "text-[#EDEDED] bg-[#111] border border-[#27272A] p-2"}`}>
            {m.role === "user" ? `> ${m.content}` : (
              <><span className="text-[#FFB800]">AJAX: </span>{fmt2(m.content)}{m.streaming && <span className="inline-block w-1.5 h-3 bg-[#FFB800] ml-1 animate-pulse align-middle" />}</>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="border-t border-[#27272A] p-2 flex gap-2 shrink-0">
        <span className="text-[#00E559] font-mono text-sm">{">"}</span>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Digite sua pergunta..."
          className="flex-1 bg-transparent border-none outline-none text-[#EDEDED] font-mono text-xs placeholder:text-[#3F3F46]"
        />
        <button onClick={send} disabled={loading || !input.trim()}
          className="px-3 py-1 bg-[#00E559] text-black font-mono text-xs font-bold disabled:opacity-40">
          SEND
        </button>
      </div>
    </div>
  );
};

// ── Main Financeiro ───────────────────────────────────────────────────────────
export function Financeiro({ vendas = [], restauranteId }) {
  const [caixa, setCaixa] = useState(null); // null = fechado
  const [historicoCaixa, setHistoricoCaixa] = useState([]);
  const [subTab, setSubTab] = useState("caixa");

  // Carrega caixa do dia do backend
  useEffect(() => {
    if (!restauranteId) return;
    axios.get(`${API}/financeiro/caixa/${restauranteId}/hoje`)
      .then(r => { if (r.data?.status === "aberto") setCaixa(r.data); })
      .catch(() => {});
  }, [restauranteId]);

  const handleAbrirCaixa = async (fundo) => {
    try {
      await axios.post(`${API}/financeiro/caixa`, { restauranteId, fundo });
      // Recarrega do backend para garantir o objeto completo (id, abertoEm, etc.)
      const r = await axios.get(`${API}/financeiro/caixa/${restauranteId}/hoje`);
      if (r.data?.status === "aberto") setCaixa(r.data);
    } catch (err) {
      console.error("Erro abrir caixa:", err?.response?.data?.detail || err.message);
    }
  };

  const handleFecharCaixa = async (resumo) => {
    try {
      const res = await axios.patch(`${API}/financeiro/caixa/${restauranteId}/fechar`, {
        dinheiro: resumo.dinheiro,
        pix: resumo.pix,
        cartao: resumo.cartao,
        outros: resumo.outros || 0,
      });
      const fechado = {
        ...caixa,
        ...res.data,
        fechadoEm: new Date().toISOString(),
        status: "fechado",
      };
      setHistoricoCaixa(p => [fechado, ...p]);
      setCaixa(null);
    } catch (err) {
      console.error("Erro fechar caixa:", err?.response?.data?.detail || err.message);
    }
  };

  const totalVendido = vendas.reduce((s, v) => s + v.total, 0);

  return (
    <div className="flex flex-col gap-0 h-full overflow-y-auto">
      {/* Boas-vindas */}
      <div className="px-6 py-5 border-b border-[#27272A]">
        <h1 className="font-mono text-lg text-[#00E559] tracking-widest">Seja bem-Vindo a sua gestão</h1>
        <p className="font-mono text-xs text-[#71717A] mt-1">
          {caixa ? `Caixa aberto às ${new Date(caixa.abertoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · Fundo: ${fmt(caixa.fundo)}` : "Caixa fechado"}
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-[#27272A]">
        {[
          { id: "caixa", label: "💰 CAIXA" },
          { id: "vendas", label: "📊 VENDAS DO DIA" },
          { id: "ajax", label: "⚡ AJAX" },
        ].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 font-mono text-xs border-b-2 transition-colors ${subTab === t.id ? "border-[#00E559] text-[#00E559]" : "border-transparent text-[#71717A] hover:text-[#A1A1AA]"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-6 flex flex-col gap-6">
        {/* Cards resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "TOTAL VENDIDO", value: fmt(totalVendido), color: "#00E559" },
            { label: "PEDIDOS", value: vendas.length, color: "#A1A1AA" },
            { label: "FUNDO DE CAIXA", value: fmt(caixa?.fundo || 0), color: "#FFB800" },
            { label: "LÍQUIDO", value: fmt(totalVendido - (caixa?.fundo || 0)), color: "#00BFFF" },
          ].map(c => (
            <div key={c.label} className="bg-[#0A0A0A] border border-[#27272A] p-3 flex flex-col gap-1">
              <span className="font-mono text-[10px] text-[#71717A] tracking-widest">{c.label}</span>
              <span className="font-mono text-base font-bold" style={{ color: c.color }}>{c.value}</span>
            </div>
          ))}
        </div>

        {/* Sub-tab: Caixa */}
        {subTab === "caixa" && (
          <div className="bg-[#0A0A0A] border border-[#27272A] p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-[#71717A] tracking-widest">STATUS DO CAIXA</span>
              <span className={`font-mono text-xs px-2 py-0.5 border ${caixa ? "border-[#00E559] text-[#00E559]" : "border-[#FF4444] text-[#FF4444]"}`}>
                {caixa ? "ABERTO" : "FECHADO"}
              </span>
            </div>

            {!caixa ? (
              <AberturaCaixa onAbrir={handleAbrirCaixa} />
            ) : (
              <FechamentoCaixa caixa={caixa} vendas={vendas} onFechar={handleFecharCaixa} />
            )}

            {/* Histórico */}
            {historicoCaixa.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-[#27272A] pt-4">
                <span className="font-mono text-[10px] text-[#71717A] tracking-widest">HISTÓRICO DE CAIXAS</span>
                {historicoCaixa.map((h, i) => (
                  <div key={i} className="flex justify-between font-mono text-xs text-[#A1A1AA] border-b border-[#27272A] pb-1">
                    <span>{new Date(h.abertoEm).toLocaleDateString("pt-BR")} {new Date(h.abertoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} → {h.fechadoEm ? new Date(h.fechadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                    <span className="text-[#00E559]">{fmt(h.totalVendido)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sub-tab: Vendas */}
        {subTab === "vendas" && (
          <div className="bg-[#0A0A0A] border border-[#27272A]">
            <div className="px-4 py-3 border-b border-[#27272A]">
              <span className="font-mono text-xs text-[#71717A] tracking-widest">VENDAS DO DIA — {new Date().toLocaleDateString("pt-BR")}</span>
            </div>
            <TabelaVendas vendas={vendas} />
          </div>
        )}

        {/* Sub-tab: AJAX */}
        {subTab === "ajax" && (
          <AjaxFinanceiro vendas={vendas} caixa={caixa} />
        )}
      </div>
    </div>
  );
}
