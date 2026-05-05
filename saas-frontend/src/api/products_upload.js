import api from './axios';

export const uploadProductImage = (productId, file) => {
  const form = new FormData();
  form.append('image', file);
  return api.post(`/products/${productId}/image`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
