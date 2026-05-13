/**
 * AuthContext.jsx
 * Gerencia autenticação JWT para o painel ZapFome.
 *
 * Uso:
 *   const { token, login, logout, isAuth, isLoading } = useAuth();
 */
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;
const TOKEN_KEY = "zapfome_token";

// ── Context ────────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Lê e valida o token do localStorage (sem chamada de rede). */
function readStoredToken() {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) return null;
    // Decodifica payload sem verificar assinatura (só para checar expiração no cliente)
    const payload = JSON.parse(atob(t.split(".")[1]));
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return t;
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

/** Cria instância axios pré-configurada com o token. */
export function makeAuthAxios(token) {
  return axios.create({
    headers: token
      ? { "X-Owner-Token": token, Authorization: `Bearer ${token}` }
      : {},
  });
}

// ── Provider ───────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => readStoredToken());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // authAxios atualizado toda vez que o token muda
  const authAxios = token ? makeAuthAxios(token) : null;

  const isAuth = Boolean(token);

  /** Faz login e armazena o JWT. */
  const login = useCallback(async (password) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await axios.post(`${API}/auth/login`, { password });
      const newToken = data.token;
      localStorage.setItem(TOKEN_KEY, newToken);
      setToken(newToken);
      return { ok: true };
    } catch (err) {
      const msg = err?.response?.data?.detail || "Erro ao conectar ao servidor.";
      setError(msg);
      return { ok: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** Remove o token e redireciona para /login. */
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  // Revalida o token periodicamente (a cada 5 min)
  useEffect(() => {
    const interval = setInterval(() => {
      const valid = readStoredToken();
      if (!valid && token) {
        setToken(null); // token expirou
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, authAxios, isAuth, isLoading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}

export default AuthContext;
