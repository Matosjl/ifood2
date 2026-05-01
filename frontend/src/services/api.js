// ─────────────────────────────────────────────────────────────────────────────
// Camada de serviços — única fonte de verdade para chamadas ao backend.
// Mapeia endpoints reais (em português) para nomes idiomáticos do app cliente.
// ─────────────────────────────────────────────────────────────────────────────
import axios from "axios";

const BASE_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
export const API = `${BASE_URL}/api`;

const OWNER_TOKEN = process.env.REACT_APP_OWNER_API_TOKEN || "";

// Instância pública — para clientes (cardápio, criar pedido, acompanhar)
export const publicApi = axios.create({ baseURL: API, timeout: 15000 });

// Instância autenticada — para operadores (estoque, status, financeiro)
export const ownerApi = axios.create({
  baseURL: API,
  timeout: 15000,
  headers: { "X-Owner-Token": OWNER_TOKEN },
});

// ── Helpers de erro ─────────────────────────────────────────────────────────
const extractError = (err) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail) return JSON.stringify(detail);
  return err?.message || "Erro desconhecido";
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANTES — públicos
// ─────────────────────────────────────────────────────────────────────────────
export const restaurantesService = {
  listar: async () => {
    const { data } = await publicApi.get("/restaurantes");
    return data || [];
  },
  buscar: async (idOrSlug) => {
    const { data } = await publicApi.get(`/restaurantes/${idOrSlug}`);
    return data;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PRODUTOS / ESTOQUE — leitura pública, escrita autenticada
// ─────────────────────────────────────────────────────────────────────────────
export const produtosService = {
  porRestaurante: async (restauranteId) => {
    const { data } = await publicApi.get(`/estoque/${restauranteId}`);
    const arr = Array.isArray(data) ? data : data?.itens || [];
    // Normaliza nomes para uso no app cliente
    return arr.map((i) => ({
      id:          i.id,
      nome:        i.nome,
      categoria:   i.categoria || "Geral",
      precoVenda:  Number(i.precoVenda || 0),
      quantidade:  Number(i.quantidade || 0),
      foto:        i.foto || null,
      descricao:   i.descricao || "",
      destaque:    !!i.destaque,
    }));
  },
  criar: async (restauranteId, item) => {
    const { data } = await ownerApi.post(`/estoque?restaurante_id=${restauranteId}`, item);
    return data;
  },
  atualizar: async (itemId, campos) => {
    const { data } = await ownerApi.patch(`/estoque/${itemId}`, campos);
    return data;
  },
  deletar: async (itemId) => {
    const { data } = await ownerApi.delete(`/estoque/${itemId}`);
    return data;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS — criação pública, gestão autenticada
// ─────────────────────────────────────────────────────────────────────────────
export const pedidosService = {
  criar: async (payload) => {
    // payload: { restauranteId, clienteNome, clienteTelefone, tipo, pagamento, itens, endereco?, observacao? }
    const { data } = await publicApi.post("/pedidos", payload);
    return data; // { id, status }
  },
  buscar: async (pedidoId) => {
    const { data } = await publicApi.get(`/pedidos/${pedidoId}`);
    return data;
  },
  listarDoRestaurante: async (restauranteId, status) => {
    const params = new URLSearchParams({ restaurante_id: restauranteId });
    if (status) params.append("status", status);
    const { data } = await ownerApi.get(`/pedidos?${params}`);
    return data?.pedidos || [];
  },
  atualizarStatus: async (pedidoId, novoStatus, motivoCancelamento) => {
    const { data } = await ownerApi.patch(`/pedidos/${pedidoId}/status`, {
      status: novoStatus,
      motivoCancelamento: motivoCancelamento || null,
    });
    return data;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTH — operador (login JWT do dono do restaurante)
// ─────────────────────────────────────────────────────────────────────────────
export const authService = {
  loginOwner: async (senha) => {
    const { data } = await publicApi.post("/owner/login", { password: senha });
    if (data?.token) localStorage.setItem("owner_token", data.token);
    return data;
  },
  logoutOwner: () => localStorage.removeItem("owner_token"),
  isOwnerLogged: () => {
    const tok = localStorage.getItem("owner_token");
    if (!tok) return false;
    try {
      const payload = JSON.parse(atob(tok.split(".")[1]));
      return payload.exp * 1000 > Date.now();
    } catch { return false; }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// IA — OpenAI via backend (POST /api/ai/chat)
// O backend injeta contexto do restaurante (cardápio, estoque, pedidos)
// antes de chamar a OpenAI, mantendo o custo baixo (gpt-4o-mini).
// ─────────────────────────────────────────────────────────────────────────────
export const iaService = {
  /**
   * @param {string} mensagem
   * @param {Array<{role:string,content:string}>} chatHistory
   * @param {string|null} restauranteId
   * @param {"cliente"|"operador"} modo
   */
  chat: async (mensagem, chatHistory = [], restauranteId = null, modo = "cliente") => {
    const { data } = await publicApi.post("/ai/chat", {
      mensagem,
      restauranteId: restauranteId || undefined,
      historico: chatHistory.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      modo,
    });
    return data?.resposta || "";
  },
};

export { extractError };
