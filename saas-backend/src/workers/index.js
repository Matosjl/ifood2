require('dotenv').config();

const { createOrderWorker }                         = require('./order.worker');
const { createAutomationWorker, createAutomationScheduler } = require('./automation.worker');

const orderWorker = createOrderWorker();
console.log('[Worker] Fila "orders" ativa. Aguardando jobs...');

let automationWorker;
let automationQueue;

createAutomationScheduler()
  .then((queue) => {
    automationQueue  = queue;
    automationWorker = createAutomationWorker();
    console.log('[Worker] Automation Engine ativo. Jobs agendados.');
  })
  .catch((err) => {
    console.error('[Worker] Falha ao iniciar Automation Engine:', err.message);
    // Não mata o processo — orders continuam funcionando
  });

const shutdown = async (signal) => {
  console.log(`[Worker] ${signal} recebido. Encerrando workers graciosamente...`);
  await Promise.allSettled([
    orderWorker.close(),
    automationWorker?.close(),
    automationQueue?.close(),
  ]);
  console.log('[Worker] Encerrado.');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
