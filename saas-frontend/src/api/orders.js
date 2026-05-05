import { v4 as uuidv4 } from 'uuid';
import api from './axios';

export const getOrders  = (params)      => api.get('/orders', { params });
export const getOrder   = (id)          => api.get(`/orders/${id}`);
export const getProducts = (params)     => api.get('/products', { params });

export const createOrder = (payload) =>
  api.post('/orders', payload, {
    headers: { 'X-Idempotency-Key': uuidv4() },
  });

export const updateOrderStatus = (id, status) =>
  api.patch(`/orders/${id}/status`, { status });

export const cancelOrder = (id) =>
  api.patch(`/orders/${id}/status`, { status: 'cancelled' });

export const login = (email, password) =>
  api.post('/auth/login', { email, password });
