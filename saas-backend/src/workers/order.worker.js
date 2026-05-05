const { Worker }       = require('bullmq');
const { createRedisClient } = require('../config/redis');
const service        = require('../modules/orders/orders.service');
const orderCache     = require('../cache/orderCache');
const eventService   = require('../socket/eventService');
const AppError       = require('../utils/AppError');
const { createLogger } = require('../utils/logger');

const logger      = createLogger('Worker:orders');
const QUEUE_NAME  = 'orders';
const CONCURRENCY = 2;

// ── Error classifier ──────────────────────────────────────────

/**
 * Runs a service function and classifies the outcome:
 *
 *  AppError (operational) → { ok: false, statusCode, message }
 *    BullMQ marks the job COMPLETED — no retry.
 *    e.g. estoque insuficiente, produto inativo, transicao invalida.
 *
 *  Any other error → rethrow
 *    BullMQ marks the job FAILED — retried up to 3x with exponential backoff.
 *    e.g. DB connection lost, Redis timeout.
 */
const safe = async (fn, meta = {}) => {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    if (err instanceof AppError && err.isOperational) {
      logger.warn('Erro operacional — sem retry', {
        ...meta,
        error:      err.message,
        statusCode: err.statusCode,
      });
      return { ok: false, statusCode: err.statusCode, message: err.message };
    }
    logger.error('Erro de infraestrutura — sera reprocessado', {
      ...meta,
      error: err.message,
      stack: err.stack?.split('\n')[1]?.trim(),
    });
    throw err;
  }
};

// ── Side effects (cache + WebSocket) ─────────────────────────

/**
 * Updates the Redis cache and emits a Socket.io event after a successful
 * write operation. Failures here are logged but never propagate — they must
 * not cause the job to be retried.
 */
const applySideEffects = async (eventFn, tenantId, order) => {
  try {
    await orderCache.upsertOrder(tenantId, order);
  } catch (err) {
    logger.warn('Falha ao atualizar cache', { tenantId, orderId: order?.id, error: err.message });
  }
  try {
    eventFn(tenantId, order);
  } catch (err) {
    logger.warn('Falha ao emitir evento', { tenantId, orderId: order?.id, error: err.message });
  }
};

// ── Processors ────────────────────────────────────────────────

const processors = {

  /**
   * create — Cria pedido com estoque atomico + auto-confirma.
   *
   * initialStatus: 'confirmed' — pedidos manuais entram direto na cozinha.
   * idempotencyKey: garante que o mesmo pedido nao seja criado duas vezes,
   *   mesmo que o job seja reprocessado por falha de infraestrutura.
   */
  async create(job) {
    const { tenantId, payload, idempotencyKey } = job.data;
    const meta = { jobId: job.id, idempotencyKey, tenantId };

    logger.info('Iniciando criacao de pedido', meta);

    return safe(async () => {
      const order = await service.createOrder(tenantId, {
        ...payload,
        initialStatus:  'confirmed',
        idempotencyKey,
      });

      logger.info('Pedido criado', {
        ...meta,
        orderId:     order.id,
        orderNumber: order.order_number,
        total:       order.total,
        items:       order.items?.length,
      });

      await applySideEffects(eventService.orderCreated, tenantId, order);
      return order;
    }, meta);
  },

  /**
   * updateStatus — Valida transicao e persiste novo status.
   */
  async updateStatus(job) {
    const { orderId, tenantId, status } = job.data;
    const meta = { jobId: job.id, orderId, tenantId, targetStatus: status };

    logger.info('Atualizando status do pedido', meta);

    return safe(async () => {
      const order = await service.updateStatus(orderId, tenantId, status);

      logger.info('Status atualizado', { ...meta, newStatus: order.status });

      await applySideEffects(eventService.orderUpdated, tenantId, order);
      return order;
    }, meta);
  },

  /**
   * cancel — Cancela pedido e devolve estoque se ja estava em producao.
   */
  async cancel(job) {
    const { orderId, tenantId } = job.data;
    const meta = { jobId: job.id, orderId, tenantId };

    logger.info('Cancelando pedido', meta);

    return safe(async () => {
      const order = await service.cancelOrder(orderId, tenantId);

      logger.info('Pedido cancelado e estoque devolvido', meta);

      // upsertOrder will HDEL because status = 'cancelled'
      await applySideEffects(eventService.orderUpdated, tenantId, order);
      return order;
    }, meta);
  },
};

// ── Worker factory ────────────────────────────────────────────

const createOrderWorker = () => {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const fn = processors[job.name];
      if (!fn) throw new Error(`Job desconhecido na fila "${QUEUE_NAME}": ${job.name}`);
      return fn(job);
    },
    {
      connection:  createRedisClient(),
      concurrency: CONCURRENCY,
    }
  );

  worker.on('completed', (job, result) => {
    if (result?.ok === false) {
      logger.warn('Job concluido com erro de negocio', {
        jobId:   job.id,
        name:    job.name,
        message: result.message,
      });
    } else {
      logger.debug('Job concluido', { jobId: job.id, name: job.name });
    }
  });

  worker.on('failed', (job, err) => {
    logger.error('Job falhou apos todas as tentativas', {
      jobId:   job?.id,
      name:    job?.name,
      attempt: job?.attemptsMade,
      error:   err.message,
    });
  });

  worker.on('error', (err) => {
    logger.error('Erro de conexao do worker', { error: err.message });
  });

  return worker;
};

module.exports = { createOrderWorker };
