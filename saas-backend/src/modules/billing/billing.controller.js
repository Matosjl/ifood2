const Tenant       = require('../../models/Tenant');
const { PLANS, OWNER_WHATSAPP } = require('../../config/plans');
const asyncHandler = require('../../utils/asyncHandler');
const { checkAndUpdateTrial } = require('../../middleware/plan.middleware');

// Builds a WhatsApp deep link pre-filled with a message
const whatsappLink = (tenantName, planName) => {
  const msg = encodeURIComponent(
    `Olá! Gostaria de assinar o Zapfome.\nRestaurante: ${tenantName}\nPlano desejado: ${planName}`
  );
  return `https://wa.me/${OWNER_WHATSAPP}?text=${msg}`;
};

// Days remaining until a future date (>= 0)
const daysUntil = (date) => {
  if (!date) return null;
  const diff = new Date(date) - new Date();
  return diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;
};

/**
 * GET /api/billing/status
 * Returns the tenant's plan, subscription status and trial countdown.
 * Used by the frontend banner / plan wall.
 */
const getStatus = asyncHandler(async (req, res) => {
  let tenant = await Tenant.findById(req.user.tenantId);
  if (!tenant) return res.status(404).json({ success: false, message: 'Tenant não encontrado.' });

  // Run lazy trial updater (same logic as plan.middleware)
  tenant = await checkAndUpdateTrial(tenant);

  const plan         = PLANS[tenant.plan] ?? PLANS.basic;
  const now          = new Date();
  const isSuspended  = tenant.subscription_status === 'suspended';
  const isCancelled  = tenant.subscription_status === 'cancelled';
  const isTrialing   = tenant.subscription_status === 'trialing';
  const isActive     = tenant.subscription_status === 'active';

  // Trial countdown details
  const trialTotalDaysLeft    = daysUntil(tenant.trial_ends_at);
  const premiumDaysLeft       = daysUntil(tenant.premium_trial_ends_at);
  const premiumTrialActive    = isTrialing && premiumDaysLeft !== null && premiumDaysLeft > 0;

  // Available plans for the plan wall
  const availablePlans = Object.values(PLANS).map(p => ({
    id:          p.id,
    name:        p.name,
    price:       p.price,
    priceLabel:  p.priceLabel,
    description: p.description,
    color:       p.color,
    popular:     p.popular ?? false,
    highlights:  p.highlights,
    limits:      p.limits,
    features:    p.features,
    whatsappLink: whatsappLink(tenant.name, p.name),
  }));

  res.json({
    success: true,
    data: {
      plan: {
        id:       plan.id,
        name:     plan.name,
        price:    plan.price,
        features: plan.features,
        limits:   plan.limits,
      },
      subscription: {
        status:          tenant.subscription_status,
        isActive,
        isTrialing,
        isSuspended,
        isCancelled,
        // Trial fields (null when not trialing)
        trialEndsAt:            tenant.trial_ends_at          ?? null,
        premiumTrialEndsAt:     tenant.premium_trial_ends_at  ?? null,
        trialTotalDaysLeft:     isTrialing ? trialTotalDaysLeft  : null,
        premiumDaysLeft:        isTrialing ? premiumDaysLeft     : null,
        premiumTrialActive,
      },
      // Only sent when account is blocked
      ...(isSuspended && {
        blocked: {
          reason:        'trial_expired',
          whatsappBasic: whatsappLink(tenant.name, 'Basic'),
          whatsappPro:   whatsappLink(tenant.name, 'Pro'),
          plans:         availablePlans,
        },
      }),
      ...(isCancelled && {
        blocked: {
          reason:        'cancelled',
          whatsappBasic: whatsappLink(tenant.name, 'Basic'),
          plans:         availablePlans,
        },
      }),
    },
  });
});

/**
 * GET /api/billing/plans
 * Public-facing plan list with WhatsApp links (tenant-aware).
 */
const getPlans = asyncHandler(async (req, res) => {
  let tenantName = 'meu restaurante';
  if (req.user?.tenantId) {
    const tenant = await Tenant.findById(req.user.tenantId);
    if (tenant) tenantName = tenant.name;
  }

  const plans = Object.values(PLANS).map(p => ({
    id:           p.id,
    name:         p.name,
    price:        p.price,
    priceLabel:   p.priceLabel,
    description:  p.description,
    color:        p.color,
    popular:      p.popular ?? false,
    highlights:   p.highlights,
    limits:       p.limits,
    features:     p.features,
    whatsappLink: whatsappLink(tenantName, p.name),
  }));

  res.json({ success: true, data: plans });
});

module.exports = { getStatus, getPlans };
