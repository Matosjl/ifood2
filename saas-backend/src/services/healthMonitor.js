/**
 * Health Monitor
 *
 * 1. runChecks()    — verifica DB, Redis e VPS2. Usado pelo endpoint /health.
 * 2. startMonitor() — loop a cada 60s. Envia alerta WhatsApp em transições down/up.
 *
 * Inicie em server.js:
 *   require('./services/healthMonitor').startMonitor();
 */

const db                   = require('../config/database');
const { createRedisClient } = require('../config/redis');
const { sendAlert }        = require('./alert.service');
const { createLogger }     = require('../utils/logger');

const logger = createLogger('healthMonitor');

// Estado anterior para detectar transições (true = saudável)
const prevOk = { db: true, redis: true, vps2: true };

// Redis dedicado ao health check (lazyConnect, 1 retry apenas)
let _redis = null;
const getRedis = () => {
  if (!_redis) {
    _redis = createRedisClient({ maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 3000 });
    _redis.on('error', () => {}); // silencia erros de reconexão do ioredis
  }
  return _redis;
};

// ── Checks individuais ─────────────────────────────────────────

async function checkDb() {
  try {
    await db.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function checkRedis() {
  try {
    const pong = await getRedis().ping();
    return { ok: pong === 'PONG' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function checkVps2() {
  // Em CI (HEALTH_SKIP_VPS2=true), VPS2 não está acessível — skip explícito.
  if (process.env.HEALTH_SKIP_VPS2 === 'true') return { ok: true };
  try {
    // Reutiliza a função já existente no ai.service (timeout 5s interno)
    const aiService = require('./ai.service');
    const ok = await aiService.isHealthy();
    return { ok };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── API pública ────────────────────────────────────────────────

/**
 * Executa todos os checks em paralelo.
 * Retorna: { db, redis, vps2 } onde cada valor é { ok: bool, error?: string }
 */
async function runChecks() {
  const [db, redis, vps2] = await Promise.all([
    checkDb(),
    checkRedis(),
    checkVps2(),
  ]);
  return { db, redis, vps2 };
}

/**
 * Inicia o loop de monitoramento.
 * Chame uma vez ao subir o servidor.
 */
async function startMonitor(intervalMs = 60_000) {
  const tick = async () => {
    let checks;
    try {
      checks = await runChecks();
    } catch (err) {
      logger.error('Erro inesperado no health monitor', { error: err.message });
      return;
    }

    const allOk = Object.values(checks).every((c) => c.ok);

    if (allOk) {
      logger.debug('Health ok', { db: true, redis: true, vps2: true });
    } else {
      const failures = Object.entries(checks)
        .filter(([, v]) => !v.ok)
        .map(([k]) => k)
        .join(', ');
      logger.warn(`Health degradado: ${failures}`, checks);
    }

    // Detecta transições e envia alertas
    for (const [service, result] of Object.entries(checks)) {
      if (!result.ok && prevOk[service]) {
        // Caiu agora
        const msg =
          `⚠️ *ZapFome ALERTA*\n\n` +
          `🔴 *${service.toUpperCase()} está DOWN!*\n` +
          `${result.error ? `Erro: ${result.error}\n` : ''}` +
          `\n_${new Date().toLocaleString('pt-BR')}_\n` +
          `ssh root@153.75.246.234`;
        sendAlert(`${service}_down`, msg);
      } else if (result.ok && !prevOk[service]) {
        // Voltou
        const msg =
          `✅ *ZapFome RECUPERADO*\n\n` +
          `🟢 *${service.toUpperCase()} voltou ao normal.*\n` +
          `_${new Date().toLocaleString('pt-BR')}_`;
        sendAlert(`${service}_up`, msg);
        logger.info(`${service} recuperado`);
      }
      prevOk[service] = result.ok;
    }
  };

  // Primeira verificação após 10s (tempo para servidor subir completamente)
  setTimeout(async () => {
    await tick();
    setInterval(tick, intervalMs);
  }, 10_000);

  logger.info('Health monitor iniciado', { intervalMs });
}

module.exports = { runChecks, startMonitor };
