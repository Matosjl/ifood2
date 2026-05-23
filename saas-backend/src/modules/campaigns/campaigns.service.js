'use strict';
const db  = require('../../config/database');
const wpp = require('../../services/whatsapp.service');
const env = require('../../config/env');
const axios = require('axios');

const SEGMENTS = ['vip','recorrente','novo','lead','em_risco','perdido','todos'];

/** Retorna clientes segmentados do tenant */
async function getSegmentCustomers(tenantId, segment) {
  const sql = `
    WITH base AS (
      SELECT
        COALESCE(lc.name, oa.name)         AS name,
        COALESCE(lc.phone, oa.phone)       AS phone,
        COALESCE(oa.order_count, 0)::int   AS order_count,
        oa.last_order_date
      FROM loyalty_customers lc
      FULL OUTER JOIN (
        SELECT customer_name AS name, customer_phone AS phone,
               COUNT(*)::int AS order_count, MAX(created_at) AS last_order_date
        FROM orders
        WHERE tenant_id = $1 AND status NOT IN ('cancelled','pending')
          AND customer_name IS NOT NULL
        GROUP BY customer_name, customer_phone
      ) oa ON lower(lc.phone) = lower(oa.phone)
      WHERE lc.tenant_id = $1 OR oa.name IS NOT NULL
    ),
    segmented AS (
      SELECT *,
        CASE
          WHEN order_count = 0 OR last_order_date IS NULL                                THEN 'lead'
          WHEN order_count >= 6 AND last_order_date > NOW() - INTERVAL '30 days'         THEN 'vip'
          WHEN order_count >= 2 AND last_order_date > NOW() - INTERVAL '30 days'         THEN 'recorrente'
          WHEN order_count = 1  AND last_order_date > NOW() - INTERVAL '30 days'         THEN 'novo'
          WHEN last_order_date  > NOW() - INTERVAL '60 days'                             THEN 'em_risco'
          ELSE 'perdido'
        END AS segment
      FROM base
      WHERE phone IS NOT NULL AND phone <> ''
    )
    SELECT name, phone, segment FROM segmented
    ${segment !== 'todos' ? 'WHERE segment = $2' : ''}
    ORDER BY name ASC
  `;
  const params = segment !== 'todos' ? [tenantId, segment] : [tenantId];
  const { rows } = await db.query(sql, params);
  return rows;
}

/** Lista campanhas do tenant */
async function list(tenantId) {
  const { rows } = await db.query(
    `SELECT * FROM campaigns WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [tenantId]
  );
  return rows;
}

/** Cria campanha (status = draft) */
async function create(tenantId, { name, segment, message }) {
  if (!name?.trim())    throw { message: 'Nome da campanha é obrigatório.', status: 400 };
  if (!SEGMENTS.includes(segment)) throw { message: 'Segmento inválido.', status: 400 };
  if (!message?.trim()) throw { message: 'Mensagem é obrigatória.', status: 400 };

  const customers = await getSegmentCustomers(tenantId, segment);
  const { rows } = await db.query(
    `INSERT INTO campaigns (tenant_id, name, segment, message, status, total)
     VALUES ($1,$2,$3,$4,'draft',$5) RETURNING *`,
    [tenantId, name.trim(), segment, message.trim(), customers.length]
  );
  return rows[0];
}

/** Dispara campanha — envia mensagens via Evolution API */
async function send(tenantId, campaignId) {
  // Busca campanha
  const { rows: crows } = await db.query(
    `SELECT * FROM campaigns WHERE id = $1 AND tenant_id = $2`, [campaignId, tenantId]
  );
  const campaign = crows[0];
  if (!campaign)                    throw { message: 'Campanha não encontrada.', status: 404 };
  if (campaign.status === 'sending') throw { message: 'Campanha já está sendo enviada.', status: 409 };
  if (campaign.status === 'done')    throw { message: 'Campanha já foi enviada.', status: 409 };

  // Verifica instância WhatsApp
  const wstatus = await wpp.getStatus(tenantId);
  if (!wstatus.connected) throw { message: 'WhatsApp não está conectado. Conecte em Configurações → WhatsApp.', status: 422 };

  const instance  = wstatus.instance;
  const customers = await getSegmentCustomers(tenantId, campaign.segment);

  // Marca como enviando
  await db.query(
    `UPDATE campaigns SET status='sending', started_at=NOW(), total=$2, sent=0, failed=0, updated_at=NOW() WHERE id=$1`,
    [campaignId, customers.length]
  );

  // Dispara em background (fire-and-forget)
  _dispatchCampaign(tenantId, campaignId, instance, campaign.message, customers).catch(() => {});

  return { total: customers.length, instance };
}

/** Envia mensagens com delay entre cada (evita banimento) */
async function _dispatchCampaign(tenantId, campaignId, instance, message, customers) {
  const evo = axios.create({
    baseURL: env.EVOLUTION_API_URL,
    headers: { apikey: env.EVOLUTION_API_KEY },
    timeout: 10000,
  });

  let sent = 0, failed = 0;

  for (const c of customers) {
    const phone = c.phone.replace(/\D/g, '');
    const number = phone.startsWith('55') ? phone : `55${phone}`;
    const personalizedMsg = message
      .replace(/\{nome\}/gi, c.name?.split(' ')[0] || 'Cliente')
      .replace(/\{segmento\}/gi, c.segment || '');

    try {
      await evo.post(`/message/sendText/${instance}`, {
        number,
        text: personalizedMsg,
      });
      sent++;
    } catch {
      failed++;
    }

    // Atualiza progresso a cada 5 envios
    if ((sent + failed) % 5 === 0) {
      await db.query(
        `UPDATE campaigns SET sent=$2, failed=$3, updated_at=NOW() WHERE id=$1`,
        [campaignId, sent, failed]
      ).catch(() => {});
    }

    // Delay de 1.5s entre mensagens (evita spam ban)
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Finaliza
  await db.query(
    `UPDATE campaigns SET status='done', sent=$2, failed=$3, finished_at=NOW(), updated_at=NOW() WHERE id=$1`,
    [campaignId, sent, failed]
  ).catch(() => {});
}

/** Retorna contagem de clientes por segmento (preview) */
async function preview(tenantId, segment) {
  const customers = await getSegmentCustomers(tenantId, segment);
  return { count: customers.length, segment };
}

module.exports = { list, create, send, preview };
