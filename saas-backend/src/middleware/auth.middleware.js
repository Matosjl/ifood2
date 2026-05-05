const jwt      = require('jsonwebtoken');
const env      = require('../config/env');
const AppError = require('../utils/AppError');

/**
 * Verifica o Bearer token e injeta req.user = { userId, tenantId, role }.
 * Todas as rotas protegidas devem usar este middleware.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Token de autenticação não fornecido.', 401));
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.user = {
      userId:   payload.sub,
      tenantId: payload.tenantId,
      role:     payload.role,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Token expirado. Faça login novamente.', 401));
    }
    return next(new AppError('Token inválido.', 401));
  }
};

/**
 * Verifica se o usuário possui um dos roles permitidos.
 * Deve ser usado após authenticate.
 *
 * Exemplo: authorize('owner', 'manager')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Não autenticado.', 401));
  }
  if (!roles.includes(req.user.role)) {
    return next(new AppError('Acesso negado. Permissão insuficiente.', 403));
  }
  next();
};

module.exports = { authenticate, authorize };
