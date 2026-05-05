const db       = require('../../config/database');
const Product  = require('../../models/Product');
const AppError = require('../../utils/AppError');

// ── Produtos ──────────────────────────────────────────────────

const listProducts = (tenantId, query) =>
  Product.findAll(tenantId, query);

const getProduct = async (id, tenantId) => {
  const product = await Product.findById(id, tenantId);
  if (!product) throw new AppError('Produto não encontrado.', 404);
  return product;
};

const createProduct = (tenantId, data) =>
  Product.create(tenantId, data);

const updateProduct = async (id, tenantId, data) => {
  const product = await Product.update(id, tenantId, data);
  if (!product) throw new AppError('Produto não encontrado.', 404);
  return product;
};

const deleteProduct = async (id, tenantId) => {
  const product = await Product.delete(id, tenantId);
  if (!product) throw new AppError('Produto não encontrado.', 404);
  return product;
};

// ── Estoque ───────────────────────────────────────────────────

/**
 * Repõe estoque de um produto.
 * qty deve ser positivo.
 */
const replenishStock = async (id, tenantId, { quantity, reason }) => {
  if (quantity <= 0) throw new AppError('Quantidade deve ser maior que zero.', 400);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const product = await Product.findById(id, tenantId, client);
    if (!product) throw new AppError('Produto não encontrado.', 404);

    const updated = await Product.addStock(id, tenantId, quantity, client);

    await Product.createMovement({
      tenantId,
      productId:   id,
      productName: product.name,
      quantity:    +quantity,
      type:        'replenishment',
      reason:      reason || 'Reposição manual',
    }, client);

    await client.query('COMMIT');
    return updated;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Movimentações ─────────────────────────────────────────────

const listMovements = (tenantId, productId, query) =>
  Product.findMovements(tenantId, productId, query);

// ── Categorias ────────────────────────────────────────────────

const listCategories = (tenantId) =>
  Product.findAllCategories(tenantId);

const createCategory = async (tenantId, name) => {
  if (!name?.trim()) throw new AppError('Nome da categoria é obrigatório.', 400);
  return Product.createCategory(tenantId, name);
};

const deleteCategory = async (id, tenantId) => {
  const cat = await Product.deleteCategory(id, tenantId);
  if (!cat) throw new AppError('Categoria não encontrada.', 404);
  return cat;
};

module.exports = {
  listProducts, getProduct, createProduct, updateProduct, deleteProduct,
  replenishStock, listMovements,
  listCategories, createCategory, deleteCategory,
};
