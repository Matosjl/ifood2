'use strict';
const db       = require('../../config/database');
const AppError = require('../../utils/AppError');

/** Lista todos os cupons do tenant */
const listCoupons = async (tenantId) => {
  const { rows } = await db.query(
    `SELECT * FROM coupons WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  return rows;
};

/** Cria cupom */
const createCoupon = async (tenantId, { code, description, discountType, discountValue, minOrder, maxUses, expiresAt }) => {
  if (!code?.trim())  throw new AppError('Código do cupom é obrigatório.', 400);
  if (!discountType || !['percent', 'fixed'].includes(discountType))
    throw new AppError('discount_type deve ser "percent" ou "fixed".', 400);
  if (!discountValue || discountValue <= 0)
    throw new AppError('Valor do desconto deve ser maior que zero.', 400);
  if (discountType === 'percent' && discountValue > 100)
    throw new AppError('Desconto percentual não pode exceder 100%.', 400);

  const { rows } = await db.query(
    `INSERT INTO coupons (tenant_id, code, description, discount_type, discount_value, min_order, max_uses, expires_at)
     VALUES ($1, upper($2), $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [tenantId, code.trim(), description || null, discountType,
     parseFloat(discountValue), parseFloat(minOrder) || 0,
     maxUses ? parseInt(maxUses) : null, expiresAt || null]
  );
  return rows[0];
};

/** Atualiza (ativa/desativa, muda valor) */
const updateCoupon = async (tenantId, id, updates) => {
  const { rows: current } = await db.query(
    `SELECT * FROM coupons WHERE id = $1 AND tenant_id = $2`, [id, tenantId]
  );
  if (!current[0]) throw new AppError('Cupom não encontrado.', 404);

  const { active, description, discountValue, minOrder, maxUses, expiresAt } = updates;
  const { rows } = await db.query(
    `UPDATE coupons
     SET active         = COALESCE($3, active),
         description    = COALESCE($4, description),
         discount_value = COALESCE($5, discount_value),
         min_order      = COALESCE($6, min_order),
         max_uses       = COALESCE($7, max_uses),
         expires_at     = COALESCE($8, expires_at)
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [id, tenantId,
     active         != null ? active : null,
     description    != null ? description : null,
     discountValue  != null ? parseFloat(discountValue) : null,
     minOrder       != null ? parseFloat(minOrder) : null,
     maxUses        != null ? parseInt(maxUses) : null,
     expiresAt      != null ? expiresAt : null]
  );
  return rows[0];
};

/** Valida e retorna desconto de um cupom (chamado ao criar pedido) */
const validateCoupon = async (tenantId, code, orderTotal) => {
  const { rows } = await db.query(
    `SELECT * FROM coupons
     WHERE tenant_id = $1 AND upper(code) = upper($2) AND active = true`,
    [tenantId, code.trim()]
  );
  const coupon = rows[0];
  if (!coupon) throw new AppError('Cupom inválido ou não encontrado.', 400);
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date())
    throw new AppError('Cupom expirado.', 400);
  if (coupon.max_uses && coupon.uses_count >= coupon.max_uses)
    throw new AppError('Cupom atingiu o limite de usos.', 400);
  if (parseFloat(orderTotal) < parseFloat(coupon.min_order))
    throw new AppError(`Pedido mínimo para este cupom: R$ ${parseFloat(coupon.min_order).toFixed(2)}.`, 400);

  const discount = coupon.discount_type === 'percent'
    ? parseFloat(orderTotal) * (parseFloat(coupon.discount_value) / 100)
    : parseFloat(coupon.discount_value);

  return {
    couponId:      coupon.id,
    code:          coupon.code,
    discountType:  coupon.discount_type,
    discountValue: coupon.discount_value,
    discount:      Math.min(discount, parseFloat(orderTotal)), // não pode exceder o total
    description:   coupon.description,
  };
};

/** Incrementa uso_count após criação de pedido (fire-and-forget) */
const incrementUses = async (tenantId, code) => {
  await db.query(
    `UPDATE coupons SET uses_count = uses_count + 1
     WHERE tenant_id = $1 AND upper(code) = upper($2)`,
    [tenantId, code]
  );
};

module.exports = { listCoupons, createCoupon, updateCoupon, validateCoupon, incrementUses };
