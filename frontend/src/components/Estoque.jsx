import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;
const ALERTA_MINIMO = 5;

const emptyItem = {
  nome: "", categoria: "", quantidade: "", precoCusto: "", precoVenda: "", porKg: false, foto: null,
};

export function Estoque({ restauranteId, onEstoqueAtualizado, onItemAdicionado }) {
  const [categorias, setCategorias] = useState([
    { id: 1, nome: "Lanches" },
    { id: 2, nome: "Bebidas" },
    { id: 3, nome: "Padaria" },
  ]);
  const [itens, setItens] = useState([]); // todos os itens flat, vindos do backend
  const [novaCategoria, setNovaCategoria] = useState("");
  const [form, setForm] = useState(emptyItem);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const fileRef = useRef();
  const editFileRef = useRef();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Carrega itens do backend ao montar
  const carregarItens = useCallback(async () => {
    if (!restauranteId) return;
    try {
      const { data } = await axios.get(`${API}/estoque/${restauranteId}`);
      setItens(data || []);
      // Reconstrói categorias a partir dos dados salvos
      const cats = [...new Set(data.map(i => i.categoria))];
      setCategorias(prev => {
        const existentes = prev.map(c => c.nome);
        const novas = cats.filter(c => !existentes.includes(c)).map((c, i) => ({ id: Date.now() + i, nome: c }));
        return [...prev, ...novas];
      });
      onEstoqueAtualizado?.(data.map(i => ({ ...i, category: i.categoria, name: i.nome, salePrice: i.precoVenda, costPrice: i.precoCusto })));
    } catch (err) {
      console.error("Erro carregar estoque:", err);
    }
  }, [restauranteId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregarItens(); }, [carregarItens]);

  // Itens com estoque baixo (alerta constante)
  const itensBaixoEstoque = itens.filter(i => i.quantidade <= ALERTA_MINIMO);

  const adicionarCategoria = () => {
    if (!novaCategoria.trim()) return;
    setCategorias(prev => [...prev, { id: Date.now(), nome: novaCategoria.trim() }]);
    setNovaCategoria("");
  };

  const adicionarItem = async () => {
    if (!form.nome || !form.categoria || !form.quantidade || !form.precoVenda) return;
    setSalvando(true);
    const fotoLocal = form.foto || null;
    const payload = {
      categoria: form.categoria,
      nome: form.nome,
      quantidade: parseFloat(form.quantidade),
      precoCusto: parseFloat(form.precoCusto) || 0,
      precoVenda: parseFloat(form.precoVenda),
      porKg: form.porKg,
    };
    try {
      const { data: salvo } = await axios.post(`${API}/estoque?restaurante_id=${restauranteId}`, payload);
      const itemFinal = { ...salvo, foto: fotoLocal };
      const novosItens = [...itens, itemFinal];
      setItens(novosItens);
      onEstoqueAtualizado?.(novosItens.map(i => ({ ...i, category: i.categoria, name: i.nome, salePrice: i.precoVenda, costPrice: i.precoCusto })));
      onItemAdicionado?.(itemFinal, itemFinal.categoria);
    } catch (err) {
      console.error("Erro adicionar item:", err);
      const salvoLocal = { ...payload, id: String(Date.now()), foto: fotoLocal, restauranteId, criadoEm: new Date().toISOString() };
      const novosItens = [...itens, salvoLocal];
      setItens(novosItens);
      onEstoqueAtualizado?.(novosItens.map(i => ({ ...i, category: i.categoria, name: i.nome, salePrice: i.precoVenda, costPrice: i.precoCusto })));
      onItemAdicionado?.(salvoLocal, salvoLocal.categoria);
    } finally {
      setForm(emptyItem);
      if (fileRef.current) fileRef.current.value = "";
      setSalvando(false);
    }
  };

  const atualizarQtd = async (itemId, delta) => {
    const item = itens.find(i => i.id === itemId);
    if (!item) return;
    const novaQtd = Math.max(0, item.quantidade + delta);
    setItens(prev => prev.map(i => i.id === itemId ? { ...i, quantidade: novaQtd } : i));
    try {
      await axios.patch(`${API}/estoque/${itemId}`, { quantidade: novaQtd });
    } catch (err) {
      console.error("Erro atualizar quantidade:", err);
    }
  };

  const removerItem = async (itemId) => {
    setItens(prev => prev.filter(i => i.id !== itemId));
    try {
      await axios.delete(`${API}/estoque/${itemId}`);
    } catch {}
  };

  const handleFoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set("foto", ev.target.result);
    reader.readAsDataURL(file);
  };

  const iniciarEdicao = (item) => {
    setEditandoId(item.id);
    setEditForm({
      nome: item.nome,
      categoria: item.categoria,
      quantidade: item.quantidade,
      precoCusto: item.precoCusto,
      precoVenda: item.precoVenda,
      porKg: item.porKg,
      foto: item.foto || null,
    });
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setEditForm({});
    if (editFileRef.current) editFileRef.current.value = "";
  };

  const salvarEdicao = async (itemId) => {
    const payload = {
      nome: editForm.nome,
      categoria: editForm.categoria,
      quantidade: parseFloat(editForm.quantidade),
      precoCusto: parseFloat(editForm.precoCusto) || 0,
      precoVenda: parseFloat(editForm.precoVenda),
      porKg: editForm.porKg,
      foto: editForm.foto,
    };
    const updates = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined && v !== ""));

    setItens(prev => prev.map(i => i.id === itemId ? { ...i, ...updates } : i));
    try {
      await axios.patch(`${API}/estoque/${itemId}`, updates);
    } catch {}
    setEditandoId(null);
    setEditForm({});
    if (editFileRef.current) editFileRef.current.value = "";
  };

  const handleEditFoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setEditForm(f => ({ ...f, foto: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const iniciarEdicao = (item) => {
    setEditandoId(item.id);
    setEditForm({
      nome: item.nome,
      categoria: item.categoria,
      quantidade: item.quantidade,
      precoCusto: item.precoCusto,
      precoVenda: item.precoVenda,
      porKg: item.porKg,
      foto: item.foto || null,
    });
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setEditForm({});
    if (editFileRef.current) editFileRef.current.value = "";
  };

  const salvarEdicao = async (itemId) => {
    const payload = {
      nome: editForm.nome,
      categoria: editForm.categoria,
      quantidade: parseFloat(editForm.quantidade),
      precoCusto: parseFloat(editForm.precoCusto) || 0,
      precoVenda: parseFloat(editForm.precoVenda),
      porKg: editForm.porKg,
      foto: editForm.foto,
    };
    const updates = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined && v !== ""));

    setItens(prev => prev.map(i => i.id === itemId ? { ...i, ...updates } : i));
    try {
      await axios.patch(`${API}/estoque/${itemId}`, updates);
    } catch {}
    setEditandoId(null);
    setEditForm({});
    if (editFileRef.current) editFileRef.current.value = "";
  };

  const handleEditFoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setEditForm(f => ({ ...f, foto: ev.target.result }));
    reader.readAsDataURL(file);
  };

  // Agrupa itens por categoria
  const itensPorCategoria = (nomeCategoria) => itens.filter(i => i.categoria === nomeCategoria);

  return (
    <div className="flex flex-col gap-4 p-4 max-w-5xl mx-auto w-full">
      <h2 className="font-mono text-[#00E559] text-sm tracking-widest">ESTOQUE</h2>

      {/* ── Alerta constante de estoque baixo ── */}
      {itensBaixoEstoque.length > 0 && (
        <div className="bg-[#FF4444]/10 border border-[#FF4444] p-3 flex flex-col gap-1.5">
          <span className="font-mono text-[10px] text-[#FF4444] tracking-widest font-bold">⚠ ESTOQUE BAIXO — REPOSIÇÃO NECESSÁRIA</span>
          {itensBaixoEstoque.map(item => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="font-mono text-xs text-[#FF4444]">
                • <span className="font-bold">{item.nome}</span> ({item.categoria}) — apenas <span className="font-bold">{item.quantidade}</span> unidade{item.quantidade !== 1 ? "s" : ""} restante{item.quantidade !== 1 ? "s" : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Formulário adicionar produto ── */}
      <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-3">
        <span className="font-mono text-xs text-[#71717A] tracking-widest">ADICIONAR PRODUTO</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">

          {/* Foto */}
          <div className="flex flex-col gap-1 sm:col-span-2 md:col-span-3">
            <label className="font-mono text-xs text-[#71717A]">FOTO DO PRODUTO</label>
            <div className="flex items-center gap-3">
              <div
                onClick={() => fileRef.current?.click()}
                className="w-16 h-16 bg-[#111] border border-[#27272A] flex items-center justify-center cursor-pointer hover:border-[#00E559] transition-colors overflow-hidden shrink-0"
              >
                {form.foto
                  ? <img src={form.foto} alt="preview" className="w-full h-full object-cover" />
                  : <span className="text-[#3F3F46] text-xl">📷</span>}
              </div>
              <div className="flex flex-col gap-1">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="font-mono text-[10px] px-3 py-1.5 border border-[#27272A] text-[#71717A] hover:border-[#00E559] hover:text-[#00E559] transition-colors self-start">
                  {form.foto ? "TROCAR FOTO" : "+ SELECIONAR FOTO"}
                </button>
                {form.foto && (
                  <button type="button" onClick={() => { set("foto", null); if (fileRef.current) fileRef.current.value = ""; }}
                    className="font-mono text-[10px] text-[#FF4444] self-start">✕ REMOVER</button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFoto} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">NOME *</label>
            <input value={form.nome} onChange={e => set("nome", e.target.value)}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]"
              placeholder="Nome do produto" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">CATEGORIA *</label>
            <select value={form.categoria} onChange={e => set("categoria", e.target.value)}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]">
              <option value="">Selecionar...</option>
              {categorias.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">QUANTIDADE *</label>
            <input type="number" min="0" value={form.quantidade} onChange={e => set("quantidade", e.target.value)}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]"
              placeholder="0" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">PREÇO DE CUSTO (R$)</label>
            <input type="number" step="0.01" min="0" value={form.precoCusto} onChange={e => set("precoCusto", e.target.value)}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]"
              placeholder="0,00" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">PREÇO DE VENDA (R$) *</label>
            <input type="number" step="0.01" min="0" value={form.precoVenda} onChange={e => set("precoVenda", e.target.value)}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]"
              placeholder="0,00" />
          </div>

          <div className="flex flex-col gap-1 justify-end">
            <label className="flex items-center gap-2 cursor-pointer h-full pb-2">
              <input type="checkbox" checked={form.porKg} onChange={e => set("porKg", e.target.checked)} className="accent-[#00E559]" />
              <span className="font-mono text-xs text-[#71717A]">PREÇO POR KG (padaria)</span>
            </label>
          </div>
        </div>

        <button onClick={adicionarItem} disabled={salvando}
          className="bg-[#00E559] text-black font-mono text-xs font-bold py-2 px-6 hover:bg-[#00c44d] transition-colors self-start disabled:opacity-40">
          {salvando ? "SALVANDO..." : "+ ADICIONAR PRODUTO"}
        </button>
      </div>

      {/* ── Nova categoria ── */}
      <div className="flex gap-2">
        <input value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)}
          onKeyDown={e => e.key === "Enter" && adicionarCategoria()}
          className="bg-[#0A0A0A] border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559] flex-1"
          placeholder="Nova categoria..." />
        <button onClick={adicionarCategoria}
          className="font-mono text-xs px-4 py-2 border border-[#27272A] text-[#71717A] hover:border-[#00E559] hover:text-[#00E559] transition-colors">
          + CATEGORIA
        </button>
      </div>

      {/* ── Tabelas por categoria ── */}
      {categorias.map(cat => {
        const catItens = itensPorCategoria(cat.nome);
        return (
          <div key={cat.id} className="bg-[#0A0A0A] border border-[#27272A]">
            {/* Header da categoria */}
            <div className="px-4 py-3 border-b border-[#27272A] flex items-center gap-2">
              <span className="font-mono text-xs text-[#FFB800] tracking-widest">{cat.nome.toUpperCase()}</span>
              <span className="font-mono text-[10px] text-[#3F3F46]">({catItens.length} itens)</span>
              {catItens.some(i => i.quantidade <= ALERTA_MINIMO) && (
                <span className="font-mono text-[10px] text-[#FF4444] border border-[#FF4444]/40 px-1.5 py-0.5 ml-1">⚠ ESTOQUE BAIXO</span>
              )}
            </div>

            {catItens.length === 0 ? (
              <div className="px-4 py-3 font-mono text-xs text-[#3F3F46]">Nenhum produto nesta categoria.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="border-b border-[#27272A]">
                      {["FOTO", "ID", "NOME", "QUANTIDADE", "CUSTO", "VENDA", "TIPO", "AÇÕES"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-mono text-[10px] text-[#71717A]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {catItens.map(item => {
                      const isEditing = editandoId === item.id;
                      return (
                        <tr key={item.id} className={`border-b border-[#27272A] hover:bg-[#111] ${item.quantidade <= ALERTA_MINIMO ? "bg-[#FF4444]/5" : ""}`}>
                          {/* Foto */}
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <div className="flex flex-col gap-1">
                                <div
                                  onClick={() => editFileRef.current?.click()}
                                  className="w-8 h-8 bg-[#111] border border-[#27272A] flex items-center justify-center cursor-pointer hover:border-[#00E559] overflow-hidden"
                                >
                                  {editForm.foto
                                    ? <img src={editForm.foto} alt="preview" className="w-full h-full object-cover" />
                                    : <span className="text-[#3F3F46] text-xs">📷</span>}
                                </div>
                                <input ref={editFileRef} type="file" accept="image/*" className="hidden" onChange={handleEditFoto} />
                              </div>
                            ) : (
                              item.foto
                                ? <img src={item.foto} alt={item.nome} className="w-8 h-8 object-cover border border-[#27272A]" />
                                : <div className="w-8 h-8 bg-[#111] border border-[#27272A] flex items-center justify-center text-[#3F3F46] text-xs">—</div>
                            )}
                          </td>
                          {/* ID */}
                          <td className="px-3 py-2 font-mono text-[10px] text-[#3F3F46] max-w-[80px]">
                            <span title={item.id} className="truncate block">{String(item.id).slice(0, 8)}…</span>
                          </td>
                          {/* Nome */}
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <input
                                value={editForm.nome}
                                onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))}
                                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1 w-full focus:outline-none focus:border-[#00E559]"
                              />
                            ) : (
                              <span className="font-mono text-sm text-[#EDEDED]">
                                {item.nome}
                                {item.quantidade <= ALERTA_MINIMO && (
                                  <span className="ml-2 font-mono text-[10px] text-[#FF4444]">⚠ pouco estoque</span>
                                )}
                              </span>
                            )}
                          </td>
                          {/* Quantidade */}
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <input
                                type="number"
                                min="0"
                                value={editForm.quantidade}
                                onChange={e => setEditForm(f => ({ ...f, quantidade: e.target.value }))}
                                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1 w-20 focus:outline-none focus:border-[#00E559]"
                              />
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => atualizarQtd(item.id, -1)}
                                  className="font-mono text-xs w-6 h-6 border border-[#27272A] text-[#71717A] hover:border-[#FF4444] hover:text-[#FF4444] flex items-center justify-center">−</button>
                                <span className={`font-mono text-sm w-8 text-center ${item.quantidade <= ALERTA_MINIMO ? "text-[#FF4444] font-bold" : "text-[#EDEDED]"}`}>
                                  {item.quantidade}
                                </span>
                                <button onClick={() => atualizarQtd(item.id, 1)}
                                  className="font-mono text-xs w-6 h-6 border border-[#27272A] text-[#71717A] hover:border-[#00E559] hover:text-[#00E559] flex items-center justify-center">+</button>
                              </div>
                            )}
                          </td>
                          {/* Custo */}
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editForm.precoCusto}
                                onChange={e => setEditForm(f => ({ ...f, precoCusto: e.target.value }))}
                                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1 w-24 focus:outline-none focus:border-[#00E559]"
                              />
                            ) : (
                              <span className="font-mono text-xs text-[#71717A]">R$ {Number(item.precoCusto).toFixed(2)}</span>
                            )}
                          </td>
                          {/* Venda */}
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editForm.precoVenda}
                                onChange={e => setEditForm(f => ({ ...f, precoVenda: e.target.value }))}
                                className="bg-black border border-[#27272A] text-[#00E559] font-mono text-xs px-2 py-1 w-24 focus:outline-none focus:border-[#00E559]"
                              />
                            ) : (
                              <span className="font-mono text-sm text-[#00E559]">
                                R$ {Number(item.precoVenda).toFixed(2)}{item.porKg ? "/kg" : ""}
                              </span>
                            )}
                          </td>
                          {/* Tipo */}
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <div className="flex flex-col gap-1">
                                <select
                                  value={editForm.categoria}
                                  onChange={e => setEditForm(f => ({ ...f, categoria: e.target.value }))}
                                  className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1 focus:outline-none focus:border-[#00E559]"
                                >
                                  {categorias.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                                </select>
                                <label className="flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={editForm.porKg}
                                    onChange={e => setEditForm(f => ({ ...f, porKg: e.target.checked }))}
                                    className="accent-[#00E559] w-3 h-3"
                                  />
                                  <span className="font-mono text-[10px] text-[#71717A]">por kg</span>
                                </label>
                              </div>
                            ) : (
                              <span className="font-mono text-xs text-[#71717A]">{item.porKg ? "POR KG" : "UNIDADE"}</span>
                            )}
                          </td>
                          {/* Ações */}
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => salvarEdicao(item.id)}
                                  className="font-mono text-[10px] text-[#00E559] hover:text-[#00c44d]">✓</button>
                                <button onClick={cancelarEdicao}
                                  className="font-mono text-[10px] text-[#FF4444] hover:text-red-300">✕</button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => iniciarEdicao(item)}
                                  className="font-mono text-xs text-[#FFB800] hover:text-[#FFD700]">✎</button>
                                <button onClick={() => removerItem(item.id)}
                                  className="font-mono text-xs text-[#FF4444] hover:text-red-300">✕</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
