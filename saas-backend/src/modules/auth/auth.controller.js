const bcrypt               = require('bcryptjs');
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

/**
 * PUT /api/auth/profile
 * Body: { name?, currentPassword?, newPassword? }
 * Permite ao usuário logado atualizar nome e/ou senha.
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { name, currentPassword, newPassword } = req.body;
  const updates = {};

  if (name?.trim()) updates.name = name.trim();

  if (newPassword) {
    if (!currentPassword)
      throw new AppError('Informe a senha atual para alterá-la.', 400);
    if (newPassword.length < 8)
      throw new AppError('Nova senha deve ter pelo menos 8 caracteres.', 400);
    if (newPassword === currentPassword)
      throw new AppError('Nova senha deve ser diferente da atual.', 400);

    const userWithHash = await User.findByIdWithHash(req.user.userId, req.user.tenantId);
    if (!userWithHash) throw new AppError('Usuário não encontrado.', 404);

    const valid = await bcrypt.compare(currentPassword, userWithHash.password_hash);
    if (!valid) throw new AppError('Senha atual incorreta.', 400);

    updates.passwordHash = await bcrypt.hash(newPassword, 12);
  }

  if (!Object.keys(updates).length)
    throw new AppError('Nenhum campo para atualizar.', 400);

  const updated = await User.update(req.user.userId, req.user.tenantId, updates);
  if (!updated) throw new AppError('Usuário não encontrado.', 404);

  res.json({
    success: true,
    data: {
      id:    updated.id,
      name:  updated.name,
      email: updated.email,
      role:  updated.role,
    },
  });
});

module.exports = { register, login, refresh, logout, me, updateProfile };
