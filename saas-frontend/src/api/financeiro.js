import api from './axios';

// ── Revenue summary ───────────────────────────────────────────
export const getSummary = (period = 'today') =>
  api.get('/financeiro/summary', { params: { period } });

// ── Monthly result ────────────────────────────────────────────
export const getResult = (month) =>
  api.get('/financeiro/result', { params: { month } });

// ── Expenses ──────────────────────────────────────────────────
export const getExpenses    = (month) =>
  api.get('/financeiro/expenses', { params: { month } });

export const getReminders   = () =>
  api.get('/financeiro/expenses/reminders');

export const createExpense  = (body) =>
  api.post('/financeiro/expenses', body);

export const updateExpense  = (id, body) =>
  api.put(`/financeiro/expenses/${id}`, body);

export const payExpense     = (id) =>
  api.patch(`/financeiro/expenses/${id}/pay`);

export const deleteExpense  = (id) =>
  api.delete(`/financeiro/expenses/${id}`);
