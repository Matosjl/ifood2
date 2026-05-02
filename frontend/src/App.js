import { useEffect, useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { RestaurantePage } from "@/components/RestaurantePage";
import { OwnerLogin } from "@/components/OwnerLogin";
import { OwnerDashboard } from "@/components/OwnerDashboard";
import { EntregadorApp } from "@/components/EntregadorApp";
import axios from "axios";
import { Header } from "@/components/Header";
import { HistorySidebar } from "@/components/HistorySidebar";
import { ChatInterface } from "@/components/ChatInterface";
import { CodeSandbox } from "@/components/CodeSandbox";
import { IntegrationsPanel } from "@/components/IntegrationsPanel";
import { PainelPedidosRestaurante } from "@/components/PainelPedidosRestaurante";
import { AcompanhamentoPedido } from "@/components/AcompanhamentoPedido";
import { CheckoutPage } from "@/components/CheckoutPage";
import { RestaurantesLista } from "@/components/RestaurantesLista";
import { RestauranteCadastro } from "@/components/RestauranteCadastro";
import { MenuPublico } from "@/components/MenuPublico";
import { CardapioPublico } from "@/components/CardapioPublico";

// ── App Cliente (delivery) ────────────────────────────────────────────────────
import { CartProvider } from "@/context/CartContext";
import { ToastProvider } from "@/hooks/useToast";
import ClienteLayout from "@/pages/ClienteLayout";
import ClienteHome from "@/pages/ClienteHome";
import CardapioCliente from "@/pages/CardapioCliente";
import CartPage from "@/pages/CartPage";
import PedidoAcompanhamento from "@/pages/PedidoAcompanhamento";
import ChatIA from "@/pages/ChatIA";
import BuscarPage from "@/pages/BuscarPage";
import MeusPedidos from "@/pages/MeusPedidos";
import LandingPage from "@/pages/LandingPage";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
const API = `${BACKEND_URL}/api`;
const LM_STUDIO_URL = "http://127.0.0.1:1234";
const LM_MODEL = "deepseek-r1-distill-qwen-1.5b";

// ── Rota protegida: valida JWT localmente (sem chamada de rede) ──────────────
const isTokenValid = () => {
  const token = localStorage.getItem("owner_token");
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
};

const ProtectedRoute = ({ children }) => {
  if (!isTokenValid()) {
    localStorage.removeItem("owner_token");
    return <Navigate to="/owner/login" replace />;
  }
  return children;
};

// Main AJAX AI Agent Layout Component
const AjaxAgent = () => {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const [backendStatus, setBackendStatus] = useState({ api: null, mongo: null });
  const [integrations, setIntegrations] = useState([
    { id: "gmail", name: "Gmail", icon: "gmail", connected: true },
    { id: "whatsapp", name: "WhatsApp", icon: "whatsapp", connected: false },
    { id: "instagram", name: "Instagram", icon: "instagram", connected: true },
    { id: "twitter", name: "X / Twitter", icon: "twitter", connected: false },
  ]);
  const [history, setHistory] = useState([
    { id: 1, title: "API Integration Help", timestamp: "2024-01-15 10:30" },
    { id: 2, title: "Code Review: auth.js", timestamp: "2024-01-15 09:15" },
    { id: 3, title: "Database Schema Design", timestamp: "2024-01-14 16:45" },
  ]);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await axios.get(`${API}/health`);
        setBackendStatus({ api: true, mongo: res.data.mongo });
      } catch {
        setBackendStatus({ api: false, mongo: false });
      }
    };
    checkBackend();
    const interval = setInterval(checkBackend, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSendMessage = async (input) => {
    if (!input.trim() || isLoading) return;

    const userMessage = { type: "user", content: input, timestamp: new Date() };
    const chatHistory = messages.map((m) => ({
      role: m.type === "user" ? "user" : "assistant",
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Add empty AI message to stream into
    const aiMsg = { type: "ai", content: "", timestamp: new Date(), streaming: true };
    setMessages((prev) => [...prev, aiMsg]);

    try {
      const response = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: LM_MODEL,
          messages: [
            { role: "system", content: "Você é AJAX, um agente de automação especializado em operações de delivery. Suas responsabilidades: monitorar relatórios de vendas e faturamento, controle de estoque e produtos, gestão de entregadores (status, rotas, performance), alertas operacionais e análise de dados. Responda sempre em português, de forma direta e objetiva, sem rodeios. Use dados e números quando relevante. Formato terminal: respostas curtas e acionáveis." },
            ...chatHistory,
            { role: "user", content: input },
          ],
          stream: true,
          temperature: 0.7,
        }),
      });

      if (!response.ok) throw new Error(`LM Studio error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || "";
            fullContent += delta;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { ...aiMsg, content: fullContent, streaming: true };
              return updated;
            });
          } catch {}
        }
      }

      // Mark streaming done
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...aiMsg, content: fullContent, streaming: false };
        return updated;
      });

      // Save to history if first message
      if (messages.length === 0) {
        const title = input.slice(0, 40) + (input.length > 40 ? "..." : "");
        setHistory((prev) => [{ id: Date.now(), title, timestamp: new Date().toLocaleString() }, ...prev]);
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...aiMsg,
          content: `[ERROR] ${err.message}\n\nVerifique se o LM Studio está rodando em http://127.0.0.1:1234`,
          streaming: false,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
  };

  const handleSelectChat = (item) => {
    console.log("Selected chat:", item);
  };

  return (
    <div className="h-screen w-screen bg-black text-[#EDEDED] flex flex-col overflow-hidden">
      <Header backendStatus={backendStatus} />

      {/* Main Content - 3 Pane Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - History */}
        <HistorySidebar
          history={history}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
        />

        {/* Center - Main Chat / Code Area */}
        <main className="flex-1 flex flex-col bg-black min-w-0">
          {/* Tab Navigation */}
          <div className="flex border-b border-[#27272A]">
            <button
              onClick={() => setActiveTab("chat")}
              className={`px-4 py-2 font-mono text-xs border-b-2 transition-colors ${
                activeTab === "chat"
                  ? "border-[#00E559] text-[#00E559]"
                  : "border-transparent text-[#71717A] hover:text-[#A1A1AA]"
              }`}
              data-testid="chat-tab"
            >
              CHAT
            </button>
            <button
              onClick={() => setActiveTab("code")}
              className={`px-4 py-2 font-mono text-xs border-b-2 transition-colors ${
                activeTab === "code"
                  ? "border-[#00E559] text-[#00E559]"
                  : "border-transparent text-[#71717A] hover:text-[#A1A1AA]"
              }`}
              data-testid="code-tab"
            >
              CODE SANDBOX
            </button>
          </div>

          {activeTab === "chat" ? (
            <ChatInterface
              messages={messages}
              isLoading={isLoading}
              onSendMessage={handleSendMessage}
            />
          ) : (
            <CodeSandbox />
          )}
        </main>

        {/* Right Sidebar - Integrations */}
        <IntegrationsPanel integrations={integrations} />
      </div>
    </div>
  );
};

function App() {
  return (
    <ToastProvider>
      <CartProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AjaxAgent />} />
            {/* Restaurantes — listagem e cadastro */}
            {/* Landing page de vendas para donos de restaurante */}
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/restaurantes" element={<RestaurantesLista />} />
            <Route path="/restaurantes/novo" element={<RestauranteCadastro />} />
            <Route path="/restaurantes/:id/editar" element={<RestauranteCadastro />} />

            {/* Cardápio digital — visão do cliente */}
            <Route path="/menu/:id" element={<MenuPublico />} />
            {/* Cardápio público OxyFood — rota amigável para clientes */}
            <Route path="/cardapio/:id" element={<CardapioPublico />} />

            {/* Painel operacional de um restaurante */}
            <Route path="/restaurante/:id" element={<RestaurantePage />} />
            <Route path="/restaurante/pedidos" element={<PainelPedidosRestaurante />} />

            <Route path="/entregador/:id" element={<EntregadorApp />} />
            <Route path="/owner/login" element={<OwnerLogin />} />
            <Route path="/owner" element={<ProtectedRoute><OwnerDashboard /></ProtectedRoute>} />
            <Route path="/pedido/:pedidoId" element={<AcompanhamentoPedido />} />
            <Route path="/checkout" element={<CheckoutPage />} />

            {/* ── App Cliente (delivery) ── */}
            <Route path="/app" element={<ClienteLayout />}>
              <Route index element={<ClienteHome />} />
              <Route path="restaurante/:id" element={<CardapioCliente />} />
              <Route path="carrinho" element={<CartPage />} />
              <Route path="pedido/:pedidoId" element={<PedidoAcompanhamento />} />
              <Route path="meus-pedidos" element={<MeusPedidos />} />
              <Route path="ia" element={<ChatIA />} />
              <Route path="buscar" element={<BuscarPage />} />
              <Route path="perfil" element={<ClienteHome />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </CartProvider>
    </ToastProvider>
  );
}

export default App;

