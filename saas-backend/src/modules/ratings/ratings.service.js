const crypto   = require('crypto');
const db       = require('../../config/database');
const AppError = require('../../utils/AppError');

// ── Send rating request (called after order delivered) ────────

/**
 * Creates a rating record with a unique token and returns the rating URL.
 * Called from order status update when status → 'delivered'.
 */
async function createRatingRequest(tenantId, orderId) {
  // Check if already exists
  const { rows: [existing] } = await db.query(
    `SELECT token FROM order_ratings WHERE order_id = $1`,
    [orderId]
  );
  if (existing) return existing.token;

  // Get customer phone + order info
  const { rows: [order] } = await db.query(
    `SELECT customer_name, customer_phone, order_number FROM orders WHERE id = $1 AND tenant_id = $2`,
    [orderId, tenantId]
  );
  if (!order) return null;

  const token = crypto.randomBytes(32).toString('hex');
  const baseUrl = process.env.FRONTEND_URL ?? 'https://zapfome.ddns.net';
  const url = `${baseUrl}/avaliar/${token}`;

  await db.query(
    `INSERT INTO order_ratings (tenant_id, order_id, stars, token, rating_url)
     VALUES ($1, $2, 0, $3, $4)
     ON CONFLICT (order_id) DO NOTHING`,
    [tenantId, orderId, token, url]
  );

  return token;
}

// ── Get rating by token (public) ──────────────────────────────

async function getByToken(token) {
  const { rows: [rating] } = await db.query(
    `SELECT r.*, o.order_number, o.total, o.customer_name,
            t.name AS tenant_name, t.slug AS tenant_slug
     FROM order_ratings r
     JOIN orders  o ON o.id = r.order_id
     JOIN tenants t ON t.id = r.tenant_id
     WHERE r.token = $1`,
    [token]
  );
  if (!rating) throw new AppError('Link de avaliação inválido ou expirado', 404);
  return rating;
}

// ── Submit rating (public) ────────────────────────────────────

async function submitRating(token, stars, comment) {
  if (!stars || stars < 1 || stars > 5) throw new AppError('Nota deve ser entre 1 e 5', 400);

  const { rows: [rating] } = await db.query(
    `SELECT * FROM order_ratings WHERE token = $1`,
    [token]
  );
  if (!rating) throw new AppError('Link de avaliação inválido', 404);
  if (rating.stars > 0) throw new AppError('Este pedido já foi avaliado', 409);

  const { rows: [updated] } = await db.query(
    `UPDATE order_ratings SET stars = $1, comment = $2, token = NULL WHERE token = $3 RETURNING *`,
    [stars, comment ?? null, token]
  );
  return updated;
}

// ── List ratings (authenticated, for dashboard) ───────────────

async function list(tenantId, { limit = 50, offset = 0 } = {}) {
  const { rows } = await db.query(
    `SELECT r.stars, r.comment, r.created_at,
            o.order_number, o.customer_name, o.total
     FROM order_ratings r
     JOIN orders o ON o.id = r.order_id
     WHERE r.tenant_id = $1 AND r.stars > 0
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset]
  );
  return rows;
}

async function summary(tenantId) {
  const { rows: [s] } = await db.query(
    `SELECT
       COUNT(*)                                       AS total,
       ROUND(AVG(stars), 1)                           AS average,
       COUNT(*) FILTER (WHERE stars = 5)              AS five_star,
       COUNT(*) FILTER (WHERE stars = 4)              AS four_star,
       COUNT(*) FILTER (WHERE stars = 3)              AS three_star,
       COUNT(*) FILTER (WHERE stars <= 2)             AS low_star
     FROM order_ratings
     WHERE tenant_id = $1 AND stars > 0`,
    [tenantId]
  );
  return s;
}

module.exports = { createRatingRequest, getByToken, submitRating, list, summary };
