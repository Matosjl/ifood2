import api from './axios';

export const getCurrentCaixa = ()            => api.get('/caixa/current');
export const openCaixa       = (body)        => api.post('/caixa/open', body);
export const closeCaixa      = (body = {})   => api.post('/caixa/close', body);
export const getCaixaHistory = (params = {}) => api.get('/caixa/history', { params });
export const getCaixaById    = (id)          => api.get(`/caixa/${id}`);
