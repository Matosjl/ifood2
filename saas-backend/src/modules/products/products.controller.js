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

module.exports = {
  list, getOne, create, update, remove,
  replenish, movements, allMovements,
  listCats, createCat, deleteCat,
  uploadImage,
};
