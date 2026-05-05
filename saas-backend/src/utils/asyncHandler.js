/**
 * Wrapper para route handlers assíncronos.
 * Evita try/catch repetitivo — qualquer erro rejeitado vai para o
 * next() e é tratado pelo errorHandler global.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
