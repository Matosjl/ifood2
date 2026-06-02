import api from './axios';

/** GET /api/financeiro/receipts/pending */
export const getPendingReceipts = (status = 'awaiting_confirmation') =>
  api.get('/financeiro/receipts/pending', { params: { status } });

/** GET /api/financeiro/receipts/:id */
export const getReceipt = (id) => api.get(`/financeiro/receipts/${id}`);

/** URL completa pra preview da imagem (usado direto em <img src>) */
export const getReceiptImageUrl = (id) => {
  const base = api.defaults.baseURL || '';
  // Token vai nos headers via interceptor — pra <img> precisamos passar no query
  // ou expor signed URL. Por ora, retorna URL sem token e o componente faz fetch+blob.
  return `${base}/financeiro/receipts/${id}/image`;
};

/** Faz fetch da imagem com auth e retorna object URL pra <img src> */
export const fetchReceiptImage = async (id) => {
  const res = await api.get(`/financeiro/receipts/${id}/image`, { responseType: 'blob' });
  return URL.createObjectURL(res.data);
};

/** POST /api/financeiro/receipts/upload — multipart com File */
export const uploadReceipt = (file) => {
  const form = new FormData();
  form.append('image', file);
  return api.post('/financeiro/receipts/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000, // OCR pode demorar
  });
};

/** POST /api/financeiro/receipts/:id/confirm */
export const confirmReceipt = (id) =>
  api.post(`/financeiro/receipts/${id}/confirm`);

/** PUT /api/financeiro/receipts/:id — edita raw_extraction / matched_items */
export const editReceipt = (id, patch) =>
  api.put(`/financeiro/receipts/${id}`, patch);

/** DELETE /api/financeiro/receipts/:id — rejeita (não apaga) */
export const rejectReceipt = (id, reason) =>
  api.delete(`/financeiro/receipts/${id}`, { data: { reason } });

/** GET /api/financeiro/receipts/revisar — todas as notas que precisam de atenção */
export const getRevisarReceipts = () =>
  api.get('/financeiro/receipts/revisar');

/** GET /api/financeiro/receipts/revisar/count — badge do Sidebar */
export const getRevisarCount = () =>
  api.get('/financeiro/receipts/revisar/count');

/** POST /api/financeiro/receipts/:id/items/:idx/resolve */
export const resolveReceiptItem = (id, idx, body) =>
  api.post(`/financeiro/receipts/${id}/items/${idx}/resolve`, body);
