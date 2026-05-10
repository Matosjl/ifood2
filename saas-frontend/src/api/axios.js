import axios from 'axios';

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000') + '/api';

const api = axios.create({
  baseURL: BASE,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request: anexa JWT ────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response: auto-refresh de token ──────────────────────────
let isRefreshing = false;
let failedQueue  = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
};

const doLogout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('tenant');
  // NÃO recarrega imediatamente — dispara evento para o App tratar
  window.dispatchEvent(new CustomEvent('auth:logout'));
};

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    // 402 — plano bloqueado / trial expirado
    if (err.response?.status === 402) {
      const payload = err.response.data ?? {};
      window.dispatchEvent(new CustomEvent('billing:blocked', { detail: payload }));
      return Promise.reject(err);
    }

    if (err.response?.status !== 401 || original._retry) {
      return Promise.reject(err);
    }

    // Evita loop: se o próprio /auth/refresh falhou → logout
    if (original.url?.includes('/auth/refresh')) {
      doLogout();
      return Promise.reject(err);
    }

    if (isRefreshing) {
      // Enfileira requisição enquanto refresh está em andamento
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((newToken) => {
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        })
        .catch((e) => Promise.reject(e));
    }

    original._retry = true;
    isRefreshing     = true;

    const refreshToken = localStorage.getItem('refreshToken');

    if (!refreshToken) {
      isRefreshing = false;
      doLogout();
      return Promise.reject(err);
    }

    try {
      const { data } = await axios.post(`${BASE}/auth/refresh`, { refreshToken });
      const { accessToken, refreshToken: newRefresh } = data.data;

      localStorage.setItem('token',        accessToken);
      localStorage.setItem('refreshToken', newRefresh);

      api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
      original.headers.Authorization            = `Bearer ${accessToken}`;

      processQueue(null, accessToken);
      return api(original);
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      doLogout();
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
