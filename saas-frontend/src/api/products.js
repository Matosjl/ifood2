import api from './axios';

// ── Products ──────────────────────────────────────────────────
export const listProducts  = (params) => api.get('/products', { params });
export const getProduct    = (id)     => api.get(`/products/${id}`);
export const createProduct = (data)   => api.post('/products', data);
export const updateProduct = (id, data) => api.put(`/products/${id}`, data);
export const deleteProduct = (id)     => api.delete(`/products/${id}`);

// ── Categories ────────────────────────────────────────────────
export const listCategories = ()       => api.get('/categories');
export const createCategory = (name)   => api.post('/categories', { name });
export const deleteCategory = (id)     => api.delete(`/categories/${id}`);

// ── Stock ─────────────────────────────────────────────────────
export const replenishStock   = (id, data) => api.post(`/products/${id}/replenish`, data);
export const listMovements    = (productId, params) =>
  api.get(`/products/${productId}/movements`, { params });
export const listAllMovements = (params) =>
  api.get('/stock/movements', { params });
