const bcrypt = require('/app/node_modules/bcryptjs');
const db = require('/app/src/config/database');
bcrypt.hash('independencia123', 10).then(hash => {
  console.log('hash gerado:', hash.substring(0,20) + '...');
  return db.query('UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING email', [hash, 'dono@independenciaexpress.com.br']);
}).then(r => { console.log('Senha atualizada:', r.rows[0].email); process.exit(0); })
.catch(e => { console.error('ERRO:', e.message); process.exit(1); });
