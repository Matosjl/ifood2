const env = require('../config/env');

/**
 * Creates a structured logger bound to a context label.
 * Dev: human-readable one-liner.  Prod: JSON (pipe to log aggregator).
 */
const createLogger = (context) => {
  const write = (level, message, meta = {}) => {
    const entry = {
      ts:    new Date().toISOString(),
      level,
      ctx:   context,
      msg:   message,
      ...meta,
    };

    const out = env.isProd()
      ? JSON.stringify(entry)
      : `${entry.ts} ${level.toUpperCase().padEnd(5)} [${context}] ${message}` +
        (Object.keys(meta).length ? '  ' + JSON.stringify(meta) : '');

    if (level === 'error') console.error(out);
    else if (level === 'warn')  console.warn(out);
    else                        console.log(out);
  };

  return {
    info:  (msg, meta) => write('info',  msg, meta),
    warn:  (msg, meta) => write('warn',  msg, meta),
    error: (msg, meta) => write('error', msg, meta),
    debug: (msg, meta) => { if (env.isDev()) write('debug', msg, meta); },
  };
};

module.exports = { createLogger };
