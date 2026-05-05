import api from './axios';

export const getSummary = (period = 'today') =>
  api.get('/financeiro/summary', { params: { period } });
