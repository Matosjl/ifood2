'use strict';
/**
 * operacao.service.js — Fechamento Operacional do Dia
 *
 * Agrega em uma única resposta:
 *   vendas       → pedidos, faturamento, receita de produtos, ticket médio, por canal
 *   logistica    → taxas cobradas, repasse motoboy, resultado logística
 *   caixa        → status, recebido, esperado, discrepância
 *   despesas     → despesas do dia (expenses)
 *   cmv          → custo total, margem estimada, % pedidos com custo válido
 *   incidentes   → abertos, resolvidos, custo, por tipo
 *   estoque      → insumos abaixo do mínimo
 *   confiabilidade → 5 critérios + status geral
 */
const db  = require('../../config/database');
const TZ  = 'America/Sao_Paulo';

const getFechamentoHoje = async (tenantId) => {
  const today = `CURRENT_DATE AT TIME ZONE '${TZ}'`;

  // ── 1. Vendas ──────────────────────────────────────────────────
  const { rows: [vendas] } = await db.query(
    `SELECT
       COUNT(o.id)::int                                                      AS total_pedidos,
       COALESCE(SUM(o.total), 0)::float                                      AS faturamento,
       COALESCE(SUM(o.total - COALESCE(o.delivery_fee, 0)), 0)::float        AS receita_produtos,
       COALESCE(SUM(CASE WHEN o.delivery_type='delivery'
                         THEN COALESCE(o.delivery_fee,0) ELSE 0 END),0)::float AS taxas_entrega,
       COALESCE(AVG(o.total), 0)::float                                      AS ticket_medio,
       COUNT(*) FILTER (WHERE o.delivery_type='delivery')::int               AS pedidos_entrega,
       COUNT(*) FILTER (WHERE o.delivery_type='pickup')::int                 AS pedidos_retirada,
       COUNT(*) FILTER (WHERE o.delivery_type='table')::int                  AS pedidos_mesa,
       COUNT(*) FILTER (WHERE o.status='cancelled')::int                     AS pedidos_cancelados
     FROM orders o
     WHERE o.tenant_id = $1
       AND o.status IN ('ready','delivered','cancelled')
       AND (o.created_at AT TIME ZONE $2)::date = CURRENT_DATE`,
    [tenantId, TZ]
  );

  // ── 2. Logística (repasse motoboy) ─────────────────────────────
  const { rows: [logist] } = await db.query(
    `SELECT COALESCE(SUM(d.driver_fee), 0)::float AS repasse_motoboy
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     WHERE d.tenant_id = $1
       AND d.status = 'delivered'
       AND (o.created_at AT TIME ZONE $2)::date = CURRENT_DATE`,
    [tenantId, TZ]
  );
  const repasse         = parseFloat(logist.repasse_motoboy || 0);
  const taxasEntrega    = parseFloat(vendas.taxas_entrega || 0);
  const resultLogistica = parseFloat((taxasEntrega - repasse).toFixed(2));

  // ── 3. Caixa ───────────────────────────────────────────────────
  const { rows: [caixa] } = await db.query(
    `SELECT
       cr.id,
       cr.status,
       cr.opened_at,
       cr.closed_at,
       COALESCE(cr.total_revenue, 0)::float          AS total_revenue,
       COALESCE(cr.cash_counted, 0)::float            AS cash_counted,
       COALESCE(cr.card_counted, 0)::float            AS card_counted,
       COALESCE(cr.pix_counted, 0)::float             AS pix_counted,
       COALESCE(cr.discrepancy, 0)::float             AS discrepancy,
       cr.payment_summary
     FROM cash_registers cr
     WHERE cr.tenant_id = $1
       AND (cr.opened_at AT TIME ZONE $2)::date = CURRENT_DATE
     ORDER BY cr.opened_at DESC
     LIMIT 1`,
    [tenantId, TZ]
  );

  // ── 4. Despesas do dia ─────────────────────────────────────────
  const { rows: [despesas] } = await db.query(
    `SELECT
       COALESCE(SUM(amount), 0)::float                                            AS total,
       COALESCE(SUM(amount) FILTER (WHERE status='paid'), 0)::float               AS pagas,
       COALESCE(SUM(amount) FILTER (WHERE status='pending'), 0)::float            AS pendentes
     FROM expenses
     WHERE tenant_id = $1
       AND (due_date AT TIME ZONE $2)::date = CURRENT_DATE`,
    [tenantId, TZ]
  );

  // ── 5. CMV ─────────────────────────────────────────────────────
  // Agrupa por pedido primeiro para classificar custo como COMPLETO / PARCIAL / SEM_CUSTO.
  // "Completo" = todos os itens do pedido têm total_cost > 0.
  // "Parcial"  = ao menos 1 item sem custo, mas ao menos 1 com custo.
  // "Sem custo"= nenhum item tem custo (ou pedido sem itens).
  const { rows: [cmv] } = await db.query(
    `WITH pedido_custo AS (
       SELECT
         o.id,
         o.total,
         o.delivery_fee,
         COALESCE(SUM(oi.total_cost), 0)                                       AS custo_total_pedido,
         COUNT(oi.id)                                                           AS total_itens,
         COUNT(oi.id) FILTER (WHERE COALESCE(oi.total_cost, 0) > 0)            AS itens_com_custo,
         COUNT(oi.id) FILTER (WHERE COALESCE(oi.total_cost, 0) = 0)            AS itens_sem_custo
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.tenant_id = $1
         AND o.status IN ('ready','delivered')
         AND (o.created_at AT TIME ZONE $2)::date = CURRENT_DATE
       GROUP BY o.id, o.total, o.delivery_fee
     )
     SELECT
       COUNT(*)::int                                                                                 AS total_pedidos,
       COUNT(*) FILTER (WHERE itens_sem_custo = 0 AND total_itens > 0)::int                         AS pedidos_com_custo_completo,
       COUNT(*) FILTER (WHERE itens_sem_custo > 0 AND itens_com_custo > 0)::int                     AS pedidos_com_custo_parcial,
       COUNT(*) FILTER (WHERE itens_com_custo = 0)::int                                             AS pedidos_sem_custo,
       COALESCE(SUM(custo_total_pedido), 0)::float                                                  AS custo_total,
       COALESCE(SUM(total - COALESCE(delivery_fee, 0)), 0)::float                                   AS receita_produtos
     FROM pedido_custo`,
    [tenantId, TZ]
  );
  const cmvPct    = cmv.receita_produtos > 0
    ? parseFloat((cmv.custo_total / cmv.receita_produtos * 100).toFixed(1))
    : null;
  // Cobertura agora é baseada APENAS em pedidos com custo COMPLETO
  const cmvCovPct = cmv.total_pedidos > 0
    ? parseFloat((cmv.pedidos_com_custo_completo / cmv.total_pedidos * 100).toFixed(0))
    : 0;
  const margemBruta = parseFloat(
    (parseFloat(vendas.receita_produtos || 0) - parseFloat(cmv.custo_total || 0)).toFixed(2)
  );

  // ── 6. Incidentes ──────────────────────────────────────────────
  const { rows: [incidentes] } = await db.query(
    `SELECT
       COUNT(*)::int                                          AS total,
       COUNT(*) FILTER (WHERE resolved = false)::int          AS abertos,
       COUNT(*) FILTER (WHERE resolved = true)::int           AS resolvidos,
       COALESCE(SUM(cost) FILTER (WHERE resolved=false),0)::float AS custo_abertos,
       COUNT(*) FILTER (WHERE type='cash_difference')::int    AS cash_difference,
       COUNT(*) FILTER (WHERE type='cash_change_missing')::int AS troco_pendente,
       COUNT(*) FILTER (WHERE type='order_forgotten')::int    AS pedidos_esquecidos,
       COUNT(*) FILTER (WHERE type='inventory_deduction_failed')::int AS deducao_falhou
     FROM operational_incidents
     WHERE tenant_id = $1
       AND (created_at AT TIME ZONE $2)::date = CURRENT_DATE`,
    [tenantId, TZ]
  );

  // ── 7. Estoque baixo ───────────────────────────────────────────
  const { rows: estoqueAlerta } = await db.query(
    `SELECT id, name, unit, qty_in_stock, min_qty
     FROM insumos
     WHERE tenant_id = $1
       AND min_qty > 0
       AND qty_in_stock <= min_qty
     ORDER BY (qty_in_stock / NULLIF(min_qty,0)) ASC
     LIMIT 10`,
    [tenantId]
  );

  // ── 8. Confiabilidade ──────────────────────────────────────────
  // Critério 1: caixa conciliado (fechado hoje sem discrepância)
  const caixaConciliado = caixa?.status === 'closed' && Math.abs(caixa?.discrepancy || 0) < 0.01;

  // Critério 2: pedidos sem total_cost (custo não preenchido)
  const { rows: [semCusto] } = await db.query(
    `SELECT COUNT(DISTINCT o.id)::int AS count
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.tenant_id = $1
       AND o.status IN ('ready','delivered')
       AND (o.created_at AT TIME ZONE $2)::date = CURRENT_DATE
       AND oi.total_cost = 0`,
    [tenantId, TZ]
  );
  const todosComCusto = parseInt(semCusto.count) === 0;

  // Critério 3: nenhum inventory_deduction_failed hoje
  const semFalhaDeducao = parseInt(incidentes.deducao_falhou) === 0;

  // Critério 4: pedidos entregues sem insumos_deducted
  const { rows: [semDeducao] } = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM orders
     WHERE tenant_id = $1
       AND status IN ('delivered','ready')
       AND insumos_deducted = false
       AND (created_at AT TIME ZONE $2)::date = CURRENT_DATE`,
    [tenantId, TZ]
  );
  const todosDeduziram = parseInt(semDeducao.count) === 0;

  // Critério 5: sem cash_difference hoje
  const semDivergenciaCaixa = parseInt(incidentes.cash_difference) === 0;

  const criterios = {
    caixa_conciliado:          caixaConciliado,
    todos_pedidos_com_custo:   todosComCusto,
    sem_falha_deducao_insumos: semFalhaDeducao,
    todos_insumos_deduziram:   todosDeduziram,
    sem_divergencia_caixa:     semDivergenciaCaixa,
  };
  const diasScore = Object.values(criterios).filter(Boolean).length;
  const diaConfiavel = diasScore === 5;

  // ── Resposta consolidada ───────────────────────────────────────
  return {
    data:     new Date().toISOString().slice(0, 10),
    gerado_em: new Date().toISOString(),

    vendas: {
      total_pedidos:      vendas.total_pedidos,
      faturamento:        parseFloat((vendas.faturamento || 0).toFixed(2)),
      receita_produtos:   parseFloat((vendas.receita_produtos || 0).toFixed(2)),
      ticket_medio:       parseFloat((vendas.ticket_medio || 0).toFixed(2)),
      pedidos_cancelados: vendas.pedidos_cancelados,
      por_canal: {
        entrega:  vendas.pedidos_entrega,
        retirada: vendas.pedidos_retirada,
        mesa:     vendas.pedidos_mesa,
      },
    },

    logistica: {
      taxas_cobradas:    parseFloat(taxasEntrega.toFixed(2)),
      repasse_motoboy:   parseFloat(repasse.toFixed(2)),
      resultado:         resultLogistica,
    },

    caixa: {
      status:         caixa?.status ?? 'nao_aberto',
      total_revenue:  parseFloat((caixa?.total_revenue || 0).toFixed(2)),
      total_contado:  parseFloat(((caixa?.cash_counted||0)+(caixa?.card_counted||0)+(caixa?.pix_counted||0)).toFixed(2)),
      discrepancy:    parseFloat((caixa?.discrepancy || 0).toFixed(2)),
    },

    despesas: {
      total:     parseFloat((despesas.total || 0).toFixed(2)),
      pagas:     parseFloat((despesas.pagas || 0).toFixed(2)),
      pendentes: parseFloat((despesas.pendentes || 0).toFixed(2)),
    },

    cmv: {
      custo_total:                  parseFloat((cmv.custo_total || 0).toFixed(2)),
      cmv_pct:                      cmvPct,
      // Cobertura baseada em custo COMPLETO (todos os itens do pedido têm custo)
      cobertura_pct:                cmvCovPct,
      pedidos_com_custo_completo:   parseInt(cmv.pedidos_com_custo_completo || 0),
      pedidos_com_custo_parcial:    parseInt(cmv.pedidos_com_custo_parcial  || 0),
      pedidos_sem_custo:            parseInt(cmv.pedidos_sem_custo          || 0),
      margem_bruta:                 margemBruta,
      aviso_cobertura:              cmvCovPct < 80
        ? `Apenas ${cmvCovPct}% dos pedidos têm custo completo. ${cmv.pedidos_com_custo_parcial} com custo parcial, ${cmv.pedidos_sem_custo} sem custo.`
        : null,
    },

    lucro_estimado: parseFloat(
      (parseFloat(vendas.receita_produtos||0) + resultLogistica - parseFloat(despesas.pagas||0) - parseFloat(cmv.custo_total||0)).toFixed(2)
    ),

    incidentes: {
      total:             incidentes.total,
      abertos:           incidentes.abertos,
      resolvidos:        incidentes.resolvidos,
      custo_abertos:     parseFloat((incidentes.custo_abertos || 0).toFixed(2)),
      cash_difference:   incidentes.cash_difference,
      troco_pendente:    incidentes.troco_pendente,
      pedidos_esquecidos: incidentes.pedidos_esquecidos,
      deducao_falhou:    incidentes.deducao_falhou,
    },

    estoque: {
      itens_abaixo_minimo: estoqueAlerta.length,
      alertas:             estoqueAlerta,
    },

    confiabilidade: {
      dia_confiavel: diaConfiavel,
      score:         diasScore,
      score_total:   5,
      criterios,
    },
  };
};


/**
 * Verifica os 5 criterios de confiabilidade para uma data especifica.
 */
const getCriteriosDia = async (tenantId, date) => {
  const { rows: [c1] } = await db.query(
    `SELECT COUNT(*)::int AS ok
     FROM cash_registers
     WHERE tenant_id = $1
       AND status = 'closed'
       AND (closed_at AT TIME ZONE $3)::date = $2::date
       AND ABS(COALESCE(discrepancy,0)) < 0.01`,
    [tenantId, date, TZ]
  );
  const { rows: [c2] } = await db.query(
    `SELECT COUNT(DISTINCT o.id)::int AS sem_custo
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.tenant_id = $1
       AND o.status IN ('ready','delivered')
       AND (o.created_at AT TIME ZONE $3)::date = $2::date
       AND oi.total_cost = 0`,
    [tenantId, date, TZ]
  );
  const { rows: [c3] } = await db.query(
    `SELECT COUNT(*)::int AS falhas
     FROM operational_incidents
     WHERE tenant_id = $1
       AND type = 'inventory_deduction_failed'
       AND (created_at AT TIME ZONE $3)::date = $2::date`,
    [tenantId, date, TZ]
  );
  const { rows: [c4] } = await db.query(
    `SELECT COUNT(*)::int AS sem_deducao
     FROM orders
     WHERE tenant_id = $1
       AND status IN ('delivered','ready')
       AND insumos_deducted = false
       AND (created_at AT TIME ZONE $3)::date = $2::date`,
    [tenantId, date, TZ]
  );
  const { rows: [c5] } = await db.query(
    `SELECT COUNT(*)::int AS divergencias
     FROM operational_incidents
     WHERE tenant_id = $1
       AND type = 'cash_difference'
       AND (created_at AT TIME ZONE $3)::date = $2::date`,
    [tenantId, date, TZ]
  );
  const criterios = {
    caixa_conciliado:          parseInt(c1.ok) > 0,
    todos_pedidos_com_custo:   parseInt(c2.sem_custo) === 0,
    sem_falha_deducao_insumos: parseInt(c3.falhas) === 0,
    todos_insumos_deduziram:   parseInt(c4.sem_deducao) === 0,
    sem_divergencia_caixa:     parseInt(c5.divergencias) === 0,
  };
  const score     = Object.values(criterios).filter(Boolean).length;
  const confiavel = score === 5;
  return { score, criterios, confiavel };
};

/**
 * Retorna o historico de confiabilidade dos ultimos N dias.
 */
const getConfiabilidade = async (tenantId, dias = 30) => {
  const datas = [];
  for (let i = 0; i < dias; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    datas.push(d.toISOString().slice(0, 10));
  }
  const resultados = await Promise.all(
    datas.map(async (date) => {
      const r = await getCriteriosDia(tenantId, date);
      return { date, ...r };
    })
  );
  let streak = 0;
  for (const dia of resultados) {
    if (dia.confiavel) streak++;
    else break;
  }
  let melhorStreak = 0, current = 0;
  for (const dia of [...resultados].reverse()) {
    if (dia.confiavel) { current++; melhorStreak = Math.max(melhorStreak, current); }
    else current = 0;
  }
  return {
    streak_atual:  streak,
    melhor_streak: melhorStreak,
    meta:          7,
    meta_atingida: streak >= 7,
    historico:     resultados,
  };
};

// ──────────────────────────────────────────────────────────────
// FECHAMENTO MENSAL
// ──────────────────────────────────────────────────────────────

/**
 * Retorna o fechamento completo de um mês.
 * @param {string} tenantId
 * @param {string} month  - formato YYYY-MM (ex: '2026-05')
 */
const getFechamentoMensal = async (tenantId, month) => {
  // ── Período ────────────────────────────────────────────────────
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month deve ser YYYY-MM');

  // Intervalo AT TIME ZONE América/SP
  const inicioExpr = `(date_trunc('month', ($2 || '-01')::date))`;
  const fimExpr    = `(date_trunc('month', ($2 || '-01')::date) + interval '1 month')`;
  const params     = [tenantId, month];

  // ── 1. Vendas ──────────────────────────────────────────────────
  const { rows: [v] } = await db.query(
    `SELECT
       COUNT(*)  FILTER (WHERE o.status NOT IN ('cancelled','pending'))::int   AS total_pedidos,
       COUNT(*)  FILTER (WHERE o.status = 'cancelled')::int                    AS pedidos_cancelados,
       COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('cancelled','pending')),0)::float AS faturamento,
       COALESCE(SUM(COALESCE(o.delivery_fee,0)) FILTER (WHERE o.status NOT IN ('cancelled','pending') AND o.delivery_type='delivery'),0)::float AS taxas_entrega,
       COALESCE(SUM(o.total - COALESCE(o.delivery_fee,0)) FILTER (WHERE o.status NOT IN ('cancelled','pending')),0)::float AS receita_produtos,
       COALESCE(AVG(o.total) FILTER (WHERE o.status NOT IN ('cancelled','pending')),0)::float AS ticket_medio,
       COUNT(*) FILTER (WHERE o.delivery_type='delivery' AND o.status NOT IN ('cancelled','pending'))::int AS pedidos_entrega,
       COUNT(*) FILTER (WHERE o.delivery_type='pickup'   AND o.status NOT IN ('cancelled','pending'))::int AS pedidos_retirada,
       COUNT(*) FILTER (WHERE o.delivery_type='table'    AND o.status NOT IN ('cancelled','pending'))::int AS pedidos_mesa
     FROM orders o
     WHERE o.tenant_id = $1
       AND (o.created_at AT TIME ZONE '${TZ}') >= ${inicioExpr}
       AND (o.created_at AT TIME ZONE '${TZ}') <  ${fimExpr}`,
    params
  );

  // ── 2. Por forma de pagamento ──────────────────────────────────
  const { rows: pgto } = await db.query(
    `SELECT payment_method, COUNT(*)::int AS qtd, COALESCE(SUM(total),0)::float AS total
     FROM orders
     WHERE tenant_id = $1
       AND status NOT IN ('cancelled','pending')
       AND (created_at AT TIME ZONE '${TZ}') >= ${inicioExpr}
       AND (created_at AT TIME ZONE '${TZ}') <  ${fimExpr}
     GROUP BY payment_method`,
    params
  );
  const pgtoMap = Object.fromEntries(pgto.map(r => [r.payment_method, { qtd: r.qtd, total: r.total }]));

  // ── 3. Repasse motoboy ─────────────────────────────────────────
  const { rows: [mot] } = await db.query(
    `SELECT COALESCE(SUM(d.driver_fee),0)::float AS repasse_motoboy
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     WHERE d.tenant_id = $1
       AND d.status = 'delivered'
       AND (o.created_at AT TIME ZONE '${TZ}') >= ${inicioExpr}
       AND (o.created_at AT TIME ZONE '${TZ}') <  ${fimExpr}`,
    params
  );

  // ── 4. Fiado ───────────────────────────────────────────────────
  // Query 1: movimentos originados no período selecionado.
  // Todos os filtros (vendido, pago, pendente) respeitam o intervalo do mês.
  const { rows: [fiadoRes] } = await db.query(
    `SELECT
       COALESCE(SUM(valor), 0)::float                                      AS vendido_mes,
       COALESCE(SUM(valor) FILTER (WHERE status='pago'),    0)::float      AS pago_no_periodo,
       COALESCE(SUM(valor) FILTER (WHERE status='pendente'),0)::float      AS pendente_do_periodo
     FROM fiado_compras
     WHERE tenant_id = $1
       AND (created_at AT TIME ZONE '${TZ}') >= ${inicioExpr}
       AND (created_at AT TIME ZONE '${TZ}') <  ${fimExpr}`,
    params
  );

  // Query 2: saldo global pendente — sem filtro de data, passa só tenantId
  const { rows: [fiadoGlobal] } = await db.query(
    `SELECT COALESCE(SUM(valor) FILTER (WHERE status='pendente'),0)::float AS saldo_pendente_global
     FROM fiado_compras
     WHERE tenant_id = $1`,
    [tenantId]
  );

  // Query 3: clientes com pendências globais — sem filtro de data, passa só tenantId
  const { rows: fiadoPendente } = await db.query(
    `SELECT fc.name AS nome, fc.phone AS telefone,
            COALESCE(SUM(c.valor) FILTER (WHERE c.status='pendente'),0)::float AS saldo_pendente,
            COUNT(c.id) FILTER (WHERE c.status='pendente')::int AS qtd_pedidos
     FROM fiado_clientes fc
     JOIN fiado_compras c ON c.cliente_id = fc.id
     WHERE fc.tenant_id = $1
     GROUP BY fc.name, fc.phone
     HAVING SUM(c.valor) FILTER (WHERE c.status='pendente') > 0
     ORDER BY saldo_pendente DESC
     LIMIT 20`,
    [tenantId]
  );

  // ── 5. CMV ─────────────────────────────────────────────────────
  // Agrupa por pedido antes de classificar: custo COMPLETO / PARCIAL / SEM_CUSTO.
  // "Completo" = todos os itens do pedido têm total_cost > 0.
  // Isso evita contar pedido misto (parte com custo, parte sem) como "coberto".
  const { rows: [cmv] } = await db.query(
    `WITH pedido_custo AS (
       SELECT
         o.id,
         o.total,
         o.delivery_fee,
         COALESCE(SUM(oi.total_cost), 0)                                        AS custo_total_pedido,
         COUNT(oi.id)                                                            AS total_itens,
         COUNT(oi.id) FILTER (WHERE COALESCE(oi.total_cost, 0) > 0)             AS itens_com_custo,
         COUNT(oi.id) FILTER (WHERE COALESCE(oi.total_cost, 0) = 0)             AS itens_sem_custo
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.tenant_id = $1
         AND o.status IN ('ready','delivered')
         AND (o.created_at AT TIME ZONE '${TZ}') >= ${inicioExpr}
         AND (o.created_at AT TIME ZONE '${TZ}') <  ${fimExpr}
       GROUP BY o.id, o.total, o.delivery_fee
     )
     SELECT
       COUNT(*)::int                                                                                  AS total_pedidos,
       COUNT(*) FILTER (WHERE itens_sem_custo = 0 AND total_itens > 0)::int                          AS pedidos_com_custo_completo,
       COUNT(*) FILTER (WHERE itens_sem_custo > 0 AND itens_com_custo > 0)::int                      AS pedidos_com_custo_parcial,
       COUNT(*) FILTER (WHERE itens_com_custo = 0)::int                                              AS pedidos_sem_custo,
       COALESCE(SUM(custo_total_pedido), 0)::float                                                   AS custo_total,
       COALESCE(SUM(total - COALESCE(delivery_fee, 0)), 0)::float                                    AS receita_produtos
     FROM pedido_custo`,
    params
  );
  const cmvPct    = cmv.receita_produtos > 0 ? parseFloat((cmv.custo_total / cmv.receita_produtos * 100).toFixed(1)) : null;
  // Cobertura = apenas pedidos com custo COMPLETO
  const cobertura = cmv.total_pedidos > 0
    ? parseFloat((cmv.pedidos_com_custo_completo / cmv.total_pedidos * 100).toFixed(0))
    : 0;
  const margemBruta = parseFloat((cmv.receita_produtos - cmv.custo_total).toFixed(2));

  // ── 6. Despesas ────────────────────────────────────────────────
  const { rows: [desp] } = await db.query(
    `SELECT
       COALESCE(SUM(amount),0)::float                              AS total,
       COALESCE(SUM(amount) FILTER (WHERE status='paid'),0)::float   AS pagas,
       COALESCE(SUM(amount) FILTER (WHERE status='pending'),0)::float AS pendentes
     FROM expenses
     WHERE tenant_id = $1
       AND (due_date AT TIME ZONE '${TZ}') >= ${inicioExpr}
       AND (due_date AT TIME ZONE '${TZ}') <  ${fimExpr}`,
    params
  );
  const { rows: despPorCategoria } = await db.query(
    `SELECT COALESCE(category,'Sem categoria') AS category,
            COALESCE(SUM(amount),0)::float AS total,
            COUNT(*)::int AS qtd
     FROM expenses
     WHERE tenant_id = $1
       AND (due_date AT TIME ZONE '${TZ}') >= ${inicioExpr}
       AND (due_date AT TIME ZONE '${TZ}') <  ${fimExpr}
     GROUP BY category
     ORDER BY total DESC`,
    params
  );

  // ── 7. Caixa ───────────────────────────────────────────────────
  const { rows: [cx] } = await db.query(
    `SELECT
       COUNT(*)::int                                             AS total_fechamentos,
       COALESCE(SUM(ABS(discrepancy)),0)::float                 AS divergencias_total,
       COUNT(*) FILTER (WHERE ABS(discrepancy) > 0.01)::int    AS fechamentos_com_divergencia
     FROM cash_registers
     WHERE tenant_id = $1
       AND status = 'closed'
       AND (closed_at AT TIME ZONE '${TZ}') >= ${inicioExpr}
       AND (closed_at AT TIME ZONE '${TZ}') <  ${fimExpr}`,
    params
  );
  const { rows: [cxMov] } = await db.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE type='sangria'),0)::float    AS sangrias,
       COALESCE(SUM(amount) FILTER (WHERE type='suprimento'),0)::float AS suprimentos
     FROM caixa_movements cm
     JOIN cash_registers cr ON cr.id = cm.cash_register_id
     WHERE cm.tenant_id = $1
       AND (cr.opened_at AT TIME ZONE '${TZ}') >= ${inicioExpr}
       AND (cr.opened_at AT TIME ZONE '${TZ}') <  ${fimExpr}`,
    params
  );

  // ── 8. Incidentes ──────────────────────────────────────────────
  const { rows: [inc] } = await db.query(
    `SELECT
       COUNT(*)::int                                                          AS total,
       COUNT(*) FILTER (WHERE resolved=false)::int                            AS abertos,
       COALESCE(SUM(cost) FILTER (WHERE resolved=false),0)::float            AS prejuizo_estimado,
       COUNT(*) FILTER (WHERE type='cash_difference')::int                   AS cash_difference,
       COUNT(*) FILTER (WHERE type='inventory_deduction_failed')::int        AS deducao_falhou,
       COUNT(*) FILTER (WHERE type='stale_cash_register')::int               AS caixa_stale,
       COUNT(*) FILTER (WHERE type='sangria_excessiva')::int                 AS sangria_excessiva,
       COUNT(*) FILTER (WHERE type='cancellation')::int                      AS cancelamentos
     FROM operational_incidents
     WHERE tenant_id = $1
       AND (created_at AT TIME ZONE '${TZ}') >= ${inicioExpr}
       AND (created_at AT TIME ZONE '${TZ}') <  ${fimExpr}`,
    params
  );

  // ── 9. Confiabilidade mensal ────────────────────────────────────
  // pedidos_sem_custo: pedidos onde NENHUM item tem custo (consistente com CMV acima).
  // Um pedido misto (parte com custo) não é contado aqui.
  const { rows: [conf] } = await db.query(
    `WITH pedido_conf AS (
       SELECT
         o.id,
         o.created_at,
         o.status,
         o.insumos_deducted,
         COUNT(oi.id) FILTER (WHERE COALESCE(oi.total_cost, 0) > 0) AS itens_com_custo
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.tenant_id = $1
         AND o.status NOT IN ('cancelled','pending')
         AND (o.created_at AT TIME ZONE '${TZ}') >= ${inicioExpr}
         AND (o.created_at AT TIME ZONE '${TZ}') <  ${fimExpr}
       GROUP BY o.id, o.created_at, o.status, o.insumos_deducted
     )
     SELECT
       COUNT(DISTINCT (created_at AT TIME ZONE '${TZ}')::date)::int                                   AS dias_com_venda,
       COUNT(*) FILTER (WHERE itens_com_custo = 0)::int                                               AS pedidos_sem_custo,
       COUNT(*) FILTER (WHERE insumos_deducted = false AND status IN ('delivered','ready'))::int       AS pedidos_sem_deducao
     FROM pedido_conf`,
    params
  );
  const { rows: [diasSemDiv] } = await db.query(
    `SELECT COUNT(*)::int AS dias_sem_divergencia
     FROM cash_registers
     WHERE tenant_id = $1
       AND status = 'closed'
       AND ABS(COALESCE(discrepancy,0)) < 0.01
       AND (closed_at AT TIME ZONE '${TZ}') >= ${inicioExpr}
       AND (closed_at AT TIME ZONE '${TZ}') <  ${fimExpr}`,
    params
  );

  // ── Monta resposta ─────────────────────────────────────────────
  const taxasEntrega  = parseFloat(v.taxas_entrega   || 0);
  const repasse       = parseFloat(mot.repasse_motoboy || 0);
  const resultLogist  = parseFloat((taxasEntrega - repasse).toFixed(2));

  return {
    periodo: {
      mes:         month,
      data_inicio: `${month}-01`,
      data_fim:    new Date(new Date(`${month}-01`).getFullYear(),
                            new Date(`${month}-01`).getMonth() + 1, 0)
                            .toISOString().slice(0, 10),
    },

    vendas: {
      total_pedidos:      v.total_pedidos,
      pedidos_cancelados: v.pedidos_cancelados,
      faturamento:        parseFloat((v.faturamento || 0).toFixed(2)),
      receita_produtos:   parseFloat((v.receita_produtos || 0).toFixed(2)),
      taxas_entrega:      parseFloat(taxasEntrega.toFixed(2)),
      repasse_motoboy:    parseFloat(repasse.toFixed(2)),
      resultado_logistica: resultLogist,
      ticket_medio:       parseFloat((v.ticket_medio || 0).toFixed(2)),
      por_canal: {
        entrega:  v.pedidos_entrega,
        retirada: v.pedidos_retirada,
        mesa:     v.pedidos_mesa,
      },
    },

    por_pagamento: {
      dinheiro: pgtoMap.cash     ?? { qtd: 0, total: 0 },
      pix:      pgtoMap.pix      ?? { qtd: 0, total: 0 },
      cartao:   {
        qtd:   (pgtoMap.credit?.qtd || 0) + (pgtoMap.debit?.qtd || 0) + (pgtoMap.voucher?.qtd || 0),
        total: parseFloat(((pgtoMap.credit?.total||0)+(pgtoMap.debit?.total||0)+(pgtoMap.voucher?.total||0)).toFixed(2)),
      },
      fiado:  pgtoMap.fiado    ?? { qtd: 0, total: 0 },
      outros: pgtoMap.other    ?? { qtd: 0, total: 0 },
    },

    fiado: {
      // Valores do período selecionado
      vendido_mes:         parseFloat((fiadoRes.vendido_mes         || 0).toFixed(2)),
      pago_no_periodo:     parseFloat((fiadoRes.pago_no_periodo     || 0).toFixed(2)),
      pendente_do_periodo: parseFloat((fiadoRes.pendente_do_periodo || 0).toFixed(2)),
      // Saldo global (toda a história do tenant) — contexto de cobrança
      saldo_pendente_global: parseFloat((fiadoGlobal.saldo_pendente_global || 0).toFixed(2)),
      clientes_pendentes: fiadoPendente,
    },

    cmv: {
      receita_produtos:              parseFloat((cmv.receita_produtos || 0).toFixed(2)),
      custo_total:                   parseFloat((cmv.custo_total      || 0).toFixed(2)),
      cmv_pct:                       cmvPct,
      lucro_bruto:                   margemBruta,
      // Cobertura baseada em custo COMPLETO (todos os itens do pedido têm custo)
      cobertura_pct:                 cobertura,
      pedidos_com_custo_completo:    parseInt(cmv.pedidos_com_custo_completo || 0),
      pedidos_com_custo_parcial:     parseInt(cmv.pedidos_com_custo_parcial  || 0),
      pedidos_sem_custo:             parseInt(cmv.pedidos_sem_custo          || 0),
      aviso_cobertura:               cobertura < 80
        ? `${cobertura}% dos pedidos têm custo completo. ${cmv.pedidos_com_custo_parcial} parciais, ${cmv.pedidos_sem_custo} sem custo. CMV subestimado.`
        : null,
    },

    despesas: {
      total:     parseFloat((desp.total    || 0).toFixed(2)),
      pagas:     parseFloat((desp.pagas    || 0).toFixed(2)),
      pendentes: parseFloat((desp.pendentes || 0).toFixed(2)),
      por_categoria: despPorCategoria,
    },

    caixa: {
      total_fechamentos:           cx.total_fechamentos,
      fechamentos_com_divergencia: cx.fechamentos_com_divergencia,
      divergencias_total:          parseFloat((cx.divergencias_total || 0).toFixed(2)),
      sangrias:                    parseFloat((cxMov.sangrias        || 0).toFixed(2)),
      suprimentos:                 parseFloat((cxMov.suprimentos     || 0).toFixed(2)),
    },

    incidentes: {
      total:            inc.total,
      abertos:          inc.abertos,
      prejuizo_estimado: parseFloat((inc.prejuizo_estimado || 0).toFixed(2)),
      por_tipo: {
        cash_difference:    inc.cash_difference,
        deducao_falhou:     inc.deducao_falhou,
        caixa_stale:        inc.caixa_stale,
        sangria_excessiva:  inc.sangria_excessiva,
        cancelamentos:      inc.cancelamentos,
      },
    },

    confiabilidade: {
      dias_com_venda:          conf.dias_com_venda,
      dias_sem_divergencia:    diasSemDiv.dias_sem_divergencia,
      pedidos_sem_custo:       conf.pedidos_sem_custo,
      pedidos_sem_deducao:     conf.pedidos_sem_deducao,
    },

    // Fórmula idêntica ao fechamento diário:
    // receita_produtos + resultado_logistica − despesas_pagas − CMV
    // margemBruta = receita_produtos − CMV, então:
    // lucro_estimado = margemBruta + resultLogist − despesas_pagas
    lucro_estimado: parseFloat(
      (margemBruta + resultLogist - parseFloat(desp.pagas || 0)).toFixed(2)
    ),

    gerado_em: new Date().toISOString(),
  };
};

module.exports = { getFechamentoHoje, getConfiabilidade, getFechamentoMensal };
