/**
 * Extrai a mensagem legível de um erro de API axios.
 * Usado em todos os catch blocks do frontend.
 *
 * @param {unknown} err
 * @param {string}  fallback  mensagem quando não há nada melhor
 */
export const getApiError = (err, fallback = 'Ocorreu um erro') =>
  err?.response?.data?.message ?? err?.message ?? fallback;
