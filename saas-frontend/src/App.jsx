import { useState } from 'react';
import LoginPage      from './pages/LoginPage';
import DashboardPage  from './pages/DashboardPage';
import ProductsPage   from './pages/ProductsPage';
import StockPage      from './pages/StockPage';
import FinanceiroPage from './pages/FinanceiroPage';
import Sidebar        from './components/Sidebar';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [page,  setPage]  = useState('orders');

  const handleLogin  = (newToken) => setToken(newToken);
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
  };

  if (!token) return <LoginPage onLogin={handleLogin} />;

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar page={page} setPage={setPage} onLogout={handleLogout} />
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {page === 'orders'     && <DashboardPage />}
        {page === 'products'   && <ProductsPage />}
        {page === 'stock'      && <StockPage />}
        {page === 'financial'  && <FinanceiroPage />}
      </div>
    </div>
  );
}
