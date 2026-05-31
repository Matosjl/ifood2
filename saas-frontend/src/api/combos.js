import api from './axios';

export const getCombo     = (productId)              => api.get(`/combos/${productId}`);
export const addComboItem = (productId, data)        => api.post(`/combos/${productId}/items`, data);
export const removeComboItem = (productId, itemId)  => api.delete(`/combos/${productId}/items/${itemId}`);
