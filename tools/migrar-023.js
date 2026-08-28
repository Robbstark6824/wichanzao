// Aplica sql/023-origen-y-autoria.sql
const { Client } = require('pg');
const fs = require('fs');

const c = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432, database: 'postgres',
  user: 'postgres.xqphjvppfgwabfruyjae', password: 'Nomejodas682425@',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();
  const sql = fs.readFileSync('sql/023-origen-y-autoria.sql', 'utf8');
  const r = await c.query(sql);
  const last = Array.isArray(r) ? r[r.length - 1] : r;
  console.log('Migración aplicada. Origen actual:', JSON.stringify(last.rows));
  const col = await c.query(
    "select column_name, data_type from information_schema.columns where table_name='pacientes' and column_name in ('origen','created_by')"
  );
  console.log('Columnas de trazabilidad:', JSON.stringify(col.rows));
  await c.end();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
