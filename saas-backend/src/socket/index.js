const { Server }         = require('socket.io');
const { createAdapter }  = require('@socket.io/redis-adapter');
const jwt                = require('jsonwebtoken');
const env                = require('../config/env');
const { createRedisClient } = require('../config/redis');
const { createLogger }   = require('../utils/logger');
const orderCache         = require('../cache/orderCache');
const db                 = require('../config/database');

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

    // ── Driver connection ────────────────────────────────────
    if (role === 'driver') {
      const driverId = userId;

      // Driver joins their own personal room
      socket.join(`driver:${driverId}`);

      // Fetch all tenant IDs this driver is connected to
      const getTenantIds = async () => {
        try {
          const { rows } = await db.query(
            'SELECT tenant_id FROM driver_tenant_connections WHERE driver_id = $1',
            [driverId]
          );
          return rows.map((r) => r.tenant_id);
        } catch (err) {
          logger.warn('Falha ao buscar tenants do driver', { driverId, error: err.message });
          return [];
        }
      };

      // Location update from driver
      socket.on('driver:location', async ({ lat, lng }) => {
        if (lat == null || lng == null) return;

        // Persist to DB (fire-and-forget)
        db.query(
          'UPDATE drivers SET current_lat = $1, current_lng = $2, updated_at = NOW() WHERE id = $3',
          [lat, lng, driverId]
        ).catch((err) => logger.warn('Falha ao persistir localização do driver', { driverId, error: err.message }));

        // Broadcast location to all restaurant tenant rooms this driver serves
        const tenantIds = await getTenantIds();
        for (const tid of tenantIds) {
          io.to(`tenant:${tid}`).emit('driver:location', {
            driverId,
            lat,
            lng,
            timestamp: new Date().toISOString(),
          });
        }
      });

      socket.on('disconnect', async (reason) => {
        logger.info('Driver desconectado', { socketId: socket.id, driverId, reason });

        // Mark driver offline and notify tenant rooms
        db.query(
          "UPDATE drivers SET status = 'offline', updated_at = NOW() WHERE id = $1",
          [driverId]
        ).catch(() => {});

        const tenantIds = await getTenantIds();
        for (const tid of tenantIds) {
          io.to(`tenant:${tid}`).emit('driver:offline', {
            driverId,
            timestamp: new Date().toISOString(),
          });
        }
      });

      return; // Skip restaurant staff logic for drivers
    }

    // ── Restaurant staff connection ───────────────────────────

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
