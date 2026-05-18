/**
 * Request Logger — substitui o morgan com logs estruturados.
 *
 * Em prod: uma linha JSON por request com método, path, status e ms.
 * Em dev:  one-liner colorível pelo terminal.
 *
 * Skipa /health para não poluir os logs com o polling do uptime.
 */

const { createLogger } = require('../utils/logger');

const logger = createLogger('http');

module.exports = function requestLogger(req, res, next) {
  // Não loga health checks (poluem muito)
  if (req.path === '/health') return next();

  const start = Date.now();

  res.on('finish', () => {
    const ms   = Date.now() - start;
    const meta = {
      method: req.method,
      path:   req.path,
      status: res.statusCode,
      ms,
      ip:     req.ip,
      // Inclui tenantId se autenticado (útil para debug multi-tenant)
      ...(req.user?.tenantId ? { tenantId: req.user.tenantId } : {}),
    };

    const line = `${req.method} ${req.path} ${res.statusCode} ${ms}ms`;

    if (res.statusCode >= 500)      logger.error(line, meta);
    else if (res.statusCode >= 400) logger.warn(line, meta);
    else                            logger.info(line, meta);
  });

  next();
};
