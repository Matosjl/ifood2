import api from './axios';

export const uploadProductImage = (productId, file) => {
  const form = new FormData();
  form.append('image', file);
  // Axios 1.x não remove o Content-Type default da instância (application/json)
  // ao detectar FormData — forçamos undefined para o browser gerar o boundary correto
  return api.post(`/products/${productId}/image`, form, {
    headers: { 'Content-Type': undefined },
  });
};
