import api from './axios';

// ── Insumos CRUD ──────────────────────────────────────────────
export const listInsumos          = ()                   => api.get('/insumos');
export const createInsumo         = (payload)            => api.post('/insumos', payload);
export const updateInsumo         = (id, payload)        => api.put(`/insumos/${id}`, payload);
export const deleteInsumo         = (id)                 => api.delete(`/insumos/${id}`);
export const adjustInsumoStock    = (id, qty, reason)    => api.post(`/insumos/${id}/adjust`, { qty, reason });

// ── Ficha técnica ─────────────────────────────────────────────
export const getProductInsumos    = (productId)          => api.get(`/insumos/product/${productId}`);
export const setProductInsumos    = (productId, insumos) => api.put(`/insumos/product/${productId}`, { insumos });

// ── Produção diária ───────────────────────────────────────────
export const listBatches          = (date)               => api.get('/insumos/production/batches', { params: date ? { date } : {} });
export const createBatch          = (payload)            => api.post('/insumos/production/batches', payload);
export const getDayReport         = (date)               => api.get('/insumos/production/report', { params: date ? { date } : {} });
export const getExpiryAlerts      = ()                   => api.get('/insumos/production/expiry');

// ── Perdas ────────────────────────────────────────────────────
export const listWasteLogs        = (params)             => api.get('/insumos/waste', { params });
export const logWaste             = (payload)            => api.post('/insumos/waste', payload);

// ── Inteligência ──────────────────────────────────────────────
export const getShoppingList      = (params)             => api.get('/insumos/intelligence/shopping-list', { params });
export const simulateProduction   = (productId, qty, params) =>
  api.get('/insumos/intelligence/simulate', { params: { product_id: productId, quantity: qty, ...params } });
export const getProfitRanking     = (days = 30)          => api.get('/insumos/intelligence/profit-ranking', { params: { days } });
