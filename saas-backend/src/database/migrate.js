const fs   = require('fs');
const path = require('path');
const db   = require('../config/database');

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('[Migrate] Aplicando schema...');
  await db.query(sql);
  console.log('[Migrate] Schema aplicado com sucesso.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('[Migrate] Erro:', err.message);
  process.exit(1);
});
