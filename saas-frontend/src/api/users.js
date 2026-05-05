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
