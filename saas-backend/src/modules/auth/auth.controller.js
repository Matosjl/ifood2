const { validationResult } = require('express-validator');
const authService          = require('./auth.service');
const User                 = require('../../models/User');
const asyncHandler         = require('../../utils/asyncHandler');
const AppError             = require('../../utils/AppError');

// ── Helpers ──────────────────────────────────────────────────

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(
      errors.array().map(e => e.msg).join('. '),
      422
    );
  }
};

// ── Controllers ───────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Cria tenant + usuário owner. Retorna tokens.
 */
const register = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { tenantName, name, email, password } = req.body;
  const result = await authService.register({ tenantName, name, email, password });
  res.status(201).json({ success: true, data: result });
});

/**
 * POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { email, password } = req.body;
  const result = await authService.login({ email, password });
  res.status(200).json({ success: true, data: result });
});

/**
 * POST /api/auth/refresh
 * Recebe { refreshToken } no body, retorna novo par de tokens.
 */
const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new AppError('refreshToken é obrigatório.', 400);
  const result = await authService.refresh(refreshToken);
  res.status(200).json({ success: true, data: result });
});

/**
 * POST /api/auth/logout
 * Requer autenticação. Revoga o refresh token enviado.
 */
const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await authService.logout(req.user.userId, refreshToken);
  }
  res.status(200).json({ success: true, message: 'Logout realizado com sucesso.' });
});

/**
 * GET /api/auth/me
 * Retorna dados do usuário autenticado.
 */
const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.userId, req.user.tenantId);
  if (!user) throw new AppError('Usuário não encontrado.', 404);
  res.status(200).json({ success: true, data: { user } });
});

module.exports = { register, login, refresh, logout, me };
