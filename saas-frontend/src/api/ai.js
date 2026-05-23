/**
 * AI API — Chamadas para agentes IA (via VPS1 → VPS2)
 */
import axios from 'axios';
import api from './axios';

const ADMIN_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/admin`
  : '/api/admin';

const adminApi = (key) => axios.create({
  baseURL: ADMIN_BASE,
  headers: { 'X-Admin-Key': key, 'Content-Type': 'application/json' },
  timeout: 15000,
});

// ── Agente Financeiro ──────────────────────────────────────────────
export const interpretFinancial = (message) =>
  api.post('/ai/financial/interpret', { message });

// ── Agente Gerente ─────────────────────────────────────────────────
export const managerAnalyze = (period = 'week', type = 'full') =>
  api.post('/ai/manager/analyze', { period, type });

export const getManagerAlerts = () =>
  api.get('/ai/manager/alerts');

// ── Agente de Marketing ────────────────────────────────────────────
export const generateMarketing = (type, context = {}) =>
  api.post('/ai/marketing/generate', { type, context });

// ── OCR de Nota Fiscal ─────────────────────────────────────────────
export const submitOcrInvoice = (imageBase64) =>
  api.post('/ai/ocr/invoice', { imageBase64 });

export const getOcrJob = (jobId) =>
  api.get(`/ai/ocr/jobs/${jobId}`);

// ── Cardápio do Dia (WhatsApp) ─────────────────────────────────────
export const getWhatsAppMenu = () =>
  api.get('/ai/menu');

export const clearWhatsAppMenu = () =>
  api.delete('/ai/menu');

// ── Admin: IA health + usage ───────────────────────────────────────
export const getAdminAiHealth = (key) =>
  adminApi(key).get('/ai/health');

export const getAdminAiUsage = (key, days = 30) =>
  adminApi(key).get('/ai/usage', { params: { days } });
