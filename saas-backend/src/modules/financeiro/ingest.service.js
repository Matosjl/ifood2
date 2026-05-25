'use strict';
/**
 * ingest.service.js — pipeline: foto de nota fiscal → pending_receipts
 *
 * Chamado por:
 *   - POST /api/financeiro/receipts/upload  (upload manual via UI)
 *   - POST /api/internal/receipts/ingest    (VPS2 repassando foto recebida no WhatsApp)
 *
 * Fluxo:
 *   1. Chama ai.service.interpretReceipt (VPS2 + Ollama Vision)
 *   2. Roda matcher.matchAll pra casar itens com insumos/products do tenant
 *   3. INSERT em pending_receipts com short_code aleatório
 *   4. Emite evento socket 'receipt:created' pro frontend
 *   5. Retorna o pending_receipt criado
 */
const db          = require('../../config/database');
const aiService   = require('../../services/ai.service');
const matcher     = require('./matcher.service');
const eventService = require('../../socket/eventService');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('receipts.ingest');

/** Gera código curto (3 chars) pro usuário usar como referência no WhatsApp */
function generateShortCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem caracteres ambíguos (O/0, I/1)
  let s = '';
  for (let i = 0; i < 3; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * Processa imagem de nota fiscal end-to-end.
 *
 * @param {object} args
 * @param {string} args.tenantId
 * @param {Buffer} args.imageBuffer
 * @param {string} [args.contentType='image/jpeg']
 * @param {string} [args.senderPhone]   — quem mandou no WA (null pra upload manual)
 * @param {string} [args.source='whatsapp']  — 'whatsapp' | 'upload' | 'email'
 * @returns {Promise<object>}  pending_receipt row
 */
async function ingest({ tenantId, imageBuffer, contentType = 'image/jpeg', senderPhone = null, source = 'whatsapp' }) {
  if (!tenantId)              throw new Error('tenantId obrigatório');
  if (!Buffer.isBuffer(imageBuffer)) throw new Error('imageBuffer deve ser Buffer');
  if (imageBuffer.length === 0)      throw new Error('imageBuffer vazio');

  logger.info('iniciando ingest', { tenantId, size: imageBuffer.length, source });

  // 1. Chama VPS2 pra extrair dados via Ollama Vision
  let extraction;
  try {
    extraction = await aiService.interpretReceipt(tenantId, imageBuffer, contentType);
  } catch (err) {
    logger.error('falha no OCR da VPS2', { tenantId, error: err.message });
    // Grava pending mesmo assim — usuário pode editar manualmente ou tentar de novo
    return createFailedPending({ tenantId, senderPhone, source, imageBuffer, error: err.message });
  }

  if (extraction?.erro) {
    logger.warn('VPS2 retornou erro', { tenantId, erro: extraction.erro });
    return createFailedPending({ tenantId, senderPhone, source, imageBuffer, error: extraction.erro });
  }

  // 2. Roda matcher
  const matchedItems = await matcher.matchAll(tenantId, extraction.itens || []);

  // 3. INSERT em pending_receipts
  const shortCode = generateShortCode();
  const { rows } = await db.query(
    `INSERT INTO pending_receipts
       (tenant_id, sender_phone, source, image_bytes, raw_extraction, matched_items,
        short_code, status)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, 'awaiting_confirmation')
     RETURNING *`,
    [
      tenantId,
      senderPhone,
      source,
      imageBuffer,
      JSON.stringify(extraction),
      JSON.stringify(matchedItems),
      shortCode,
    ]
  );

  const pending = rows[0];

  // 4. Emite socket pro frontend abrir notificação
  try {
    eventService.emit(tenantId, 'receipt:created', sanitize(pending));
  } catch (err) {
    logger.warn('falha ao emitir socket receipt:created', { error: err.message });
  }

  // 5. Se há itens sem match, pergunta ao empresário se quer cadastrar (fire-and-forget)
  const newItems = matchedItems.filter((m) => m.action === 'create_new' && m.raw?.descricao);
  if (newItems.length > 0) {
    const waNotify = require('../../services/waNotify.service');
    waNotify.sendNewProductSuggestion(tenantId, newItems, shortCode).catch(() => {});
  }

  logger.info('pending_receipt criado', {
    tenantId, id: pending.id, shortCode, itens: matchedItems.length,
    confianca: extraction.confianca, novosItens: newItems.length,
  });

  return pending;
}

async function createFailedPending({ tenantId, senderPhone, source, imageBuffer, error }) {
  const { rows } = await db.query(
    `INSERT INTO pending_receipts
       (tenant_id, sender_phone, source, image_bytes, raw_extraction, matched_items,
        status)
     VALUES ($1, $2, $3, $4, $5::jsonb, '[]'::jsonb, 'extraction_failed')
     RETURNING *`,
    [
      tenantId,
      senderPhone,
      source,
      imageBuffer,
      JSON.stringify({ erro: 'extraction_failed', detail: String(error).slice(0, 500) }),
    ]
  );
  return rows[0];
}

function sanitize(pending) {
  // Remove image_bytes (BYTEA pode ser grande demais pro socket)
  const { image_bytes, ...rest } = pending;
  return rest;
}

module.exports = { ingest, generateShortCode, sanitize };
