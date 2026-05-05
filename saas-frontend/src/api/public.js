import api from './axios';

export const getPublicMenu = (slug) =>
  api.get(`/public/${slug}`);

export const createPublicOrder = (slug, data) =>
  api.post(`/public/${slug}/orders`, data);

export const trackPublicOrder = (id) =>
  api.get(`/public/order/${id}`);
