import api from './axios';

export const getCurrentCaixa  = ()            => api.get('/caixa/current', { params: { _t: Date.now() } });
export const openCaixa        = (body)        => api.post('/caixa/open', body);
export const closeCaixa       = (body = {})   => api.post('/caixa/close', body);
export const getCaixaHistory  = (params = {}) => api.get('/caixa/history', { params });
export const getCaixaById     = (id)          => api.get(`/caixa/${id}`);
export const postSangria      = (body)        => api.post('/caixa/sangria', body);
export const postSuprimento   = (body)        => api.post('/caixa/suprimento', body);
export const getCaixaMovements = (params={})  => api.get('/caixa/movements', { params });
