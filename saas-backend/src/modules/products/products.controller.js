const { validationResult } = require('express-validator');
const service              = require('./products.service');
const asyncHandler         = require('../../utils/asyncHandler');
const AppError             = require('../../utils/AppError');

const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(errors.array().map(e => e.msg).join('. '), 422);
  }
};

// ── Produtos ──────────────────────────────────────────────────

/**
 * GET /api/products
 * Query: categoryId, search, active, page, limit
 */
const list = asyncHandler(async (req, res) => {
  const { categoryId, search, active, page, limit } = req.query;
  const products = await service.listProducts(req.user.tenantId, {
    categoryId,
    search,
    active: active !== undefined ? active === 'true' : true,
    page: parseInt(page) || 1,
    limit: Math.min(parseInt(limit) || 50, 200),
  });
  res.json({ success: true, data: products });
});

/** GET /api/products/:id */
const getOne = asyncHandler(async (req, res) => {
  const product = await service.getProduct(req.params.id, req.user.tenantId);
  res.json({ success: true, data: product });
});

/** POST /api/products */
const create = asyncHandler(async (req, res) => {
  handleValidation(req);
  const product = await service.createProduct(req.user.tenantId, req.body);
  res.status(201).json({ success: true, data: product });
});

/** PUT /api/products/:id */
const update = asyncHandler(async (req, res) => {
  handleValidation(req);
  const product = await service.updateProduct(req.params.id, req.user.tenantId, req.body);
  res.json({ success: true, data: product });
});

/** DELETE /api/products/:id */
const remove = asyncHandler(async (req, res) => {
  await service.deleteProduct(req.params.id, req.user.tenantId);
  res.json({ success: true, message: 'Produto desativado com sucesso.' });
});

// ── Estoque ───────────────────────────────────────────────────

/** POST /api/products/:id/replenish */
const replenish = asyncHandler(async (req, res) => {
  handleValidation(req);
  const { quantity, reason } = req.body;
  const product = await service.replenishStock(req.params.id, req.user.tenantId, { quantity, reason });
  res.json({ success: true, data: product });
});

/** GET /api/products/:id/movements */
const movements = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await service.listMovements(req.user.tenantId, req.params.id, {
    page: parseInt(page) || 1,
    limit: Math.min(parseInt(limit) || 100, 500),
  });
  res.json({ success: true, data: result });
});

/** GET /api/stock/movements (todos os produtos) */
const allMovements = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await service.listMovements(req.user.tenantId, null, {
    page: parseInt(page) || 1,
    limit: Math.min(parseInt(limit) || 100, 500),
  });
  res.json({ success: true, data: result });
});

// ── Categorias ────────────────────────────────────────────────

/** GET /api/categories */
const listCats = asyncHandler(async (req, res) => {
  const cats = await service.listCategories(req.user.tenantId);
  res.json({ success: true, data: cats });
});

/** POST /api/categories */
const createCat = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const cat = await service.createCategory(req.user.tenantId, name);
  res.status(201).json({ success: true, data: cat });
});

/** PATCH /api/categories/:id */
const updateCat = asyncHandler(async (req, res) => {
  const { name, printer_target } = req.body;
  const cat = await service.updateCategory(req.params.id, req.user.tenantId, { name, printer_target });
  res.json({ success: true, data: cat });
});

/** DELETE /api/categories/:id */
const deleteCat = asyncHandler(async (req, res) => {
  await service.deleteCategory(req.params.id, req.user.tenantId);
  res.json({ success: true, message: 'Categoria removida.' });
});

/** POST /api/products/:id/image */
const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('Nenhuma imagem enviada.', 400);
  const imageUrl = `/uploads/${req.file.filename}`;
  const { rows: [product] } = await require('../../config/database').query(
    `UPDATE products SET image_url = $1, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [imageUrl, req.params.id, req.user.tenantId]
  );
  if (!product) throw new AppError('Produto não encontrado.', 404);
  res.json({ success: true, data: { image_url: imageUrl } });
});

// ── Variações ─────────────────────────────────────────────────

const db = require('../../config/database');

/** POST /api/products/:id/variations/groups */
const createGroup = asyncHandler(async (req, res) => {
  const { name, required = true, sortOrder = 0 } = req.body;
  if (!name?.trim()) throw new AppError('Nome do grupo é obrigatório.', 400);

  const { rows } = await db.query(
    `INSERT INTO product_variation_groups (tenant_id, product_id, name, required, sort_order)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.user.tenantId, req.params.id, name.trim(), required, sortOrder]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

