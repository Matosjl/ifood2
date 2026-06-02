import api from './axios';

export const getCombo        = (productId)              => api.get(`/combos/${productId}`);
export const addComboItem    = (productId, data)        => api.post(`/combos/${productId}/items`, data);
export const removeComboItem = (productId, itemId)      => api.delete(`/combos/${productId}/items/${itemId}`);

// ── Option Groups (Combo V2) ──────────────────────────────────
export const getOptionGroups     = (productId)                  => api.get(`/combos/${productId}/option-groups`);
export const createOptionGroup   = (productId, data)            => api.post(`/combos/${productId}/option-groups`, data);
export const updateOptionGroup   = (productId, groupId, data)   => api.put(`/combos/${productId}/option-groups/${groupId}`, data);
export const deleteOptionGroup   = (productId, groupId)         => api.delete(`/combos/${productId}/option-groups/${groupId}`);
export const addOptionItem       = (productId, groupId, data)   => api.post(`/combos/${productId}/option-groups/${groupId}/items`, data);
export const removeOptionItem    = (productId, groupId, itemId) => api.delete(`/combos/${productId}/option-groups/${groupId}/items/${itemId}`);
