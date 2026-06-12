import api from './axios';

export const getFiadoResumo       = ()             => api.get('/fiado/resumo');
export const listFiadoClientes    = (params)       => api.get('/fiado/clientes', { params });
export const createFiadoCliente   = (data)         => api.post('/fiado/clientes', data);
export const updateFiadoCliente   = (id, data)     => api.put(`/fiado/clientes/${id}`, data);
export const deleteFiadoCliente   = (id)           => api.delete(`/fiado/clientes/${id}`);
export const toggleBloqueio       = (id)           => api.patch(`/fiado/clientes/${id}/bloquear`);
export const listFiadoCompras     = (clienteId)    => api.get(`/fiado/clientes/${clienteId}/compras`);
export const createFiadoCompra    = (data)         => api.post('/fiado/compras', data);
export const pagarFiadoCompra     = (id, data)     => api.patch(`/fiado/compras/${id}/pagar`, data);
export const cancelarFiadoCompra  = (id)           => api.patch(`/fiado/compras/${id}/cancelar`);
