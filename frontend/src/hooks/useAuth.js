import { useState, useCallback } from "react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const TOKEN_KEY = "auth_token";

export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));

  const login = useCallback(async (username, password) => {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error("Usuário ou senha incorretos");
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.access_token);
    setToken(data.access_token);
    return data.access_token;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  // Authenticated fetch helper
  const authFetch = useCallback(async (url, options = {}) => {
    const t = localStorage.getItem(TOKEN_KEY);
    const res = await fetch(url, {
      ...options,
      headers: { "Authorization": `Bearer ${t}`, "Content-Type": "application/json", ...options.headers },
    });
    if (res.status === 401) { logout(); throw new Error("Sessão expirada"); }
    return res;
  }, [logout]);

  return { token, login, logout, authFetch, isAuthenticated: !!token };
}
