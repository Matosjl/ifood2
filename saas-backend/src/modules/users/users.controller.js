const bcrypt             = require('bcryptjs');
const { validationResult } = require('express-validator');
const User               = require('../../models/User');
const asyncHandler       = require('../../utils/asyncHandler');
const AppError           = require('../../utils/AppError');

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    throw new AppError(errors.array().map((e) => e.msg).join('. '), 422);
};

// ── Equipe (team management) ──────────────────────────────────

/** GET /api/users */
const list = asyncHandler(async (req, res) => {
  const users = await User.findAll(req.user.tenantId);
  res.json({ success: true, data: users });
});

/** POST /api/users — cria colaborador no mesmo tenant */
const create = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { name, email, password, role = 'staff' } = req.body;

  const existing = await User.findByEmail(email);
  if (existing) throw new AppError('E-mail já cadastrado.', 409);

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    tenantId: req.user.tenantId,
    name,
    email,
    passwordHash,
    role,
  });
  res.status(201).json({ success: true, data: user });
});

/** PATCH /api/users/:id — altera role ou ativa/desativa */
const update = asyncHandler(async (req, res) => {
  handleValidation(req);
  if (req.params.id === req.user.userId)
    throw new AppError('Use /api/auth/profile para alterar seu próprio perfil.', 400);

  const { role, active } = req.body;
  const user = await User.update(req.params.id, req.user.tenantId, { role, active });
  if (!user) throw new AppError('Usuário não encontrado.', 404);
  res.json({ success: true, data: user });
});

/** DELETE /api/users/:id — desativa colaborador */
const remove = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.userId)
    throw new AppError('Não é possível desativar sua própria conta por aqui.', 400);

  const user = await User.deactivate(req.params.id, req.user.tenantId);
  if (!user) throw new AppError('Usuário não encontrado.', 404);
  res.json({ success: true, message: 'Usuário desativado.' });
});

module.exports = { list, create, update, remove };
