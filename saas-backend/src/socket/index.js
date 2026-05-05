const { Server }         = require('socket.io');
const { createAdapter }  = require('@socket.io/redis-adapter');
const jwt                = require('jsonwebtoken');
const env                = require('../config/env');
const { createRedisClient } = require('../config/redis');
const { createLogger }   = require('../utils/logger');
const orderCache         = require('../cache/orderCache');

const logger = createLogger('Socket');

let _io = null;

// ── JWT middleware ────────────────────────────────────────────

const authMiddleware = (socket, next) => {
  // Accept token from: socket.handshake.auth.token  OR  Authorization header
  const raw =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

  if (!raw) {
    logger.warn('Conexao rejeitada: token ausente', { ip: socket.handshake.address });
    return next(new Error('AUTH_REQUIRED'));
  }

  try {
    const payload  = jwt.verify(raw, env.JWT_SECRET);
    socket.tenantId = payload.tenantId;
    socket.userId   = payload.sub;
    socket.role     = payload.role;
    next();
  } catch {
    logger.warn('Conexao rejeitada: token invalido', { ip: socket.handshake.address });
    next(new Error('AUTH_INVALID'));
  }
};

// ── Initialization ────────────────────────────────────────────

/**
 * Attaches Socket.io to an existing Node http.Server.
 * Must be called once before the server starts listening.
 */
const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin:      env.CORS_ORIGINS,
      credentials: true,
    },
    transports:    ['websocket', 'polling'],
    pingTimeout:   20_000,
    pingInterval:  10_000,
  });

  // Redis pub/sub adapter — enables horizontal scaling across API instances
  const pubClient = createRedisClient();
  const subClient = createRedisClient();
  io.adapter(createAdapter(pubClient, subClient));

  io.use(authMiddleware);

  io.on('connection', async (socket) => {
    const { tenantId, userId, role } = socket;
    logger.info('Cliente conectado', {
      socketId: socket.id, tenantId, userId, role,
    });

    // Every client joins its own tenant room — events are scoped per restaurant
    socket.join(`tenant:${tenantId}`);

    // Send active-orders snapshot so the board renders immediately,
    // without a separate REST call from the frontend
    try {
      const cached = await orderCache.getActiveOrders(tenantId);
      socket.emit('orders:active', {
        data:      cached,
        timestamp: new Date().toISOString(),
      });
      logger.debug('Snapshot enviado', { tenantId, count: cached.length });
    } catch (err) {
      logger.warn('Falha ao enviar snapshot', { tenantId, error: err.message });
    }

    socket.on('disconnect', (reason) => {
      logger.info('Cliente desconectado', {
        socketId: socket.id, tenantId, reason,
      });
    });
  });

  _io = io;
  logger.info('Socket.io inicializado com Redis adapter');
  return io;
};

// ── Accessor ──────────────────────────────────────────────────

const getIO = () => {
  if (!_io) throw new Error('[Socket] Nao inicializado — chame initSocket(httpServer) primeiro');
  return _io;
};

module.exports = { initSocket, getIO };
