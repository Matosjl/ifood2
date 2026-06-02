'use strict';
/**
 * Internal Controller — Rotas chamadas pelo AI Engine (VPS2)
 * Auth: X-Internal-Key header
 */
const asyncHandler    = require('../../utils/asyncHandler');
const db              = require('../../config/database');
const AppError        = require('../../utils/AppError');
const orderService    = require('../orders/orders.service');
const eventService    = require('../../socket/eventService');

// ── Tenants ────────────────────────────────────────────────────────

/** GET /api/internal/tenants/:tenantId */
const getTenant = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, name, plan, active, subscription_status, chatbot_enabled, created_at
     FROM tenants WHERE id = $1`,
    [req.params.tenantId]
  );
  if (!rows.length) throw new AppError('Tenant não encontrado', 404);
  res.json({ success: true, data: rows[0] });
});

/** GET /api/internal/super/tenants */
const getAllTenants = asyncHandler(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT id, name, plan, active, subscription_status, created_at
     FROM tenants ORDER BY created_at DESC`
  );
  res.json({ success: true, data: rows });
});

/** GET /api/internal/super/stats */
const getSuperStats = asyncHandler(async (_req, res) => {
  const { rows } = await db.query(`
    SELECT
      COUNT(*)                                            AS total_tenants,
      COUNT(*) FILTER (WHERE active = TRUE)              AS active_tenants,
      COUNT(*) FILTER (WHERE plan = 'pro')               AS pro_tenants,
      COUNT(*) FILTER (WHERE plan = 'basic')             AS basic_tenants,
      COUNT(*) FILTER (WHERE plan = 'starter')           AS starter_tenants
    FROM tenants
  `);
  const { rows: mrr } = await db.query(`
    SELECT COALESCE(SUM(
      CASE WHEN plan = 'pro'     THEN 197
           WHEN plan = 'basic'   THEN 97
           WHEN plan = 'starter' THEN 47
           ELSE 0 END
    ), 0) AS mrr_brl
    FROM tenants WHERE active = TRUE
  `);
  res.json({
    success: true,
    data: { ...rows[0], mrr_brl: parseFloat(mrr[0].mrr_brl) },
  });
});

// ── Products ───────────────────────────────────────────────────────

/** GET /api/internal/products (X-Tenant-Id required) */
const getProducts = asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('X-Tenant-Id obrigatório', 400);
  const { rows } = await db.query(
    `SELECT p.id, p.name, p.sale_price AS price, p.stock_qty AS stock, p.active AS available,
            c.name AS category
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.tenant_id = $1 AND p.active = TRUE
     ORDER BY c.name, p.name`,
    [req.tenantId]
  );
  res.json({ success: true, data: rows });
});

// ── Orders ─────────────────────────────────────────────────────────

/** GET /api/internal/orders/summary */
const getOrdersSummary = asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('X-Tenant-Id obrigatório', 400);
  const days = parseInt(req.query.days) || 7;
  const { rows } = await db.query(`
    SELECT
      COUNT(*)                               AS total_orders,
      COUNT(*) FILTER (WHERE status = 'delivered') AS delivered_orders,
      COALESCE(SUM(total), 0)                AS total_revenue,
      COALESCE(AVG(total), 0)                AS avg_ticket,
      DATE(created_at)                       AS day
    FROM orders
    WHERE tenant_id = $1
      AND created_at >= NOW() - ($2 || ' days')::INTERVAL
    GROUP BY DATE(created_at)
    ORDER BY day
  `, [req.tenantId, days]);

  const totals = rows.reduce((acc, r) => ({
    totalOrders:   acc.totalOrders   + parseInt(r.total_orders),
    totalRevenue:  acc.totalRevenue  + parseFloat(r.total_revenue),
  }), { totalOrders: 0, totalRevenue: 0 });

  res.json({ success: true, data: { ...totals, byDay: rows } });
});

