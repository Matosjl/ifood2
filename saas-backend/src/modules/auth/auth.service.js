const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const db       = require('../../config/database');
const env      = require('../../config/env');
const User     = require('../../models/User');
const Tenant   = require('../../models/Tenant');
const AppError = require('../../utils/AppError');
const { TRIAL_DAYS, PREMIUM_TRIAL_DAYS } = require('../../config/plans');

// ── Helpers ──────────────────────────────────────────────────

const signAccessToken = (userId, tenantId, role) =>
  jwt.sign(
    { sub: userId, tenantId, role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

const signRefreshToken = (userId) =>
  jwt.sign(
    { sub: userId, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN }
  );

const parseExpiry = (expiresIn) => {
  // Converte '7d' → Date de expiração
  const units = { s: 1, m: 60, h: 3600, d: 86400 };
  const match  = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error('Formato de expiração inválido');
  const seconds = parseInt(match[1], 10) * units[match[2]];
  return new Date(Date.now() + seconds * 1000);
};

const slugify = (name) =>
  name.toLowerCase().trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 100);

// ── Service ───────────────────────────────────────────────────

/**
 * Registra um novo tenant e seu primeiro usuário (owner).
 * Tudo em uma única transaction.
 * @param {boolean} [trial=false] — se true, coloca em trialing por 14 dias
 */
const register = async ({ tenantName, name, email, password, trial = false }) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Verifica se e-mail já existe globalmente
    const existing = await User.findByEmail(email, client);
    if (existing) throw new AppError('E-mail já cadastrado.', 409);

    // Cria tenant usando o model (inclui campos de assinatura)
    const slug   = slugify(tenantName);
    const now = Date.now();
    const tenant = await Tenant.create(
      {
        name:                    tenantName.trim(),
        slug,
        plan:                    trial ? 'premium' : 'basic',  // começa no Premium durante trial
        subscription_status:     trial ? 'trialing' : 'active',
        trial_ends_at:           trial ? new Date(now + TRIAL_DAYS         * 24 * 60 * 60 * 1000) : null,
        premium_trial_ends_at:   trial ? new Date(now + PREMIUM_TRIAL_DAYS * 24 * 60 * 60 * 1000) : null,
      },
      client
    );

    // Inicializa contador de pedidos
    await client.query(
      `INSERT INTO order_counters (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [tenant.id]
    );

    // Cria usuário owner
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create(
      { tenantId: tenant.id, name, email, passwordHash, role: 'owner' },
      client
    );

    await client.query('COMMIT');

    // Emite tokens
    const accessToken  = signAccessToken(user.id, tenant.id, user.role);
    const refreshToken = signRefreshToken(user.id);
    await User.saveRefreshToken({
      userId: user.id,
      token: refreshToken,
      expiresAt: parseExpiry(env.JWT_REFRESH_EXPIRES_IN),
    });

    return {
      accessToken,
      refreshToken,
      user:   { id: user.id, name: user.name, email: user.email, role: user.role },
      tenant: {
        id:                   tenant.id,
        name:                 tenant.name,
        slug:                 tenant.slug,
        plan:                 tenant.plan,
        subscriptionStatus:   tenant.subscription_status,
        trialEndsAt:          tenant.trial_ends_at          ?? null,
        premiumTrialEndsAt:   tenant.premium_trial_ends_at  ?? null,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/** Autentica usuário e retorna par de tokens. */
const login = async ({ email, password }) => {
  const user = await User.findByEmail(email);
  if (!user) throw new AppError('E-mail ou senha incorretos.', 401);
  if (!user.active) throw new AppError('Conta inativa. Contate o suporte.', 403);
  if (!user.tenant_active) throw new AppError('Tenant inativo. Contate o suporte.', 403);

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) throw new AppError('E-mail ou senha incorretos.', 401);

  const accessToken  = signAccessToken(user.id, user.tenant_id, user.role);
  const refreshToken = signRefreshToken(user.id);

  await User.saveRefreshToken({
    userId: user.id,
    token: refreshToken,
    expiresAt: parseExpiry(env.JWT_REFRESH_EXPIRES_IN),
  });

  return {
    accessToken,
    refreshToken,
    user:   { id: user.id, name: user.name, email: user.email, role: user.role },
    tenant: {
      id:                  user.tenant_id,
      name:                user.tenant_name,
      slug:                user.tenant_slug,
      plan:                user.tenant_plan,
      subscriptionStatus:  user.tenant_subscription_status ?? 'active',
      trialEndsAt:         user.tenant_trial_ends_at         ?? null,
      premiumTrialEndsAt:  user.tenant_premium_trial_ends_at ?? null,
    },
  };
};

/**
 * Rotaciona o refresh token.
 * Estratégia: delete o token antigo, emite par novo.
 */
const refresh = async (rawRefreshToken) => {
  let payload;
  try {
    payload = jwt.verify(rawRefreshToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError('Refresh token inválido ou expirado.', 401);
  }

  if (payload.type !== 'refresh') throw new AppError('Token inválido.', 401);

  const stored = await User.findRefreshToken(payload.sub, rawRefreshToken);
  if (!stored) throw new AppError('Refresh token revogado ou inexistente.', 401);

  // Busca dados do usuário
  const { rows } = await db.query(
    `SELECT u.id, u.tenant_id, u.role, u.active
     FROM users u WHERE u.id = $1`,
    [payload.sub]
  );
  const user = rows[0];
  if (!user || !user.active) throw new AppError('Usuário inativo.', 401);

  // Rotaciona: deleta antigo, emite novo
  await User.deleteRefreshToken(user.id, rawRefreshToken);

  const newAccessToken  = signAccessToken(user.id, user.tenant_id, user.role);
  const newRefreshToken = signRefreshToken(user.id);

  await User.saveRefreshToken({
    userId: user.id,
    token: newRefreshToken,
    expiresAt: parseExpiry(env.JWT_REFRESH_EXPIRES_IN),
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

/** Invalida o refresh token (logout). */
const logout = async (userId, rawRefreshToken) => {
  await User.deleteRefreshToken(userId, rawRefreshToken);
};

module.exports = { register, login, refresh, logout };
