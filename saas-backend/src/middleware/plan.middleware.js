const Tenant       = require('../models/Tenant');
const { PLANS }    = require('../config/plans');
const AppError     = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { createLogger } = require('../utils/logger');

const logger = createLogger('PlanMiddleware');

// ── Helpers ───────────────────────────────────────────────────

/**
 * Returns true when the billing period recorded on the tenant has rolled
 * over into a new calendar month (or year).
 */
const isPeriodExpired = (billingPeriodStart) => {
  const start = new Date(billingPeriodStart);
  const now   = new Date();
  return (
    now.getFullYear() !== start.getFullYear() ||
    now.getMonth()    !== start.getMonth()
  );
};

// ── Middleware factory ────────────────────────────────────────

/**
 * checkOrderLimit — add BEFORE the create-order handler.
 *
 * 1. Verifica se o tenant esta ativo e com assinatura valida.
 * 2. Faz reset lazy do contador mensal se o periodo virou.
 * 3. Bloqueia com 402 se o limite do plano foi atingido.
 *
 * Erros lancados:
 *   403 — conta inativa (dono bloqueou ou suporte suspendeu)
 *   402 — assinatura suspensa OU limite de pedidos atingido
 */
const checkOrderLimit = asyncHandler(async (req, res, next) => {
  const tenant = await Tenant.findById(req.user.tenantId);

  if (!tenant) throw new AppError('Tenant nao encontrado.', 404);
  if (!tenant.active) {
    throw new AppError('Conta inativa. Contate o suporte.', 403);
  }
  if (tenant.subscription_status === 'suspended') {
    throw new AppError(
      'Assinatura suspensa. Regularize o pagamento para continuar criando pedidos.',
      402
    );
  }

  const plan = PLANS[tenant.plan] ?? PLANS.basic;

  // Lazy monthly reset — avoids a separate cron job
  if (isPeriodExpired(tenant.billing_period_start)) {
    await Tenant.resetMonthlyCounter(tenant.id);
    logger.info('Contador mensal resetado', { tenantId: tenant.id, plan: plan.id });
    return next(); // contador zerado, pode criar
  }

  const limit = plan.limits.ordersPerMonth;
  if (limit !== null && tenant.orders_count_monthly >= limit) {
    logger.warn('Limite de pedidos atingido', {
      tenantId: tenant.id,
      plan:     plan.id,
      count:    tenant.orders_count_monthly,
      limit,
    });
    throw new AppError(
      `Limite de ${limit} pedidos/mes do plano ${plan.name} atingido. ` +
      `Faca upgrade para continuar: GET /api/plans`,
      402
    );
  }

  next();
});

/**
 * checkFeature(featureName) — middleware factory para gates de funcionalidade.
 *
 * Uso:
 *   router.post('/webhook', authenticate, checkFeature('whatsapp'), ctrl.webhook)
 *
 * Lanca 403 se o plano do tenant nao inclui o recurso.
 */
const checkFeature = (featureName) =>
  asyncHandler(async (req, res, next) => {
    const tenant = await Tenant.findById(req.user.tenantId);
    const plan   = PLANS[tenant?.plan] ?? PLANS.basic;

    if (!plan.features[featureName]) {
      throw new AppError(
        `Recurso "${featureName}" nao disponivel no plano ${plan.name}. ` +
        `Faca upgrade: GET /api/plans`,
        403
      );
    }

    next();
  });

module.exports = { checkOrderLimit, checkFeature };
