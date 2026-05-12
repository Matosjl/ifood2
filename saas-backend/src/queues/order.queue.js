const { Queue, QueueEvents } = require('bullmq');
const { createRedisClient } = require('../config/redis');
const AppError = require('../utils/AppError');

const QUEUE_NAME = 'orders';
const JOB_TIMEOUT_MS = 30_000;

let _queue = null;
let _events = null;

const getQueue = () => {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: createRedisClient(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { count: 100 },
        removeOnFail:    { count: 50 },
      },
    });
  }
  return _queue;
};

const getQueueEvents = () => {
  if (!_events) {
    _events = new QueueEvents(QUEUE_NAME, { connection: createRedisClient() });
  }
  return _events;
};

/**
 * Adds a job, waits for completion, and returns the result data.
 *
 * Workers signal operational errors (AppError) by returning
 *   { ok: false, statusCode, message }
 * instead of throwing, so BullMQ does NOT retry client mistakes.
 * Infrastructure errors (DB down, etc.) are thrown in the worker and retried.
 *
 * @param {string} [opts.idempotencyKey] - when set, used as BullMQ jobId;
 *   BullMQ deduplicates jobs with the same ID that are still in-flight or
 *   recently completed. DB-level UNIQUE constraint handles the rest.
 */
const enqueueAndWait = async (name, data, { idempotencyKey } = {}) => {
  const jobOpts = idempotencyKey ? { jobId: idempotencyKey } : {};
  const job = await getQueue().add(name, data, jobOpts);
  const result = await job.waitUntilFinished(getQueueEvents(), JOB_TIMEOUT_MS);

  if (result && result.ok === false) {
    throw new AppError(result.message, result.statusCode);
  }

  return result.data ?? result;
};

const closeQueue = async () => {
  await Promise.allSettled([
    _queue  && _queue.close(),
    _events && _events.close(),
  ]);
  _queue  = null;
  _events = null;
};

module.exports = { getQueue, getQueueEvents, enqueueAndWait, closeQueue };
