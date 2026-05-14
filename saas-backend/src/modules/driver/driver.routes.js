const { Router }         = require('express');
const { body }           = require('express-validator');
const jwt                = require('jsonwebtoken');
const env                = require('../../config/env');
const AppError           = require('../../utils/AppError');
const { authenticate }   = require('../../middleware/auth.middleware');
const ctrl               = require('./driver.controller');

const router = Router();

// ── Middleware de autenticação para motoboys ──────────────────
// Drivers têm JWT com role='driver' e sub=driverId (sem tenantId)

const authDriver = (req, res, next) => {
  const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!raw) return next(new AppError('Token não fornecido.', 401));
  try {
    const payload = jwt.verify(raw, env.JWT_SECRET);
    if (payload.role !== 'driver') return next(new AppError('Acesso restrito a motoboys.', 403));
    req.driverId = payload.sub;
    next();
  } catch (err) {
    next(new AppError(err.name === 'TokenExpiredError' ? 'Token expirado.' : 'Token inválido.', 401));
  }
};

// ── Validadores ───────────────────────────────────────────────

const registerRules = [
  body('name').trim().notEmpty().withMessage('Nome é obrigatório.'),
  body('email').isEmail().normalizeEmail().withMessage('E-mail inválido.'),
  body('password').isLength({ min: 6 }).withMessage('Senha deve ter ao menos 6 caracteres.'),
];

const loginRules = [
  body('email').isEmail().normalizeEmail().withMessage('E-mail inválido.'),
  body('password').notEmpty().withMessage('Senha é obrigatória.'),
];

// ── Rotas públicas (sem auth) ─────────────────────────────────

router.post('/register', registerRules, ctrl.register);
router.post('/login',    loginRules,    ctrl.login);

// ── Rotas do motoboy (requerem authDriver) ────────────────────

router.get ('/profile',                        authDriver, ctrl.getProfile);
router.post('/connect',                        authDriver, ctrl.connect);
router.put ('/status',                         authDriver, ctrl.updateStatus);
router.put ('/location',                       authDriver, ctrl.updateLocation);
router.get ('/deliveries/available',           authDriver, ctrl.getAvailable);
router.get ('/deliveries/active',              authDriver, ctrl.getActive);
router.post('/deliveries/:orderId/accept',     authDriver, ctrl.accept);
router.post('/deliveries/:deliveryId/pickup',  authDriver, ctrl.pickup);
router.post('/deliveries/:deliveryId/pay',     authDriver, ctrl.markPaid);
router.post('/deliveries/:deliveryId/complete',authDriver, ctrl.complete);
router.get ('/stats',                          authDriver, ctrl.getStats);
router.get ('/history',                        authDriver, ctrl.getHistory);

// ── Rotas do restaurante (requerem auth normal de staff) ──────

router.get ('/restaurant/token',   authenticate, ctrl.getToken);
router.get ('/restaurant/drivers', authenticate, ctrl.getDrivers);
router.post('/restaurant/assign',  authenticate, ctrl.assign);

module.exports = router;
