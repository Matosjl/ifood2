/**
 * consumo.service.js — Consumo Interno + Centro de Vazamentos
 *
 * Registra saídas internas (funcionário, família, brinde, degustação, perda)
 * para insumos ou produtos. Atualiza estoque e cria registro de movimentação.
 * Alimenta o Centro de Vazamentos via aggregação mensal.
 */
const db = require('../../config/database');
const AppError = require('../../utils/AppError');

// ── Sugestões para cold start ─────────────────────────────────

/**
 * Retorna os itens mais usados (consumo interno) + mais vendidos (fallback)
 * para exibir sugestões rápidas na tela de registro.
 */
const getSugestoes = async (tenantId) => {
  // 1. Mais consumidos internamente nos últimos 60 dias
  const { rows: usados } = await db.query(
    `SELECT
       ic.item_name                      AS name,
       ic.unit,
       ic.insumo_id,
       ic.product_id,
       SUM(ic.quantity)::float           AS total_usado,
       COUNT(*)::int                     AS vezes,
       AVG(ic.unit_cost)::float          AS unit_cost,
       MAX(ic.consumption_type)          AS ultimo_tipo
     FROM internal_consumptions ic
     WHERE ic.tenant_id = $1
       AND ic.created_at >= NOW() - INTERVAL '60 days'
     GROUP BY ic.item_name, ic.unit, ic.insumo_id, ic.product_id
     ORDER BY vezes DESC, total_usado DESC
     LIMIT 10`,
    [tenantId]
  );

  // 2. Insumos ativos (para busca completa)
  const { rows: insumos } = await db.query(
    `SELECT id, name, unit, qty_in_stock, cost_per_unit
     FROM insumos
     WHERE tenant_id = $1
     ORDER BY name ASC
     LIMIT 100`,
    [tenantId]
  );

  // 3. Mais vendidos dos últimos 30 dias (fallback se não houver histórico)
  const { rows: vendidos } = await db.query(
    `SELECT
       p.id                        AS product_id,
       p.name,
       p.sale_type                 AS unit,
       p.cost_price                AS unit_cost,
       p.stock_qty,
       SUM(oi.quantity)::int       AS total_vendido
     FROM order_items oi
     JOIN orders o       ON o.id = oi.order_id
     JOIN products p     ON p.id = oi.product_id
     WHERE o.tenant_id = $1
       AND o.created_at >= NOW() - INTERVAL '30 days'
       AND o.status NOT IN ('cancelled', 'pending')
       AND p.active = true
     GROUP BY p.id, p.name, p.sale_type, p.cost_price, p.stock_qty
     ORDER BY total_vendido DESC
     LIMIT 10`,
    [tenantId]
  );

  return { usados, insumos, vendidos };
};

// ── Registro de consumo interno ───────────────────────────────

/**
 * Registra um consumo interno. Transacional:
 *  - Valida item existente e ativo
 *  - Atualiza qty_in_stock (insumo) ou stock_qty (produto)
 *  - Cria registro em insumo_movements ou stock_movements
 *  - Insere em internal_consumptions
 */
