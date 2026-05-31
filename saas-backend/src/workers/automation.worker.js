'use strict';
/**
 * automation.worker.js
 *
 * Automation Engine do ZapFome — o "funcionário invisível".
 *
 * BullMQ repeatable jobs que rodam automaticamente para TODOS os tenants:
 *
 *   stuck-orders     → a cada 5 min  → alerta se pedido > 15min parado
 *   low-stock        → a cada 15 min → alerta insumos abaixo do mínimo
 *   daily-report     → 08:00 BRT     → relatório financeiro do dia anterior
 *   inactive-clients → 10:00 BRT     → recupera clientes há +15 dias sem comprar
 *   low-sales        → 13:00 BRT     → vendas < 70% da média → cria cupom + alerta
 *   cmv-anomaly      → a cada 30 min → CMV acima do esperado (usa pricing_calculations)
 *
 * REGRA: Este worker NUNCA toma decisões financeiras.
 *        Ele detecta → chama alert.service → chama n8n.service.
 *        A IA só interpreta. O banco calcula.
 */

const { Queue, Worker, QueueScheduler } = require('bullmq');
const db           = require('../config/database');
const ctxSvc       = require('../services/context.service');
const alertSvc     = require('../services/alert.service');
const n8nSvc       = require('../services/n8n.service');
const { createRedisClient } = require('../config/redis');
const { createLogger }      = require('../utils/logger');

const logger    = createLogger('Worker:automation');
const QUEUE     = 'automation';

// ── Redis connections ─────────────────────────────────────────────────
const connection = createRedisClient();

// ── Get all active tenants ────────────────────────────────────────────

async function getActiveTenants() {
  try {
    const { rows } = await db.query(`
      SELECT
        t.id,
        t.name,
        t.slug,
        COALESCE(t.owner_whatsapp, u.phone) AS owner_phone
      FROM tenants t
      LEFT JOIN users u ON u.tenant_id = t.id AND u.role = 'owner'
      WHERE t.status = 'active'
        -- Só tenants com atividade recente (últimos 30 dias)
        AND EXISTS (
          SELECT 1 FROM orders o
          WHERE o.tenant_id = t.id
            AND o.created_at >= NOW() - INTERVAL '30 days'
        )
    `);
    return rows;
  } catch (err) {
    logger.error('getActiveTenants falhou', { error: err.message });
    return [];
  }
}

// ── Job Handlers ──────────────────────────────────────────────────────

/**
 * JOB: stuck-orders
 * Checa pedidos parados há mais de 15 min e alerta o dono via WhatsApp.
 */
async function handleStuckOrders() {
  const tenants = await getActiveTenants();
  let processed = 0;

  for (const tenant of tenants) {
    try {
      const anomalies = await ctxSvc.detectAnomalies(tenant.id);
      const stuckAnom  = anomalies.find((a) => a.type === 'STUCK_ORDERS');
      if (!stuckAnom) continue;

      const { data: stuck } = stuckAnom;
      const msg = [
        `⚠️ *Pedidos Parados — ${tenant.name}*`,
        '',
        ...stuck.map((o) =>
          `🔴 #${o.order_number} — ${o.status} — ${o.minutes_since_update} min sem atualização`
          + (o.customer_name ? ` (${o.customer_name})` : '')
        ),
        '',
        `_${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}_`,
      ].join('\n');

      // WhatsApp direto (fallback se n8n não configurado)
      if (tenant.owner_phone) {
        await alertSvc.sendAlertToPhone(`stuck_${tenant.id}`, tenant.owner_phone, msg);
      }

      // n8n webhook (para automação avançada)
      await n8nSvc.triggerStuckOrders(tenant.id, {
        ownerPhone: tenant.owner_phone,
        stuckOrders: stuck,
      }).catch(() => {});

      processed++;
    } catch (err) {
      logger.error('stuck-orders: erro no tenant', { tenantId: tenant.id, error: err.message });
    }
  }

  logger.info('stuck-orders concluído', { tenants: tenants.length, withAlerts: processed });
}

/**
 * JOB: low-stock
 * Checa insumos abaixo do mínimo e alerta.
 */
