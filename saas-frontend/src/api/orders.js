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

export const searchCustomers = (q, limit) =>
  api.get('/orders/customers', { params: { q, ...(limit ? { limit } : {}) } });

export const createCustomer = (payload) =>
  api.post('/orders/customers', payload);

/** Registra pagamento de um pedido (paid_at + payment_method). */
export const markOrderPaid = (id, paymentMethod) =>
  api.patch(`/orders/${id}/paid`, { paymentMethod });

/**
 * Substitui os itens de um pedido editável.
 * @param {string} id
 * @param {Array<{productId, quantity?, weightKg?, notes?}>} items
 */
export const editOrderItems = (id, items) =>
  api.patch(`/orders/${id}/items`, { items });

/**
 * Atualiza entrega, endereço, taxa e aplica desconto/acréscimo de valor.
 * @param {string} id
 * @param {{ deliveryType?, neighborhood?, customerAddress?, deliveryFee?,
 *           notes?, adjustmentType?, adjustmentValue?, adjustmentReason? }} payload
 */
export const updateOrderInfo = (id, payload) =>
  api.patch(`/orders/${id}/info`, payload);

export const login = (email, password) =>
  api.post('/auth/login', { email, password });
