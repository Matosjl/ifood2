import api from './axios';

export const getBancoBalance      = ()           => api.get('/banco/balance');
export const getBancoTransactions = (params={})  => api.get('/banco/transactions', { params });
export const addBancoTransaction  = (data)       => api.post('/banco/transactions', data);
export const deleteBancoTransaction = (id)       => api.delete(`/banco/transactions/${id}`);