// ── Financial ─────────────────────────────────────────────────────

/** GET /api/internal/financial/summary */
const getFinancialSummary = asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('X-Tenant-Id obrigatório', 400);
  const period = req.query.period || 'month';
  const interval = period === 'day' ? '1 day' : period === 'week' ? '7 days' : '30 days';

  // Receitas = orders entregues; Despesas = expenses
  const { rows: rev } = await db.query(`
    SELECT COALESCE(SUM(total), 0) AS receitas
    FROM orders
    WHERE tenant_id = $1 AND status = 'delivered'
      AND created_at >= NOW() - $2::INTERVAL
  `, [req.tenantId, interval]);

  const { rows: exp } = await db.query(`
    SELECT COALESCE(SUM(amount), 0) AS despesas
    FROM expenses
    WHERE tenant_id = $1
      AND created_at >= NOW() - $2::INTERVAL
  `, [req.tenantId, interval]);

  const receitas = parseFloat(rev[0].receitas);
  const despesas = parseFloat(exp[0].despesas);
  res.json({ success: true, data: { receitas, despesas, lucro: receitas - despesas, period } });
});

/** POST /api/internal/financial/transactions — cria despesa via WhatsApp */
const createTransaction = asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('X-Tenant-Id obrigatório', 400);
  const { type, amount, category, description, date } = req.body;

  if (type !== 'EXPENSE') {
    return res.status(201).json({ success: true, data: { skipped: true, reason: 'Receitas são registradas via pedidos' } });
  }

  const { rows } = await db.query(
    `INSERT INTO expenses (tenant_id, name, category, amount, payment_method, due_date, status)
     VALUES ($1, $2, $3, $4, 'pix', $5, 'paid')
     RETURNING *`,
    [req.tenantId, description || category, category || 'other', amount, date || new Date()]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

// ── Stock ─────────────────────────────────────────────────────────

/** GET /api/internal/stock — lista insumos do tenant para o AI Engine */
const getStock = asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('X-Tenant-Id obrigatório', 400);
  const { rows } = await db.query(
    `SELECT id, name, unit, current_stock AS qty, min_stock, cost_per_unit AS cost
     FROM insumos
     WHERE tenant_id = $1
     ORDER BY name`,
    [req.tenantId]
  );
  res.json({ success: true, data: rows });
});

/** POST /api/internal/stock/bulk-update */
const bulkUpdateStock = asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('X-Tenant-Id obrigatório', 400);
  const { items } = req.body;
  if (!Array.isArray(items) || !items.length) throw new AppError('items[] obrigatório', 400);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const updated = [];

    for (const item of items) {
      const { name, qty } = item;
      if (!name || !qty) continue;

      // Tenta encontrar produto por nome (busca aproximada)
      const { rows } = await client.query(
        `UPDATE products
         SET stock_qty = stock_qty + $1, updated_at = NOW()
         WHERE tenant_id = $2 AND LOWER(name) LIKE LOWER($3)
         RETURNING id, name, stock_qty`,
        [qty, req.tenantId, `%${name}%`]
      );
      if (rows.length) updated.push(...rows);
    }

    await client.query('COMMIT');
    res.json({ success: true, data: { updated: updated.length, items: updated } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

/** GET /api/internal/orders/by-phone?phone=xxx — pedidos recentes do cliente */
const getOrdersByPhone = asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('X-Tenant-Id obrigatório', 400);
  const rawPhone = (req.query.phone || '').replace(/\D/g, '');
  if (!rawPhone) throw new AppError('phone obrigatório', 400);

  // Gera variantes (8/9 dígitos) para cobrir diferenças de formatação
  const variants = new Set([rawPhone]);
  if (rawPhone.length === 13) {
    // 55 + DDD(2) + 9dígitos → tenta sem o 9
    variants.add(rawPhone.slice(0, 4) + rawPhone.slice(5));
  } else if (rawPhone.length === 12) {
    // 55 + DDD(2) + 8dígitos → tenta com o 9
    variants.add(rawPhone.slice(0, 4) + '9' + rawPhone.slice(4));
  }
  const placeholders = [...variants].map((_, i) => `$${i + 2}`).join(',');

  const { rows } = await db.query(
    `SELECT id, order_number, status, total, customer_name,
            customer_phone, delivery_type, created_at
     FROM   orders
     WHERE  tenant_id = $1
       AND  customer_phone = ANY(ARRAY[${placeholders}])
       AND  created_at >= NOW() - INTERVAL '24 hours'
     ORDER  BY created_at DESC
     LIMIT  3`,
    [req.tenantId, ...[...variants]]
  );
  res.json({ success: true, data: rows });
});

