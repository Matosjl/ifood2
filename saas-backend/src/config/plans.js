/**
 * Definicoes de planos do SaaS.
 *
 * limits.ordersPerMonth : null = ilimitado
 * limits.usersMax       : null = ilimitado
 *
 * features.*: boolean — controla acesso a funcionalidades especificas.
 * O middleware plan.middleware.js usa estas definicoes.
 */
const PLANS = {
  basic: {
    id:       'basic',
    name:     'Basic',
    price:    49,
    currency: 'BRL',
    limits: {
      ordersPerMonth: 100,
      usersMax:       2,
    },
    features: {
      whatsapp:    false,  // integracao WhatsApp (Evolution API)
      ai:          false,  // IA de atendimento (GPT)
      reports:     false,  // relatorios avancados
      multiUser:   false,  // mais de 1 usuario (apenas o owner)
      stockAlerts: false,  // alertas de estoque baixo
      api:         false,  // acesso a API publica
    },
  },

  pro: {
    id:       'pro',
    name:     'Pro',
    price:    97,
    currency: 'BRL',
    limits: {
      ordersPerMonth: 500,
      usersMax:       5,
    },
    features: {
      whatsapp:    true,
      ai:          true,
      reports:     false,
      multiUser:   true,
      stockAlerts: true,
      api:         false,
    },
  },

  premium: {
    id:       'premium',
    name:     'Premium',
    price:    149,
    currency: 'BRL',
    limits: {
      ordersPerMonth: null,   // ilimitado
      usersMax:       null,   // ilimitado
    },
    features: {
      whatsapp:    true,
      ai:          true,
      reports:     true,
      multiUser:   true,
      stockAlerts: true,
      api:         true,
    },
  },
};

const VALID_PLAN_IDS = Object.keys(PLANS);

module.exports = { PLANS, VALID_PLAN_IDS };
