/**
 * PrivateRoute.jsx
 * Protege rotas que exigem autenticação JWT.
 * Redireciona para /login se não autenticado.
 */
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function PrivateRoute({ children }) {
  const { isAuth } = useAuth();
  const location = useLocation();

  if (!isAuth) {
    // Salva a rota tentada para redirecionar após login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
