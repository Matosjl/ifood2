import { useState } from 'react';
import LoginPage      from './pages/LoginPage';
import DashboardPage  from './pages/DashboardPage';
import ProductsPage   from './pages/ProductsPage';
import StockPage      from './pages/StockPage';
import FinanceiroPage    from './pages/FinanceiroPage';
import HistoricoPage     from './pages/HistoricoPage';
import ConfiguracoesPage from './pages/ConfiguracoesPage';
import Sidebar           from './components/Sidebar';
import CustomerApp       from './CustomerApp';
import AdminApp          from './AdminApp';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [page,  setPage]  = useState('orders');

  const handleLogin  = (newToken) => setToken(newToken);
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
  };

  const adminMatch = window.location.pathname.startsWith('/admin');
  if (adminMatch) return <AdminApp />;

  // Customer menu app (no auth required)
  const menuMatch = window.location.pathname.match(/^\/menu\/([^/]+)/);
  if (menuMatch) return <CustomerApp slug={menuMatch[1]} />;

  if (!token) return <LoginPage onLogin={handleLogin} />;

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar page={page} setPage={setPage} onLogout={handleLogout} />
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {page === 'orders'     && <DashboardPage />}
        {page === 'products'   && <ProductsPage />}
        {page === 'stock'      && <StockPage />}
        {page === 'financial'  && <FinanceiroPage />}
        {page === 'historico'  && <HistoricoPage />}
        {page === 'settings'   && <ConfiguracoesPage />}
      </div>
    </div>
  );
}
