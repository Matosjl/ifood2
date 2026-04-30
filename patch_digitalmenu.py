with open('frontend/src/components/DigitalMenu.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add imports and state for PDF upload
old_imports = '''const MOCK_ITEMS = ['''
new_imports = '''import { useState, useRef } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

const MOCK_ITEMS = ['''
content = content.replace(old_imports, new_imports)

# Replace the component function to add PDF upload functionality
old_component = '''export function DigitalMenu({ items = MOCK_ITEMS, restaurantName = "Restaurante" }) {
  const grouped = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return ('''
new_component = '''export function DigitalMenu({ items = MOCK_ITEMS, restaurantName = "Restaurante", restauranteId = "", isOwner = false }) {
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfItens, setPdfItens] = useState([]);
  const [pdfCategorias, setPdfCategorias] = useState([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [categoriaMap, setCategoriaMap] = useState({});
  const pdfRef = useRef();

  const grouped = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const handlePdfChange = (e) => {
    const file = e.target.files?.[0];
    if (file) setPdfFile(file);
  };

  const processarPdf = async () => {
    if (!pdfFile || !restauranteId) return;
    setPdfLoading(true);
    setPdfError("");
    setPdfItens([]);
    const formData = new FormData();
    formData.append("file", pdfFile);
    formData.append("restauranteId", restauranteId);
    try {
      const { data } = await axios.post(`${API}/cardapio/pdf-upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 30000,
      });
      setPdfItens(data.itensDetectados || []);
      setPdfCategorias(data.categoriasDetectadas || []);
      const map = {};
      (data.itensDetectados || []).forEach((item, idx) => {
        map[idx] = item.categoria || "Outros";
      });
      setCategoriaMap(map);
    } catch (err) {
      setPdfError(err.response?.data?.detail || "Erro ao processar PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const importarItens = async () => {
    if (!restauranteId || pdfItens.length === 0) return;
    const itensParaImportar = pdfItens.map((item, idx) => ({
      restauranteId,
      categoria: categoriaMap[idx] || item.categoria || "Outros",
      nome: item.nome,
      quantidade: parseFloat(item.quantidade) || 0,
      precoCusto: parseFloat(item.precoCompra) || 0,
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

  return ('''
content = content.replace(old_component, new_component)

# Add PDF upload section before the main menu content
old_menu_start = '''    <div className="flex flex-col gap-0 max-w-2xl mx-auto w-full p-6">
      <div className="text-center mb-8">
        <h1 className="font-mono text-2xl text-[#00E559] tracking-widest">{restaurantName.toUpperCase()}</h1>
        <p className="font-mono text-xs text-[#71717A] mt-1">CARDÁPIO DIGITAL</p>
      </div>'''
new_menu_start = '''    <div className="flex flex-col gap-0 max-w-2xl mx-auto w-full p-6">
      <div className="text-center mb-8">
        <h1 className="font-mono text-2xl text-[#00E559] tracking-widest">{restaurantName.toUpperCase()}</h1>
        <p className="font-mono text-xs text-[#71717A] mt-1">CARDÁPIO DIGITAL</p>
      </div>

      {/* ── Upload de PDF (visível apenas para o restaurante) ── */}
      {isOwner && (
        <div className="bg-[#0A0A0A] border border-[#27272A] p-4 mb-6 flex flex-col gap-3">
          <span className="font-mono text-xs text-[#FFB800] tracking-widest">📄 IMPORTAR CARDÁPIO VIA PDF</span>
          <span className="font-mono text-[10px] text-[#71717A]">
            Envie um PDF com nome, preço de compra, preço de venda e quantidade. O sistema extrairá os itens automaticamente.
          </span>
          <div className="flex items-center gap-2">
            <input
              ref={pdfRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handlePdfChange}
            />
            <button
              onClick={() => pdfRef.current?.click()}
              className="font-mono text-xs px-3 py-2 border border-[#27272A] text-[#71717A] hover:border-[#00E559] hover:text-[#00E559] transition-colors"
            >
              {pdfFile ? "TROCAR PDF" : "+ SELECIONAR PDF"}
            </button>
            {pdfFile && (
              <span className="font-mono text-xs text-[#EDEDED] truncate max-w-[200px]">{pdfFile.name}</span>
            )}
            <button
              onClick={processarPdf}
              disabled={!pdfFile || pdfLoading}
              className="font-mono text-xs px-4 py-2 bg-[#00E559] text-black font-bold hover:bg-[#00c44d] transition-colors disabled:opacity-40 ml-auto"
            >
              {pdfLoading ? "PROCESSANDO..." : "PROCESSAR PDF"}
            </button>
          </div>

          {pdfError && (
            <div className="font-mono text-xs text-[#FF4444] bg-[#FF4444]/10 border border-[#FF4444]/30 px-3 py-2">
              ⚠ {pdfError}
            </div>
          )}

          {pdfItens.length > 0 && (
            <div className="flex flex-col gap-2 mt-2">
              <span className="font-mono text-xs text-[#71717A]">
                {pdfItens.length} ITENS DETECTADOS:
              </span>
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
                {pdfItens.map((item, idx) => (
                  <div key={idx} className="bg-[#111] border border-[#27272A] p-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-[#EDEDED] font-bold">{item.nome}</span>
                      <span className="font-mono text-[10px] text-[#00E559]">
                        Compra: R$ {item.precoCompra} · Venda: R$ {item.precoVenda}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-[#71717A]">Qtd: {item.quantidade}</span>
                      <span className="font-mono text-[10px] text-[#71717A]">Categoria detectada: {item.categoria || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-[10px] text-[#71717A]">Categoria final:</span>
                      <select
                        value={categoriaMap[idx] || item.categoria || "Outros"}
                        onChange={e => setCategoriaMap(prev => ({ ...prev, [idx]: e.target.value }))}
                        className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-[10px] px-2 py-1 focus:outline-none focus:border-[#00E559]"
                      >
                        {pdfCategorias.map(c => <option key={c} value={c}>{c}</option>)}
                        <option value="Outros">Outros</option>
                      </select>
                    </div>
                ))}
              </div>
              <button
                onClick={importarItens}
                className="w-full py-2 bg-[#00E559] text-black font-mono text-xs font-bold hover:bg-[#00c44d] transition-colors mt-2"
              >
                ✓ IMPORTAR {pdfItens.length} ITENS PARA O ESTOQUE
              </button>
            </div>
          )}
        </div>
      )}'''
content = content.replace(old_menu_start, new_menu_start)

with open('frontend/src/components/DigitalMenu.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('DigitalMenu.jsx updated successfully')
