import api from './axios';

export const getSugestoes      = ()            => api.get('/consumo-interno/sugestoes');
export const registrarConsumo  = (data)        => api.post('/consumo-interno', data);
export const getHistoricoConsumo = (params)    => api.get('/consumo-interno', { params });
export const getVazamentos     = (params)      => api.get('/vazamentos', { params });
