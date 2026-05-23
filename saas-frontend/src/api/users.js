import api from './axios';

// ── Equipe (team management) ──────────────────────────────────
export const listUsers      = ()           => api.get('/users');
export const createUser     = (data)       => api.post('/users', data);
export const updateUser     = (id, data)   => api.patch(`/users/${id}`, data);
export const deactivateUser = (id)         => api.delete(`/users/${id}`);

// ── Perfil do usuário logado ──────────────────────────────────
export const updateProfile       = (data) => api.put('/auth/profile', data);

// ── Perfil do restaurante (owner) ────────────────────────────
export const updateTenantProfile = (data) => api.put('/tenant/profile', data);
export const getTenantInfo       = ()     => api.get('/tenant/me');

// ── Configurações avançadas do restaurante ───────────────────
export const getFullSettings   = ()     => api.get('/tenant/full-settings');
export const updateSettings    = (data) => api.patch('/tenant/settings', data);

// ── WhatsApp / Evolution API ─────────────────────────────────
export const getWhatsappStatus    = ()  => api.get('/tenant/whatsapp/status');
export const connectWhatsapp      = ()  => api.post('/tenant/whatsapp/connect');
export const disconnectWhatsapp   = ()  => api.delete('/tenant/whatsapp/disconnect');

// ── Cupons ────────────────────────────────────────────────────
export const listCoupons     = ()         => api.get('/coupons');
export const createCoupon    = (data)     => api.post('/coupons', data);
export const updateCoupon    = (id, data) => api.patch(`/coupons/${id}`, data);
export const validateCoupon  = (data)     => api.post('/coupons/validate', data);

// ── Mesas ─────────────────────────────────────────────────────
export const listTables    = ()         => api.get('/tables');
export const createTable   = (data)     => api.post('/tables', data);
export const updateTable   = (id, data) => api.patch(`/tables/${id}`, data);
export const deleteTable   = (id)       => api.delete(`/tables/${id}`);

// ── Campanhas WhatsApp ────────────────────────────────────────
export const listCampaigns   = ()         => api.get('/campaigns');
export const previewCampaign = (segment)  => api.get('/campaigns/preview', { params: { segment } });
export const createCampaign  = (data)     => api.post('/campaigns', data);
export const sendCampaign    = (id)       => api.post(`/campaigns/${id}/send`);

// ── Leads CRM ─────────────────────────────────────────────────
export const createLead  = (data)  => api.post('/tenant/leads', data);
export const importLeads = (leads) => api.post('/tenant/leads/import', { leads });

// ── CRM ───────────────────────────────────────────────────────
export const listCRMCustomers  = (params) => api.get('/tenant/crm', { params });
export const getCRMCustomer    = (id)     => api.get(`/tenant/crm/${id}`);
export const updateCRMCustomer = (id, data) => api.patch(`/tenant/crm/${id}`, data);
