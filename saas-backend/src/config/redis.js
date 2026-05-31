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

/**
 * Cache singleton para uso geral (health score, etc.)
 * Separado do BullMQ para não compartilhar configurações.
 */
let _cacheClient = null;
const getCacheClient = () => {
  if (!_cacheClient) {
    _cacheClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    _cacheClient.on('error', (err) => {
      // Cache falha não deve derrubar a aplicação
      console.warn('[Redis cache] erro (non-fatal):', err.message);
    });
  }
  return _cacheClient;
};

/**
 * Cache helper: get/set com TTL e fallback automático se Redis indisponível.
 * @param {string} key
 * @param {number} ttlSeconds
 * @param {Function} fetchFn — chamada quando cache miss
 */
const withCache = async (key, ttlSeconds, fetchFn) => {
  const redis = getCacheClient();
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch { /* cache miss — continua */ }

  const result = await fetchFn();

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(result));
  } catch { /* falha silenciosa */ }

  return result;
};

module.exports = { createRedisClient, getCacheClient, withCache };
