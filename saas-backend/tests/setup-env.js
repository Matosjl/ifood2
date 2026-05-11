// Runs BEFORE any module is loaded (setupFiles).
// Carrega o .env real do projeto e sobrescreve apenas JWT e NODE_ENV.
// O banco usado é o MESMO de produção (saas_restaurant) — os dados de teste
// são isolados por UUID único e removidos no afterAll de cada suite.

const path = require('path');
const dotenv = require('dotenv');

// Carrega o .env do root do projeto (um nível acima de saas-backend)
const result = dotenv.config({ path: path.join(__dirname, '../../.env') });

// Se encontrou o arquivo, garante que DB_PASSWORD foi setado explicitamente
// (dotenv não sobrescreve vars já definidas, mas queremos ter certeza)
if (result.parsed) {
  if (result.parsed.DB_HOST)     process.env.DB_HOST     = result.parsed.DB_HOST;
  if (result.parsed.DB_PORT)     process.env.DB_PORT     = result.parsed.DB_PORT;
  if (result.parsed.DB_NAME)     process.env.DB_NAME     = result.parsed.DB_NAME;
  if (result.parsed.DB_USER)     process.env.DB_USER     = result.parsed.DB_USER;
  if (result.parsed.DB_PASSWORD) process.env.DB_PASSWORD = result.parsed.DB_PASSWORD;
  if (result.parsed.REDIS_URL)   process.env.REDIS_URL   = result.parsed.REDIS_URL;
}

// Sobrescreve apenas o que deve ser diferente em testes
process.env.NODE_ENV       = 'test';
process.env.JWT_SECRET     = 'test-jwt-secret-do-not-use-in-production';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-production';
process.env.SUPER_ADMIN_KEY    = 'test-admin-key';
// Nota: DB_NAME permanece como saas_restaurant — dados de teste são isolados
// por tenant_id UUID único e limpos no afterAll de cada suite.
