const { Router }       = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const ctrl             = require('./financeiro.controller');

const router = Router();
router.use(authenticate);

// ── Revenue summary ───────────────────────────────────────────
router.get('/summary',  ctrl.summary);

// ── Monthly result (revenue vs expenses) ─────────────────────
router.get('/result',   ctrl.getResult);

// ── CMV por produto ───────────────────────────────────────────
router.get('/cmv',      ctrl.getCmvByProduct);

// ── Expenses ──────────────────────────────────────────────────
router.get('/expenses/reminders', ctrl.getReminders);
router.get('/expenses',           ctrl.listExpenses);
router.post('/expenses',          ctrl.createExpense);
router.put('/expenses/:id',       ctrl.updateExpense);
router.patch('/expenses/:id/pay', ctrl.payExpense);
router.delete('/expenses/:id',    ctrl.deleteExpense);

router.get('/audit-log', ctrl.getAuditLog);

module.exports = router;