async function handleLowStock() {
  const tenants = await getActiveTenants();
  let processed = 0;

  for (const tenant of tenants) {
    try {
      const anomalies = await ctxSvc.detectAnomalies(tenant.id);
      const stockAnom  = anomalies.find((a) => a.type === 'LOW_STOCK');
      if (!stockAnom) continue;

      const items = stockAnom.data;
      const msg = [
        `📦 *Estoque Crítico — ${tenant.name}*`,
        '',
        ...items.slice(0, 8).map((i) =>
          `• ${i.name}: ${i.qty_in_stock} ${i.unit} (mín: ${i.min_qty} ${i.unit})`
        ),
        items.length > 8 ? `_...e mais ${items.length - 8} itens_` : '',
        '',
        `_${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}_`,
      ].filter(Boolean).join('\n');

      if (tenant.owner_phone) {
        await alertSvc.sendAlertToPhone(`lowstock_${tenant.id}`, tenant.owner_phone, msg);
      }

      await n8nSvc.triggerLowStock(tenant.id, {
        ownerPhone: tenant.owner_phone,
        items,
      }).catch(() => {});

      processed++;
    } catch (err) {
      logger.error('low-stock: erro no tenant', { tenantId: tenant.id, error: err.message });
    }
  }

  logger.info('low-stock concluído', { tenants: tenants.length, withAlerts: processed });
}

/**
 * JOB: daily-report
 * Envia relatório do dia anterior às 08:00 BRT.
 */