// ── WhatsApp ──────────────────────────────────────────────────────

/** POST /api/internal/whatsapp/send */
const sendWhatsApp = asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('X-Tenant-Id obrigatório', 400);
  const { phone, message, evolutionInstance } = req.body;
  if (!phone || !message) throw new AppError('phone e message obrigatórios', 400);

  // Usa instância fornecida pelo AI Engine (preferencial) ou busca no banco
  let instance = evolutionInstance || null;

  if (!instance) {
    // Fallback: tenta buscar instância configurada no tenant
    const { rows } = await db.query(
      `SELECT whatsapp_instance FROM tenants WHERE id = $1`,
      [req.tenantId]
    );
    instance = rows[0]?.whatsapp_instance || null;
  }

  if (!instance) {
    return res.json({ success: true, data: { sent: false, reason: 'Instância WhatsApp não configurada' } });
  }

  // Chama Evolution API diretamente
  const axios = require('axios');
  const env   = require('../../config/env');
  await axios.post(
    `${env.EVOLUTION_API_URL}/message/sendText/${instance}`,
    { number: phone, text: message },
    { headers: { apikey: env.EVOLUTION_API_KEY }, timeout: 10000 }
  );

  res.json({ success: true, data: { sent: true, phone, instance } });
});

/** POST /api/internal/whatsapp/send-media — envia imagem/mídia */
const sendWhatsAppMedia = asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('X-Tenant-Id obrigatório', 400);
  const { phone, base64, caption = '', mimeType = 'image/jpeg', evolutionInstance } = req.body;
  if (!phone || !base64) throw new AppError('phone e base64 obrigatórios', 400);

  let instance = evolutionInstance || null;
  if (!instance) {
    const { rows } = await db.query(`SELECT whatsapp_instance FROM tenants WHERE id = $1`, [req.tenantId]);
    instance = rows[0]?.whatsapp_instance || null;
  }
  if (!instance) return res.json({ success: true, data: { sent: false, reason: 'Instância não configurada' } });

  const axios = require('axios');
  const env   = require('../../config/env');

  // Evolution API v2: sendMedia endpoint
  await axios.post(
    `${env.EVOLUTION_API_URL}/message/sendMedia/${instance}`,
    {
      number:   phone,
      mediatype: mimeType.startsWith('image') ? 'image' : 'document',
      media:    base64,
      caption:  caption,
    },
    { headers: { apikey: env.EVOLUTION_API_KEY }, timeout: 15000 }
  );

  res.json({ success: true, data: { sent: true } });
});

// ── Orders from WhatsApp ──────────────────────────────────────

/**
 * POST /api/internal/orders/from-whatsapp
 * Cria pedido recebido pelo agente WhatsApp.
 * Body: {
 *   customerName, customerPhone, customerAddress?,
 *   deliveryType ('delivery'|'pickup'), paymentMethod,
 *   reference?, notes?,
 *   items: [{ productId, quantity }]
 * }
 */