/** PUT /api/products/variations/groups/:gid */
const updateGroup = asyncHandler(async (req, res) => {
  const { name, required, sortOrder } = req.body;
  const setClauses = [];
  const params = [req.params.gid, req.user.tenantId];

  if (name !== undefined)      { params.push(name.trim());  setClauses.push(`name = $${params.length}`); }
  if (required !== undefined)  { params.push(required);     setClauses.push(`required = $${params.length}`); }
  if (sortOrder !== undefined) { params.push(sortOrder);    setClauses.push(`sort_order = $${params.length}`); }
  if (!setClauses.length) throw new AppError('Nenhum campo para atualizar.', 400);

  const { rows } = await db.query(
    `UPDATE product_variation_groups SET ${setClauses.join(', ')}
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    params
  );
  if (!rows[0]) throw new AppError('Grupo não encontrado.', 404);
  res.json({ success: true, data: rows[0] });
});

/** DELETE /api/products/variations/groups/:gid */
const deleteGroup = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `DELETE FROM product_variation_groups WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [req.params.gid, req.user.tenantId]
  );
  if (!rows[0]) throw new AppError('Grupo não encontrado.', 404);
  res.json({ success: true });
});

/** POST /api/products/variations/groups/:gid/options */
const createOption = asyncHandler(async (req, res) => {
  const { name, price = 0, sortOrder = 0 } = req.body;
  if (!name?.trim()) throw new AppError('Nome da opção é obrigatório.', 400);

  // Valida que o grupo pertence ao tenant
  const { rows: [group] } = await db.query(
    `SELECT id FROM product_variation_groups WHERE id = $1 AND tenant_id = $2`,
    [req.params.gid, req.user.tenantId]
  );
  if (!group) throw new AppError('Grupo não encontrado.', 404);

  const { rows } = await db.query(
    `INSERT INTO product_variation_options (group_id, tenant_id, name, price, sort_order)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.params.gid, req.user.tenantId, name.trim(), parseFloat(price) || 0, sortOrder]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

/** PUT /api/products/variations/options/:oid */
const updateOption = asyncHandler(async (req, res) => {
  const { name, price, available, sortOrder } = req.body;
  const setClauses = [];
  const params = [req.params.oid, req.user.tenantId];

  if (name !== undefined)      { params.push(name.trim());           setClauses.push(`name = $${params.length}`); }
  if (price !== undefined)     { params.push(parseFloat(price) || 0); setClauses.push(`price = $${params.length}`); }
  if (available !== undefined) { params.push(available);             setClauses.push(`available = $${params.length}`); }
  if (sortOrder !== undefined) { params.push(sortOrder);             setClauses.push(`sort_order = $${params.length}`); }
  if (!setClauses.length) throw new AppError('Nenhum campo para atualizar.', 400);

  const { rows } = await db.query(
    `UPDATE product_variation_options SET ${setClauses.join(', ')}
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    params
  );
  if (!rows[0]) throw new AppError('Opção não encontrada.', 404);
  res.json({ success: true, data: rows[0] });
});

/** DELETE /api/products/variations/options/:oid */
const deleteOption = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `DELETE FROM product_variation_options WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [req.params.oid, req.user.tenantId]
  );
  if (!rows[0]) throw new AppError('Opção não encontrada.', 404);
  res.json({ success: true });
});

// ── Código de barras ──────────────────────────────────────────

/** GET /api/products/barcode/:code — busca produto por barcode no tenant */
const getByBarcode = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.*, c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.tenant_id = $1 AND p.barcode = $2 AND p.active = true
     LIMIT 1`,
    [req.user.tenantId, req.params.code.trim()]
  );
  if (!rows[0]) return res.json({ success: true, data: null });
  res.json({ success: true, data: rows[0] });
});

/** GET /api/products/barcode-lookup/:code — consulta Open Food Facts */
const lookupBarcode = asyncHandler(async (req, res) => {
  const code = req.params.code.trim();
  const https = require('https');

  const result = await new Promise((resolve, reject) => {
    const url = `https://world.openfoodfacts.org/api/v0/product/${code}.json`;
    https.get(url, { headers: { 'User-Agent': 'ZapFome/1.0' } }, (resp) => {
      let raw = '';
      resp.on('data', d => raw += d);
      resp.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (json.status !== 1 || !json.product) return resolve(null);
          const p = json.product;
          const name = p.product_name_pt || p.product_name || p.product_name_en || '';
          const brand = p.brands || '';
          const cat = (p.categories_tags || [])[0]?.replace('pt:', '').replace('en:', '') || '';
          resolve({ name: [name, brand].filter(Boolean).join(' — '), category: cat, barcode: code });
        } catch { resolve(null); }
      });
      resp.on('error', reject);
    }).on('error', reject);
  });

  res.json({ success: true, data: result });
});

module.exports = {
  list, getOne, create, update, remove,
  replenish, movements, allMovements,
  listCats, createCat, updateCat, deleteCat,
  uploadImage,
  createGroup, updateGroup, deleteGroup,
  createOption, updateOption, deleteOption,
  getByBarcode, lookupBarcode,
};
