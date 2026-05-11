import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/admin`
  : '/api/admin';

const adminApi = (key) => axios.create({
  baseURL: BASE,
  headers: { 'X-Admin-Key': key, 'Content-Type': 'application/json' },
});

export const listTenants      = (key)                => adminApi(key).get('/tenants');
export const createTenant     = (key, data)          => adminApi(key).post('/tenants', data);
export const updateTenant     = (key, id, data)      => adminApi(key).patch(`/tenants/${id}`, data);
export const activateTenant   = (key, id, plan)      => adminApi(key).post(`/tenants/${id}/activate`, { plan });
export const extendTrial      = (key, id, days = 7)  => adminApi(key).post(`/tenants/${id}/extend-trial`, { days });
export const deactivateTenant = (key, id)            => adminApi(key).delete(`/tenants/${id}`);
export const destroyTenant    = (key, id)            => adminApi(key).delete(`/tenants/${id}/destroy`);
