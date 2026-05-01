import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { DigitalMenu } from "@/components/DigitalMenu";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

export function MenuPublico() {
  const { id } = useParams(); // slug ou UUID do restaurante
  const [restaurante, setRestaurante] = useState(null);
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        // Busca dados do restaurante
        const r = await axios.get(`${API}/restaurantes/${id}`);
        setRestaurante(r.data);

        // Busca itens do estoque (cardápio)
        const e = await axios.get(`${API}/estoque/${r.data.id || id}`);
        setItens(e.data?.itens || e.data || []);
      } catch {
        setErro("Restaurante não encontrado.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-emerald-400 font-mono text-sm animate-pulse">Carregando cardápio…</div>
    </div>
  );

  if (erro) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-red-400 font-mono text-sm">{erro}</div>
    </div>
  );

  return (
    <DigitalMenu
      items={itens}
      restaurantName={restaurante?.nome || id}
      restauranteId={restaurante?.id || id}
    />
  );
}