async function handleDailyReport() {
  const tenants = await getActiveTenants();

  for (const tenant of tenants) {
    try {
      const ctx = await ctxSvc.buildDailyReportContext(tenant.id);

      // Formata mensagem de relatório
      const yesterday = ctx.yesterday;
      const fmt = (n) => `R$ ${parseFloat(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

      const topProductsText = ctx.topProducts.length > 0
        ? ctx.topProducts.slice(0, 3).map((p, i) =>
            `  ${['🥇','🥈','🥉'][i]} ${p.name} — ${fmt(p.total_revenue)}`
          ).join('\n')
        : '  Sem dados de produtos';

      const msg = [
        `☀️ *Bom dia! Resumo de ontem — ${tenant.name}*`,
        '',
        `💰 Receita: *${fmt(yesterday.revenue)}*`,
        `📦 Pedidos: *${yesterday.orders}*`,
        yesterday.orders > 0
          ? `🎯 Ticket médio: *${fmt(yesterday.revenue / yesterday.orders)}*`
          : null,
        '',
        `🏆 Mais vendidos:`,
        topProductsText,
        ctx.today.stockAlertCount > 0
          ? `\n⚠️ *${ctx.today.stockAlertCount} insumo(s) abaixo do mínimo hoje!*`
          : '\n✅ Estoque OK',
        '',
        `_Relatório automático ZapFome_`,
      ].filter(Boolean).join('\n');

      if (tenant.owner_phone) {
        await alertSvc.sendAlertToPhone(`dailyreport_${tenant.id}`, tenant.owner_phone, msg);
      }

      // n8n para automação avançada (pode complementar com análise GPT)
      await n8nSvc.triggerDailyReport(tenant.id, {
        ownerPhone: tenant.owner_phone,
        context: ctx,
      }).catch(() => {});

    } catch (err) {
      logger.error('daily-report: erro no tenant', { tenantId: tenant.id, error: err.message });
    }
  }

  logger.info('daily-report concluído', { tenants: tenants.length });
}

/**
 * JOB: inactive-clients
 * Recuperação automática de clientes há +15 dias sem comprar.
 */
async function handleInactiveClients() {
  const tenants = await getActiveTenants();

  for (const tenant of tenants) {
    try {
      const customers = await ctxSvc.getInactiveCustomers(tenant.id, 15, 50);
      if (!customers.length) continue;

      logger.info('inactive-clients: clientes inativos encontrados', {
        tenantId: tenant.id,
        count: customers.length,
      });

      await n8nSvc.triggerAutoRecovery(tenant.id, {
        ownerPhone: tenant.owner_phone,
        customers,
      }).catch(() => {});

    } catch (err) {
      logger.error('inactive-clients: erro no tenant', { tenantId: tenant.id, error: err.message });
    }
  }

  logger.info('inactive-clients concluído', { tenants: tenants.length });
}

/**
 * JOB: low-sales
 * Detecta queda nas vendas e cria cupom automático às 13:00.
 */
async function handleLowSales() {
  const tenants = await getActiveTenants();

  for (const tenant of tenants) {
    try {
      const anomalies = await ctxSvc.detectAnomalies(tenant.id);
      const salesAnom  = anomalies.find((a) => a.type === 'LOW_SALES');
      if (!salesAnom) continue;

      const { data: salesData } = salesAnom;

      // Cria cupom automático de 15% com validade hoje
      let couponCode = null;
      try {
        const code = `BOOST${new Date().toISOString().slice(5, 10).replace('-', '')}`;
        await db.query(`
          INSERT INTO coupons
            (tenant_id, code, type, value, min_order_value, max_uses, expires_at)
          VALUES ($1, $2, 'percentage', 15, 30, 50, NOW() + INTERVAL '6 hours')
          ON CONFLICT (tenant_id, code) DO NOTHING
        `, [tenant.id, code]);
        couponCode = code;
      } catch { /* tabela pode não existir */ }

      const fmt = (n) => `R$ ${parseFloat(n || 0).toFixed(2)}`;
      const msg = [
        `📉 *Vendas Baixas Detectadas — ${tenant.name}*`,
        '',
        `Hoje: *${fmt(salesData.todayRev)}*`,
        `Média diária: *${fmt(salesData.avgDailyRev)}*`,
        `Variação: *${Math.round((salesData.todayRev / salesData.avgDailyRev - 1) * 100)}%*`,
        '',
        couponCode ? `🎁 Cupom criado automaticamente: *${couponCode}* (15% off, válido por 6h)` : '',
        '',
        `_ZapFome Automation — ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}_`,
      ].filter(Boolean).join('\n');

      if (tenant.owner_phone) {
        await alertSvc.sendAlertToPhone(`lowsales_${tenant.id}`, tenant.owner_phone, msg);
      }

      await n8nSvc.triggerLowSalesAlert(tenant.id, {
        ownerPhone:  tenant.owner_phone,
        todayRev:    salesData.todayRev,
        avgRev:      salesData.avgDailyRev,
        couponCode,
      }).catch(() => {});

    } catch (err) {
      logger.error('low-sales: erro no tenant', { tenantId: tenant.id, error: err.message });
    }
  }

  logger.info('low-sales concluído', { tenants: tenants.length });
}

/**
 * JOB: cmv-anomaly
 * Detecta CMV acima do esperado baseado em histórico de precificação.
 */
async function handleCmvAnomaly() {
  const tenants = await getActiveTenants();

  for (const tenant of tenants) {
    try {
      // Verifica se existe histórico de precificação
      const { rows } = await db.query(`
        SELECT
          AVG(custo_total / NULLIF(preco_sugerido, 0) * 100) AS avg_cmv_pct,
          COUNT(*)                                           AS calc_count
        FROM pricing_calculations
        WHERE tenant_id = $1
          AND preco_sugerido > 0
          AND created_at >= NOW() - INTERVAL '30 days'
      `, [tenant.id]);

      const avgCmv = parseFloat(rows[0]?.avg_cmv_pct || 0);
      const count  = parseInt(rows[0]?.calc_count || 0);

      if (count < 3 || avgCmv <= 0) continue; // Não tem histórico suficiente

      // Busca compras recentes para estimar CMV real.
      // Agregações separadas para evitar produto cartesiano entre
      // financial_records e orders (join direto multiplicaria os totais).
      const { rows: recentRows } = await db.query(`
        WITH
          expenses AS (
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM financial_records
            WHERE tenant_id = $1
              AND type = 'expense'
              AND category ILIKE '%insumo%'
              AND created_at >= NOW() - INTERVAL '7 days'
          ),
          rev AS (
            SELECT COALESCE(SUM(total), 0) AS total
            FROM orders
            WHERE tenant_id = $1
              AND status <> 'cancelled'
              AND created_at >= NOW() - INTERVAL '7 days'
          )
        SELECT
          expenses.total AS insumo_expense,
          rev.total      AS revenue
        FROM expenses, rev
      `, [tenant.id]).catch(() => ({ rows: [{ insumo_expense: 0, revenue: 0 }] }));

      // Se não tem dados suficientes, skip
      const revenue = parseFloat(recentRows[0]?.revenue || 0);
      if (revenue <= 0) continue;

      const realCmv = (parseFloat(recentRows[0]?.insumo_expense || 0) / revenue) * 100;
      if (realCmv <= 0 || realCmv < avgCmv * 1.3) continue; // CMV dentro do normal

      const msg = [
        `⚠️ *Anomalia de CMV — ${tenant.name}*`,
        '',
        `CMV estimado hoje: *${realCmv.toFixed(1)}%*`,
        `CMV médio (30 dias): *${avgCmv.toFixed(1)}%*`,
        `Variação: *+${((realCmv - avgCmv) / avgCmv * 100).toFixed(0)}%*`,
        '',
        `Verifique desperdício, preços de insumos ou pratos vendidos abaixo do custo.`,
        '',
        `_ZapFome Automation_`,
      ].join('\n');

      if (tenant.owner_phone) {
        await alertSvc.sendAlertToPhone(`cmvanomaly_${tenant.id}`, tenant.owner_phone, msg);
      }

    } catch (err) {
      logger.error('cmv-anomaly: erro no tenant', { tenantId: tenant.id, error: err.message });
    }
  }

  logger.info('cmv-anomaly concluído', { tenants: tenants.length });
}

// ── JOB: detect-incidents ──────────────────────────────────────────────
// Roda a cada 15 min. Detecta dois tipos automáticos:
//   1. cash_change_missing — troco não confirmado 30 min após entrega
//   2. order_forgotten     — pedido pending/confirmed > 10 min
async function handleDetectIncidents() {
  const incidentSvc = require('../modules/incidents/incidents.service');
  const [missing, forgotten] = await Promise.all([
    incidentSvc.detectMissingChange().catch((err) => { logger.warn('detectMissingChange falhou', { error: err.message }); return 0; }),
    incidentSvc.detectForgottenOrders().catch((err) => { logger.warn('detectForgottenOrders falhou', { error: err.message }); return 0; }),
  ]);
  if (missing + forgotten > 0) {
    logger.info('detect-incidents: incidentes criados', { missing, forgotten });
  }
}

// ── Job dispatcher ────────────────────────────────────────────────────

const JOB_HANDLERS = {
  'stuck-orders':      handleStuckOrders,
  'low-stock':         handleLowStock,
  'daily-report':      handleDailyReport,
  'inactive-clients':  handleInactiveClients,
  'low-sales':         handleLowSales,
  'cmv-anomaly':       handleCmvAnomaly,
  'detect-incidents':  handleDetectIncidents,
};

// ── Worker factory ────────────────────────────────────────────────────

function createAutomationWorker() {
  const worker = new Worker(
    QUEUE,
    async (job) => {
      const handler = JOB_HANDLERS[job.name];
      if (!handler) {
        logger.warn('Job desconhecido', { name: job.name });
        return;
      }
      logger.info('Job iniciado', { name: job.name, id: job.id });
      const t0 = Date.now();
      await handler();
      logger.info('Job concluído', { name: job.name, ms: Date.now() - t0 });
    },
    {
      connection,
      concurrency: 1, // Um job de automação por vez
      lockDuration: 5 * 60 * 1000, // 5 min max por job
    }
  );

  worker.on('failed', (job, err) => {
    logger.error('Job falhou', { name: job?.name, error: err.message });
  });

  return worker;
}

// ── Queue scheduler (gerencia repeatable jobs) ────────────────────────

async function createAutomationScheduler() {
  const queue = new Queue(QUEUE, { connection });

  // Remove jobs antigos antes de re-registrar (evita duplicatas)
  const existingRepeatables = await queue.getRepeatableJobs();
  for (const job of existingRepeatables) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Agenda os jobs
  // stuck-orders: a cada 5 min
  await queue.add('stuck-orders', {}, {
    repeat: { every: 5 * 60 * 1000 },
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
  });

  // low-stock: a cada 15 min
  await queue.add('low-stock', {}, {
    repeat: { every: 15 * 60 * 1000 },
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
  });

  // daily-report: 08:00 horário de Brasília (11:00 UTC)
  await queue.add('daily-report', {}, {
    repeat: { cron: '0 11 * * *' }, // 11:00 UTC = 08:00 BRT
    attempts: 3,
    backoff: { type: 'fixed', delay: 60_000 },
  });

  // inactive-clients: 10:00 BRT (13:00 UTC) — segunda a sábado
  await queue.add('inactive-clients', {}, {
    repeat: { cron: '0 13 * * 1-6' },
    attempts: 2,
    backoff: { type: 'fixed', delay: 60_000 },
  });

  // low-sales: 13:00 BRT (16:00 UTC)
  await queue.add('low-sales', {}, {
    repeat: { cron: '0 16 * * *' },
    attempts: 2,
    backoff: { type: 'fixed', delay: 30_000 },
  });

  // cmv-anomaly: a cada 30 min (só durante horário comercial — 11:00-22:00 UTC = 08:00-19:00 BRT)
  await queue.add('cmv-anomaly', {}, {
    repeat: { cron: '*/30 11-22 * * *' },
    attempts: 1,
  });

  // detect-incidents: a cada 15 min — troco não confirmado + pedidos esquecidos
  await queue.add('detect-incidents', {}, {
    repeat: { every: 15 * 60 * 1000 },
    backoff: { type: 'fixed', delay: 30_000 },
  });

  const jobs = await queue.getRepeatableJobs();
  logger.info('Automation scheduler iniciado', {
    jobs: jobs.map((j) => ({ name: j.name, cron: j.cron, every: j.every })),
  });

  return queue;
}

module.exports = { createAutomationWorker, createAutomationScheduler };
