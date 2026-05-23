import api from './axios';

// ── Grupos ────────────────────────────────────────────────────
export const listAddonGroups  = ()                => api.get('/addons');
export const createAddonGroup = (payload)         => api.post('/addons', payload);
export const updateAddonGroup = (id, payload)     => api.put(`/addons/${id}`, payload);
export const deleteAddonGroup = (id)              => api.delete(`/addons/${id}`);

// ── Itens ─────────────────────────────────────────────────────
export const createAddonItem  = (groupId, payload) => api.post(`/addons/${groupId}/items`, payload);
export const updateAddonItem  = (itemId, payload)  => api.put(`/addons/items/${itemId}`, payload);
export const deleteAddonItem  = (itemId)           => api.delete(`/addons/items/${itemId}`);

// ── Ligação produto <-> grupos ─────────────────────────────────
export const getProductAddonGroups = (productId)           => api.get(`/addons/product/${productId}`);
export const setProductAddonGroups = (productId, groupIds) => api.put(`/addons/product/${productId}`, { groupIds });
