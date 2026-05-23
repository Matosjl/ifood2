// ── Shared cart helpers ────────────────────────────────────────
// Funções puras usadas tanto no NewOrderModal quanto no EditOrderModal.

export const addToCart = (cart, product, addons = []) => {
  const prev = cart[product.id];
  // If product already in cart and has no addons (or same addons), just bump qty
  if (prev && addons.length === 0) return { ...cart, [product.id]: { ...prev, qty: prev.qty + 1 } };
  // Addons provided (or first add): set/overwrite
  return { ...cart, [product.id]: { product, qty: prev?.qty ?? 1, weightKg: prev?.weightKg ?? '', addons } };
};

export const removeFromCart = (cart, id) => {
  const next = { ...cart };
  delete next[id];
  return next;
};

/** Addon price for one cart entry */
const addonPrice = (addons = []) =>
  addons.reduce((sum, a) => sum + (parseFloat(a.unit_price) || 0) * (a.qty || 1), 0);

export const cartTotal = (cart) =>
  Object.values(cart).reduce((sum, { product, qty, weightKg, addons }) => {
    const basePrice = product.sale_type === 'kg'
      ? parseFloat(product.sale_price) * parseFloat(weightKg || 0)
      : parseFloat(product.sale_price) * (qty || 0);
    const extrasPrice = addonPrice(addons) * (product.sale_type === 'kg' ? 1 : (qty || 0));
    return sum + basePrice + extrasPrice;
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
