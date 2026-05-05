const { Emitter } = require('@socket.io/redis-emitter');
const { createRedisClient } = require('../config/redis');

/**
 * Singleton redis-emitter used by any process (API or Worker) to publish
 * Socket.io events without holding a Socket.io server instance.
 *
 * The @socket.io/redis-adapter on the API server picks these up and
 * forwards them to connected browsers via the matching tenant room.
 */
let _emitter = null;

const getEmitter = () => {
  if (!_emitter) {
    _emitter = new Emitter(createRedisClient());
  }
  return _emitter;
};

module.exports = { getEmitter };