const registrar = async (tenantId, userId, {
  insumo_id,
  product_id,
  quantity,
  consumption_type = 'funcionario',
  notes,
}) => {
  if (!insumo_id && !product_id) {
    throw new AppError('Informe o insumo ou produto.', 400);
  }
  if (insumo_id && product_id) {
    throw new AppError('Informe apenas insumo ou produto, não ambos.', 400);
  }
  if (!quantity || parseFloat(quantity) <= 0) {
    throw new AppError('Quantidade deve ser maior que zero.', 400);
  }

  const TIPOS_VALIDOS = ['funcionario', 'familia', 'brinde', 'degustacao', 'perda'];
  if (!TIPOS_VALIDOS.includes(consumption_type)) {
    throw new AppError('Tipo de consumo inválido.', 400);
  }

  const qty = parseFloat(quantity);
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    let itemName, unit, unitCost, totalCost;

    if (insumo_id) {
      // ── Insumo ─────────────────────────────────────────────
      const { rows: [insumo] } = await client.query(
        `SELECT id, name, unit, qty_in_stock, cost_per_unit
         FROM insumos WHERE id = $1 AND tenant_id = $2`,
        [insumo_id, tenantId]
      );
      if (!insumo) throw new AppError('Insumo não encontrado.', 404);

      itemName = insumo.name;
      unit     = insumo.unit;
      unitCost = parseFloat(insumo.cost_per_unit);
      totalCost = parseFloat((unitCost * qty).toFixed(2));

      const qtyBefore = parseFloat(insumo.qty_in_stock);
      const qtyAfter  = parseFloat((qtyBefore - qty).toFixed(3));

      // Aviso se estoque vai ficar negativo (não bloqueia)
      const stockWarning = qtyAfter < 0
        ? `Atenção: estoque ficará negativo (${qtyAfter} ${unit})`
        : null;

      // Atualiza estoque do insumo
      await client.query(
        `UPDATE insumos SET qty_in_stock = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [qtyAfter, insumo_id, tenantId]
      );

      // Cria movimento em insumo_movements
      await client.query(
        `INSERT INTO insumo_movements
           (tenant_id, insumo_id, type, qty, qty_before, qty_after, reason, reference_type, created_by)
         VALUES ($1, $2, 'consumption', $3, $4, $5, $6, 'internal_consumption', $7)`,
        [tenantId, insumo_id, -qty, qtyBefore, qtyAfter,
         `Consumo interno: ${consumption_type}${notes ? ' — ' + notes : ''}`,
         userId || null]
      );

    } else {
      // ── Produto ────────────────────────────────────────────
      const { rows: [product] } = await client.query(
        `SELECT id, name, sale_type, stock_qty, cost_price, active
         FROM products WHERE id = $1 AND tenant_id = $2`,
        [product_id, tenantId]
      );
      if (!product) throw new AppError('Produto não encontrado.', 404);
      if (!product.active) throw new AppError('Produto inativo.', 400);

      itemName = product.name;
      unit     = product.sale_type === 'kg' ? 'kg' : 'un';
      unitCost = parseFloat(product.cost_price || 0);
      totalCost = parseFloat((unitCost * qty).toFixed(2));

      const qtyBefore = parseFloat(product.stock_qty || 0);
      const qtyAfter  = parseFloat((qtyBefore - qty).toFixed(3));

      // Atualiza stock_qty do produto
      await client.query(
        `UPDATE products SET stock_qty = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [qtyAfter, product_id, tenantId]
      );

      // Cria movimento em stock_movements
      await client.query(
        `INSERT INTO stock_movements
           (tenant_id, product_id, product_name, quantity, type, reason, created_at)
         VALUES ($1, $2, $3, $4, 'out', $5, NOW())`,
        [tenantId, product_id, product.name, -qty,
         `Consumo interno: ${consumption_type}${notes ? ' — ' + notes : ''}`]
      );
    }

    // Registra em internal_consumptions
    const { rows: [registro] } = await client.query(
      `INSERT INTO internal_consumptions
         (tenant_id, insumo_id, product_id, item_name, unit, quantity,
          unit_cost, total_cost, consumption_type, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [tenantId, insumo_id || null, product_id || null,
       itemName, unit, qty, unitCost, totalCost,
       consumption_type, notes || null, userId || null]
    );

    await client.query('COMMIT');
    return { ...registro, total_cost: totalCost };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── Histórico ─────────────────────────────────────────────────

const getHistorico = async (tenantId, { mes, page = 1, limit = 50 } = {}) => {
  const offset = (page - 1) * limit;
  const params = [tenantId];
  let dateFilter = '';

  if (mes) {
    // mes = 'YYYY-MM'
    params.push(mes + '-01');
    dateFilter = `AND ic.created_at >= $${params.length}::date
                  AND ic.created_at < ($${params.length}::date + INTERVAL '1 month')`;
  }

  params.push(limit, offset);

  const { rows } = await db.query(
    `SELECT ic.*,
            u.name AS created_by_name
     FROM internal_consumptions ic
     LEFT JOIN users u ON u.id = ic.created_by
     WHERE ic.tenant_id = $1
       ${dateFilter}
     ORDER BY ic.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return rows;
};

// ── Centro de Vazamentos ──────────────────────────────────────

/**
 * Agrega todos os "vazamentos" do mês:
 * - Consumo interno (internal_consumptions)
 * - Perdas de insumos (waste_logs)
 * - Cancelamentos (orders WHERE status='cancelled')
 * - Diferença de caixa (cash_registers WHERE discrepancy != 0)
 * - CMV Teórico vs Real (desvio operacional)
 * - Produtos vendidos sem custo cadastrado
 * - Taxas de cartão estimadas (crédito/débito)
 * - Fiado em aberto > 30 dias
 */
const getVazamentos = async (tenantId, mes) => {
  // mes = 'YYYY-MM', padrão = mês atual
  const refMes = mes || new Date().toISOString().slice(0, 7);
  const inicio = refMes + '-01';

  // Mês anterior para comparativo
  const [ano, mm] = refMes.split('-').map(Number);
  const mesAnterior = mm === 1
    ? `${ano - 1}-12`
    : `${ano}-${String(mm - 1).padStart(2, '0')}`;
  const inicioAnterior = mesAnterior + '-01';

  // ── Consumo Interno ────────────────────────────────────────
  const { rows: [ci] } = await db.query(
    `SELECT
       COALESCE(SUM(total_cost), 0)::float                                         AS total,
       COALESCE(SUM(total_cost) FILTER (WHERE consumption_type='funcionario'),0)::float AS funcionario,
       COALESCE(SUM(total_cost) FILTER (WHERE consumption_type='familia'),0)::float     AS familia,
       COALESCE(SUM(total_cost) FILTER (WHERE consumption_type='brinde'),0)::float      AS brinde,
       COALESCE(SUM(total_cost) FILTER (WHERE consumption_type='degustacao'),0)::float  AS degustacao,
       COALESCE(SUM(total_cost) FILTER (WHERE consumption_type='perda'),0)::float       AS perda_ic,
       COUNT(*)::int                                                                    AS registros
     FROM internal_consumptions
     WHERE tenant_id = $1
       AND created_at >= $2::date
       AND created_at < ($2::date + INTERVAL '1 month')`,
    [tenantId, inicio]
  );

  const { rows: [ciAnterior] } = await db.query(
    `SELECT COALESCE(SUM(total_cost), 0)::float AS total
     FROM internal_consumptions
     WHERE tenant_id = $1
       AND created_at >= $2::date
       AND created_at < ($2::date + INTERVAL '1 month')`,
    [tenantId, inicioAnterior]
  );

  // ── Perdas de insumos (waste_logs) ────────────────────────
  const { rows: [perdas] } = await db.query(
    `SELECT COALESCE(SUM(cost), 0)::float AS total, COUNT(*)::int AS registros
     FROM waste_logs
     WHERE tenant_id = $1
       AND created_at >= $2::date
       AND created_at < ($2::date + INTERVAL '1 month')`,
    [tenantId, inicio]
  );

  const { rows: [perdasAnterior] } = await db.query(
    `SELECT COALESCE(SUM(cost), 0)::float AS total
     FROM waste_logs
     WHERE tenant_id = $1
       AND created_at >= $2::date
       AND created_at < ($2::date + INTERVAL '1 month')`,
    [tenantId, inicioAnterior]
  );

  // ── Cancelamentos ─────────────────────────────────────────
  const { rows: [cancel] } = await db.query(
    `SELECT
       COALESCE(SUM(total), 0)::float AS total,
       COUNT(*)::int                  AS registros
     FROM orders
     WHERE tenant_id = $1
       AND status = 'cancelled'
       AND created_at >= $2::date
       AND created_at < ($2::date + INTERVAL '1 month')`,
    [tenantId, inicio]
  );

  const { rows: [cancelAnterior] } = await db.query(
    `SELECT COALESCE(SUM(total), 0)::float AS total
     FROM orders
     WHERE tenant_id = $1
       AND status = 'cancelled'
       AND created_at >= $2::date
       AND created_at < ($2::date + INTERVAL '1 month')`,
    [tenantId, inicioAnterior]
  );

  // ── Diferença de caixa ────────────────────────────────────
  const { rows: [caixa] } = await db.query(
    `SELECT
       COALESCE(SUM(ABS(discrepancy)), 0)::float AS total,
       COUNT(*) FILTER (WHERE discrepancy != 0)::int AS registros
     FROM cash_registers
     WHERE tenant_id = $1
       AND status = 'closed'
       AND discrepancy IS NOT NULL
       AND closed_at >= $2::date
       AND closed_at < ($2::date + INTERVAL '1 month')`,
    [tenantId, inicio]
  );

  const { rows: [caixaAnterior] } = await db.query(
    `SELECT COALESCE(SUM(ABS(discrepancy)), 0)::float AS total
     FROM cash_registers
     WHERE tenant_id = $1
       AND status = 'closed'
       AND discrepancy IS NOT NULL
       AND closed_at >= $2::date
       AND closed_at < ($2::date + INTERVAL '1 month')`,
    [tenantId, inicioAnterior]
  );

  // ── Faturamento do mês (para calcular %) ─────────────────
  const { rows: [fat] } = await db.query(
    `SELECT COALESCE(SUM(total), 0)::float AS faturamento
     FROM orders
     WHERE tenant_id = $1
       AND status NOT IN ('cancelled', 'pending')
       AND created_at >= $2::date
       AND created_at < ($2::date + INTERVAL '1 month')`,
    [tenantId, inicio]
  );

  const faturamento = parseFloat(fat.faturamento) || 1; // evita divisão por zero

  // ── CMV Teórico vs Real ────────────────────────────────────
  // CMV Teórico = o que deveria ter sido consumido (ficha técnica × qtd vendida)
  // CMV Real    = o que foi registrado nos order_items (total_cost snapshot)
  // Desvio      = Real − Teórico  (positivo = perdas não capturadas)
  const { rows: [cmvRows] } = await db.query(
    `SELECT
       -- CMV Real: snapshot gravado nos itens no momento da venda
       COALESCE(SUM(oi.total_cost), 0)::float AS cmv_real,
       -- CMV Teórico: qty_per_unit × quantidade_vendida × cost_per_unit atual do insumo
       COALESCE(SUM(
         CASE WHEN oi.weight_kg IS NOT NULL
              THEN oi.weight_kg * pi.qty_per_unit * i.cost_per_unit
              ELSE oi.quantity  * pi.qty_per_unit * i.cost_per_unit
         END
       ), 0)::float AS cmv_teorico
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN product_insumos pi
       ON pi.product_id = oi.product_id AND pi.tenant_id = o.tenant_id
     LEFT JOIN insumos i ON i.id = pi.insumo_id
     WHERE o.tenant_id = $1
       AND o.status IN ('ready','delivered')
       AND o.created_at >= $2::date
       AND o.created_at < ($2::date + INTERVAL '1 month')`,
    [tenantId, inicio]
  );

  const cmvReal    = parseFloat(cmvRows.cmv_real    || 0);
  const cmvTeorico = parseFloat(cmvRows.cmv_teorico || 0);
  // Desvio: quanto consumiu a mais que o previsto pelas fichas técnicas
  const desvio_cmv = parseFloat(Math.max(0, cmvReal - cmvTeorico).toFixed(2));

  // ── Produtos vendidos sem custo cadastrado ────────────────
  // Receita gerada por produtos com cost_price = 0 e sem ficha técnica
  // = lucro potencialmente inflado (CMV = 0, mas real é desconhecido)
  const { rows: [semCusto] } = await db.query(
    `SELECT
       COUNT(DISTINCT oi.product_id)::int  AS produtos,
       COALESCE(SUM(oi.total), 0)::float   AS receita
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id AND p.tenant_id = o.tenant_id
     WHERE o.tenant_id = $1
       AND o.status IN ('ready','delivered')
       AND o.created_at >= $2::date
       AND o.created_at < ($2::date + INTERVAL '1 month')
       AND p.cost_price = 0
       AND NOT EXISTS (
         SELECT 1 FROM product_insumos pi2
         WHERE pi2.product_id = oi.product_id AND pi2.tenant_id = o.tenant_id
       )`,
    [tenantId, inicio]
  );

  // ── Taxas de cartão estimadas ─────────────────────────────
  // Crédito ≈ 2.99%, Débito ≈ 1.49%, Voucher ≈ 1.99% — usamos 2.5% como estimativa conservadora
  const TAXA_CARTAO = 0.025;
  const { rows: [cartao] } = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN payment_method = 'credit'  THEN total ELSE 0 END), 0)::float AS credito,
       COALESCE(SUM(CASE WHEN payment_method = 'debit'   THEN total ELSE 0 END), 0)::float AS debito,
       COALESCE(SUM(CASE WHEN payment_method = 'voucher' THEN total ELSE 0 END), 0)::float AS voucher
     FROM orders
     WHERE tenant_id = $1
       AND status IN ('ready','delivered')
       AND created_at >= $2::date
       AND created_at < ($2::date + INTERVAL '1 month')`,
    [tenantId, inicio]
  );

  const baseCartao   = parseFloat(cartao.credito) + parseFloat(cartao.debito) + parseFloat(cartao.voucher);
  const taxaCartao   = parseFloat((baseCartao * TAXA_CARTAO).toFixed(2));

  // ── Fiado em aberto > 30 dias ─────────────────────────────
  const { rows: [fiado] } = await db.query(
    `SELECT
       COALESCE(SUM(fc.valor), 0)::float AS total,
       COUNT(*)::int                      AS registros
     FROM fiado_compras fc
     WHERE fc.tenant_id = $1
       AND fc.status = 'pendente'
       AND fc.created_at < NOW() - INTERVAL '30 days'`,
    [tenantId]
  );

  const totalCI      = parseFloat(ci.total);
  const totalPerdas  = parseFloat(perdas.total);
  const totalCancel  = parseFloat(cancel.total);
  const totalCaixa   = parseFloat(caixa.total);
  const totalFiado   = parseFloat(fiado.total || 0);
  const totalSemCusto = 0; // não é perda direta, é risco — informativo
  const totalGeral   = parseFloat((
    totalCI + totalPerdas + totalCancel + totalCaixa + desvio_cmv + taxaCartao
  ).toFixed(2));

  const pct   = (v) => parseFloat(((v / faturamento) * 100).toFixed(1));
  const delta = (atual, anterior) => parseFloat((atual - anterior).toFixed(2));

  return {
    mes: refMes,
    faturamento: parseFloat(faturamento.toFixed(2)),
    total: totalGeral,
    total_pct: pct(totalGeral),
    delta_anterior: delta(
      totalGeral,
      parseFloat(ciAnterior.total) + parseFloat(perdasAnterior.total) +
      parseFloat(cancelAnterior.total) + parseFloat(caixaAnterior.total)
    ),
    categorias: {
      // ── Desvio CMV (Teórico vs Real) ─────────────────────
      desvio_cmv: {
        total:       desvio_cmv,
        pct:         pct(desvio_cmv),
        delta:       0,
        registros:   0,
        cmv_real:    parseFloat(cmvReal.toFixed(2)),
        cmv_teorico: parseFloat(cmvTeorico.toFixed(2)),
        // Negativo = sistema está mais barato que ficha técnica (fichas desatualizadas)
        // Positivo = está consumindo mais que o esperado (desvio real)
      },
      // ── Produtos sem custo ────────────────────────────────
      produtos_sem_custo: {
        total:     0, // risco, não perda calculável diretamente
        pct:       0,
        delta:     0,
        registros: parseInt(semCusto.produtos || 0),
        receita_afetada: parseFloat((semCusto.receita || 0).toFixed(2)),
        // Quanto de receita tem CMV desconhecido (pode estar vendendo no prejuízo)
      },
      // ── Taxas de cartão ──────────────────────────────────
      taxas_cartao: {
        total:     taxaCartao,
        pct:       pct(taxaCartao),
        delta:     0,
        registros: 0,
        base_cartao: parseFloat(baseCartao.toFixed(2)),
        taxa_pct:  2.5,
      },
      // ── Fiado vencido > 30 dias ──────────────────────────
      fiado_vencido: {
        total:     totalFiado,
        pct:       pct(totalFiado),
        delta:     0,
        registros: parseInt(fiado.registros || 0),
        // Não entra no totalGeral (não é perda ainda, é risco de inadimplência)
      },
      // ── Vazamentos operacionais existentes ───────────────
      consumo_interno: {
        total:      parseFloat(totalCI.toFixed(2)),
        pct:        pct(totalCI),
        delta:      delta(totalCI, parseFloat(ciAnterior.total)),
        registros:  parseInt(ci.registros),
        breakdown: {
          funcionario: parseFloat(ci.funcionario.toFixed(2)),
          familia:     parseFloat(ci.familia.toFixed(2)),
          brinde:      parseFloat(ci.brinde.toFixed(2)),
          degustacao:  parseFloat(ci.degustacao.toFixed(2)),
          perda:       parseFloat(ci.perda_ic.toFixed(2)),
        },
      },
      perdas: {
        total:     parseFloat(totalPerdas.toFixed(2)),
        pct:       pct(totalPerdas),
        delta:     delta(totalPerdas, parseFloat(perdasAnterior.total)),
        registros: parseInt(perdas.registros),
      },
      cancelamentos: {
        total:     parseFloat(totalCancel.toFixed(2)),
        pct:       pct(totalCancel),
        delta:     delta(totalCancel, parseFloat(cancelAnterior.total)),
        registros: parseInt(cancel.registros),
      },
      diferenca_caixa: {
        total:     parseFloat(totalCaixa.toFixed(2)),
        pct:       pct(totalCaixa),
        delta:     delta(totalCaixa, parseFloat(caixaAnterior.total)),
        registros: parseInt(caixa.registros),
      },
    },
  };
};

module.exports = { getSugestoes, registrar, getHistorico, getVazamentos };
