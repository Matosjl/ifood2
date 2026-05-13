import { useState, useEffect, useCallback } from 'react';
import LoginPage         from './pages/LoginPage';
import LandingPage       from './pages/LandingPage';
import RegisterPage      from './pages/RegisterPage';
import DashboardPage     from './pages/DashboardPage';
import ProductsPage      from './pages/ProductsPage';
import StockPage         from './pages/StockPage';
import FinanceiroPage    from './pages/FinanceiroPage';
import ConfiguracoesPage from './pages/ConfiguracoesPage';
import FiadoPage         from './pages/FiadoPage';
import RelatoriosPage    from './pages/RelatoriosPage';
import EntregasPage      from './pages/EntregasPage';
import PlansPage         from './pages/PlansPage';
import Sidebar           from './components/Sidebar';
import TrialBanner       from './components/TrialBanner';
import PlanWall          from './components/PlanWall';
import CustomerApp       from './CustomerApp';
import AdminApp          from './AdminApp';
import DriverApp         from './pages/DriverApp';

// ── Routing helper ────────────────────────────────────────────
const getRoute = () => window.location.pathname;
const navigate = (path) => {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export default function App() {
  const [token,        setToken]        = useState(() => localStorage.getItem('token'));
  const [page,         setPage]         = useState('orders');
  const [route,        setRoute]        = useState(getRoute);
  const [showPlanWall, setShowPlanWall] = useState(false);
  const [showPlansPage, setShowPlansPage] = useState(false);

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

  // Escuta 402 disparado pelo axios (trial expirado / conta bloqueada)
  useEffect(() => {
    const onBlocked = () => {
      setShowPlanWall(true);
    };
    window.addEventListener('billing:blocked', onBlocked);
    return () => window.removeEventListener('billing:blocked', onBlocked);
  }, []);

  // Detecta conta já suspensa no login (subscriptionStatus no localStorage)
  useEffect(() => {
    if (!token) return;
    const tenant = (() => {
      try { return JSON.parse(localStorage.getItem('tenant') || 'null'); } catch { return null; }
    })();
    if (tenant?.subscriptionStatus === 'suspended' || tenant?.subscriptionStatus === 'cancelled') {
      setShowPlanWall(true);
    }
  }, [token]);

  const handleLogin  = (newToken) => { setToken(newToken); navigate('/'); };
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('tenant');
    setToken(null);
    setShowPlanWall(false);
    navigate('/');
  };

  const handleShowPlans = useCallback(() => setShowPlansPage(true), []);

  // ── Driver app (mobile PWA) ───────────────────────────────
  if (route.startsWith('/driver')) return <DriverApp />;

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

      {/* Trial banner — dias restantes */}
      <TrialBanner onShowPlans={handleShowPlans} />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar
          page={showPlansPage ? 'plans' : page}
          setPage={(p) => { setShowPlansPage(false); setPage(p); }}
          onLogout={handleLogout}
          onShowPlans={handleShowPlans}
        />

        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {showPlansPage ? (
            <PlansPage />
          ) : (
            <>
              {page === 'orders'     && <DashboardPage />}
              {page === 'products'   && <ProductsPage />}
              {page === 'stock'      && <StockPage />}
              {page === 'financial'  && <FinanceiroPage />}
              {page === 'relatorios' && <RelatoriosPage />}
              {page === 'fiado'      && <FiadoPage />}
              {page === 'entregas'   && <EntregasPage />}
              {page === 'settings'   && <ConfiguracoesPage />}
            </>
          )}
        </div>
      </div>

      {/* Plan wall — sobrepõe tudo quando conta está bloqueada */}
      {showPlanWall && (
        <PlanWall onDismiss={() => setShowPlanWall(false)} />
      )}
    </div>
  );
}
