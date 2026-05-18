/**
 * Retry com backoff exponencial.
 *
 * Uso:
 *   const result = await retryWithBackoff(() => aiEngine.post(...), { maxAttempts: 3, baseDelayMs: 1000 });
 *
 * Tentativas: 1ª imediata, 2ª após 1s, 3ª após 2s, 4ª após 4s...
 * Se todas falharem, relança o último erro.
 */
async function retryWithBackoff(fn, options = {}) {
  const { maxAttempts = 3, baseDelayMs = 1000 } = options;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) break;

      // Backoff: 1s → 2s → 4s → ...
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw lastError;
}

module.exports = { retryWithBackoff };
