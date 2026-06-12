'use strict';
const db         = require('../../config/database');
const AppError   = require('../../utils/AppError');
const financeLog = require('../../utils/financeLog');

// Clientes

exports.listClientes = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { search, order = 'name' } = req.query;

    const orderMap = { name: 'fc.name ASC', valor: 'total_aberto DESC', data: 'ultimo_fiado DESC NULLS LAST' };
    const orderBy  = orderMap[order] ?? 'fc.name ASC';

    const { rows } = await db.query(
      `SELECT
         fc.id, fc.name, fc.phone, fc.address, fc.dia_acerto,
         fc.acerto_type, fc.acerto_weekday,
         fc.bloqueado, fc.notes, fc.created_at,
         COALESCE(SUM(CASE WHEN c.status='pendente' AND COALESCE(c.tipo,'compra')='compra'       THEN c.valor ELSE 0 END), 0)
           - COALESCE(SUM(CASE WHEN c.status='pendente' AND c.tipo='adiantamento' THEN c.valor ELSE 0 END), 0) AS total_aberto,
         COALESCE(SUM(CASE WHEN c.status='pago'     THEN c.valor END), 0) AS total_pago,
         COALESCE(SUM(CASE WHEN c.status='pendente' AND c.tipo='adiantamento' THEN c.valor ELSE 0 END), 0) AS total_credito,
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
    const { name, phone, address, dia_acerto, notes, acerto_type = 'day_of_month', acerto_weekday } = req.body;
    if (!name?.trim()) throw new AppError('Nome e obrigatorio.', 400);

    const { rows } = await db.query(
      `INSERT INTO fiado_clientes (tenant_id, name, phone, address, dia_acerto, notes, acerto_type, acerto_weekday)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [tenantId, name.trim(), phone || null, address || null,
       acerto_type === 'day_of_month' ? (dia_acerto || null) : null,
       notes || null,
       acerto_type,
       acerto_type === 'day_of_week' ? (acerto_weekday ?? null) : null]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

exports.updateCliente = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { name, phone, address, dia_acerto, notes, acerto_type = 'day_of_month', acerto_weekday } = req.body;

    const { rows } = await db.query(
      `UPDATE fiado_clientes
       SET name=$1, phone=$2, address=$3, dia_acerto=$4, notes=$5,
           acerto_type=$6, acerto_weekday=$7, updated_at=NOW()
       WHERE id=$8 AND tenant_id=$9 RETURNING *`,
      [name, phone || null, address || null,
       acerto_type === 'day_of_month' ? (dia_acerto || null) : null,
       notes || null,
       acerto_type,
       acerto_type === 'day_of_week' ? (acerto_weekday ?? null) : null,
       id, tenantId]
    );
    if (!rows[0]) throw new AppError('Cliente nao encontrado.', 404);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

exports.deleteCliente = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const { rows: pending } = await db.query(
      `SELECT COUNT(*) FROM fiado_compras WHERE cliente_id=$1 AND tenant_id=$2 AND status='pendente'`,
      [id, tenantId]
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
    if (!rows[0]) throw new AppError('Cliente nao encontrado.', 404);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

// Compras

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
    const { cliente_id, order_id, descricao, valor, tipo = 'compra' } = req.body;
    if (!cliente_id || !valor) throw new AppError('cliente_id e valor sao obrigatorios.', 400);
    if (!['compra', 'adiantamento'].includes(tipo)) throw new AppError('tipo invalido.', 400);

    const { rows: cli } = await db.query(
      `SELECT bloqueado FROM fiado_clientes WHERE id=$1 AND tenant_id=$2`,
      [cliente_id, tenantId]
    );
    if (!cli[0]) throw new AppError('Cliente nao encontrado.', 404);
    if (cli[0].bloqueado && tipo === 'compra') throw new AppError('Cliente bloqueado para compras fiadas.', 403);

    const defaultDesc = tipo === 'adiantamento' ? 'Pagamento adiantado' : 'Compra fiada';
    const { rows } = await db.query(
      `INSERT INTO fiado_compras (tenant_id, cliente_id, order_id, descricao, valor, tipo)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tenantId, cliente_id, order_id || null, descricao || defaultDesc, valor, tipo]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

// pagarCompra — Costura 2
//
// Fluxo:
//   BEGIN
//   UPDATE fiado_compras ... WHERE status='pendente' RETURNING *   <- atomico, idempotente
//   se 0 rows: ROLLBACK + 404
//   se adiantamento: COMMIT (sem lancamento financeiro)
//   validar payment_method para compra
//   dinheiro  -> caixa_movements (type='fiado_recebido', reference_id=fiado_compra.id)
//   digital   -> banco_transactions (type='credit', source='fiado', reference_id=fiado_compra.id)
//   COMMIT
//   financeLog (fire-and-forget)
//
// Idempotencia:
//   - UPDATE com WHERE status='pendente' retorna 0 rows se ja pago -> ROLLBACK + 404
//   - uq_caixa_fiado_recebido_reference e uq_banco_fiado_reference bloqueiam duplicatas no DB
exports.pagarCompra = async (req, res, next) => {
  const client = await db.getClient();
  try {
    const { tenantId, userId }     = req.user;
    const { id }                   = req.params;
    const { payment_method }       = req.body;

    await client.query('BEGIN');

    // 1. UPDATE atomico dentro da transacao — garante que so 1 request vence
    //    WHERE status='pendente' e a unica guard de idempotencia necessaria
    const { rows: updated } = await client.query(
      `UPDATE fiado_compras
       SET status='pago', paid_at=NOW(), updated_at=NOW(),
           payment_method = CASE WHEN tipo='adiantamento' THEN NULL ELSE $3 END,
           paid_by        = $4
       WHERE id=$1 AND tenant_id=$2 AND status='pendente'
       RETURNING *`,
      [id, tenantId, payment_method || null, userId || null]
    );

    if (!updated[0]) {
      await client.query('ROLLBACK');
      throw new AppError('Compra nao encontrada ou ja quitada.', 404);
    }

    const compra = updated[0];

    // 2. Adiantamento: sem lancamento financeiro (dinheiro ja foi recebido antes)
    if (compra.tipo === 'adiantamento') {
      await client.query('COMMIT');
      await financeLog({
        tenantId, userId, action: 'fiado_adiantamento_usado',
        tableName: 'fiado_compras', recordId: id,
        beforeData: { status: 'pendente', tipo: compra.tipo, valor: compra.valor },
        afterData:  { status: 'pago', payment_method: null },
        amount: compra.valor, ip: req.ip,
      });
      return res.json({ success: true, data: compra });
    }

    // 3. Compra: validar metodo
    const VALID = ['cash', 'pix', 'credit', 'debit', 'voucher', 'other'];
    if (!payment_method) {
      await client.query('ROLLBACK');
      throw new AppError('payment_method e obrigatorio para compras fiadas.', 400);
    }
    if (!VALID.includes(payment_method)) {
      await client.query('ROLLBACK');
      throw new AppError('payment_method invalido. Use: cash, pix, credit, debit, voucher ou other.', 400);
    }

    if (payment_method === 'cash') {
      // 4a. Dinheiro: entra no caixa fisico
      const { rows: cr } = await client.query(
        `SELECT id FROM cash_registers WHERE tenant_id=$1 AND status='open' LIMIT 1`,
        [tenantId]
      );
      if (!cr[0]) {
        await client.query('ROLLBACK');
        throw new AppError('Nenhum caixa aberto. Abra o caixa antes de registrar recebimento de fiado.', 409);
      }
      const cashRegisterId = cr[0].id;

      // uq_caixa_fiado_recebido_reference bloqueia duplicata no DB
      await client.query(
        `INSERT INTO caixa_movements
           (tenant_id, cash_register_id, type, amount, reason, created_by, reference_id)
         VALUES ($1,$2,'fiado_recebido',$3,$4,$5,$6)
         ON CONFLICT DO NOTHING`,
        [tenantId, cashRegisterId, compra.valor,
         'Fiado recebido: ' + (compra.descricao || 'compra fiada'),
         userId || null, id]
      );

      await client.query(
        `UPDATE fiado_compras SET cash_register_id=$1 WHERE id=$2`,
        [cashRegisterId, id]
      );
    } else {
      // 4b. Digital (PIX/cartao/voucher/other): banco_transactions
      // type='credit' (schema: CHECK type IN ('credit','debit'))
      // sem created_by (coluna nao existe em banco_transactions)
      // uq_banco_fiado_reference bloqueia duplicata no DB
      await client.query(
        `INSERT INTO banco_transactions
           (tenant_id, type, amount, description, source, reference_id)
         VALUES ($1,'credit',$2,$3,'fiado',$4)
         ON CONFLICT DO NOTHING`,
        [tenantId, compra.valor,
         'Fiado recebido (' + payment_method + '): ' + (compra.descricao || 'compra fiada'),
         id]
      );
    }

    await client.query('COMMIT');

    await financeLog({
      tenantId, userId, action: 'fiado_paid',
      tableName: 'fiado_compras', recordId: id,
      beforeData: { status: 'pendente', tipo: compra.tipo, valor: compra.valor },
      afterData:  { status: 'pago', payment_method },
      amount: compra.valor, ip: req.ip,
    });

    res.json({ success: true, data: compra });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
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
    if (!rows[0]) throw new AppError('Compra nao encontrada ou nao pode ser cancelada.', 404);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

// Resumo dashboard

exports.resumo = async (req, res, next) => {
  try {
    const { tenantId } = req.user;

    const { rows } = await db.query(
      `SELECT
         COUNT(DISTINCT fc.id)                                          AS total_clientes,
         COUNT(DISTINCT CASE WHEN fc.bloqueado THEN fc.id END)         AS clientes_bloqueados,
         COALESCE(SUM(CASE WHEN c.status='pendente' THEN c.valor END), 0) AS total_aberto,
         COALESCE(SUM(CASE WHEN c.status='pago'     THEN c.valor END), 0) AS total_recebido,
         COUNT(CASE WHEN c.status='pendente' AND COALESCE(c.tipo,'compra')='compra' THEN 1 END) AS compras_pendentes,
         COALESCE(SUM(CASE WHEN c.status='pendente' AND c.tipo='adiantamento' THEN c.valor END), 0) AS total_creditos
       FROM fiado_clientes fc
       LEFT JOIN fiado_compras c ON c.cliente_id = fc.id
       WHERE fc.tenant_id = $1`,
      [tenantId]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};
