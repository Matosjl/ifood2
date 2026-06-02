'use strict';
const asyncHandler = require('../../utils/asyncHandler');
const AppError     = require('../../utils/AppError');
const receiptsService = require('./receipts.service');
const ingestService   = require('./ingest.service');

/**
 * POST /api/financeiro/receipts/upload
 * Upload manual de uma nota fiscal (multer middleware injetou req.file).
 */
const upload = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  if (!req.file) throw new AppError('Imagem obrigatória (campo "image")', 400);

  const pending = await ingestService.ingest({
    tenantId,
    imageBuffer: req.file.buffer,
    contentType: req.file.mimetype,
    senderPhone: null,
    source: 'upload',
  });

  // Não devolvemos image_bytes na resposta
  const { image_bytes, ...safe } = pending;
  res.status(201).json({ success: true, data: safe });
});

/**
 * GET /api/financeiro/receipts/pending
 */
const listPending = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const status = req.query.status || 'awaiting_confirmation';
  const items = await receiptsService.listPending(tenantId, { status, limit: 50 });

  const sanitized = items.map(({ image_bytes, ...rest }) => rest);
  res.json({ success: true, data: sanitized });
});

/**
 * GET /api/financeiro/receipts/:id
 */
const getOne = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const pending = await receiptsService.getById(tenantId, req.params.id);
  const { image_bytes, ...safe } = pending;
  res.json({ success: true, data: safe });
});

/**
 * GET /api/financeiro/receipts/:id/image
 * Serve a imagem original em binário (pra preview no modal).
 */
const getImage = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const pending = await receiptsService.getById(tenantId, req.params.id);
  if (!pending.image_bytes) throw new AppError('Imagem indisponível', 404);

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(pending.image_bytes);
});

/**
 * POST /api/financeiro/receipts/:id/confirm
 */
const confirm = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const userId = req.user.id || req.user.userId;
  const result = await receiptsService.confirm(tenantId, req.params.id, userId);

  const { image_bytes, ...safePending } = result.pending;
  res.json({
    success: true,
    data: {
      pending: safePending,
      expense: result.expense,
      stockMovements: result.stockMovements,
    },
  });
});

/**
 * PUT /api/financeiro/receipts/:id
 * Edita raw_extraction e/ou matched_items antes de confirmar.
 */
const edit = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const updated = await receiptsService.edit(tenantId, req.params.id, req.body || {});
  const { image_bytes, ...safe } = updated;
  res.json({ success: true, data: safe });
});

/**
 * DELETE /api/financeiro/receipts/:id
 * Rejeita a nota (não apaga o registro — fica auditável).
 */
const reject = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const updated = await receiptsService.reject(tenantId, req.params.id, req.body?.reason);
  const { image_bytes, ...safe } = updated;
  res.json({ success: true, data: safe });
});


/**
 * GET /api/financeiro/receipts/revisar
 */
const listForRevisar = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const items = await receiptsService.listForRevisar(tenantId);
  const sanitized = items.map(({ image_bytes, ...rest }) => rest);
  res.json({ success: true, data: sanitized });
});

/**
 * GET /api/financeiro/receipts/revisar/count
 */
const countPending = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const count = await receiptsService.countPending(tenantId);
  res.json({ success: true, data: { count } });
});

/**
 * POST /api/financeiro/receipts/:id/items/:idx/resolve
 * Resolve item create_new: cria/casa insumo e lanca estoque retroativamente.
 * NAO cria nova despesa - financeiro ja foi lancado na confirmacao.
 */
const resolveItem = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const userId   = req.user.id || req.user.userId || null;
  const { id, idx } = req.params;
  const result = await receiptsService.resolveItem(tenantId, id, idx, req.body, userId);
  res.json({ success: true, data: result });
});

module.exports = {
  upload, listPending, getOne, getImage, confirm, edit, reject,
  listForRevisar, countPending, resolveItem,
};
