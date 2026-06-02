// ── Shared cart helpers ────────────────────────────────────────
// Funções puras usadas tanto no NewOrderModal quanto no EditOrderModal.

export const addToCart = (cart, product, addons = [], variation = null, choices = null) => {
  const prev = cart[product.id];
  // Se já está no carrinho sem addons, variação e choices, só incrementa qty
  if (prev && addons.length === 0 && variation === null && choices === null) {
    return { ...cart, [product.id]: { ...prev, qty: prev.qty + 1 } };
  }
  return {
    ...cart,
    [product.id]: {
      product,
      qty:       prev?.qty ?? 1,
      weightKg:  prev?.weightKg ?? '',
      addons,
      notes:     prev?.notes ?? '',
      variation, // null ou [{ groupId, groupName, optionId, optionName, price }]
      choices,   // null ou [{ group_id, product_id, product_name, extra_price }]
    },
  };
};

export const removeFromCart = (cart, id) => {
  const next = { ...cart };
  delete next[id];
  return next;
};

/** Addon price for one cart entry */
const addonPrice = (addons = []) =>
  addons.reduce((sum, a) => sum + (parseFloat(a.unit_price) || 0) * (a.qty || 1), 0);

/** Preço base de um item: soma das opções de variação selecionadas, ou sale_price */
export const itemBasePrice = ({ product, variation }) => {
  if (variation?.length) {
    return variation.reduce((s, sel) => s + (parseFloat(sel.price) || 0), 0);
  }
  return parseFloat(product.sale_price) || 0;
};

const choicesExtra = (choices = []) =>
  (choices ?? []).reduce((sum, c) => sum + (parseFloat(c.extra_price) || 0), 0);

export const cartTotal = (cart) =>
  Object.values(cart).reduce((sum, entry) => {
    const { product, qty, weightKg, addons, choices } = entry;
    const units = product.sale_type === 'kg' ? parseFloat(weightKg || 0) : (qty || 0);
    const base        = itemBasePrice(entry) * units;
    const extrasPrice = addonPrice(addons) * (product.sale_type === 'kg' ? 1 : (qty || 0));
    const choicePrice = choicesExtra(choices) * (product.sale_type === 'kg' ? 1 : (qty || 0));
    return sum + base + extrasPrice + choicePrice;
  }, 0);

/** Agrupa array de produtos por category_name → [{ name, items }] */
export const groupByCategory = (products) => {
  const map = {};
  for (const p of products) {
    const cat = p.category_name ?? 'Sem categoria';
    if (!map[cat]) map[cat] = [];
    map[cat].push(p);
  }
  return Object.entries(map).map(([name, items]) => ({ name, items }));
};
