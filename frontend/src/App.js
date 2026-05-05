import "@/App.css";
import { useState } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { LayoutDashboard, Package, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import LoginPage from "@/components/LoginPage";
import OrdersPanel from "@/components/OrdersPanel";
import StockPage from "@/components/StockPage";

function NavBar({ onLogout }) {
  return (
    <nav className="flex items-center gap-1 px-4 py-2 border-b border-border bg-card/80 backdrop-blur shrink-0">
      <NavLink to="/"
        className={({ isActive }) =>
          `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
           ${isActive ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-card"}`
        }
      >
        <LayoutDashboard size={14} /> Pedidos
      </NavLink>
      <NavLink to="/estoque"
        className={({ isActive }) =>
          `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
           ${isActive ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-card"}`
        }
      >
        <Package size={14} /> Estoque
      </NavLink>
      <button
        onClick={onLogout}
        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                   text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
      >
        <LogOut size={14} /> Sair
      </button>
    </nav>
  );
}

function ProtectedApp() {
  const { logout } = useAuth();
  return (
    <div className="flex flex-col h-screen">
      <NavBar onLogout={logout} />
      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/"        element={<OrdersPanel />} />
          <Route path="/estoque" element={<StockPage />} />
          <Route path="*"        element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthenticated } = useAuth();
  const [, forceUpdate] = useState(0);

  if (!isAuthenticated) {
    return (
      <div className="App">
        <LoginPage onLogin={() => forceUpdate((n) => n + 1)} />
      </div>
    );
  }

  return (
    <div className="App min-h-screen bg-background text-foreground">
      <BrowserRouter>
        <ProtectedApp />
      </BrowserRouter>
    </div>
  );
}
