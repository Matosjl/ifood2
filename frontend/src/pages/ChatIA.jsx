// Chat com IA — assistente do app de delivery.
// Conecta ao backend /api/ai/chat (OpenAI gpt-4o-mini).
import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { iaService, extractError } from "@/services/api";
import { useToast } from "@/hooks/useToast";

export default function ChatIA() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const restauranteId = searchParams.get("restId") || null;

  const [mensagens, setMensagens] = useState([
    {
      role: "assistant",
      content: "Olá! 👋 Sou o assistente ZapFome. Posso te ajudar com informações sobre restaurantes, pratos e seu pedido. Como posso te ajudar?",
    },
  ]);
  const [input, setInput] = useState("");
  const [carregando, setCarregando] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, carregando]);

  const enviar = async (texto) => {
    const txt = (texto || input).trim();
    if (!txt || carregando) return;
    setInput("");

    const novas = [...mensagens, { role: "user", content: txt }];
    setMensagens(novas);
    setCarregando(true);

    try {
      const history = novas.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
      const resposta = await iaService.chat(txt, history, restauranteId, "cliente");
      setMensagens((prev) => [...prev, { role: "assistant", content: resposta }]);
    } catch (err) {
      setMensagens((prev) => [
        ...prev,
        { role: "assistant", content: "😴 O assistente está temporariamente indisponível. Em breve voltamos! Para dúvidas, entre em contato diretamente com o restaurante." },
      ]);
    } finally {
      setCarregando(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const SUGESTOES = [
    "Quais restaurantes estão abertos?",
    "Sugira algo para jantar",
    "Como acompanho meu pedido?",
  ];

  return (
    <div className="max-w-lg mx-auto flex flex-col h-[calc(100vh-80px)]">
      {/* Header */}
      <header className="pt-6 px-5 pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-lg">
            🤖
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Assistente ZapFome</h1>
            <p className={`text-[11px] ${carregando ? "text-amber-400" : "text-emerald-400"}`}>
              {carregando ? "Digitando…" : "Online"}
            </p>
          </div>
        </div>
      </header>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-5 flex flex-col gap-3 pb-4">
        {mensagens.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-sm shrink-0 mr-2 mt-1">
                🤖
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === "user"
                ? "bg-emerald-500 text-black font-medium rounded-br-sm"
                : "bg-white/5 text-zinc-200 border border-white/8 rounded-bl-sm"
            }`}>
              {m.content}
            </div>
          </div>
        ))}

        {/* Indicador de digitação */}
        {carregando && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-sm shrink-0 mr-2 mt-1">
              🤖
            </div>
            <div className="bg-white/5 border border-white/8 rounded-2xl rounded-bl-sm px-5 py-4 flex gap-1.5 items-center">
              {[0, 1, 2].map((d) => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce"
                  style={{ animationDelay: `${d * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* Sugestões iniciais */}
        {mensagens.length === 1 && !carregando && (
          <div className="flex flex-col gap-2 mt-2">
            {SUGESTOES.map((s) => (
              <button key={s} onClick={() => enviar(s)}
                className="text-left text-xs text-zinc-400 border border-white/8 rounded-2xl px-4 py-3 hover:bg-white/5 hover:text-white transition-colors">
                💬 {s}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-5 pb-4 shrink-0">
        <form onSubmit={(e) => { e.preventDefault(); enviar(); }} className="flex gap-2">
          <input
            ref={inputRef}
            type="text" value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="Digite sua mensagem…"
            disabled={carregando}
            className="flex-1 bg-white/5 border border-white/8 rounded-2xl text-white text-sm px-4 py-3.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600 disabled:opacity-50"
          />
          <button type="submit" disabled={!input.trim() || carregando}
            className="w-12 h-12 rounded-2xl bg-emerald-500 text-black flex items-center justify-center text-xl font-bold hover:bg-emerald-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0">
            ↑
          </button>
        </form>
      </div>
    </div>
  );
}
