// Barra de navegação inferior — estilo app mobile (Dribbble-inspired)
import { useNavigate, useLocation } from "react-router-dom";
import { useCart } from "@/context/CartContext";

const TABS = [
  { id: "home",    label: "Início",   icon: "🏠", path: "/app" },
  { id: "search",  label: "Buscar",   icon: "🔍", path: "/app/buscar" },
  { id: "cart",    label: "Carrinho", icon: "🛒", path: "/app/carrinho", badge: true },
  { id: "orders",  label: "Pedidos",  icon: "📋", path: "/app/meus-pedidos" },
  { id: "ai",      label: "Chat",     icon: "💬", path: "/app/ia" },
];

export const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { totalItens } = useCart();

  const isActive = (path) => {
    if (path === "/app") return location.pathname === "/app";
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-[#0A0A0A]/95 backdrop-blur-xl border-t border-white/8 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-lg mx-auto flex items-center justify-around px-2 py-2">
        {TABS.map((t) => {
          const active = isActive(t.path);
          return (
            <button key={t.id} onClick={() => navigate(t.path)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-colors relative ${
                active ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
              }`}>
              <div className="relative">
                <span className="text-lg">{t.icon}</span>
                {t.badge && totalItens > 0 && (
                  <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-emerald-500 text-black text-[9px] font-bold flex items-center justify-center">
                    {totalItens}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold">{t.label}</span>
              {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
