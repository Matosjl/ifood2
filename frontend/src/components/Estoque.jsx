import { useState } from "react";

const ALERTA_MINIMO = 5;

const emptyItem = {
  nome: "", categoria: "", quantidade: "", precoCusto: "", precoVenda: "", porKg: false,
};

export function Estoque({ onEstoqueAtualizado }) {
  const [categorias, setCategorias] = useState([
    { id: 1, nome: "Lanches", itens: [] },
    { id: 2, nome: "Bebidas", itens: [] },
    { id: 3, nome: "Padaria", itens: [] },
  ]);
  const [novaCategoria, setNovaCategoria] = useState("");
  const [form, setForm] = useState(emptyItem);
  const [alertas, setAlertas] = useState([]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const adicionarCategoria = () => {
    if (!novaCategoria.trim()) return;
    setCategorias(prev => [...prev, { id: Date.now(), nome: novaCategoria.trim(), itens: [] }]);
    setNovaCategoria("");
  };

  const adicionarItem = () => {
    if (!form.nome || !form.categoria || !form.quantidade || !form.precoVenda) return;
    const qtd = parseFloat(form.quantidade);
    const novoItem = {
      id: Date.now(),
      nome: form.nome,
      quantidade: qtd,
      precoCusto: parseFloat(form.precoCusto) || 0,
      precoVenda: parseFloat(form.precoVenda),
      porKg: form.porKg,
    };

    const updated = categorias.map(cat =>
      cat.nome === form.categoria ? { ...cat, itens: [...cat.itens, novoItem] } : cat
    );
    setCategorias(updated);

    if (qtd <= ALERTA_MINIMO) {
      const msg = `⚠ ALERTA: "${form.nome}" está com apenas ${qtd} unidade(s) em estoque!`;
      setAlertas(prev => [msg, ...prev]);
    }

    onEstoqueAtualizado?.(updated.flatMap(c => c.itens.map(i => ({ ...i, category: c.nome }))));
    setForm(emptyItem);
  };

  const atualizarQtd = (catId, itemId, delta) => {
    const updated = categorias.map(cat => {
      if (cat.id !== catId) return cat;
      return {
        ...cat,
        itens: cat.itens.map(item => {
          if (item.id !== itemId) return item;
          const novaQtd = Math.max(0, item.quantidade + delta);
          if (novaQtd <= ALERTA_MINIMO && item.quantidade > ALERTA_MINIMO) {
            setAlertas(prev => [`⚠ ALERTA: "${item.nome}" chegou a ${novaQtd} unidade(s)!`, ...prev]);
          }
          return { ...item, quantidade: novaQtd };
        }),
      };
    });
    setCategorias(updated);
  };

  const removerItem = (catId, itemId) => {
    setCategorias(prev => prev.map(cat =>
      cat.id === catId ? { ...cat, itens: cat.itens.filter(i => i.id !== itemId) } : cat
    ));
  };

  return (
    <div className="flex flex-col gap-4 p-4 max-w-4xl mx-auto w-full">
      <h2 className="font-mono text-[#00E559] text-sm tracking-widest">ESTOQUE</h2>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="bg-[#FF4444]/10 border border-[#FF4444] p-3 flex flex-col gap-1">
          {alertas.slice(0, 3).map((a, i) => (
            <span key={i} className="font-mono text-xs text-[#FF4444]">{a}</span>
          ))}
          {alertas.length > 3 && (
            <button onClick={() => setAlertas([])} className="font-mono text-[10px] text-[#71717A] self-start hover:text-[#EDEDED]">
              + {alertas.length - 3} alertas — LIMPAR
            </button>
          )}
        </div>
      )}

      {/* Adicionar item */}
      <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-3">
        <span className="font-mono text-xs text-[#71717A] tracking-widest">ADICIONAR PRODUTO</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
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
              <input type="checkbox" checked={form.porKg} onChange={e => set("porKg", e.target.checked)}
                className="accent-[#00E559]" />
              <span className="font-mono text-xs text-[#71717A]">PREÇO POR KG (padaria)</span>
            </label>
          </div>
        </div>
        <button onClick={adicionarItem}
          className="bg-[#00E559] text-black font-mono text-xs font-bold py-2 px-6 hover:bg-[#00c44d] transition-colors self-start">
          + ADICIONAR PRODUTO
        </button>
      </div>

      {/* Nova categoria */}
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

      {/* Tabela por categoria */}
      {categorias.map(cat => (
        <div key={cat.id} className="bg-[#0A0A0A] border border-[#27272A]">
          <div className="px-4 py-3 border-b border-[#27272A] flex items-center gap-2">
            <span className="font-mono text-xs text-[#FFB800] tracking-widest">{cat.nome.toUpperCase()}</span>
            <span className="font-mono text-[10px] text-[#3F3F46]">({cat.itens.length} itens)</span>
          </div>
          {cat.itens.length === 0 ? (
            <div className="px-4 py-3 font-mono text-xs text-[#3F3F46]">Nenhum produto nesta categoria.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-[#27272A]">
                    {["PRODUTO", "QUANTIDADE", "CUSTO", "VENDA", "TIPO", "AÇÕES"].map(h => (
                      <th key={h} className="px-4 py-2 text-left font-mono text-xs text-[#71717A]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cat.itens.map(item => (
                    <tr key={item.id} className={`border-b border-[#27272A] hover:bg-[#111] ${item.quantidade <= ALERTA_MINIMO ? "bg-[#FF4444]/5" : ""}`}>
                      <td className="px-4 py-2 font-mono text-sm text-[#EDEDED]">{item.nome}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => atualizarQtd(cat.id, item.id, -1)}
                            className="font-mono text-xs w-6 h-6 border border-[#27272A] text-[#71717A] hover:border-[#FF4444] hover:text-[#FF4444] flex items-center justify-center">−</button>
                          <span className={`font-mono text-sm w-8 text-center ${item.quantidade <= ALERTA_MINIMO ? "text-[#FF4444]" : "text-[#EDEDED]"}`}>
                            {item.quantidade}
                          </span>
                          <button onClick={() => atualizarQtd(cat.id, item.id, 1)}
                            className="font-mono text-xs w-6 h-6 border border-[#27272A] text-[#71717A] hover:border-[#00E559] hover:text-[#00E559] flex items-center justify-center">+</button>
                          {item.quantidade <= ALERTA_MINIMO && <span className="text-[#FF4444] text-xs">⚠</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-[#71717A]">R$ {item.precoCusto.toFixed(2)}</td>
                      <td className="px-4 py-2 font-mono text-sm text-[#00E559]">
                        R$ {item.precoVenda.toFixed(2)}{item.porKg ? "/kg" : ""}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-[#71717A]">{item.porKg ? "POR KG" : "UNIDADE"}</td>
                      <td className="px-4 py-2">
                        <button onClick={() => removerItem(cat.id, item.id)}
                          className="font-mono text-xs text-[#FF4444] hover:text-red-300">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
