const db       = require('../config/database');
const AppError = require('../utils/AppError');

class Tenant {

  // ── Leitura ─────────────────────────────────────────────────

  static async findById(id, dbClient = db) {
    const { rows } = await dbClient.query(
      'SELECT * FROM tenants WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  }

  // ── Criacao ──────────────────────────────────────────────────

  /**
   * Cria um tenant.
   * Em caso de conflito de slug, adiciona sufixo numerico aleatorio.
   * Deve ser chamado dentro de uma transaction.
   */
  static async create({
    name,
    slug,
    plan                  = 'basic',
    subscription_status   = 'active',
    trial_ends_at         = null,
    premium_trial_ends_at = null,
  }, dbClient = db) {
    const { rows } = await dbClient.query(
      `INSERT INTO tenants
         (name, slug, plan, subscription_status,
          trial_ends_at, premium_trial_ends_at, billing_period_start)
       VALUES ($1, $2, $3, $4, $5, $6, date_trunc('month', NOW()))
       ON CONFLICT (slug)
         DO UPDATE SET slug = $2 || '-' || floor(random()*9000+1000)::text
       RETURNING *`,
      [name, slug, plan, subscription_status, trial_ends_at, premium_trial_ends_at]
    );
    return rows[0];
  }

  // ── Plano ────────────────────────────────────────────────────

  static async updatePlan(id, plan, dbClient = db) {
    const { rows } = await dbClient.query(
      `UPDATE tenants
       SET plan = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, plan]
    );
    if (!rows[0]) throw new AppError('Tenant nao encontrado.', 404);
    return rows[0];
  }

  // ── Contador mensal de pedidos ────────────────────────────────

  /**
   * Incrementa o contador mensal de pedidos em +1.
   * Fire-and-forget — chamadores devem usar .catch() para nao propagar falhas.
   */
  static async incrementOrderCount(id, dbClient = db) {
    const { rows } = await dbClient.query(
      `UPDATE tenants
       SET orders_count_monthly = orders_count_monthly + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING orders_count_monthly`,
      [id]
    );
    return rows[0]?.orders_count_monthly ?? 0;
  }

  /**
   * Zera o contador e reinicia o periodo de billing para o inicio do mes atual.
   * Chamado lazily pelo plan.middleware quando detecta virada de periodo.
   */
  static async resetMonthlyCounter(id, dbClient = db) {
    await dbClient.query(
      `UPDATE tenants
       SET orders_count_monthly = 0,
           billing_period_start = date_trunc('month', NOW()),
           updated_at           = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  // ── Assinatura ───────────────────────────────────────────────

  /**
   * Atualiza campos de assinatura.
   * Todos os campos sao opcionais (COALESCE mantem o valor atual se null).
   * Preparado para integracao com Stripe / Mercado Pago.
   */
  static async updateSubscription(id, {
    subscriptionStatus,
    nextBillingDate,
    stripeCustomerId,
    paymentProvider,
  }, dbClient = db) {
    const { rows } = await dbClient.query(
      `UPDATE tenants
       SET subscription_status = COALESCE($2, subscription_status),
           next_billing_date   = COALESCE($3, next_billing_date),
           stripe_customer_id  = COALESCE($4, stripe_customer_id),
           payment_provider    = COALESCE($5, payment_provider),
           updated_at          = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, subscriptionStatus, nextBillingDate, stripeCustomerId, paymentProvider]
    );
    return rows[0];
  }

  // ── Uso atual ────────────────────────────────────────────────

  /**
   * Retorna metricas de uso do tenant (usuarios, produtos, pedidos do mes).
   * Usado pelo endpoint GET /api/tenant/usage.
   */
  static async getUsage(id, dbClient = db) {
    const { rows } = await dbClient.query(
      `SELECT
         t.orders_count_monthly,
         t.billing_period_start,
         COUNT(DISTINCT u.id)  FILTER (WHERE u.active = true)  AS users_count,
         COUNT(DISTINCT p.id)  FILTER (WHERE p.active = true)  AS products_count,
         COUNT(DISTINCT o.id)  FILTER (
           WHERE o.created_at >= date_trunc('month', NOW())
         )                                                       AS orders_this_period
       FROM  tenants  t
       LEFT  JOIN users    u ON u.tenant_id = t.id
       LEFT  JOIN products p ON p.tenant_id = t.id
       LEFT  JOIN orders   o ON o.tenant_id = t.id
       WHERE t.id = $1
       GROUP BY t.orders_count_monthly, t.billing_period_start`,
      [id]
    );
    return rows[0] || {};
  }
}

module.exports = Tenant;
