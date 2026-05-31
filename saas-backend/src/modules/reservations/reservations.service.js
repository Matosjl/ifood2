const db       = require('../../config/database');
const AppError = require('../../utils/AppError');

const VALID_STATUSES = ['pending', 'confirmed', 'seated', 'cancelled', 'no_show'];

// ── CRUD ──────────────────────────────────────────────────────

async function list(tenantId, { date, status } = {}) {
  const params = [tenantId];
  const wheres = ['r.tenant_id = $1'];

  if (date) {
    params.push(date); // YYYY-MM-DD
    wheres.push(`DATE(r.reserved_at AT TIME ZONE 'America/Sao_Paulo') = $${params.length}`);
  }
  if (status) {
    params.push(status);
    wheres.push(`r.status = $${params.length}`);
  }

  const { rows } = await db.query(
    `SELECT r.*, t.table_number, t.description AS table_label
     FROM reservations r
     LEFT JOIN restaurant_tables t ON t.id = r.table_id
     WHERE ${wheres.join(' AND ')}
     ORDER BY r.reserved_at ASC`,
    params
  );
  return rows;
}

async function create(tenantId, data) {
  const { customerName, phone, reservedAt, partySize, tableId, notes } = data;
  if (!customerName?.trim()) throw new AppError('Nome é obrigatório', 400);
  if (!reservedAt)           throw new AppError('Data/hora é obrigatória', 400);
  if (!partySize || partySize < 1) throw new AppError('Número de pessoas inválido', 400);

  const { rows } = await db.query(
    `INSERT INTO reservations (tenant_id, customer_name, phone, reserved_at, party_size, table_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [tenantId, customerName.trim(), phone ?? null, reservedAt, partySize, tableId ?? null, notes ?? null]
  );
  return rows[0];
}

async function update(id, tenantId, data) {
  const fields = [];
  const params = [id, tenantId];

  const allowed = ['customer_name', 'phone', 'reserved_at', 'party_size', 'table_id', 'notes', 'status'];
  const map     = {
    customerName: 'customer_name',
    phone:        'phone',
    reservedAt:   'reserved_at',
    partySize:    'party_size',
    tableId:      'table_id',
    notes:        'notes',
    status:       'status',
  };

  for (const [jsKey, dbCol] of Object.entries(map)) {
    if (data[jsKey] !== undefined) {
      if (dbCol === 'status' && !VALID_STATUSES.includes(data[jsKey])) {
        throw new AppError('Status inválido', 400);
      }
      params.push(data[jsKey]);
      fields.push(`${dbCol} = $${params.length}`);
    }
  }
  if (fields.length === 0) throw new AppError('Nada para atualizar', 400);
  fields.push('updated_at = NOW()');

  const { rows } = await db.query(
    `UPDATE reservations SET ${fields.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    params
  );
  if (!rows[0]) throw new AppError('Reserva não encontrada', 404);
  return rows[0];
}

async function remove(id, tenantId) {
  const { rowCount } = await db.query(
    `DELETE FROM reservations WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (!rowCount) throw new AppError('Reserva não encontrada', 404);
}

// ── Send WhatsApp confirmation ────────────────────────────────

async function sendConfirmation(tenantId, reservation) {
  const { phone, customer_name, reserved_at, party_size } = reservation;
  if (!phone) return;

  const dt  = new Date(reserved_at);
  const dtf = dt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
  const msg = `Olá ${customer_name}! ✅ Sua reserva foi *confirmada*.\n📅 Data: *${dtf}*\n👥 Pessoas: *${party_size}*\n\nNos vemos em breve! 😊`;

  const { sendMessage } = require('../../services/whatsapp.service');
  return sendMessage(tenantId, phone, msg).catch(() => {});
}

module.exports = { list, create, update, remove, sendConfirmation };
