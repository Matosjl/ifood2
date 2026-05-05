require('dotenv').config();

const { createOrderWorker } = require('./order.worker');

const worker = createOrderWorker();

console.log('[Worker] Iniciado. Aguardando jobs na fila "orders"...');

const shutdown = async (signal) => {
  console.log(`[Worker] ${signal} recebido. Encerrando worker graciosamente...`);
  await worker.close();
  console.log('[Worker] Encerrado.');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
