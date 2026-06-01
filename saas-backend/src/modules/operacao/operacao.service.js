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
  const { rows: [cmv] } = await db.query(
    `SELECT
       COUNT(o.id)::int                                       AS total_pedidos,
       COUNT(o.id) FILTER (WHERE oi.total_cost > 0)::int     AS pedidos_com_custo,
       COALESCE(SUM(oi.total_cost), 0)::float                 AS custo_total,
       COALESCE(SUM(o.total - COALESCE(o.delivery_fee,0)),0)::float AS receita_produtos
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.tenant_id = $1
       AND o.status IN ('ready','delivered')
       AND (o.created_at AT TIME ZONE $2)::date = CURRENT_DATE`,
    [tenantId, TZ]
  );
  const cmvPct     = cmv.receita_produtos > 0
    ? parseFloat((cmv.custo_total / cmv.receita_produtos * 100).toFixed(1))
    : null;
  const cmvCovPct  = cmv.total_pedidos > 0
    ? parseFloat((cmv.pedidos_com_custo / cmv.total_pedidos * 100).toFixed(0))
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
      custo_total:        parseFloat((cmv.custo_total || 0).toFixed(2)),
      cmv_pct:            cmvPct,
      cobertura_pct:      cmvCovPct,
      margem_bruta:       margemBruta,
      aviso_cobertura:    cmvCovPct < 80
        ? `Apenas ${cmvCovPct}% dos pedidos têm custo cadastrado. Aplique o precificador nos produtos.`
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

module.exports = { getFechamentoHoje, getConfiabilidade };
