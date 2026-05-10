const Tenant       = require('../models/Tenant');
const { PLANS, OWNER_WHATSAPP }    = require('../config/plans');
const AppError     = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const db           = require('../config/database');
const { createLogger } = require('../utils/logger');

const logger = createLogger('PlanMiddleware');

// ── Helpers ───────────────────────────────────────────────────

const isPeriodExpired = (billingPeriodStart) => {
  const start = new Date(billingPeriodStart);
  const now   = new Date();
  return (
    now.getFullYear() !== start.getFullYear() ||
    now.getMonth()    !== start.getMonth()
  );
};

const whatsappLink = (tenantName, planName) => {
  const msg = encodeURIComponent(
    `Olá! Gostaria de assinar o Zapfome.\nRestaurante: ${tenantName}\nPlano desejado: ${planName}`
  );
  return `https://wa.me/${OWNER_WHATSAPP}?text=${msg}`;
};

// ── Trial lazy updater ─────────────────────────────────────────
/**
 * Verifica e atualiza o estado do trial de forma lazy (a cada request).
 *
 * Regras:
 *  - Dias 1-3  (premium_trial_ends_at > NOW): plano = 'premium', status = 'trialing'
 *  - Dias 4-10 (trial_ends_at > NOW):         plano = 'basic',   status = 'trialing'
 *  - Após 10 dias:                             status = 'suspended'
 *
 * Retorna o tenant atualizado.
 */
const checkAndUpdateTrial = async (tenant) => {
  if (tenant.subscription_status !== 'trialing') return tenant;

  const now = new Date();

  // Trial total expirou → suspender
  if (tenant.trial_ends_at && new Date(tenant.trial_ends_at) < now) {
    await db.query(
      `UPDATE tenants SET subscription_status = 'suspended', updated_at = NOW() WHERE id = $1`,
      [tenant.id]
    );
    logger.info('Trial expirado — conta suspensa', { tenantId: tenant.id });
    return { ...tenant, subscription_status: 'suspended' };
  }

  // Premium trial expirou → rebaixar para basic
  if (
    tenant.premium_trial_ends_at &&
    new Date(tenant.premium_trial_ends_at) < now &&
    tenant.plan === 'premium'
  ) {
    await db.query(
      `UPDATE tenants SET plan = 'basic', updated_at = NOW() WHERE id = $1`,
      [tenant.id]
    );
    logger.info('Período Premium expirado — rebaixado para Basic', { tenantId: tenant.id });
    return { ...tenant, plan: 'basic' };
  }

  return tenant;
};

// ── Middleware factory ────────────────────────────────────────

/**
 * checkOrderLimit — add BEFORE the create-order handler.
 *
 * 1. Verifica se o tenant esta ativo e com assinatura valida.
 * 2. Aplica lógica de trial (lazy): Premium 3 dias → Basic 7 dias → Suspended.
 * 3. Faz reset lazy do contador mensal se o periodo virou.
 * 4. Bloqueia com 402 se o limite do plano foi atingido.
 */
const checkOrderLimit = asyncHandler(async (req, res, next) => {
  let tenant = await Tenant.findById(req.user.tenantId);

  if (!tenant) throw new AppError('Tenant nao encontrado.', 404);
  if (!tenant.active) throw new AppError('Conta inativa. Contate o suporte.', 403);

  // Atualiza estado do trial se necessario
  tenant = await checkAndUpdateTrial(tenant);

  // Conta suspensa → bloquear com info de contato
  if (tenant.subscription_status === 'suspended') {
    const link = whatsappLink(tenant.name, 'Basic');
    throw new AppError(
      'Seu período de teste encerrou. Assine um plano para continuar criando pedidos.',
      402,
      { whatsappLink: link, plans: true }
    );
  }

  if (tenant.subscription_status === 'cancelled') {
    throw new AppError('Assinatura cancelada. Contate o suporte para reativar.', 402);
  }

  const plan = PLANS[tenant.plan] ?? PLANS.basic;

  // Lazy monthly reset
  if (isPeriodExpired(tenant.billing_period_start)) {
    await Tenant.resetMonthlyCounter(tenant.id);
    logger.info('Contador mensal resetado', { tenantId: tenant.id, plan: plan.id });
    return next();
  }

  const limit = plan.limits.ordersPerMonth;
  if (limit !== null && tenant.orders_count_monthly >= limit) {
    const link = whatsappLink(tenant.name, 'Pro');
    logger.warn('Limite de pedidos atingido', {
      tenantId: tenant.id, plan: plan.id,
      count: tenant.orders_count_monthly, limit,
    });
    throw new AppError(
      `Limite de ${limit} pedidos/mes do plano ${plan.name} atingido. Faca upgrade para continuar.`,
      402,
      { whatsappLink: link, plans: true }
    );
  }

  next();
});

/**
 * checkFeature(featureName) — gate de funcionalidade por plano.
 */
const checkFeature = (featureName) =>
  asyncHandler(async (req, res, next) => {
    const tenant = await Tenant.findById(req.user.tenantId);
    const plan   = PLANS[tenant?.plan] ?? PLANS.basic;

    if (!plan.features[featureName]) {
      throw new AppError(
        `Recurso "${featureName}" nao disponivel no plano ${plan.name}. Faca upgrade.`,
        403
      );
    }

    next();
  });

module.exports = { checkOrderLimit, checkFeature, checkAndUpdateTrial };
