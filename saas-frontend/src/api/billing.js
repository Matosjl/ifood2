import api from './axios';

/** GET /api/billing/status — retorna plano, trial e estado da conta */
export const getBillingStatus = () => api.get('/billing/status').then(r => r.data.data);

/** GET /api/billing/plans — lista de planos com links WhatsApp */
export const getBillingPlans  = () => api.get('/billing/plans').then(r => r.data.data);
