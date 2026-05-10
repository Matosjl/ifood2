/**
 * Erro operacional esperado pelo sistema.
 * Diferente de erros de programação (bugs), esses têm statusCode
 * e mensagem segura para expor ao cliente.
 */
class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode=500]
   * @param {object} [data={}] — dados extras retornados ao cliente (ex: whatsappLink)
   */
  constructor(message, statusCode = 500, data = {}) {
    super(message);
    this.statusCode    = statusCode;
    this.isOperational = true;
    this.data          = data;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
