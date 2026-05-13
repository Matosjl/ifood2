// ── Shared cart helpers ────────────────────────────────────────
// Funções puras usadas tanto no NewOrderModal quanto no EditOrderModal.

export const addToCart = (cart, product) => {
  const prev = cart[product.id];
  if (prev) return { ...cart, [product.id]: { ...prev, qty: prev.qty + 1 } };
  return { ...cart, [product.id]: { product, qty: 1, weightKg: '' } };
};

export const removeFromCart = (cart, id) => {
  const next = { ...cart };
  delete next[id];
  return next;
};

export const cartTotal = (cart) =>
  Object.values(cart).reduce((sum, { product, qty, weightKg }) => {
    const amount = product.sale_type === 'kg'
      ? parseFloat(product.sale_price) * parseFloat(weightKg || 0)
      : parseFloat(product.sale_price) * (qty || 0);
    return sum + amount;
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
