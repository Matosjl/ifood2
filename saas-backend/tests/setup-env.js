// Runs BEFORE any module is loaded (setupFiles).
// Sets all environment variables needed by src/config/env.js and the app.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-production';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'saas_restaurant_test';
process.env.DB_USER = process.env.DB_USER || 'saas_user';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'saas_pass';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.SUPER_ADMIN_KEY = 'test-admin-key';
