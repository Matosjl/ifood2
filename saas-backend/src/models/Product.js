const db       = require('../config/database');
const AppError = require('../utils/AppError');

class Product {
  // ── Leitura ────────────────────────────────────────────────

  /**
   * Lista produtos do tenant com filtros opcionais.
   * @param {object} filters - { categoryId, search, active, page, limit }
   */
  static async findAll(tenantId, filters = {}, dbClient = db) {
    const { categoryId, search, active = true, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;
    const params = [tenantId];
    const conditions = ['p.tenant_id = $1'];

    if (active !== undefined) {
      params.push(active);
      conditions.push(`p.active = $${params.length}`);
    }
    if (categoryId) {
      params.push(categoryId);
      conditions.push(`p.category_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`p.name ILIKE $${params.length}`);
    }

    params.push(limit, offset);
    const limitClause = `LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const { rows } = await dbClient.query(
      `SELECT p.*,
              c.name AS category_name,
              ROUND(((p.sale_price - p.cost_price) / NULLIF(p.cost_price, 0)) * 100, 2) AS margin_pct
       FROM   products p
       LEFT   JOIN categories c ON c.id = p.category_id
       WHERE  ${conditions.join(' AND ')}
       ORDER  BY p.name ASC
       ${limitClause}`,
      params
    );
    return rows;
  }

  /** Busca produto por ID, validando tenant. */
  static async findById(id, tenantId, dbClient = db) {
    const { rows } = await dbClient.query(
      `SELECT p.*,
              c.name AS category_name,
              ROUND(((p.sale_price - p.cost_price) / NULLIF(p.cost_price, 0)) * 100, 2) AS margin_pct
       FROM   products p
       LEFT   JOIN categories c ON c.id = p.category_id
       WHERE  p.id = $1 AND p.tenant_id = $2`,
      [id, tenantId]
    );
    return rows[0] || null;
  }

  // ── Escrita ────────────────────────────────────────────────

  static async create(tenantId, data, dbClient = db) {
    const { categoryId, name, description, saleType, costPrice, salePrice, stockQty, alertThreshold, featured } = data;
    const { rows } = await dbClient.query(
      `INSERT INTO products
         (tenant_id, category_id, name, description, sale_type, cost_price, sale_price, stock_qty, alert_threshold, featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [tenantId, categoryId || null, name.trim(), description || null,
       saleType || 'unit', costPrice || 0, salePrice || 0, stockQty || 0, alertThreshold || 0, featured ?? false]
    );
    return rows[0];
  }

  static async update(id, tenantId, data, dbClient = db) {
    const { categoryId, name, description, saleType, costPrice, salePrice, alertThreshold, active, featured } = data;
    const { rows } = await dbClient.query(
      `UPDATE products
       SET category_id     = COALESCE($3, category_id),
           name            = COALESCE($4, name),
           description     = COALESCE($5, description),
           sale_type       = COALESCE($6, sale_type),
           cost_price      = COALESCE($7, cost_price),
           sale_price      = COALESCE($8, sale_price),
           alert_threshold = COALESCE($9, alert_threshold),
           active          = COALESCE($10, active),
           featured        = COALESCE($11, featured),
           updated_at      = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId, categoryId, name?.trim(), description, saleType, costPrice, salePrice, alertThreshold, active,
       featured !== undefined ? featured : null]
    );
    return rows[0] || null;
  }

  static async delete(id, tenantId, dbClient = db) {
    const { rows } = await dbClient.query(
      `UPDATE products SET active = false, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );
    return rows[0] || null;
  }

  // ── Estoque ────────────────────────────────────────────────

  /**
   * Desconta estoque de forma ATÔMICA.
   *
   * Comportamento:
   *  - stock_qty >= qty  → desconta normalmente
   *  - stock_qty = 0     → estoque não rastreado (produto novo sem entrada manual)
   *                        permite a venda mas não desconta (evita bloqueio silencioso)
   *  - stock_qty > 0 mas < qty → lança AppError 400 (estoque insuficiente real)
   *
   * DEVE ser chamado dentro de uma transaction.
   */
  static async deductStock(id, tenantId, qty, dbClient = db) {
    // Tenta descontar estoque quando suficiente
    const { rows } = await dbClient.query(
      `UPDATE products
       SET stock_qty  = stock_qty - $3,
           updated_at = NOW()
       WHERE id = $1
         AND tenant_id = $2
         AND stock_qty >= $3
       RETURNING *`,
      [id, tenantId, qty]
    );
    if (rows.length > 0) return rows[0];

    // Verifica se é estoque não rastreado (stock_qty = 0) ou realmente insuficiente
    const { rows: check } = await dbClient.query(
      `SELECT id, stock_qty FROM products WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (!check[0]) throw new AppError(`Produto não encontrado.`, 404);

    // stock_qty = 0 significa "nunca foi reposto manualmente" → permite venda sem desconto
    if (parseFloat(check[0].stock_qty) === 0) return check[0];

    // stock_qty > 0 mas < qty → realmente sem estoque suficiente
    throw new AppError(`Estoque insuficiente para o produto solicitado.`, 400);
  }

  /**
   * Repõe estoque (entrada manual).
   * qty deve ser positivo.
   */
  static async addStock(id, tenantId, qty, dbClient = db) {
    const { rows } = await dbClient.query(
      `UPDATE products
       SET stock_qty  = stock_qty + $3,
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId, qty]
    );
    return rows[0] || null;
  }

  // ── Movimentações ──────────────────────────────────────────

  static async createMovement({ tenantId, productId, productName, quantity, type, reason, orderId }, dbClient = db) {
    const { rows } = await dbClient.query(
      `INSERT INTO stock_movements
         (tenant_id, product_id, product_name, quantity, type, reason, order_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [tenantId, productId, productName, quantity, type, reason || null, orderId || null]
    );
    return rows[0];
  }

  static async findMovements(tenantId, productId = null, { limit = 100, page = 1 } = {}, dbClient = db) {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let filter = 'tenant_id = $1';
    if (productId) {
      params.push(productId);
      filter += ` AND product_id = $${params.length}`;
    }
    params.push(limit, offset);
    const { rows } = await dbClient.query(
      `SELECT * FROM stock_movements
       WHERE ${filter}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  }

  // ── Categorias ─────────────────────────────────────────────

  static async findAllCategories(tenantId, dbClient = db) {
    const { rows } = await dbClient.query(
      `SELECT * FROM categories WHERE tenant_id = $1 ORDER BY name`,
      [tenantId]
    );
    return rows;
  }

  static async createCategory(tenantId, name, dbClient = db) {
    const { rows } = await dbClient.query(
      `INSERT INTO categories (tenant_id, name) VALUES ($1, $2) RETURNING *`,
      [tenantId, name.trim()]
    );
    return rows[0];
  }

  static async deleteCategory(id, tenantId, dbClient = db) {
    const { rows } = await dbClient.query(
      `DELETE FROM categories WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenantId]
    );
    return rows[0] || null;
  }
}

module.exports = Product;
