/**
 * Definicoes de planos do SaaS.
 *
 * limits.ordersPerMonth : null = ilimitado
 * limits.usersMax       : null = ilimitado
 *
 * features.*: boolean — controla acesso a funcionalidades especificas.
 * O middleware plan.middleware.js usa estas definicoes.
 */
// WhatsApp do dono para contato de assinatura
const OWNER_WHATSAPP = '5551981521264';

const PLANS = {
  basic: {
    id:          'basic',
    name:        'Basic',
    price:       67,
    priceLabel:  'R$ 67/mês',
    description: 'Ideal para começar',
    currency:    'BRL',
    color:       'orange',
    highlights: [
      'Pedidos ilimitados',
      'Controle de caixa',
      'Histórico de pedidos',
      'Fiado e clientes',
      'Cardápio digital',
    ],
    limits: {
      ordersPerMonth: null,  // ilimitado
      usersMax:       2,
    },
    features: {
      whatsapp:    false,
      ai:          false,
      reports:     false,
      multiUser:   false,
      stockAlerts: false,
      api:         false,
    },
  },

  pro: {
    id:          'pro',
    name:        'Pro',
    price:       179.99,
    priceLabel:  'R$ 179,99/mês',
    description: 'Para quem quer crescer',
    currency:    'BRL',
    color:       'blue',
    popular:     true,
    highlights: [
      'Tudo do Basic',
      'Relatórios avançados',
      'Múltiplos usuários (até 5)',
      'Alertas de estoque',
      'Suporte prioritário',
    ],
    limits: {
      ordersPerMonth: null,
      usersMax:       5,
    },
    features: {
      whatsapp:    true,
      ai:          false,
      reports:     true,
      multiUser:   true,
      stockAlerts: true,
      api:         false,
    },
  },

  premium: {
    id:          'premium',
    name:        'Premium',
    price:       370,
    priceLabel:  'R$ 370/mês',
    description: 'Poder total sem limites',
    currency:    'BRL',
    color:       'purple',
    highlights: [
      'Tudo do Pro',
      'Usuários ilimitados',
      'API pública',
      'Integrações avançadas',
      'Suporte VIP via WhatsApp',
    ],
    limits: {
      ordersPerMonth: null,
      usersMax:       null,
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

// Duracao do trial em dias
const TRIAL_DAYS         = 10;   // trial total
const PREMIUM_TRIAL_DAYS = 3;    // primeiros dias com Premium liberado

module.exports = { PLANS, VALID_PLAN_IDS, OWNER_WHATSAPP, TRIAL_DAYS, PREMIUM_TRIAL_DAYS };
