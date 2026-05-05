const Tenant       = require('../../models/Tenant');
const { PLANS, VALID_PLAN_IDS } = require('../../config/plans');
const AppError     = require('../../utils/AppError');

// ── Helpers ───────────────────────────────────────────────────

const formatTenantResponse = (tenant, usage = {}) => {
  const plan = PLANS[tenant.plan] ?? PLANS.basic;
  const monthlyCount = parseInt(usage.orders_count_monthly ?? tenant.orders_count_monthly) || 0;

  return {
    id:                 tenant.id,
    name:               tenant.name,
    slug:               tenant.slug,
    active:             tenant.active,
    plan: {
      ...plan,
      current: true,
    },
    subscription: {
      status:          tenant.subscription_status,
      nextBillingDate: tenant.next_billing_date ?? null,
      provider:        tenant.payment_provider  ?? null,
    },
    usage: {
      ordersThisMonth:    monthlyCount,
      ordersLimit:        plan.limits.ordersPerMonth,
      ordersRemaining:    plan.limits.ordersPerMonth === null
                            ? null
                            : Math.max(0, plan.limits.ordersPerMonth - monthlyCount),
      billingPeriodStart: usage.billing_period_start ?? tenant.billing_period_start,
      usersCount:         parseInt(usage.users_count)    || 0,
      usersLimit:         plan.limits.usersMax,
      productsCount:      parseInt(usage.products_count) || 0,
    },
    createdAt: tenant.created_at,
  };
};

// ── Service ───────────────────────────────────────────────────

/**
 * Retorna dados completos do tenant autenticado, incluindo plano e uso atual.
 */
const getMyTenant = async (tenantId) => {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new AppError('Tenant nao encontrado.', 404);

  const usage = await Tenant.getUsage(tenantId);
  return formatTenantResponse(tenant, usage);
};

/**
 * Altera o plano do tenant.
 * Apenas o owner pode alterar. Plano invalido retorna 400.
 *
 * Em producao: antes de aplicar, verificar pagamento pendente.
 * Por enquanto, troca imediata (simulando plano pago).
 */
const changePlan = async (tenantId, newPlan, role) => {
  if (role !== 'owner') {
    throw new AppError('Apenas o proprietario pode alterar o plano.', 403);
  }
  if (!VALID_PLAN_IDS.includes(newPlan)) {
    throw new AppError(
      `Plano invalido. Opcoes: ${VALID_PLAN_IDS.join(', ')}.`,
      400
    );
  }

  const tenant  = await Tenant.updatePlan(tenantId, newPlan);
  const usage   = await Tenant.getUsage(tenantId);
  return formatTenantResponse(tenant, usage);
};

/**
 * Suspende ou reactiva a assinatura do tenant.
 * Uso interno (webhook de pagamento).
 */
const updateSubscription = async (tenantId, payload) => {
  const tenant = await Tenant.updateSubscription(tenantId, payload);
  return formatTenantResponse(tenant);
};

module.exports = { getMyTenant, changePlan, updateSubscription };
