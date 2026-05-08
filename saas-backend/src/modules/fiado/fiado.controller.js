const db       = require('../../config/database');
const AppError = require('../../utils/AppError');

// ── Clientes ──────────────────────────────────────────────────

exports.listClientes = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { search, order = 'name' } = req.query;

    const orderMap = { name: 'fc.name ASC', valor: 'total_aberto DESC', data: 'ultimo_fiado DESC NULLS LAST' };
    const orderBy  = orderMap[order] ?? 'fc.name ASC';

    const { rows } = await db.query(
      `SELECT
         fc.id, fc.name, fc.phone, fc.address, fc.dia_acerto,
         fc.bloqueado, fc.notes, fc.created_at,
         COALESCE(SUM(CASE WHEN c.status='pendente' THEN c.valor ELSE 0 END), 0) AS total_aberto,
         COALESCE(SUM(CASE WHEN c.status='pago'     THEN c.valor ELSE 0 END), 0) AS total_pago,
         MAX(CASE WHEN c.status='pendente' THEN c.created_at END) AS ultimo_fiado
       FROM fiado_clientes fc
       LEFT JOIN fiado_compras c ON c.cliente_id = fc.id
       WHERE fc.tenant_id = $1
         ${search ? `AND fc.name ILIKE $2` : ''}
       GROUP BY fc.id
       ORDER BY ${orderBy}`,
      search ? [tenantId, `%${search}%`] : [tenantId]
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.createCliente = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { name, phone, address, dia_acerto, notes } = req.body;
    if (!name?.trim()) throw new AppError('Nome é obrigatório.', 400);

    const { rows } = await db.query(
      `INSERT INTO fiado_clientes (tenant_id, name, phone, address, dia_acerto, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tenantId, name.trim(), phone || null, address || null, dia_acerto || null, notes || null]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

exports.updateCliente = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { name, phone, address, dia_acerto, notes } = req.body;

    const { rows } = await db.query(
      `UPDATE fiado_clientes
       SET name=$1, phone=$2, address=$3, dia_acerto=$4, notes=$5, updated_at=NOW()
       WHERE id=$6 AND tenant_id=$7 RETURNING *`,
      [name, phone || null, address || null, dia_acerto || null, notes || null, id, tenantId]
    );
    if (!rows[0]) throw new AppError('Cliente não encontrado.', 404);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

exports.deleteCliente = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    // Não permite deletar se tiver compras pendentes
    const { rows: pending } = await db.query(
      `SELECT COUNT(*) FROM fiado_compras WHERE cliente_id=$1 AND status='pendente'`,
      [id]
    );
    if (parseInt(pending[0].count) > 0)
      throw new AppError('Cliente tem compras pendentes. Quite antes de remover.', 409);

    await db.query(`DELETE FROM fiado_clientes WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    res.json({ success: true });
  } catch (err) { next(err); }
};

exports.toggleBloqueio = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const { rows } = await db.query(
      `UPDATE fiado_clientes
       SET bloqueado = NOT bloqueado, updated_at = NOW()
       WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [id, tenantId]
    );
    if (!rows[0]) throw new AppError('Cliente não encontrado.', 404);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

// ── Compras ───────────────────────────────────────────────────

exports.listCompras = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { clienteId } = req.params;

    const { rows } = await db.query(
      `SELECT c.*, o.order_number
       FROM fiado_compras c
       LEFT JOIN orders o ON o.id = c.order_id
       WHERE c.cliente_id=$1 AND c.tenant_id=$2
       ORDER BY c.created_at DESC`,
      [clienteId, tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.createCompra = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { cliente_id, order_id, descricao, valor } = req.body;
    if (!cliente_id || !valor) throw new AppError('cliente_id e valor são obrigatórios.', 400);

    // Verifica se cliente está bloqueado
    const { rows: cli } = await db.query(
      `SELECT bloqueado FROM fiado_clientes WHERE id=$1 AND tenant_id=$2`,
      [cliente_id, tenantId]
    );
    if (!cli[0]) throw new AppError('Cliente não encontrado.', 404);
    if (cli[0].bloqueado) throw new AppError('Cliente bloqueado para compras fiadas.', 403);

    const { rows } = await db.query(
      `INSERT INTO fiado_compras (tenant_id, cliente_id, order_id, descricao, valor)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [tenantId, cliente_id, order_id || null, descricao || 'Compra fiada', valor]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

exports.pagarCompra = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const { rows } = await db.query(
      `UPDATE fiado_compras
       SET status='pago', paid_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND tenant_id=$2 AND status='pendente' RETURNING *`,
      [id, tenantId]
    );
    if (!rows[0]) throw new AppError('Compra não encontrada ou já quitada.', 404);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

exports.cancelarCompra = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const { rows } = await db.query(
      `UPDATE fiado_compras
       SET status='cancelado', updated_at=NOW()
       WHERE id=$1 AND tenant_id=$2 AND status='pendente' RETURNING *`,
      [id, tenantId]
    );
    if (!rows[0]) throw new AppError('Compra não encontrada ou não pode ser cancelada.', 404);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

// ── Resumo dashboard ──────────────────────────────────────────

exports.resumo = async (req, res, next) => {
  try {
    const { tenantId } = req.user;

    const { rows } = await db.query(
      `SELECT
         COUNT(DISTINCT fc.id)                                          AS total_clientes,
         COUNT(DISTINCT CASE WHEN fc.bloqueado THEN fc.id END)         AS clientes_bloqueados,
         COALESCE(SUM(CASE WHEN c.status='pendente' THEN c.valor END), 0) AS total_aberto,
         COALESCE(SUM(CASE WHEN c.status='pago'     THEN c.valor END), 0) AS total_recebido,
         COUNT(CASE WHEN c.status='pendente' THEN 1 END)               AS compras_pendentes
       FROM fiado_clientes fc
       LEFT JOIN fiado_compras c ON c.cliente_id = fc.id
       WHERE fc.tenant_id = $1`,
      [tenantId]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};