const createOrderFromWhatsApp = asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('X-Tenant-Id obrigatório', 400);

  const {
    customerName, customerPhone, customerAddress,
    deliveryType = 'pickup', paymentMethod = 'cash',
    reference, notes, items,
  } = req.body;

  if (!customerName?.trim())  throw new AppError('customerName obrigatório', 400);
  if (!items?.length)         throw new AppError('items[] obrigatório', 400);

  const notesComposed = [
    reference ? `Referência: ${reference}` : null,
    notes || null,
    'Pedido via WhatsApp',
  ].filter(Boolean).join(' | ');

  const order = await orderService.createOrder(req.tenantId, {
    customerName:    customerName.trim(),
    customerPhone:   customerPhone || null,
    customerAddress: customerAddress || null,
    channel:         'whatsapp',
    deliveryType,
    paymentMethod,
    notes:           notesComposed,
    items,
    initialStatus:   'pending',
    idempotencyKey:  `wa:${req.tenantId}:${customerPhone}:${Date.now()}`,
  });

  // Notifica o painel em tempo real
  eventService.orderCreated(req.tenantId, order);

  res.status(201).json({ success: true, data: order });
});

/**
 * POST /api/internal/leads
 * Chamado pelo VPS2 (chatbot) quando uma nova conversa WhatsApp é iniciada.
 * Cria o contato como lead no funil CRM se ainda não existir.
 * Body: { tenantId, phone, name? }
 */
const upsertLead = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId || req.body.tenantId;
  if (!tenantId) throw new AppError('tenantId obrigatório', 400);

  const { phone, name } = req.body;
  if (!phone) throw new AppError('phone obrigatório', 400);

  const normPhone = phone.replace(/\D/g, '').trim();
  if (!normPhone) throw new AppError('phone inválido', 400);

  const { rows } = await db.query(
    `INSERT INTO loyalty_customers (tenant_id, phone, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, phone) DO UPDATE
       SET name       = COALESCE(EXCLUDED.name, loyalty_customers.name),
           updated_at = NOW()
     RETURNING id, name, phone, total_orders`,
    [tenantId, normPhone, name?.trim() || null]
  );

  res.json({ success: true, data: rows[0] });
});

// ── Receipts (OCR de notas fiscais via WhatsApp) ──────────────────

const receiptsService = require('../financeiro/receipts.service');
const ingestService   = require('../financeiro/ingest.service');
const waNotify        = require('../../services/waNotify.service');

/**
 * POST /api/internal/receipts/ingest
 * Chamado pela VPS2 quando detecta uma IMAGEM no webhook do Evolution.
 *
 * Body: { senderPhone, imageBase64, mimeType }
 * Resposta: 201 { pending } — VPS2 deve então mandar `waNotify.sendReceiptPreview`.
 */
const ingestReceipt = asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('X-Tenant-Id obrigatório', 400);
  const { senderPhone, imageBase64, mimeType = 'image/jpeg' } = req.body;

  if (!senderPhone)  throw new AppError('senderPhone obrigatório', 400);
  if (!imageBase64)  throw new AppError('imageBase64 obrigatório', 400);

  const buf = Buffer.from(imageBase64, 'base64');
  if (buf.length === 0) throw new AppError('imageBase64 inválido (zero bytes)', 400);
  if (buf.length > 10 * 1024 * 1024) throw new AppError('imagem maior que 10MB', 413);

  const pending = await ingestService.ingest({
    tenantId:    req.tenantId,
    imageBuffer: buf,
    contentType: mimeType,
    senderPhone: senderPhone.replace(/\D/g, ''),
    source:      'whatsapp',
  });

  // Notifica o usuário no WA com o preview e botões SIM/NAO/EDITAR
  try {
    await waNotify.sendReceiptPreview(req.tenantId, senderPhone, pending);
  } catch (err) {
    // Falha de WA não derruba o ingest — usuário pode acessar via UI
    console.warn('[internal.ingestReceipt] falha ao mandar preview WA:', err.message);
  }

  const { image_bytes, ...safe } = pending;
  res.status(201).json({ success: true, data: safe });
});

