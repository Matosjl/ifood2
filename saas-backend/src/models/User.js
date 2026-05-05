const crypto = require('crypto');
const db     = require('../config/database');

/** Hash de tokens de refresh para não guardar o valor bruto no banco. */
const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

class User {
  // ── Queries ────────────────────────────────────────────────

  /**
   * Busca usuário pelo e-mail (join com tenant para autenticação).
   * Não filtra por tenant_id — necessário para login onde o tenant
   * ainda não é conhecido.
   */
  static async findByEmail(email, dbClient = db) {
    const { rows } = await dbClient.query(
      `SELECT u.id, u.tenant_id, u.name, u.email, u.password_hash,
              u.role, u.active,
              t.name                AS tenant_name,
              t.slug                AS tenant_slug,
              t.plan                AS tenant_plan,
              t.active              AS tenant_active,
              t.subscription_status AS tenant_subscription_status
       FROM   users u
       JOIN   tenants t ON t.id = u.tenant_id
       WHERE  u.email = $1`,
      [email.toLowerCase().trim()]
    );
    return rows[0] || null;
  }

  /** Busca usuário pelo ID, filtrado pelo tenant (segurança multi-tenant). */
  static async findById(id, tenantId, dbClient = db) {
    const { rows } = await dbClient.query(
      `SELECT id, tenant_id, name, email, role, active, created_at, updated_at
       FROM   users
       WHERE  id = $1 AND tenant_id = $2 AND active = true`,
      [id, tenantId]
    );
    return rows[0] || null;
  }

  /** Lista todos os usuários do tenant. */
  static async findAll(tenantId, dbClient = db) {
    const { rows } = await dbClient.query(
      `SELECT id, name, email, role, active, created_at
       FROM   users
       WHERE  tenant_id = $1
       ORDER  BY created_at DESC`,
      [tenantId]
    );
    return rows;
  }

  /** Cria um novo usuário. */
  static async create({ tenantId, name, email, passwordHash, role = 'staff' }, dbClient = db) {
    const { rows } = await dbClient.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, tenant_id, name, email, role, created_at`,
      [tenantId, name.trim(), email.toLowerCase().trim(), passwordHash, role]
    );
    return rows[0];
  }

  // ── Refresh Tokens ─────────────────────────────────────────

  /** Persiste o hash do refresh token no banco. */
  static async saveRefreshToken({ userId, token, expiresAt }, dbClient = db) {
    await dbClient.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, hashToken(token), expiresAt]
    );
  }

  /**
   * Verifica se o token (bruto) está registrado e não expirou.
   * Retorna a linha, ou null se inválido.
   */
  static async findRefreshToken(userId, token, dbClient = db) {
    const { rows } = await dbClient.query(
      `SELECT * FROM refresh_tokens
       WHERE  user_id = $1
         AND  token_hash = $2
         AND  expires_at > NOW()`,
      [userId, hashToken(token)]
    );
    return rows[0] || null;
  }

  /** Remove um refresh token específico (logout). */
  static async deleteRefreshToken(userId, token, dbClient = db) {
    await dbClient.query(
      `DELETE FROM refresh_tokens
       WHERE user_id = $1 AND token_hash = $2`,
      [userId, hashToken(token)]
    );
  }

  /** Remove todos os refresh tokens do usuário (logout em todos os dispositivos). */
  static async deleteAllRefreshTokens(userId, dbClient = db) {
    await dbClient.query(
      `DELETE FROM refresh_tokens WHERE user_id = $1`,
      [userId]
    );
  }

  /** Remove tokens expirados (executar periodicamente via cron). */
  static async purgeExpiredTokens(dbClient = db) {
    const { rowCount } = await dbClient.query(
      `DELETE FROM refresh_tokens WHERE expires_at <= NOW()`
    );
    return rowCount;
  }

  // ── Profile updates ────────────────────────────────────────

  /** Busca usuário com password_hash (para verificação de senha). */
  static async findByIdWithHash(id, tenantId, dbClient = db) {
    const { rows } = await dbClient.query(
      `SELECT id, tenant_id, name, email, password_hash, role, active
       FROM   users
       WHERE  id = $1 AND tenant_id = $2 AND active = true`,
      [id, tenantId]
    );
    return rows[0] || null;
  }

  /**
   * Atualiza campos do usuário (null = sem alteração via COALESCE).
   * Campos aceitos: name, passwordHash, role, active.
   */
  static async update(id, tenantId, { name, passwordHash, role, active } = {}, dbClient = db) {
    const { rows } = await dbClient.query(
      `UPDATE users
       SET name          = COALESCE($3, name),
           password_hash = COALESCE($4, password_hash),
           role          = COALESCE($5, role),
           active        = COALESCE($6, active),
           updated_at    = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, tenant_id, name, email, role, active, created_at, updated_at`,
      [id, tenantId,
       name        ?? null,
       passwordHash ?? null,
       role        ?? null,
       active      ?? null]
    );
    return rows[0] || null;
  }

  /** Desativa um usuário (soft-delete). */
  static async deactivate(id, tenantId, dbClient = db) {
    const { rows } = await dbClient.query(
      `UPDATE users SET active = false, updated_at = NOW()
       WHERE  id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );
    return rows[0] || null;
  }
}

module.exports = User;
