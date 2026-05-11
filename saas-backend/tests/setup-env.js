// Runs BEFORE any module is loaded (setupFiles).
// Carrega o .env real do projeto para pegar DB_PASSWORD, DB_HOST, DB_USER,
// depois sobrescreve apenas o que precisa ser diferente nos testes.

const path = require('path');

// Carrega o .env do root do projeto (um nível acima de saas-backend)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Sobrescreve para o ambiente de teste
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-production';
// Banco de teste separado — DB_HOST, DB_USER e DB_PASSWORD vêm do .env real
process.env.DB_NAME = 'saas_restaurant_test';
process.env.SUPER_ADMIN_KEY = 'test-admin-key';
