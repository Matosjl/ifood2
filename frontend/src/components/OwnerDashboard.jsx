import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;
const LM_STUDIO_URL = "http://127.0.0.1:1234";
const LM_MODEL = "deepseek-r1-distill-qwen-1.5b";

const STATUS_COLOR = { active: "#00E559", inactive: "#71717A" };
const emptyForm = { name: "", representative: "", phone: "", gmail: "", plan_value: 80, notes: "" };

// ── Summary Cards ─────────────────────────────────────────────────────────────
const SummaryCards = ({ summary }) => {
  const cards = [
    { label: "RESTAURANTES", value: summary.total_restaurants ?? "—", color: "#A1A1AA" },
    { label: "ATIVOS", value: summary.active ?? "—", color: "#00E559" },
    { label: "INATIVOS", value: summary.inactive ?? "—", color: "#71717A" },
    { label: "MRR", value: summary.mrr != null ? `R$ ${Number(summary.mrr).toFixed(2)}` : "—", color: "#FFB000" },
    { label: "TOTAL RECEBIDO", value: summary.total_earned != null ? `R$ ${Number(summary.total_earned).toFixed(2)}` : "—", color: "#007AFF" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-1">
          <span className="font-mono text-[10px] text-[#71717A] tracking-widest">{c.label}</span>
          <span className="font-mono text-lg font-bold" style={{ color: c.color }}>{c.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Restaurant Modal ──────────────────────────────────────────────────────────
const RestaurantModal = ({ initial, onSave, onClose, onRegenCode }) => {
  const [form, setForm] = useState(
    initial
      ? { ...initial }
      : { ...emptyForm }
  );
  const [loading, setLoading] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await onSave(form);
    setLoading(false);
  };

  const handleRegen = async () => {
    setRegenLoading(true);
    const newCode = await onRegenCode(initial.id);
    if (newCode) set("access_code", newCode);
    setRegenLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#0A0A0A] border border-[#27272A] w-full max-w-md p-6 flex flex-col gap-4 my-auto">
        <div className="flex justify-between items-center">
          <span className="font-mono text-[#00E559] text-sm tracking-widest">
            {initial ? "EDITAR RESTAURANTE" : "NOVO RESTAURANTE"}
          </span>
          <button onClick={onClose} className="font-mono text-xs text-[#71717A] hover:text-[#EDEDED]">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Nome */}
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">NOME *</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} required
              placeholder="Nome do restaurante"
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]" />
          </div>

          {/* Responsável */}
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">RESPONSÁVEL *</label>
            <input value={form.representative} onChange={(e) => set("representative", e.target.value)} required
              placeholder="Nome do responsável"
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]" />
          </div>

          {/* Telefone */}
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">TELEFONE *</label>
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} required
              placeholder="(00) 00000-0000"
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]" />
          </div>

          {/* Gmail */}
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">GMAIL (para envio do código)</label>
            <input value={form.gmail || ""} onChange={(e) => set("gmail", e.target.value)}
              type="email" placeholder="restaurante@gmail.com"
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]" />
          </div>

          {/* Código de acesso — só exibe ao editar */}
          {initial && (
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs text-[#71717A]">CÓDIGO DE ACESSO</label>
              <div className="flex gap-2 items-center">
                <span className="flex-1 bg-black border border-[#27272A] text-[#00E559] font-mono text-sm px-3 py-2 tracking-widest">
                  {form.access_code || "—"}
                </span>
                <button type="button" onClick={handleRegen} disabled={regenLoading}
                  className="font-mono text-xs px-3 py-2 border border-[#27272A] text-[#FFB000] hover:border-[#FFB000] transition-colors disabled:opacity-40">
                  {regenLoading ? "..." : "↺ GERAR"}
                </button>
              </div>
              <span className="font-mono text-[10px] text-[#3F3F46]">
                Envie este código ao restaurante para acesso ao sistema.
              </span>
            </div>
          )}

          {/* Plano */}
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">VALOR DO PLANO (R$)</label>
            <input type="number" step="0.01" min="0" value={form.plan_value}
              onChange={(e) => set("plan_value", parseFloat(e.target.value) || 0)}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]" />
          </div>

          {/* Meses pagos — só ao editar */}
          {initial && (
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs text-[#71717A]">MESES PAGOS</label>
              <input type="number" min="0" value={form.months_paid ?? 0}
                onChange={(e) => set("months_paid", parseInt(e.target.value) || 0)}
                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]" />
            </div>
          )}

          {/* Status — só ao editar */}
          {initial && (
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs text-[#71717A]">STATUS</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value)}
                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]">
                <option value="active">ATIVO</option>
                <option value="inactive">INATIVO</option>
              </select>
            </div>
          )}

          {/* Observações */}
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">OBSERVAÇÕES</label>
            <textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)}
              rows={2} className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559] resize-none" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading}
              className="flex-1 bg-[#00E559] text-black font-mono text-xs font-bold py-2 hover:bg-[#00c44d] transition-colors disabled:opacity-40">
              {loading ? "SALVANDO..." : "SALVAR"}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-[#27272A] text-[#71717A] font-mono text-xs hover:border-[#3F3F46] transition-colors">
              CANCELAR
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── AJAX Chat Panel ───────────────────────────────────────────────────────────
const AjaxChat = ({ onClose }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((p) => [...p, { role: "user", content: input }]);
    setInput("");
    setLoading(true);

    const aiPlaceholder = { role: "assistant", content: "", streaming: true };
    setMessages((p) => [...p, aiPlaceholder]);

    try {
      const res = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: LM_MODEL,
          messages: [
            { role: "system", content: "Você é AJAX, agente de automação de delivery. Responda em português, de forma direta e objetiva." },
            ...history,
            userMsg,
          ],
          stream: true,
          temperature: 0.7,
        }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content || "";
            full += delta;
            setMessages((p) => {
              const updated = [...p];
              updated[updated.length - 1] = { role: "assistant", content: full, streaming: true };
              return updated;
            });
          } catch {}
        }
      }
      setMessages((p) => {
        const updated = [...p];
        updated[updated.length - 1] = { role: "assistant", content: full, streaming: false };
        return updated;
      });
    } catch (err) {
      setMessages((p) => {
        const updated = [...p];
        updated[updated.length - 1] = { role: "assistant", content: `[ERRO] ${err.message}`, streaming: false };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const formatContent = (content) =>
    content.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || content;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-[#0A0A0A] border border-[#27272A] w-full max-w-lg flex flex-col h-[70vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272A] shrink-0">
          <span className="font-mono text-xs text-[#00E559] tracking-widest">AJAX AI AGENT</span>
          <button onClick={onClose} className="font-mono text-xs text-[#71717A] hover:text-[#EDEDED]">✕ FECHAR</button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-sm">
          {messages.length === 0 && (
            <div className="text-[#71717A] text-xs text-center mt-8">
              <div className="text-[#00E559] mb-1">AJAX pronto.</div>
              <div>Pergunte sobre pedidos, estoque, faturamento...</div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col gap-1 ${m.role === "user" ? "" : "bg-[#111] border border-[#27272A] p-2"}`}>
              <span className={`text-xs ${m.role === "user" ? "text-[#00E559]" : "text-[#FFB000]"}`}>
                {m.role === "user" ? ">" : "AJAX:"}
              </span>
              <span className="text-[#EDEDED] whitespace-pre-wrap text-xs leading-relaxed">
                {formatContent(m.content)}
                {m.streaming && <span className="inline-block w-2 h-3 bg-[#FFB000] ml-1 animate-pulse align-middle" />}
              </span>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="border-t border-[#27272A] p-3 flex gap-2 shrink-0">
          <span className="text-[#00E559] font-mono text-sm">{">"}</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Digite sua pergunta..."
            className="flex-1 bg-transparent border-none outline-none text-[#EDEDED] font-mono text-sm placeholder:text-[#71717A]"
          />
          <button onClick={send} disabled={loading || !input.trim()}
            className="px-3 py-1 bg-[#00E559] text-black font-mono text-xs font-bold disabled:opacity-40">
            SEND
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Dashboard ────────────────────────────────────────────────────────────
export function OwnerDashboard() {
  const navigate = useNavigate();

  const [restaurants, setRestaurants] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showChat, setShowChat] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [rRes, sRes] = await Promise.all([
        axios.get(`${API}/owner/restaurants`, { headers }),
        axios.get(`${API}/owner/summary`, { headers }),
      ]);
      setRestaurants(rRes.data);
      setSummary(sRes.data);
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem("owner_token");
        navigate("/owner/login");
      } else {
        setError(`Erro ao carregar dados: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async (form) => {
    const headers = { Authorization: `Bearer ${localStorage.getItem("owner_token")}` };
    try {
      await axios.post(`${API}/owner/restaurants`, form, { headers });
      setModal(null);
      fetchAll();
    } catch {
      setError("Erro ao criar restaurante.");
    }
  };

  const handleEdit = async (form) => {
    const headers = { Authorization: `Bearer ${localStorage.getItem("owner_token")}` };
    try {
      await axios.patch(`${API}/owner/restaurants/${modal.data.id}`, form, { headers });
      setModal(null);
      fetchAll();
    } catch {
      setError("Erro ao atualizar restaurante.");
    }
  };

  const handleDelete = async () => {
    const headers = { Authorization: `Bearer ${localStorage.getItem("owner_token")}` };
    try {
      await axios.delete(`${API}/owner/restaurants/${deleteTarget.id}`, { headers });
      setDeleteTarget(null);
      fetchAll();
    } catch {
      setError("Erro ao excluir restaurante.");
    }
  };

  const handleToggleStatus = async (r) => {
    const headers = { Authorization: `Bearer ${localStorage.getItem("owner_token")}` };
    try {
      await axios.patch(
        `${API}/owner/restaurants/${r.id}`,
        { status: r.status === "active" ? "inactive" : "active" },
        { headers }
      );
      setRestaurants((prev) =>
        prev.map((x) => x.id === r.id ? { ...x, status: x.status === "active" ? "inactive" : "active" } : x)
      );
    } catch {
      setError("Erro ao atualizar status.");
    }
  };

  const handleRegenCode = async (id) => {
    const headers = { Authorization: `Bearer ${localStorage.getItem("owner_token")}` };
    try {
      const res = await axios.post(`${API}/owner/restaurants/${id}/regen-code`, {}, { headers });
      setRestaurants((prev) =>
        prev.map((x) => x.id === id ? { ...x, access_code: res.data.access_code } : x)
      );
      return res.data.access_code;
    } catch {
      setError("Erro ao gerar código.");
      return null;
    }
  };

  const logout = () => {
    localStorage.removeItem("owner_token");
    navigate("/owner/login");
  };

  return (
    <div className="min-h-screen bg-black text-[#EDEDED] flex flex-col">
      {/* Header */}
      <div className="h-12 bg-[#0A0A0A] border-b border-[#27272A] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="font-mono text-xs text-[#71717A] hover:text-[#EDEDED] transition-colors">
            ← AJAX
          </button>
          <span className="font-mono text-sm text-[#00E559] tracking-widest">OWNER DASHBOARD</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowChat(true)}
            className="font-mono text-xs px-3 py-1 border border-[#00E559] text-[#00E559] hover:bg-[#00E559]/10 transition-colors">
            ⚡ FALAR COM AJAX
          </button>
          <button onClick={logout} className="font-mono text-xs text-[#71717A] hover:text-[#FF4444] transition-colors">
            SAIR
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-6 flex flex-col gap-6 max-w-7xl mx-auto w-full">
        {/* Summary */}
        <SummaryCards summary={summary} />

        {/* Error */}
        {error && (
          <div className="font-mono text-xs text-[#FF4444] border border-[#FF4444]/30 bg-[#FF4444]/5 px-3 py-2 flex justify-between">
            {error}
            <button onClick={() => setError("")} className="text-[#71717A] hover:text-[#EDEDED]">✕</button>
          </div>
        )}

        {/* Table */}
        <div className="bg-[#0A0A0A] border border-[#27272A] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272A]">
            <span className="font-mono text-xs text-[#71717A] tracking-widest">RESTAURANTES</span>
            <button onClick={() => setModal({ mode: "create" })}
              className="font-mono text-xs px-3 py-1 bg-[#00E559] text-black font-bold hover:bg-[#00c44d] transition-colors">
              + NOVO
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center font-mono text-xs text-[#71717A]">CARREGANDO...</div>
          ) : restaurants.length === 0 ? (
            <div className="p-8 text-center font-mono text-xs text-[#3F3F46]">NENHUM RESTAURANTE CADASTRADO</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-[#27272A]">
                    {["NOME", "RESPONSÁVEL", "TELEFONE", "GMAIL", "CÓDIGO", "PLANO", "MESES", "STATUS", "AÇÕES"].map((h) => (
                      <th key={h} className="px-4 py-2 text-left font-mono text-xs text-[#71717A]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {restaurants.map((r) => (
                    <tr key={r.id} className="border-b border-[#27272A] hover:bg-[#111] group">
                      <td className="px-4 py-3 font-mono text-sm text-[#EDEDED]">{r.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#A1A1AA]">{r.representative}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#A1A1AA]">{r.phone}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#A1A1AA]">{r.gmail || "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#00E559] tracking-widest">{r.access_code || "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#00E559]">R$ {Number(r.plan_value).toFixed(2)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#A1A1AA]">{r.months_paid ?? 0}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleToggleStatus(r)}
                          className="font-mono text-xs px-2 py-0.5 border transition-colors"
                          style={{ color: STATUS_COLOR[r.status] || "#71717A", borderColor: STATUS_COLOR[r.status] || "#27272A" }}>
                          {r.status === "active" ? "ATIVO" : "INATIVO"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setModal({ mode: "edit", data: r })}
                            className="font-mono text-xs text-[#71717A] hover:text-[#EDEDED] transition-colors">
                            EDITAR
                          </button>
                          <button onClick={() => setDeleteTarget(r)}
                            className="font-mono text-xs text-[#FF4444] hover:text-red-300 transition-colors">
                            EXCLUIR
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal criar/editar */}
      {modal && (
        <RestaurantModal
          initial={modal.mode === "edit" ? modal.data : null}
          onSave={modal.mode === "create" ? handleCreate : handleEdit}
          onClose={() => setModal(null)}
          onRegenCode={handleRegenCode}
        />
      )}

      {/* Confirmar exclusão */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#FF4444]/50 p-6 max-w-sm w-full flex flex-col gap-4">
            <span className="font-mono text-sm text-[#FF4444]">CONFIRMAR EXCLUSÃO</span>
            <span className="font-mono text-xs text-[#A1A1AA]">
              Excluir <span className="text-[#EDEDED]">{deleteTarget.name}</span>? Esta ação não pode ser desfeita.
            </span>
            <div className="flex gap-3">
              <button onClick={handleDelete}
                className="flex-1 bg-[#FF4444] text-white font-mono text-xs font-bold py-2 hover:bg-red-600 transition-colors">
                EXCLUIR
              </button>
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 border border-[#27272A] text-[#71717A] font-mono text-xs hover:border-[#3F3F46] transition-colors">
                CANCELAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat AJAX */}
      {showChat && <AjaxChat onClose={() => setShowChat(false)} />}
    </div>
  );
}
