import { useState, useEffect, useRef } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

export function Cardapio({ restauranteId }) {
  const [meta, setMeta] = useState(null);       // metadados do cardápio atual
  const [uploading, setUploading] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const fileRef = useRef();

  const carregarMeta = async () => {
    if (!restauranteId) return;
    try {
      const { data } = await axios.get(`${API}/cardapio/${restauranteId}`);
      setMeta(data);
    } catch (err) {
      if (err.response?.status !== 404) {
        setErro("Erro ao verificar cardápio existente.");
      }
    }
  };

  useEffect(() => { carregarMeta(); }, [restauranteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const TIPOS_VALIDOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!TIPOS_VALIDOS.includes(file.type)) {
      setErro("Tipo inválido. Use PDF, JPG ou PNG.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErro("Arquivo excede 10 MB.");
      return;
    }

    setErro("");
    setSucesso("");
    setUploading(true);

    const form = new FormData();
    form.append("file", file);

    try {
      await axios.post(`${API}/cardapio/upload?restaurante_id=${restauranteId}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSucesso(`"${file.name}" enviado com sucesso.`);
      await carregarMeta();
    } catch (err) {
      setErro(err.response?.data?.detail || "Erro ao enviar arquivo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const arquivoUrl = meta
    ? `${API}/cardapio/${restauranteId}/arquivo`
    : null;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto w-full">
      <h2 className="font-mono text-[#00E559] text-sm tracking-widest">CARDÁPIO DIGITAL</h2>

      {/* Status atual */}
      <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-3">
        <span className="font-mono text-[10px] text-[#71717A] tracking-widest">ARQUIVO ATUAL</span>
        {meta ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-sm text-[#EDEDED]">{meta.filename}</span>
              <span className="font-mono text-[10px] text-[#71717A]">
                {meta.contentType} · {(meta.tamanhoBytes / 1024).toFixed(0)} KB ·{" "}
                {new Date(meta.uploadedAt).toLocaleString("pt-BR")}
              </span>
            </div>
            <a
              href={arquivoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs px-3 py-1.5 border border-[#00E559] text-[#00E559] hover:bg-[#00E559]/10 transition-colors shrink-0"
            >
              👁 VER
            </a>
          </div>
        ) : (
          <span className="font-mono text-xs text-[#3F3F46]">Nenhum cardápio enviado ainda.</span>
        )}
      </div>

      {/* Upload */}
      <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-3">
        <span className="font-mono text-[10px] text-[#71717A] tracking-widest">
          {meta ? "SUBSTITUIR CARDÁPIO" : "ENVIAR CARDÁPIO"}
        </span>
        <p className="font-mono text-[10px] text-[#71717A]">
          PDF, JPG ou PNG · máximo 10 MB
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleUpload}
          disabled={uploading}
        />

        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || !restauranteId}
          data-testid="cardapio-upload-btn"
          className="bg-[#00E559] text-black font-mono text-xs font-bold py-2 px-6 hover:bg-[#00c44d] transition-colors self-start disabled:opacity-40"
        >
          {uploading ? "ENVIANDO..." : `${meta ? "↑ SUBSTITUIR" : "+ ENVIAR"} ARQUIVO`}
        </button>

        {erro && (
          <div className="font-mono text-xs text-[#FF4444] border border-[#FF4444]/30 bg-[#FF4444]/5 px-3 py-2 flex justify-between">
            {erro}
            <button onClick={() => setErro("")} className="text-[#71717A] hover:text-[#EDEDED]">✕</button>
          </div>
        )}
        {sucesso && (
          <div className="font-mono text-xs text-[#00E559] border border-[#00E559]/30 bg-[#00E559]/5 px-3 py-2 flex justify-between">
            ✓ {sucesso}
            <button onClick={() => setSucesso("")} className="text-[#71717A] hover:text-[#EDEDED]">✕</button>
          </div>
        )}
      </div>
    </div>
  );
}
