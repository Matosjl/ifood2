const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  host:     env.DB_HOST,
  port:     env.DB_PORT,
  database: env.DB_NAME,
  user:     env.DB_USER,
  password: env.DB_PASSWORD,
  max: 20,                      // máximo de conexões no pool
  idleTimeoutMillis:  30_000,   // fecha conexão ociosa após 30s
  connectionTimeoutMillis: 3_000,
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool PostgreSQL:', err.message);
  process.exit(1);
});

/**
 * Executa uma query simples usando o pool.
 * Para transações, use `getClient()`.
 */
const query = (text, params) => pool.query(text, params);

/**
 * Obtém um client do pool para uso em transações.
 * Lembre de chamar client.release() no finally.
 *
 * Padrão:
 *   const client = await db.getClient();
 *   try {
 *     await client.query('BEGIN');
 *     ...
 *     await client.query('COMMIT');
 *   } catch (err) {
 *     await client.query('ROLLBACK');
 *     throw err;
 *   } finally {
 *     client.release();
 *   }
 */
const getClient = () => pool.connect();

const testConnection = async () => {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('[DB] PostgreSQL conectado com sucesso.');
  } finally {
    client.release();
  }
};

module.exports = { query, getClient, testConnection };
