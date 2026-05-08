import { useState, useEffect } from 'react';
import LoginPage         from './pages/LoginPage';
import LandingPage       from './pages/LandingPage';
import RegisterPage      from './pages/RegisterPage';
import DashboardPage     from './pages/DashboardPage';
import ProductsPage      from './pages/ProductsPage';
import StockPage         from './pages/StockPage';
import FinanceiroPage    from './pages/FinanceiroPage';
import HistoricoPage     from './pages/HistoricoPage';
import ConfiguracoesPage from './pages/ConfiguracoesPage';
import FiadoPage         from './pages/FiadoPage';
import Sidebar           from './components/Sidebar';
import TrialBanner       from './components/TrialBanner';
import CustomerApp       from './CustomerApp';
import AdminApp          from './AdminApp';

// ── Routing helper ────────────────────────────────────────────
const getRoute = () => window.location.pathname;
const navigate = (path) => {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export default function App() {
  const [token,    setToken]    = useState(() => localStorage.getItem('token'));
  const [page,     setPage]     = useState('orders');
  const [route,    setRoute]    = useState(getRoute);

  // Sync route on back/forward
  useEffect(() => {
    const onPop = () => setRoute(getRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Escuta logout disparado pelo axios quando refresh token falha
  useEffect(() => {
    const onAuthLogout = () => {
      setToken(null);
      navigate('/entrar');
    };
    window.addEventListener('auth:logout', onAuthLogout);
    return () => window.removeEventListener('auth:logout', onAuthLogout);
  }, []);

  const handleLogin  = (newToken) => { setToken(newToken); navigate('/'); };
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('tenant');
    setToken(null);
    navigate('/');
  };

  // ── Admin panel ───────────────────────────────────────────
  if (route.startsWith('/admin')) return <AdminApp />;

  // ── Customer menu (public) ────────────────────────────────
  const menuMatch = route.match(/^\/menu\/([^/]+)/);
  if (menuMatch) return <CustomerApp slug={menuMatch[1]} />;

  // ── Register page ─────────────────────────────────────────
  if (route === '/cadastro') {
    if (token) { navigate('/'); return null; }
    return (
      <RegisterPage
        onLogin={handleLogin}
        onGoLogin={() => navigate('/entrar')}
      />
    );
  }

  // ── Login page ────────────────────────────────────────────
  if (route === '/entrar' || (!token && route !== '/')) {
    if (token) { navigate('/'); return null; }
    return (
      <LoginPage
        onLogin={handleLogin}
        onGoRegister={() => navigate('/cadastro')}
        onGoLanding={() => navigate('/')}
      />
    );
  }

  // ── Landing page (unauthenticated at /) ───────────────────
  if (!token) {
    return (
      <LandingPage
        onGoLogin={() => navigate('/entrar')}
        onGoRegister={() => navigate('/cadastro')}
      />
    );
  }

  // ── App (authenticated) ───────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-950 overflow-hidden">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar page={page} setPage={setPage} onLogout={handleLogout} />
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {page === 'orders'    && <DashboardPage />}
          {page === 'products'  && <ProductsPage />}
          {page === 'stock'     && <StockPage />}
          {page === 'financial' && <FinanceiroPage />}
          {page === 'historico' && <HistoricoPage />}
          {page === 'fiado'     && <FiadoPage />}
          {page === 'settings'  && <ConfiguracoesPage />}
        </div>
      </div>
    </div>
  );
}
