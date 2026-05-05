const { Redis } = require('ioredis');
const env = require('./env');

/**
 * Creates a new ioredis client configured for BullMQ.
 * BullMQ requires maxRetriesPerRequest: null on every connection it owns.
 */
const createRedisClient = (opts = {}) =>
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...opts,
  });

module.exports = { createRedisClient };
