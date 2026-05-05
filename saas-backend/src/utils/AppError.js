/**
 * Erro operacional esperado pelo sistema.
 * Diferente de erros de programação (bugs), esses têm statusCode
 * e mensagem segura para expor ao cliente.
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode  = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
