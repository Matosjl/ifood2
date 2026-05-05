const { Router }                  = require('express');
const { body }                    = require('express-validator');
const rateLimit                   = require('express-rate-limit');
const { authenticate }            = require('../../middleware/auth.middleware');
const { register, login, refresh, logout, me, updateProfile } = require('./auth.controller');

const router = Router();

// Rate limit exclusivo para rotas de auth (evita brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max: 15,
  message: { success: false, message: 'Muitas tentativas. Aguarde 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Validadores ───────────────────────────────────────────────

const registerRules = [
  body('tenantName').trim().notEmpty().withMessage('Nome do restaurante é obrigatório.')
    .isLength({ max: 200 }).withMessage('Nome do restaurante muito longo.'),
  body('name').trim().notEmpty().withMessage('Nome do usuário é obrigatório.'),
  body('email').isEmail().normalizeEmail().withMessage('E-mail inválido.'),
  body('password').isLength({ min: 8 }).withMessage('Senha deve ter pelo menos 8 caracteres.'),
];

const loginRules = [
  body('email').isEmail().normalizeEmail().withMessage('E-mail inválido.'),
  body('password').notEmpty().withMessage('Senha é obrigatória.'),
];

// ── Rotas ─────────────────────────────────────────────────────

router.post('/register', authLimiter, registerRules, register);
router.post('/login',    authLimiter, loginRules,    login);
router.post('/refresh',  authLimiter, refresh);
router.post('/logout',   authenticate, logout);
router.get('/me',        authenticate, me);
router.put('/profile',   authenticate, updateProfile);

module.exports = router;
