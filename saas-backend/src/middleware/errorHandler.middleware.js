const env = require('../config/env');

/**
 * Middleware global de tratamento de erros.
 * Deve ser o último middleware registrado no app.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Erro operacional conhecido
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      // Inclui dados extras (ex: whatsappLink para erros 402)
      ...(err.data && Object.keys(err.data).length > 0 && { data: err.data }),
    });
  }

  // Erros do PostgreSQL
  if (err.code) {
    const pgErrors = {
      '23505': { status: 409, message: 'Registro duplicado. Verifique os dados enviados.' },
      '23503': { status: 400, message: 'Referência inválida. Registro relacionado não encontrado.' },
      '22P02': { status: 400, message: 'Formato de dado inválido.' },
    };
    const mapped = pgErrors[err.code];
    if (mapped) {
      return res.status(mapped.status).json({ success: false, message: mapped.message });
    }
  }

  // Erro inesperado de programação — captura no Sentry se disponível
  if (process.env.SENTRY_DSN) {
    try { require('@sentry/node').captureException(err); } catch (_) {}
  }
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);

  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor. Tente novamente.',
    ...(env.isDev() && { stack: err.stack }),
  });
};

module.exports = errorHandler;
