const db       = require('../../config/database');
const AppError = require('../../utils/AppError');

const listLocations = async (tenantId) => {
  const { rows } = await db.query(
    `SELECT id, name, address, phone, active, is_default, created_at, updated_at
     FROM locations
     WHERE tenant_id = $1
     ORDER BY is_default DESC, name ASC`,
    [tenantId]
  );
  return rows;
};

const getLocation = async (tenantId, id) => {
  const { rows } = await db.query(
    `SELECT id, name, address, phone, active, is_default, created_at, updated_at
     FROM locations WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  return rows[0] ?? null;
};

const createLocation = async (tenantId, { name, address, phone, active = true, is_default = false }) => {
  // If first location, make it default automatically
  const { rows: existing } = await db.query(
    `SELECT COUNT(*)::int AS cnt FROM locations WHERE tenant_id = $1`, [tenantId]
  );
  const makeDefault = is_default || existing[0].cnt === 0;

  if (makeDefault) {
    await db.query(
      `UPDATE locations SET is_default = false WHERE tenant_id = $1`, [tenantId]
    );
  }

  const { rows } = await db.query(
    `INSERT INTO locations (tenant_id, name, address, phone, active, is_default)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, address, phone, active, is_default, created_at`,
    [tenantId, name.trim(), address ?? null, phone ?? null, active, makeDefault]
  );
  return rows[0];
};

const updateLocation = async (tenantId, id, { name, address, phone, active, is_default }) => {
  // If setting this as default, clear others first
  if (is_default === true) {
    await db.query(
      `UPDATE locations SET is_default = false WHERE tenant_id = $1`, [tenantId]
    );
  }

  const { rows } = await db.query(
    `UPDATE locations SET
       name       = COALESCE($3, name),
       address    = COALESCE($4, address),
       phone      = COALESCE($5, phone),
       active     = COALESCE($6, active),
       is_default = COALESCE($7, is_default),
       updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, name, address, phone, active, is_default, updated_at`,
    [tenantId, id, name?.trim(), address, phone, active, is_default]
  );
  if (!rows[0]) throw new AppError('Filial não encontrada.', 404);
  return rows[0];
};

const deleteLocation = async (tenantId, id) => {
  // Cannot delete the default location if others exist
  const { rows: loc } = await db.query(
    `SELECT is_default FROM locations WHERE tenant_id = $1 AND id = $2`, [tenantId, id]
  );
  if (!loc[0]) throw new AppError('Filial não encontrada.', 404);

  const { rows: others } = await db.query(
    `SELECT COUNT(*)::int AS cnt FROM locations WHERE tenant_id = $1 AND id != $2`, [tenantId, id]
  );
  if (loc[0].is_default && others[0].cnt > 0) {
    throw new AppError('Defina outra filial como padrão antes de remover esta.', 400);
  }

  // Null out orders linked to this location
  await db.query(
    `UPDATE orders SET location_id = NULL WHERE tenant_id = $1 AND location_id = $2`,
    [tenantId, id]
  );

  const { rowCount } = await db.query(
    `DELETE FROM locations WHERE tenant_id = $1 AND id = $2`, [tenantId, id]
  );
  return rowCount > 0;
};

module.exports = { listLocations, getLocation, createLocation, updateLocation, deleteLocation };
