import api from './axios';

export const listInsumos          = ()                   => api.get('/insumos');
export const createInsumo         = (payload)            => api.post('/insumos', payload);
export const updateInsumo         = (id, payload)        => api.put(`/insumos/${id}`, payload);
export const deleteInsumo         = (id)                 => api.delete(`/insumos/${id}`);
export const adjustInsumoStock    = (id, qty, reason)    => api.post(`/insumos/${id}/adjust`, { qty, reason });

export const getProductInsumos    = (productId)          => api.get(`/insumos/product/${productId}`);
export const setProductInsumos    = (productId, insumos) => api.put(`/insumos/product/${productId}`, { insumos });