/**
 * POST /api/internal/receipts/handle-reply
 * Chamado pela VPS2 quando o usuário responde texto no WhatsApp depois de ver o preview.
 *
 * Body: { senderPhone, text }  — text exemplo: "SIM", "NAO", "SIM 47B", "EDITAR 47B"
 * Resposta: { handled: true|false, action, pending? }
 */
const handleReceiptReply = asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('X-Tenant-Id obrigatório', 400);
  const { senderPhone, text } = req.body;
  if (!senderPhone || !text)   throw new AppError('senderPhone e text obrigatórios', 400);

  const phone = senderPhone.replace(/\D/g, '');
  const normalized = String(text).trim().toUpperCase();

  // Tenta extrair short_code (3 chars alfanum) do texto
  const codeMatch = normalized.match(/\b([A-Z0-9]{3})\b/);
  const shortCode = codeMatch ? codeMatch[1] : null;

  // Identifica intenção
  let action = null;
  if (/^(SIM|S|OK|CONFIRMAR|CONFIRMA|YES)\b/.test(normalized))            action = 'confirm';
  else if (/^(NAO|NÃO|N|CANCELA|CANCELAR|REJEITAR|NO)\b/.test(normalized)) action = 'reject';
  else if (/^EDITAR\b/.test(normalized))                                   action = 'edit';

  if (!action) {
    return res.json({ success: true, data: { handled: false, reason: 'no_intent_detected' } });
  }

  // Resolve qual pending — short_code se informado, senão o mais recente do phone
  let pending = shortCode
    ? await receiptsService.getByShortCode(req.tenantId, shortCode)
    : await receiptsService.getMostRecentByPhone(req.tenantId, phone);

  if (!pending) {
    try {
      await waNotify.sendText(req.tenantId, senderPhone,
        '🤔 Não encontrei nenhuma nota pendente pra confirmar. Manda a foto da nota fiscal novamente.');
    } catch {}
    return res.json({ success: true, data: { handled: false, reason: 'no_pending_found', action } });
  }

  if (action === 'confirm') {
    let result;
    try {
      result = await receiptsService.confirm(req.tenantId, pending.id);
    } catch (confirmErr) {
      if (confirmErr.statusCode === 422 || confirmErr.status === 422) {
        try {
          await waNotify.sendText(req.tenantId, senderPhone,
            '⚠️ *Não foi possível confirmar automaticamente.*\n\n' +
            confirmErr.message +
            '\n\nAcesse o painel para revisar: https://app.zapfome.com/financeiro'
          );
        } catch {}
        return res.json({ success: true, data: { handled: true, action: 'confirm_blocked', reason: confirmErr.message } });
      }
      throw confirmErr;
    }
    try {
      await waNotify.sendReceiptConfirmed(req.tenantId, senderPhone, result);
    } catch {}
    const { image_bytes, ...safe } = result.pending;
    return res.json({ success: true, data: { handled: true, action, pending: safe } });
  }

  if (action === 'reject') {
    const updated = await receiptsService.reject(req.tenantId, pending.id, 'rejeitado_via_whatsapp');
    try {
      await waNotify.sendText(req.tenantId, senderPhone,
        '👌 Beleza, nota cancelada. Se quiser registrar de novo, é só mandar outra foto.');
    } catch {}
    const { image_bytes, ...safe } = updated;
    return res.json({ success: true, data: { handled: true, action, pending: safe } });
  }

  // action === 'edit'
  try {
    await waNotify.sendText(req.tenantId, senderPhone,
      `✏️ Pra editar a nota *${pending.short_code}*, acesse o financeiro no app: ` +
      `https://app.zapfome.com/financeiro (ou avise quais itens estão errados que eu te ajudo).`);
  } catch {}
  return res.json({ success: true, data: { handled: true, action, pending: { id: pending.id, short_code: pending.short_code } } });
});

