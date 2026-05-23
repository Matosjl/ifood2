const { createServer }       = require('http');
const app                    = require('./app');
const env                    = require('./config/env');
const db                     = require('./config/database');
const { initSocket }         = require('./socket');
const { closeQueue }         = require('./queues/order.queue');
const { startMonitor }       = require('./services/healthMonitor');
const { startPolling: startIfoodPolling, stopPolling: stopIfoodPolling } = require('./modules/integrations/ifood.service');

const PORT = env.PORT;

const start = async () => {
  try {
    await db.testConnection();

    // Socket.io must attach to the raw http.Server, not Express directly
    const httpServer = createServer(app);
    initSocket(httpServer);

    httpServer.listen(PORT, () => {
      console.log(`
+-------------------------------------------+
|   SaaS Restaurant API                     |
|   Porta    : ${String(PORT).padEnd(28)}|
|   Ambiente : ${env.NODE_ENV.padEnd(28)}|
|   WebSocket: habilitado (Socket.io)       |
|   Health   : /health (DB + Redis + VPS2) |
+-------------------------------------------+
      `);

      // Inicia monitor de saúde (verifica a cada 60s, alerta no WhatsApp)
      startMonitor(60_000);

      // Inicia polling iFood (a cada 30s, só para tenants configurados)
      startIfoodPolling().catch((e) => console.warn('[iFood] Polling não iniciado:', e.message));
    });
  } catch (err) {
    console.error('[Server] Falha ao iniciar:', err.message);
    process.exit(1);
  }
};

// Graceful shutdown — close queue connections before exit
const shutdown = async (signal) => {
  console.log(`[Server] ${signal} recebido. Encerrando...`);
  stopIfoodPolling();
  await closeQueue();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start();
