import api from './axios';

export const getOverhead    = ()        => api.get('/precificador/overhead');
export const saveOverhead   = (payload) => api.put('/precificador/overhead', payload);
export const calculate      = (payload) => api.post('/precificador/calculate', payload);
export const listHistory    = (limit)   => api.get('/precificador/history', { params: { limit } });
