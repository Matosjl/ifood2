import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

export function RestaurantesLista() {
  const navigate = useNavigate();
  const [restaurantes, setRestaurantes] = useState([]);
  const [carregando, setCarregando]     = useState(true);
  const [erro, setErro]                 = useState("");
  const [deletando, setDeletando]       = useState(null);   // id sendo deletado

  const carregar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const { data } = await axios.get(`${API}/restaurantes`);
      setRestaurantes(data);
    } catch {
      setErro("Erro ao carregar restaurantes.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const handleDeletar = async (r) => {
    if (!window.confirm(`Excluir "${r.nome}"? Esta ação não pode ser desfeita.`)) return;
    setDeletando(r.id);
    try {
      await axios.delete(`${API}/restaurantes/${r.id}`);
      setRestaurantes((prev) => prev.filter((x) => x.id !== r.id));
    } catch {
      alert("Erro ao excluir restaurante.");
    } finally {
      setDeletando(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-[#EDEDED]">
      {/* Header */}
      <div className="border-b border-[#27272A] px-6 py-4 flex items-center justify-between">
        <span className="font-mono text-[#00E559] text-sm tracking-widest">RESTAURANTES</span>
        <button
          onClick={() => navigate("/restaurantes/novo")}
          className="bg-[#00E559] text-black font-mono text-xs font-bold px-4 py-2 hover:bg-[#00c44d] transition-colors"
        >
          + NOVO RESTAURANTE
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Estado de carregamento */}
        {carregando && (
          <div className="flex items-center justify-center py-20">
            <span className="font-mono text-[#71717A] text-sm animate-pulse">CARREGANDO...</span>
          </div>
        )}

        {/* Erro */}
        {erro && !carregando && (
          <div className="font-mono text-xs text-[#FF4444] border border-[#FF4444]/30 bg-[#FF4444]/5 px-4 py-3 flex justify-between">
            {erro}
            <button onClick={carregar} className="underline hover:no-underline">tentar novamente</button>
          </div>
        )}

        {/* Lista vazia */}
        {!carregando && !erro && restaurantes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <span className="font-mono text-[#3F3F46] text-4xl">🍽</span>
            <span className="font-mono text-[#71717A] text-sm">Nenhum restaurante cadastrado ainda.</span>
            <button
              onClick={() => navigate("/restaurantes/novo")}
              className="font-mono text-xs text-[#00E559] border border-[#00E559]/40 px-4 py-2 hover:bg-[#00E559]/10 transition-colors"
            >
              + Cadastrar primeiro restaurante
            </button>
          </div>
        )}

        {/* Cards */}
        {!carregando && restaurantes.length > 0 && (
          <div className="flex flex-col gap-3">
            {restaurantes.map((r) => (
              <div
                key={r.id}
                className="bg-[#0A0A0A] border border-[#27272A] hover:border-[#3F3F46] transition-colors flex items-center gap-4 p-4"
              >
                {/* Logo ou inicial */}
                <div className="w-12 h-12 bg-[#111] border border-[#27272A] flex items-center justify-center shrink-0 overflow-hidden">
                  {r.logoUrl ? (
                    <img
                      src={r.logoUrl}
                      alt={r.nome}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  ) : (
                    <span className="font-mono text-lg text-[#3F3F46]">
                      {r.nome?.[0]?.toUpperCase() ?? "?"}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm text-[#EDEDED] font-bold truncate">{r.nome}</span>
                    <span className={`font-mono text-[9px] px-1.5 py-0.5 border ${
                      r.ativo
                        ? "border-[#00E559]/40 text-[#00E559] bg-[#00E559]/5"
                        : "border-[#FF4444]/40 text-[#FF4444] bg-[#FF4444]/5"
                    }`}>
                      {r.ativo ? "ATIVO" : "INATIVO"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {r.categoria && (
                      <span className="font-mono text-[10px] text-[#71717A]">{r.categoria}</span>
                    )}
                    {r.cidade && (
                      <span className="font-mono text-[10px] text-[#3F3F46]">· {r.cidade}</span>
                    )}
                    <span className="font-mono text-[10px] text-[#3F3F46]">
                      · /{r.slug}
                    </span>
                  </div>
                  {r.tempoEstimado && (
                    <span className="font-mono text-[9px] text-[#3F3F46]">⏱ {r.tempoEstimado}</span>
                  )}
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/restaurante/${r.id}`)}
                    className="font-mono text-[10px] px-3 py-1.5 border border-[#27272A] text-[#71717A] hover:border-[#00E559] hover:text-[#00E559] transition-colors"
                    title="Abrir painel"
                  >
                    PAINEL
                  </button>
                  <button
                    onClick={() => navigate(`/restaurantes/${r.id}/editar`)}
                    className="font-mono text-[10px] px-3 py-1.5 border border-[#27272A] text-[#71717A] hover:border-[#FFB000] hover:text-[#FFB000] transition-colors"
                    title="Editar"
                  >
                    EDITAR
                  </button>
                  <button
                    onClick={() => handleDeletar(r)}
                    disabled={deletando === r.id}
                    className="font-mono text-[10px] px-3 py-1.5 border border-[#27272A] text-[#71717A] hover:border-[#FF4444] hover:text-[#FF4444] transition-colors disabled:opacity-40"
                    title="Excluir"
                  >
                    {deletando === r.id ? "..." : "✕"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
