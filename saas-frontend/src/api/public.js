import api from './axios';

export const getPublicMenu = (slug) =>
  api.get(`/public/${slug}`);

export const createPublicOrder = (slug, data) =>
  api.post(`/public/${slug}/orders`, data);

export const trackPublicOrder = (id) =>
  api.get(`/public/order/${id}`);

/** Busca dados de fidelidade do cliente pelo telefone */
export const getPublicCustomer = (slug, phone) =>
  api.get(`/public/${slug}/customer/${encodeURIComponent(phone.replace(/\D/g, ''))}`);

/** Envia avaliação de estrelas para um pedido entregue */
export const submitPublicRating = (slug, data) =>
  api.post(`/public/${slug}/ratings`, data);

/** Busca histórico de pedidos do cliente pelo telefone */
export const getPublicOrderHistory = (slug, phone) =>
  api.get(`/public/${slug}/history/${encodeURIComponent(phone.replace(/\D/g, ''))}`);
