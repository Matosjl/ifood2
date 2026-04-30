import os

FILE_PATH = os.path.join("frontend", "src", "components", "DigitalMenu.jsx")

content = r'''import { useState, useRef } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

const MOCK_ITEMS = [
  { id: 1, name: "X-Burguer Especial", description: "Pão brioche, 180g de carne, queijo cheddar, alface e tomate", category: "Lanches", salePrice: 28.9 },
  { id: 2, name: "X-Bacon Duplo", description: "Dois hambúrgueres, bacon crocante, queijo prato e molho especial", category: "Lanches", salePrice: 34.9 },
  { id: 3, name: "Pizza Margherita", description: "Molho de tomate, mussarela e manjericão fresco", category: "Pizzas", salePrice: 49.9 },
  { id: 4, name: "Coca-Cola 350ml", description: "Lata gelada", category: "Bebidas", salePrice: 6.9 },
  { id: 5, name: "Suco de Laranja", description: "Natural, 500ml", category: "Bebidas", salePrice: 9.9 },
];

const PDF_CATEGORIAS = ["Lanches", "Pizzas", "Bebidas", "Sobremesas", "Entradas", "Pratos Principais", "Combos", "Outros"];

export function DigitalMenu({ items = MOCK_ITEMS, restaurantName = "Restaurante", restauranteId = "", isOwner = false }) {
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfItens, setPdfItens] = useState([]);
  const [categoriaMap, setCategoriaMap] = useState({});
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const pdfRef = useRef();

  const grouped = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const handlePdfChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfFile(file);
    setPdfError("");
    processarPdf(file);
  };

  const processarPdf = async (file) => {
    setPdfLoading(true);
    setPdfItens([]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("restauranteId", restauranteId || "local");
      const { data } = await axios.post(`${API}/cardapio/pdf-upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 30000,
      });
      if (data.itensDetectados?.length > 0) {
        setPdfItens(data.itensDetectados);
        const map = {};
        data.itensDetectados.forEach((item, idx) => { map[idx] = item.categoria || "Outros"; });
        setCategoriaMap(map);
      } else {
        setPdfError("Nenhum item detectado no PDF. Verifique o formato.");
      }
    } catch (err) {
      setPdfError(err.response?.data?.detail || "Erro ao processar PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const importarItens = async () => {
    if (pdfItens.length === 0) return;
    const itensParaImportar = pdfItens.map((item, idx) => ({
      restauranteId: restauranteId || "local",
      categoria: categoriaMap[idx] || "Outros",
      nome: item.nome,
      quantidade: parseFloat(item.quantidade) || 0,
      precoCusto: parseFloat(item.precoCusto) || 0,
      precoVenda: parseFloat(item.precoVenda) || 0,
      porKg: false,
    }));
    try {
      await Promise.all(itensParaImportar.map(item => axios.post(`${API}/estoque`, item)));
      setPdfItens([]);
      setPdfFile(null);
      setCategoriaMap({});
      if (pdfRef.current) pdfRef.current.value = "";
      alert(`${itensParaImportar.length} itens importados com sucesso!`);
    } catch (err) {
      setPdfError("Erro ao importar itens para o estoque");
    }
  };

  return (
    <div className="flex flex-col gap-0 max-w-2xl mx-auto w-full p-6">
      <div className="text-center mb-8">
        <h1 className="font-mono text-2xl text-[#00E559] tracking-widest">{restaurantName.toUpperCase()}</h1>
        <p className="font-mono text-xs text-[#71717A] mt-1">CARDÁPIO DIGITAL</p>
      </div>
      {isOwner && (
        <div className="bg-[#0A0A0A] border border-[#27272A] p-4 mb-6 flex flex-col gap-3">
          <span className="font-mono text-xs text-[#FFB800] tracking-widest">📄 IMPORTAR CARDÁPIO VIA PDF</span>
          <span className="font-mono text-[10px] text-[#71717A]">Envie um PDF com nome, preço de compra, preço de venda e quantidade. O sistema extrairá os itens automaticamente.</span>
          <div className="flex items-center gap-2">
            <input ref={pdfRef} type="file" accept=".pdf,application/pdf" className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1.5" onChange={handlePdfChange} />
            {pdfFile && <button onClick={() => { setPdfFile(null); setPdfItens([]); setPdfError(""); if (pdfRef.current) pdfRef.current.value = ""; }} className="font-mono text-xs text-[#FF4444] hover:text-red-300 px-2">✕</button>}
          </div>
          {pdfLoading && <div className="font-mono text-xs text-[#71717A] animate-pulse">⏳ Extraindo itens do PDF...</div>}
          {pdfError && <div className="bg-[#FF4444]/10 border border-[#FF4444] px-3 py-2 font-mono text-xs text-[#FF4444]">⚠ {pdfError}</div>}
          {pdfItens.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-[#27272A] pt-3">
              <span className="font-mono text-[10px] text-[#71717A] tracking-widest">ITENS DETECTADOS ({pdfItens.length})</span>
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {pdfItens.map((item, idx) => (
                  <div key={idx} className="bg-[#111] border border-[#27272A] p-2 flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-xs text-[#EDEDED] font-bold">{item.nome}</span>
                      <span className="font-mono text-[10px] text-[#00E559]">R$ {Number(item.precoVenda).toFixed(2)}</span>
                    </div>
                    <div className="flex gap-3 font-mono text-[10px] text-[#71717A]">
                      <span>Custo: R$ {Number(item.precoCusto).toFixed(2)}</span>
                      <span>Qtd: {item.quantidade}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="font-mono text-[10px] text-[#71717A]">Categoria:</span>
                      <select value={categoriaMap[idx] || "Outros"} onChange={e => setCategoriaMap(prev => ({ ...prev, [idx]: e.target.value }))} className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-[10px] px-2 py-1 focus:outline-none focus:border-[#00E559]">
                        {PDF_CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                ))}
              </div>
              <button onClick={importarItens} className="w-full py-2 bg-[#00E559] text-black font-mono text-xs font-bold hover:bg-[#00c44d] transition-colors mt-2">✓ IMPORTAR {pdfItens.length} ITENS PARA O ESTOQUE</button>
            </div>
          )}
        </div>
      )}
      {Object.entries(grouped).map(([category, categoryItems]) => (
        <div key={category} className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-mono text-xs text-[#FFB800] tracking-widest">{category.toUpperCase()}</span>
            <div className="flex-1 h-px bg-[#27272A]" />
          </div>
          <div className="flex flex-col gap-3">
            {categoryItems.map((item) => (
              <div key={item.id} className="bg-[#0A0A0A] border border-[#27272A] flex hover:border-[#3F3F46] transition-colors overflow-hidden">
                {item.photo && <img src={item.photo} alt={item.name} className="w-20 h-20 object-cover shrink-0" />}
                <div className="flex justify-between items-start p-4 flex-1 min-w-0">
                  <div className="flex flex-col gap-1 flex-1 mr-4">
                    <span className="font-mono text-sm text-[#EDEDED]">{item.name}</span>
                    {item.description && <span className="font-mono text-xs text-[#71717A] leading-relaxed">{item.description}</span>}
                  </div>
                  <span className="font-mono text-sm text-[#00E559] whitespace-nowrap">R$ {Number(item.salePrice).toFixed(2).replace(".", ",")}</span>
                </div>
            ))}
          </div>
      ))}
      {items.length === 0 && <div className="text-center py-16 font-mono text-xs text-[#71717A]">NENHUM ITEM NO CARDÁPIO</div>}
    </div>
  );
}
'''

if __name__ == "__main__":
    with open(FILE_PATH, "w", encoding="utf-8") as f:
        f.write(content)
        f.flush()
    print(f"Arquivo {FILE_PATH} escrito com sucesso ({len(content)} caracteres).")
