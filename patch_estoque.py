import re

with open('frontend/src/components/Estoque.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add new state variables after const [salvando, setSalvando] = useState(false);
old_state = '  const [salvando, setSalvando] = useState(false);\n  const fileRef = useRef();'
new_state = '''  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const fileRef = useRef();
  const editFileRef = useRef();'''
content = content.replace(old_state, new_state)

# 2. Add new functions before // Agrupa itens por categoria
old_agrupa = '  // Agrupa itens por categoria'
new_funcs = '''  const iniciarEdicao = (item) => {
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

  // Agrupa itens por categoria'''
content = content.replace(old_agrupa, new_funcs)

# 3. Modify the table row rendering to support inline editing
old_row_start = '''                    {catItens.map(item => (
                      <tr key={item.id} className={`border-b border-[#27272A] hover:bg-[#111] ${item.quantidade <= ALERTA_MINIMO ? "bg-[#FF4444]/5" : ""}`}>
                        {/* Foto */}
                        <td className="px-3 py-2">
                          {item.foto
                            ? <img src={item.foto} alt={item.nome} className="w-8 h-8 object-cover border border-[#27272A]" />
                            : <div className="w-8 h-8 bg-[#111] border border-[#27272A] flex items-center justify-center text-[#3F3F46] text-xs">—</div>}
                        </td>
                        {/* ID */}
                        <td className="px-3 py-2 font-mono text-[10px] text-[#3F3F46] max-w-[80px]">
                          <span title={item.id} className="truncate block">{String(item.id).slice(0, 8)}…</span>
                        </td>
                        {/* Nome */}
                        <td className="px-3 py-2 font-mono text-sm text-[#EDEDED]">
                          {item.nome}
                          {item.quantidade <= ALERTA_MINIMO && (
                            <span className="ml-2 font-mono text-[10px] text-[#FF4444]">⚠ pouco estoque</span>
                          )}
                        </td>
                        {/* Quantidade */}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => atualizarQtd(item.id, -1)}
                              className="font-mono text-xs w-6 h-6 border border-[#27272A] text-[#71717A] hover:border-[#FF4444] hover:text-[#FF4444] flex items-center justify-center">−</button>
                            <span className={`font-mono text-sm w-8 text-center ${item.quantidade <= ALERTA_MINIMO ? "text-[#FF4444] font-bold" : "text-[#EDEDED]"}`}>
                              {item.quantidade}
                            </span>
                            <button onClick={() => atualizarQtd(item.id, 1)}
                              className="font-mono text-xs w-6 h-6 border border-[#27272A] text-[#71717A] hover:border-[#00E559] hover:text-[#00E559] flex items-center justify-center">+</button>
                          </div>
                        </td>
                        {/* Custo */}
                        <td className="px-3 py-2 font-mono text-xs text-[#71717A]">R$ {Number(item.precoCusto).toFixed(2)}</td>
                        {/* Venda */}
                        <td className="px-3 py-2 font-mono text-sm text-[#00E559]">
                          R$ {Number(item.precoVenda).toFixed(2)}{item.porKg ? "/kg" : ""}
                        </td>
                        {/* Tipo */}
                        <td className="px-3 py-2 font-mono text-xs text-[#71717A]">{item.porKg ? "POR KG" : "UNIDADE"}</td>
                        {/* Ações */}
                        <td className="px-3 py-2">
                          <button onClick={() => removerItem(item.id)}
                            className="font-mono text-xs text-[#FF4444] hover:text-red-300">✕</button>
                        </td>
                      </tr>
                    ))}'''

new_row = '''                    {catItens.map(item => {
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
                    })}'''
content = content.replace(old_row_start, new_row)

with open('frontend/src/components/Estoque.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Estoque.jsx updated successfully')