/**
 * POST /api/internal/receipts/ingest-processed
 * Chamado pelo VPS2 OCR worker APÓS já ter processado a nota.
 * Não re-faz OCR — apenas salva o resultado já estruturado em pending_receipts
 * e envia preview WhatsApp.
 *
 * Body: {
 *   senderPhone,
 *   evolutionInstance,
 *   ocrResult: { supplier, invoiceDate, totalValue, confidence, items: [{name,qty,unit,unitPrice,total}] }
 * }
 */
const ingestProcessedReceipt = asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('X-Tenant-Id obrigatório', 400);
  const { senderPhone, evolutionInstance, ocrResult } = req.body;
  if (!senderPhone)  throw new AppError('senderPhone obrigatório', 400);
  if (!ocrResult)    throw new AppError('ocrResult obrigatório', 400);

  const phone = senderPhone.replace(/\D/g, '');

  // Traduz formato VPS2 → formato raw_extraction do pending_receipts
  const rawExtraction = {
    fornecedor:     ocrResult.supplier   || null,
    cnpj:           ocrResult.cnpj       || null,
    data_emissao:   ocrResult.invoiceDate || null,
    total:          parseFloat(ocrResult.totalValue || 0),
    confianca:      parseFloat(ocrResult.confidence || 0),
    categoria_sugerida: 'food_supplier',
    itens: (ocrResult.items || []).map((it) => ({
      descricao:   it.name,
      quantidade:  parseFloat(it.qty || 1),
      unidade:     it.unit || 'un',
      valor_unit:  parseFloat(it.unitPrice || 0),
      valor_total: parseFloat(it.total || 0),
    })),
  };

  // Roda matcher nos itens
  const { matchAll } = require('../financeiro/matcher.service');
  const matchedItems = await matchAll(req.tenantId, rawExtraction.itens);

  // Gera short_code único (4 chars = 36^4 ≈ 1.68M combos; retry pra evitar colisão ativa)
  const db = require('../../config/database');
  let shortCode;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = Math.random().toString(36).slice(2, 6).toUpperCase();
    const { rows: existing } = await db.query(
      `SELECT 1 FROM pending_receipts
       WHERE tenant_id = $1 AND short_code = $2 AND status = 'awaiting_confirmation' LIMIT 1`,
      [req.tenantId, candidate]
    );
    if (!existing.length) { shortCode = candidate; break; }
  }
  if (!shortCode) shortCode = Date.now().toString(36).slice(-5).toUpperCase(); // fallback infálível

  // Insere pending_receipts
  const { rows } = await db.query(
    `INSERT INTO pending_receipts
       (tenant_id, sender_phone, source, raw_extraction, matched_items, status, short_code)
     VALUES ($1, $2, 'whatsapp', $3, $4, 'awaiting_confirmation', $5)
     RETURNING *`,
    [req.tenantId, phone, JSON.stringify(rawExtraction), JSON.stringify(matchedItems), shortCode]
  );
  const pending = rows[0];

  // Emite socket
  const eventService = require('../../socket/eventService');
  try { eventService.emit(req.tenantId, 'receipt:created', { ...pending, image_bytes: undefined }); } catch {}

  // Envia preview WA
  try { await waNotify.sendReceiptPreview(req.tenantId, senderPhone, pending); } catch {}

  const { image_bytes, ...safe } = pending;
  res.status(201).json({ success: true, data: safe });
});

module.exports = {
  getTenant, getAllTenants, getSuperStats,
  getProducts, getOrdersSummary,
  getFinancialSummary, createTransaction,
  getStock, bulkUpdateStock, sendWhatsApp, sendWhatsAppMedia,
  getOrdersByPhone, createOrderFromWhatsApp,
  upsertLead,
  ingestReceipt, handleReceiptReply, ingestProcessedReceipt,
};
