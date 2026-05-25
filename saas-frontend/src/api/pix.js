import api from './axios';

export const getPixConfig      = ()         => api.get('/pix/config');
export const savePixConfig     = (data)     => api.put('/pix/config', data);
export const generatePixCharge = (orderId)  => api.post(`/pix/orders/${orderId}/charge`);
export const getPixStatus      = (orderId)  => api.get(`/pix/orders/${orderId}/status`);
