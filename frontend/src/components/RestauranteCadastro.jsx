import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

const CATEGORIAS = [
  "Hambúrguer", "Pizza", "Japonês", "Brasileira", "Árabe",
  "Italiana", "Mexicana", "Frutos do Mar", "Vegano", "Açaí",
  "Lanches", "Marmita", "Sobremesas", "Bebidas", "Outro",
];

const EMPTY = {
  nome: "",
  slug: "",
  telefone: "",
  endereco: "",
  cidade: "",
  categoria: "",
  descricao: "",
  logoUrl: "",
  taxaEntrega: "5.00",
  tempoEstimado: "30-45 min",
  ativo: true,
};

// gera slug automático a partir do nome
const toSlug = (str) =>
  str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

export function RestauranteCadastro() {
  const { id } = useParams();          // presente quando editando
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(EMPTY);
  const [slugManual, setSlugManual] = useState(false);  // true após editar slug à mão
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(isEdit);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  // carrega dados ao editar
  useEffect(() => {
    if (!isEdit) return;
    axios
      .get(`${API}/restaurantes/${id}`)
      .then(({ data }) =>
        setForm({
          nome:          data.nome          ?? "",
          slug:          data.slug          ?? "",
          telefone:      data.telefone      ?? "",
          endereco:      data.endereco      ?? "",
          cidade:        data.cidade        ?? "",
          categoria:     data.categoria     ?? "",
          descricao:     data.descricao     ?? "",
          logoUrl:       data.logoUrl       ?? "",
          taxaEntrega:   String(data.taxaEntrega ?? "5.00"),
          tempoEstimado: data.tempoEstimado ?? "30-45 min",
          ativo:         data.ativo         ?? true,
        })
      )
      .catch(() => setErro("Restaurante não encontrado."))
      .finally(() => setCarregando(false));
  }, [id, isEdit]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === "checkbox" ? checked : value;

    setForm((prev) => {
      const next = { ...prev, [name]: val };
      // auto-slug quando nome muda e usuário não editou slug manualmente
      if (name === "nome" && !slugManual) {
        next.slug = toSlug(value);
      }
      return next;
    });
  };

  const handleSlugChange = (e) => {
    setSlugManual(true);
    setForm((prev) => ({ ...prev, slug: e.target.value.replace(/\s+/g, "-").toLowerCase() }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro("");
    setSucesso("");

    if (!form.nome.trim()) { setErro("Nome é obrigatório."); return; }
    if (!form.slug.trim()) { setErro("Slug é obrigatório."); return; }
    if (!form.categoria)   { setErro("Selecione uma categoria."); return; }

    const payload = {
      ...form,
      taxaEntrega: parseFloat(form.taxaEntrega) || 0,
    };

    setSalvando(true);
    try {
      if (isEdit) {
        await axios.patch(`${API}/restaurantes/${id}`, payload);
        setSucesso("Restaurante atualizado com sucesso!");
      } else {
        const { data } = await axios.post(`${API}/restaurantes`, payload);
        setSucesso("Restaurante criado! Redirecionando...");
        setTimeout(() => navigate(`/restaurante/${data.id}`), 1500);
      }
    } catch (err) {
      setErro(err.response?.data?.detail || "Erro ao salvar restaurante.");
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <span className="font-mono text-[#71717A] text-sm animate-pulse">CARREGANDO...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-[#EDEDED]">
      {/* Header */}
      <div className="border-b border-[#27272A] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/restaurantes")}
            className="font-mono text-[#71717A] text-xs hover:text-[#EDEDED] transition-colors"
          >
            ← VOLTAR
          </button>
          <span className="font-mono text-[#00E559] text-sm tracking-widest">
            {isEdit ? "EDITAR RESTAURANTE" : "NOVO RESTAURANTE"}
          </span>
        </div>
        {isEdit && (
          <button
            onClick={() => navigate(`/restaurante/${id}`)}
            className="font-mono text-xs px-3 py-1.5 border border-[#27272A] text-[#71717A] hover:border-[#00E559] hover:text-[#00E559] transition-colors"
          >
            → VER PAINEL
          </button>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* Bloco: Identidade */}
        <section className="flex flex-col gap-4">
          <span className="font-mono text-[10px] text-[#71717A] tracking-widest border-b border-[#27272A] pb-2">
            IDENTIDADE
          </span>

          <Field label="NOME DO RESTAURANTE *">
            <input
              name="nome"
              value={form.nome}
              onChange={handleChange}
              placeholder="Ex: Pizzaria do Zé"
              className={inputCls}
              required
            />
          </Field>

          <Field label="SLUG (URL) *" hint={`/restaurante/${form.slug || "meu-restaurante"}`}>
            <input
              name="slug"
              value={form.slug}
              onChange={handleSlugChange}
              placeholder="pizzaria-do-ze"
              className={inputCls}
              required
            />
          </Field>

          <Field label="CATEGORIA *">
            <select
              name="categoria"
              value={form.categoria}
              onChange={handleChange}
              className={inputCls}
              required
            >
              <option value="">Selecione...</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>

          <Field label="DESCRIÇÃO">
            <textarea
              name="descricao"
              value={form.descricao}
              onChange={handleChange}
              placeholder="Uma breve descrição do restaurante..."
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </Field>
        </section>

        {/* Bloco: Contato */}
        <section className="flex flex-col gap-4">
          <span className="font-mono text-[10px] text-[#71717A] tracking-widest border-b border-[#27272A] pb-2">
            CONTATO E LOCALIZAÇÃO
          </span>

          <Field label="TELEFONE / WHATSAPP">
            <input
              name="telefone"
              value={form.telefone}
              onChange={handleChange}
              placeholder="(11) 99999-0000"
              className={inputCls}
            />
          </Field>

          <Field label="ENDEREÇO">
            <input
              name="endereco"
              value={form.endereco}
              onChange={handleChange}
              placeholder="Rua das Flores, 123 — Bairro"
              className={inputCls}
            />
          </Field>

          <Field label="CIDADE">
            <input
              name="cidade"
              value={form.cidade}
              onChange={handleChange}
              placeholder="São Paulo - SP"
              className={inputCls}
            />
          </Field>
        </section>

        {/* Bloco: Operação */}
        <section className="flex flex-col gap-4">
          <span className="font-mono text-[10px] text-[#71717A] tracking-widest border-b border-[#27272A] pb-2">
            OPERAÇÃO
          </span>

          <div className="grid grid-cols-2 gap-4">
            <Field label="TAXA DE ENTREGA (R$)">
              <input
                name="taxaEntrega"
                type="number"
                min="0"
                step="0.50"
                value={form.taxaEntrega}
                onChange={handleChange}
                className={inputCls}
              />
            </Field>

            <Field label="TEMPO ESTIMADO">
              <input
                name="tempoEstimado"
                value={form.tempoEstimado}
                onChange={handleChange}
                placeholder="30-45 min"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="URL DO LOGO (opcional)">
            <input
              name="logoUrl"
              value={form.logoUrl}
              onChange={handleChange}
              placeholder="https://..."
              className={inputCls}
            />
            {form.logoUrl && (
              <img
                src={form.logoUrl}
                alt="preview logo"
                className="mt-2 h-16 w-16 object-cover border border-[#27272A]"
                onError={(e) => { e.target.style.display = "none"; }}
              />
            )}
          </Field>

          {isEdit && (
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div className="relative">
                <input
                  type="checkbox"
                  name="ativo"
                  checked={form.ativo}
                  onChange={handleChange}
                  className="sr-only"
                />
                <div className={`w-10 h-5 rounded-full transition-colors ${form.ativo ? "bg-[#00E559]" : "bg-[#27272A]"}`} />
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-black transition-transform ${form.ativo ? "translate-x-5.5" : "translate-x-0.5"}`} />
              </div>
              <span className="font-mono text-xs text-[#A1A1AA]">
                {form.ativo ? "RESTAURANTE ATIVO" : "RESTAURANTE INATIVO"}
              </span>
            </label>
          )}
        </section>

        {/* Feedback */}
        {erro && (
          <div className="font-mono text-xs text-[#FF4444] border border-[#FF4444]/30 bg-[#FF4444]/5 px-3 py-2 flex justify-between items-center">
            {erro}
            <button type="button" onClick={() => setErro("")} className="text-[#71717A] hover:text-[#EDEDED]">✕</button>
          </div>
        )}
        {sucesso && (
          <div className="font-mono text-xs text-[#00E559] border border-[#00E559]/30 bg-[#00E559]/5 px-3 py-2">
            ✓ {sucesso}
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={salvando}
            className="bg-[#00E559] text-black font-mono text-xs font-bold py-2.5 px-8 hover:bg-[#00c44d] transition-colors disabled:opacity-40"
          >
            {salvando ? "SALVANDO..." : isEdit ? "✓ SALVAR ALTERAÇÕES" : "+ CRIAR RESTAURANTE"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/restaurantes")}
            className="font-mono text-xs px-6 py-2.5 border border-[#27272A] text-[#71717A] hover:border-[#EDEDED] hover:text-[#EDEDED] transition-colors"
          >
            CANCELAR
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Helpers de UI ─────────────────────────────────────────────────────────────
const inputCls =
  "w-full bg-[#0A0A0A] border border-[#27272A] text-[#EDEDED] font-mono text-xs px-3 py-2 " +
  "placeholder:text-[#3F3F46] focus:outline-none focus:border-[#00E559] transition-colors";

function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] text-[#71717A] tracking-widest">{label}</span>
        {hint && <span className="font-mono text-[9px] text-[#3F3F46]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
