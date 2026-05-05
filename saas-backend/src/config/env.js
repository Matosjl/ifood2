require('dotenv').config();

const required = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Variavel de ambiente obrigatoria nao definida: ${key}`);
  return value;
};

module.exports = {
  NODE_ENV:               process.env.NODE_ENV || 'development',
  PORT:                   parseInt(process.env.PORT || '3000', 10),

  // Database
  DB_HOST:                process.env.DB_HOST || 'localhost',
  DB_PORT:                parseInt(process.env.DB_PORT || '5432', 10),
  DB_NAME:                process.env.DB_NAME || 'saas_restaurant',
  DB_USER:                process.env.DB_USER || 'postgres',
  DB_PASSWORD:            process.env.DB_PASSWORD || '',

  // Redis / BullMQ
  REDIS_URL:              process.env.REDIS_URL || 'redis://localhost:6379',

  // JWT
  JWT_SECRET:             required('JWT_SECRET'),
  JWT_EXPIRES_IN:         process.env.JWT_EXPIRES_IN         || '15m',
  JWT_REFRESH_SECRET:     required('JWT_REFRESH_SECRET'),
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // CORS
  CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim()),

  isDev:  () => process.env.NODE_ENV !== 'production',
  isProd: () => process.env.NODE_ENV === 'production',
};
