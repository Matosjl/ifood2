import { useState, useRef } from "react";

const CATEGORIES = ["Lanches", "Pizzas", "Bebidas", "Sobremesas", "Entradas", "Pratos Principais", "Combos", "Outros"];

const emptyForm = { name: "", description: "", category: "", costPrice: "", salePrice: "" };

export function MenuItemForm({ onAdd }) {
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([]);
  const [photo, setPhoto] = useState(null); // base64 preview
  const fileRef = useRef();

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhoto(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.salePrice || !form.category) return;
    const newItem = {
      ...form,
      id: Date.now(),
      photo,
      costPrice: parseFloat(form.costPrice) || 0,
      salePrice: parseFloat(form.salePrice),
    };
    const updated = [newItem, ...items];
    setItems(updated);
    onAdd?.(newItem);
    setForm(emptyForm);
    setPhoto(null);
  };

  const margin = (item) => {
    if (!item.costPrice || !item.salePrice) return null;
    return (((item.salePrice - item.costPrice) / item.salePrice) * 100).toFixed(1);
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-4xl mx-auto w-full">
      <form onSubmit={handleSubmit} className="bg-[#0A0A0A] border border-[#27272A] p-4 sm:p-6 flex flex-col gap-4">
        <h2 className="font-mono text-[#00E559] text-sm tracking-widest">ADICIONAR ITEM AO CARDÁPIO</h2>

        {/* Photo upload — proporção 9:16 (celular) */}
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-[#71717A]">FOTO DO ITEM</label>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            {/* Preview box — aspect-ratio 9/16 */}
            <div
              className="relative bg-[#111] border border-[#27272A] overflow-hidden cursor-pointer hover:border-[#00E559] transition-colors flex items-center justify-center"
              style={{ width: "min(160px, 45vw)", aspectRatio: "9/16" }}
              onClick={() => fileRef.current?.click()}
            >
              {photo ? (
                <img src={photo} alt="preview" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-center px-2">
                  <span className="text-[#3F3F46] text-2xl">📷</span>
                  <span className="font-mono text-[10px] text-[#3F3F46] leading-tight">TOQUE PARA<br />ADICIONAR<br />FOTO</span>
                </div>
              )}
              {photo && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPhoto(null); fileRef.current.value = ""; }}
                  className="absolute top-1 right-1 bg-black/70 text-[#FF4444] font-mono text-xs px-1 hover:bg-black"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2 justify-end">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="font-mono text-xs px-3 py-2 border border-[#27272A] text-[#71717A] hover:border-[#00E559] hover:text-[#00E559] transition-colors"
              >
                {photo ? "TROCAR FOTO" : "+ SELECIONAR FOTO"}
              </button>
              <span className="font-mono text-[10px] text-[#3F3F46]">Proporção 9:16 · Responsivo</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhoto}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">NOME DO ITEM *</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Ex: X-Burguer Especial"
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">CATEGORIA *</label>
            <select
              name="category"
              value={form.category}
              onChange={handleChange}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]"
              required
            >
              <option value="">Selecionar...</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="font-mono text-xs text-[#71717A]">DESCRIÇÃO</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Descreva o item..."
              rows={2}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559] resize-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">VALOR DE CUSTO (R$)</label>
            <input
              name="costPrice"
              type="number"
              step="0.01"
              min="0"
              value={form.costPrice}
              onChange={handleChange}
              placeholder="0,00"
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">VALOR DE VENDA (R$) *</label>
            <input
              name="salePrice"
              type="number"
              step="0.01"
              min="0"
              value={form.salePrice}
              onChange={handleChange}
              placeholder="0,00"
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]"
              required
            />
          </div>
        </div>

        {form.costPrice && form.salePrice && (
          <div className="font-mono text-xs text-[#FFB800]">
            MARGEM: {(((parseFloat(form.salePrice) - parseFloat(form.costPrice)) / parseFloat(form.salePrice)) * 100).toFixed(1)}%
          </div>
        )}

        <button
          type="submit"
          className="bg-[#00E559] text-black font-mono text-xs font-bold py-2 px-6 hover:bg-[#00c44d] transition-colors self-start"
        >
          + ADICIONAR ITEM
        </button>
      </form>

      {items.length > 0 && (
        <div className="bg-[#0A0A0A] border border-[#27272A]">
          <div className="px-6 py-3 border-b border-[#27272A] font-mono text-xs text-[#71717A]">
            ITENS ADICIONADOS ({items.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-[#27272A]">
                  {["FOTO", "NOME", "CATEGORIA", "CUSTO", "VENDA", "MARGEM"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left font-mono text-xs text-[#71717A]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-[#27272A] hover:bg-[#111]">
                    <td className="px-4 py-2">
                      {item.photo ? (
                        <img src={item.photo} alt={item.name} className="w-8 h-14 object-cover border border-[#27272A]" style={{ aspectRatio: "9/16" }} />
                      ) : (
                        <div className="w-8 h-14 bg-[#111] border border-[#27272A] flex items-center justify-center text-[#3F3F46] text-xs">—</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-[#EDEDED]">{item.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#71717A]">{item.category}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#71717A]">R$ {item.costPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 font-mono text-sm text-[#00E559]">R$ {item.salePrice.toFixed(2)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#FFB800]">{margin(item) ? `${margin(item)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
