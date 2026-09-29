// Aplica un archivo SQL a la base de la app y muestra lo que devuelve.
//
//   node tools/aplicar-sql.mjs sql/031-multiservicio-base.sql
//
// El archivo maneja su propia transacción (BEGIN/COMMIT): si una sentencia
// falla, Postgres deshace todo lo anterior. Antes de una migración, respaldo:
// node tools/respaldo-bd.mjs
import fs from 'fs';
import pg from 'pg';

const archivo = process.argv[2];
if (!archivo) throw new Error('Uso: node tools/aplicar-sql.mjs <archivo.sql>');

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const PASS = (env.match(/^SUPABASE_DB_PASSWORD=(.+)$/m) || [])[1];
if (!PASS) throw new Error('Falta SUPABASE_DB_PASSWORD en .env');

const client = new pg.Client({
  host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432, database: 'postgres',
  user: 'postgres.xqphjvppfgwabfruyjae', password: PASS.trim(),
  ssl: { rejectUnauthorized: false }
});

await client.connect();
try {
  const res = await client.query(fs.readFileSync(archivo, 'utf8'));
  for (const r of [].concat(res)) if (r.rows && r.rows.length) console.table(r.rows);
  console.log('✓ ' + archivo + ' aplicado.');
} catch (e) {
  console.error('✗ ' + archivo + ' falló (no quedó nada a medias si el archivo usa BEGIN/COMMIT):\n  ' + e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
