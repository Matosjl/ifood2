// ─────────────────────────────────────────────────────────────────────────────
// useToast — sistema de notificações simples sem dependências externas.
// Uso: const { toast } = useToast(); toast.success("Salvo!");
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useCallback, createContext, useContext } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((tipo, msg, duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, tipo, msg }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), duration);
  }, []);

  const toast = {
    success: (m, d) => push("success", m, d),
    error:   (m, d) => push("error",   m, d),
    info:    (m, d) => push("info",    m, d),
  };

  const colors = {
    success: { bg: "bg-emerald-500", text: "text-black", icon: "✓" },
    error:   { bg: "bg-red-500",     text: "text-white", icon: "✕" },
    info:    { bg: "bg-blue-500",    text: "text-white", icon: "i" },
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* container fixo */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id}
            className={`${colors[t.tipo].bg} ${colors[t.tipo].text} px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 min-w-[260px] animate-slide-in pointer-events-auto`}>
            <span className="w-6 h-6 rounded-full bg-black/20 flex items-center justify-center text-xs font-bold">
              {colors[t.tipo].icon}
            </span>
            <span className="text-sm font-semibold">{t.msg}</span>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slide-in {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in { animation: slide-in .25s ease-out; }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast deve ser usado dentro de <ToastProvider>");
  return ctx;
}
