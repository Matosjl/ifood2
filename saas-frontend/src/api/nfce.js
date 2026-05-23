import api from './axios';

export const getNfceConfig  = ()         => api.get('/nfce/config');
export const saveNfceConfig = (data)     => api.put('/nfce/config', data);
export const issueNfce      = (orderId)  => api.post(`/nfce/orders/${orderId}/issue`);
export const checkNfce      = (orderId)  => api.get(`/nfce/orders/${orderId}/status`);
