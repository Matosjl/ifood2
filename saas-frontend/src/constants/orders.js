// ── Shared order constants ──────────────────────────────────────
// Fonte única para NEIGHBORHOODS, PAY_OPTIONS, PAY_LABELS, PAY_ICONS.
// Importar aqui em vez de redefinir em cada componente.

export const NEIGHBORHOODS = [
  { bairro: 'Itapeva',              taxa: 6  },
  { bairro: 'Itapeva Norte',        taxa: 6  },
  { bairro: 'Tupinambá',            taxa: 8  },
  { bairro: 'Praia Gaúcha',         taxa: 8  },
  { bairro: 'Praia Yara',           taxa: 8  },
  { bairro: 'Praia Recreio',        taxa: 10 },
  { bairro: 'Praia Santa Helena',   taxa: 10 },
  { bairro: 'Praia Estrela',        taxa: 10 },
  { bairro: 'Praia Real',           taxa: 10 },
  { bairro: 'Praia Paraíso',        taxa: 15 },
  { bairro: 'São Brás',             taxa: 15 },
  { bairro: 'Campo Bonito',         taxa: 17 },
  { bairro: 'Torres',               taxa: 20 },
];

// Superset — cada consumidor filtra o que não precisa
export const PAY_OPTIONS = [
  { value: 'cash',    label: '💵 Dinheiro', color: 'green'  },
  { value: 'pix',     label: '📱 Pix',      color: 'blue'   },
  { value: 'credit',  label: '💳 Crédito',  color: 'purple' },
  { value: 'debit',   label: '💳 Débito',   color: 'indigo' },
  { value: 'voucher', label: '🎫 Vale',      color: 'yellow' },
  { value: 'fiado',   label: '🤝 Fiado',    color: 'purple' },
  { value: 'other',   label: '🔖 Outro',    color: 'gray'   },
  { value: 'pending', label: '⏳ A cobrar', color: 'orange' },
];

export const PAY_LABELS = {
  cash:    'Dinheiro',
  pix:     'Pix',
  credit:  'Crédito',
  debit:   'Débito',
  voucher: 'Vale',
  fiado:   'Fiado',
  pending: 'A cobrar',
  other:   'Outro',
};

export const PAY_ICONS = {
  cash:    '💵',
  pix:     '📱',
  credit:  '💳',
  debit:   '💳',
  voucher: '🎫',
  fiado:   '🤝',
  pending: '⏳',
  other:   '🔖',
};

/** Formata valor em reais: `R$ 12,50` */
export const fmt = (n) => `R$ ${parseFloat(n ?? 0).toFixed(2)}`;
