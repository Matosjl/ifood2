const db       = require('../../config/database');
const AppError = require('../../utils/AppError');

const VALID_TYPES = ['happy_hour', 'product_discount', 'category_discount'];

// ── CRUD ──────────────────────────────────────────────────────

async function list(tenantId) {
  const { rows } = await db.query(
    `SELECT * FROM promotions WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  return rows;
}

async function create(tenantId, data) {
  const { name, type, discountType, discountValue, conditions, active } = data;
  if (!name?.trim())                   throw new AppError('Nome é obrigatório', 400);
  if (!VALID_TYPES.includes(type))     throw new AppError('Tipo inválido', 400);
  if (!['percent', 'fixed'].includes(discountType)) throw new AppError('Tipo de desconto inválido', 400);
  if (!discountValue || discountValue <= 0)         throw new AppError('Valor do desconto inválido', 400);

  const { rows } = await db.query(
    `INSERT INTO promotions (tenant_id, name, type, discount_type, discount_value, conditions, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [tenantId, name.trim(), type, discountType, discountValue, JSON.stringify(conditions ?? {}), active !== false]
  );
  return rows[0];
}

async function update(id, tenantId, data) {
  const fields  = [];
  const params  = [id, tenantId];

  if (data.name != null)          { params.push(data.name.trim());              fields.push(`name = $${params.length}`); }
  if (data.discountType != null)  { params.push(data.discountType);             fields.push(`discount_type = $${params.length}`); }
  if (data.discountValue != null) { params.push(data.discountValue);            fields.push(`discount_value = $${params.length}`); }
  if (data.conditions != null)    { params.push(JSON.stringify(data.conditions)); fields.push(`conditions = $${params.length}`); }
  if (data.active != null)        { params.push(data.active);                   fields.push(`active = $${params.length}`); }

  if (fields.length === 0) throw new AppError('Nada para atualizar', 400);
  fields.push(`updated_at = NOW()`);

  const { rows } = await db.query(
    `UPDATE promotions SET ${fields.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    params
  );
  if (!rows[0]) throw new AppError('Promoção não encontrada', 404);
  return rows[0];
}

async function remove(id, tenantId) {
  const { rowCount } = await db.query(
    `DELETE FROM promotions WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (!rowCount) throw new AppError('Promoção não encontrada', 404);
}

// ── Apply promotions to a cart (called from order creation) ──

/**
 * Returns the discounted price for a product, or null if no promotion applies.
 * Does NOT modify DB — just calculates.
 *
 * @param {string}  tenantId
 * @param {string}  productId
 * @param {string}  categoryId
 * @param {number}  originalPrice
 * @returns {Promise<{price: number, promotionId: string, promotionName: string}|null>}
 */
async function applyToProduct(tenantId, productId, categoryId, originalPrice) {
  const now       = new Date();
  const dayOfWeek = now.getDay();   // 0=Sun … 6=Sat
  const timeStr   = now.toTimeString().slice(0, 5); // HH:MM

  const { rows } = await db.query(
    `SELECT * FROM promotions WHERE tenant_id = $1 AND active = true`,
    [tenantId]
  );

  let bestDiscount = 0;
  let bestPromo    = null;

  for (const promo of rows) {
    const cond = promo.conditions ?? {};

    // ── Check type-specific conditions ─────────────────────────
    if (promo.type === 'happy_hour') {
      const days      = Array.isArray(cond.days) ? cond.days : [0, 1, 2, 3, 4, 5, 6];
      const startTime = cond.start_time ?? '00:00';
      const endTime   = cond.end_time   ?? '23:59';
      if (!days.includes(dayOfWeek))   continue;
      if (timeStr < startTime)          continue;
      if (timeStr > endTime)            continue;
    } else if (promo.type === 'product_discount') {
      const ids = Array.isArray(cond.product_ids) ? cond.product_ids : [];
      if (!ids.includes(productId))    continue;
    } else if (promo.type === 'category_discount') {
      const ids = Array.isArray(cond.category_ids) ? cond.category_ids : [];
      if (!categoryId || !ids.includes(categoryId)) continue;
    }

    // ── Calculate discount amount ───────────────────────────────
    let discount = 0;
    if (promo.discount_type === 'percent') {
      discount = originalPrice * (Number(promo.discount_value) / 100);
    } else {
      discount = Math.min(Number(promo.discount_value), originalPrice);
    }

    if (discount > bestDiscount) {
      bestDiscount = discount;
      bestPromo    = promo;
    }
  }

  if (!bestPromo) return null;

  const newPrice = Math.max(0, originalPrice - bestDiscount);
  return {
    price:         newPrice,
    promotionId:   bestPromo.id,
    promotionName: bestPromo.name,
    discount:      bestDiscount,
  };
}

/**
 * Returns active promotions for the public menu (frontend display only).
 */
async function getActive(tenantId) {
  const { rows } = await db.query(
    `SELECT id, name, type, discount_type, discount_value, conditions
     FROM promotions WHERE tenant_id = $1 AND active = true ORDER BY created_at DESC`,
    [tenantId]
  );
  return rows;
}

module.exports = { list, create, update, remove, applyToProduct, getActive };
