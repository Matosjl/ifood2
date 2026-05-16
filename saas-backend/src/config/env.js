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
  JWT_EXPIRES_IN:         process.env.JWT_EXPIRES_IN         || '8h',
  JWT_REFRESH_SECRET:     required('JWT_REFRESH_SECRET'),
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // CORS
  CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim()),

  // Super Admin
  SUPER_ADMIN_KEY: process.env.SUPER_ADMIN_KEY || 'change-me-super-secret-key',

  // AI Engine (VPS2)
  VPS2_URL:         process.env.VPS2_URL         || 'http://69.10.43.169:3001',
  AI_ENGINE_KEY:    process.env.AI_ENGINE_KEY    || '',  // chave para chamar VPS2
  INTERNAL_KEY:     process.env.INTERNAL_KEY     || '',  // chave que VPS2 usa para chamar VPS1

  // Evolution API
  EVOLUTION_API_URL: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
  EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY || '',

  isDev:  () => process.env.NODE_ENV !== 'production',
  isProd: () => process.env.NODE_ENV === 'production',
};
