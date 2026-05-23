/**
 * addons.service.js — Complementos / Adicionais
 * Gerencia grupos de complementos e seus itens.
 * Relaciona grupos <-> produtos via product_addon_groups.
 */
const db = require('../../config/database');

// ── Grupos ────────────────────────────────────────────────────

/**
 * Lista todos os grupos do tenant, com seus itens embutidos.
 */
const listGroups = async (tenantId) => {
  const { rows: groups } = await db.query(
    `SELECT id, name, description, min_qty, max_qty, created_at
     FROM addon_groups
     WHERE tenant_id = $1
     ORDER BY name ASC`,
    [tenantId]
  );

  if (groups.length === 0) return [];

  const groupIds = groups.map((g) => g.id);
  const { rows: items } = await db.query(
    `SELECT id, group_id, name, price, active, sort_order
     FROM addon_items
     WHERE group_id = ANY($1) AND tenant_id = $2
     ORDER BY sort_order ASC, name ASC`,
    [groupIds, tenantId]
  );

  const itemsByGroup = {};
  for (const item of items) {
    (itemsByGroup[item.group_id] ??= []).push(item);
  }

  return groups.map((g) => ({ ...g, items: itemsByGroup[g.id] ?? [] }));
};

const getGroup = async (tenantId, groupId) => {
  const { rows } = await db.query(
    `SELECT id, name, description, min_qty, max_qty FROM addon_groups
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, groupId]
  );
  if (!rows[0]) return null;

  const { rows: items } = await db.query(
    `SELECT id, name, price, active, sort_order FROM addon_items
     WHERE group_id = $1 AND tenant_id = $2 ORDER BY sort_order ASC, name ASC`,
    [groupId, tenantId]
  );

  return { ...rows[0], items };
};

const createGroup = async (tenantId, { name, description, min_qty = 0, max_qty = null }) => {
  const { rows } = await db.query(
    `INSERT INTO addon_groups (tenant_id, name, description, min_qty, max_qty)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, name, description, min_qty, max_qty`,
    [tenantId, name.trim(), description?.trim() || null, min_qty, max_qty]
  );
  return { ...rows[0], items: [] };
};

const updateGroup = async (tenantId, groupId, { name, description, min_qty, max_qty }) => {
  const { rows } = await db.query(
    `UPDATE addon_groups SET
       name        = COALESCE($3, name),
       description = COALESCE($4, description),
       min_qty     = COALESCE($5, min_qty),
       max_qty     = $6,
       updated_at  = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, name, description, min_qty, max_qty`,
    [tenantId, groupId, name?.trim(), description?.trim() || null, min_qty, max_qty]
  );
  return rows[0] ?? null;
};

const deleteGroup = async (tenantId, groupId) => {
  const { rowCount } = await db.query(
    `DELETE FROM addon_groups WHERE tenant_id = $1 AND id = $2`,
    [tenantId, groupId]
  );
  return rowCount > 0;
};

// ── Itens ─────────────────────────────────────────────────────

const createItem = async (tenantId, groupId, { name, price = 0, sort_order = 0 }) => {
  const { rows } = await db.query(
    `INSERT INTO addon_items (group_id, tenant_id, name, price, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, price, active, sort_order`,
    [groupId, tenantId, name.trim(), price, sort_order]
  );
  return rows[0];
};

const updateItem = async (tenantId, itemId, { name, price, active, sort_order }) => {
  const { rows } = await db.query(
    `UPDATE addon_items SET
       name       = COALESCE($3, name),
       price      = COALESCE($4, price),
       active     = COALESCE($5, active),
       sort_order = COALESCE($6, sort_order)
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, name, price, active, sort_order`,
    [tenantId, itemId, name?.trim(), price, active, sort_order]
  );
  return rows[0] ?? null;
};

const deleteItem = async (tenantId, itemId) => {
  const { rowCount } = await db.query(
    `DELETE FROM addon_items WHERE tenant_id = $1 AND id = $2`,
    [tenantId, itemId]
  );
  return rowCount > 0;
};

// ── Ligação produto <-> grupos ─────────────────────────────────

/**
 * Retorna os grupos (com itens) vinculados a um produto.
 */
const getProductGroups = async (tenantId, productId) => {
  const { rows: links } = await db.query(
    `SELECT ag.id, ag.name, ag.description, ag.min_qty, ag.max_qty, pag.sort_order
     FROM product_addon_groups pag
     JOIN addon_groups ag ON ag.id = pag.group_id
     WHERE pag.product_id = $1 AND ag.tenant_id = $2
     ORDER BY pag.sort_order ASC, ag.name ASC`,
    [productId, tenantId]
  );

  if (links.length === 0) return [];

  const groupIds = links.map((g) => g.id);
  const { rows: items } = await db.query(
    `SELECT id, group_id, name, price, active, sort_order
     FROM addon_items WHERE group_id = ANY($1) AND tenant_id = $2 AND active = true
     ORDER BY sort_order ASC, name ASC`,
    [groupIds, tenantId]
  );

  const itemsByGroup = {};
  for (const item of items) {
    (itemsByGroup[item.group_id] ??= []).push(item);
  }

  return links.map((g) => ({ ...g, items: itemsByGroup[g.id] ?? [] }));
};

/**
 * Substitui todos os grupos vinculados a um produto.
 * groupIds: array de UUIDs (pode ser vazio para remover todos).
 */
const setProductGroups = async (tenantId, productId, groupIds) => {
  // Valida que todos os groupIds pertencem ao tenant
  if (groupIds.length > 0) {
    const { rows } = await db.query(
      `SELECT id FROM addon_groups WHERE tenant_id = $1 AND id = ANY($2)`,
      [tenantId, groupIds]
    );
    if (rows.length !== groupIds.length) {
      throw new Error('Um ou mais grupos não encontrados.');
    }
  }

  await db.query(`DELETE FROM product_addon_groups WHERE product_id = $1`, [productId]);

  if (groupIds.length > 0) {
    const values = groupIds
      .map((gid, i) => `($1, $${i + 2}, ${i})`)
      .join(', ');
    await db.query(
      `INSERT INTO product_addon_groups (product_id, group_id, sort_order) VALUES ${values}`,
      [productId, ...groupIds]
    );
  }

  return getProductGroups(tenantId, productId);
};

module.exports = {
  listGroups, getGroup, createGroup, updateGroup, deleteGroup,
  createItem, updateItem, deleteItem,
  getProductGroups, setProductGroups,
};
