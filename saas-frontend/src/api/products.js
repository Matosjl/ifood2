import api from './axios';

// ── Products ──────────────────────────────────────────────────
export const listProducts  = (params) => api.get('/products', { params });
export const getProduct    = (id)     => api.get(`/products/${id}`);
export const createProduct = (data)   => api.post('/products', data);
export const updateProduct = (id, data) => api.put(`/products/${id}`, data);
export const deleteProduct = (id)     => api.delete(`/products/${id}`);

// ── Categories ────────────────────────────────────────────────
export const listCategories  = ()           => api.get('/categories');
export const createCategory  = (name)       => api.post('/categories', { name });
export const updateCategory  = (id, data)   => api.patch(`/categories/${id}`, data);
export const deleteCategory  = (id)         => api.delete(`/categories/${id}`);

// ── Stock ─────────────────────────────────────────────────────
export const replenishStock   = (id, data) => api.post(`/products/${id}/replenish`, data);

// ── Código de barras ──────────────────────────────────────────
export const getByBarcode    = (code) => api.get(`/products/barcode/${encodeURIComponent(code)}`);
export const lookupBarcode   = (code) => api.get(`/products/barcode-lookup/${encodeURIComponent(code)}`);
export const listMovements    = (productId, params) =>
  api.get(`/products/${productId}/movements`, { params });
export const listAllMovements = (params) =>
  api.get('/stock/movements', { params });

// ── Variações ─────────────────────────────────────────────────
export const createVarGroup  = (productId, data)  => api.post(`/products/${productId}/variations/groups`, data);
export const updateVarGroup  = (gid, data)         => api.put(`/products/variations/groups/${gid}`, data);
export const deleteVarGroup  = (gid)               => api.delete(`/products/variations/groups/${gid}`);
export const createVarOption = (gid, data)         => api.post(`/products/variations/groups/${gid}/options`, data);
export const updateVarOption = (oid, data)         => api.put(`/products/variations/options/${oid}`, data);
export const deleteVarOption = (oid)               => api.delete(`/products/variations/options/${oid}`);
