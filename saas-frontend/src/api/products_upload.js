import api from './axios';

export const uploadProductImage = (productId, file) => {
  const form = new FormData();
  form.append('image', file);
  // NÃO definir Content-Type manualmente — axios detecta FormData e
  // gera automaticamente "multipart/form-data; boundary=XXXX" correto
  return api.post(`/products/${productId}/image`, form);
};
