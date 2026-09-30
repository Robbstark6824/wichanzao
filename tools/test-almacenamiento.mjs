// Prueba qué puede hacer cada tipo de usuario con el almacenamiento
// (bucket `documentos`), SIN guardar nada: cada caso corre dentro de una
// transacción que termina en ROLLBACK, con los mismos roles de Supabase.
//
//   node tools/test-almacenamiento.mjs
//
// Y, por HTTP real y solo lectura, que los archivos siguen descargándose por su
// enlace público (recetas, instalador del agente): cerrar escritura y listado
// no debe romper nada de eso.
import fs from 'fs';
import pg from 'pg';

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const PASS = env.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)[1].trim();
const c = new pg.Client({
  host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432, database: 'postgres',
  user: 'postgres.xqphjvppfgwabfruyjae', password: PASS, ssl: { rejectUnauthorized: false }
});
await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;

const uid = (await q(`SELECT id FROM workers WHERE NOT is_admin LIMIT 1`))[0].id;
const nombreReal = (await q(`SELECT name FROM storage.objects WHERE bucket_id = 'documentos' AND name ~ '^ginecologia/workers/[^/]+/\\d{4}-\\d{2}-\\d{2}/' LIMIT 1`))[0].name;

let fallas = 0;
const ver = (d, ok, x) => { if (!ok) fallas++; console.log((ok ? '  OK    ' : '  FALLA ') + d + (x !== undefined ? '   ->  ' + x : '')); };

async function como(rol, fn) {
  await c.query('BEGIN');
  try {
    if (rol === 'authenticated') {
      await c.query(`SELECT set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' }), uid]);
    }
    await c.query('SET LOCAL ROLE ' + rol);
    await fn(async (sql, p) => {
      await c.query('SAVEPOINT s');
      try { const r = await c.query(sql, p); await c.query('RELEASE SAVEPOINT s'); return r; }
      catch (e) { await c.query('ROLLBACK TO SAVEPOINT s'); return { error: e.message }; }
    });
  } finally { await c.query('ROLLBACK'); }
}
const cuenta = r => r.error ? 'error' : +r.rows[0].count;
const total = +(await q(`SELECT count(*) FROM storage.objects WHERE bucket_id = 'documentos'`))[0].count;

console.log('SIN CUENTA (rol anon, con la clave pública de la app)');
await como('anon', async db => {
  ver('NO puede listar los archivos', cuenta(await db(`SELECT count(*) FROM storage.objects WHERE bucket_id = 'documentos'`)) === 0);
  const i = await db(`INSERT INTO storage.objects (bucket_id, name) VALUES ('documentos', 'PRUEBA/no-guardar.txt')`);
  ver('NO puede subir un archivo', !!i.error, i.error ? i.error.slice(0, 55) : 'se subió');
  const u = await db(`UPDATE storage.objects SET name = name WHERE bucket_id = 'documentos'`);
  ver('NO puede modificar archivos', !!u.error || u.rowCount === 0, u.error || u.rowCount + ' filas');
});
// Borrar: Supabase no deja borrar por SQL directo (solo por su API), así que se
// mira lo que decide la API: qué políticas tiene el rol anon.
const politicas = await q(`SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'`);
const deAnon = politicas.filter(p => String(p.roles).includes('anon'));
ver('NO queda ninguna política para el rol anon (ni borrar, ni subir, ni listar)', deAnon.length === 0, deAnon.map(p => p.cmd + ' ' + p.policyname).join(', '));
ver('siguen las de los usuarios con sesión (listar, subir, modificar, borrar)', ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].every(cmd => politicas.some(p => p.cmd === cmd && /^allow_/.test(p.policyname))), politicas.filter(p => /^allow_/.test(p.policyname)).map(p => p.cmd).join(','));

console.log('\nCON SESIÓN (un usuario de la app)');
await como('authenticated', async db => {
  ver('lista todos los archivos', cuenta(await db(`SELECT count(*) FROM storage.objects WHERE bucket_id = 'documentos'`)) === total, total);
  const i = await db(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('documentos', 'PRUEBA/no-guardar.txt', $1)`, [uid]);
  ver('puede subir un archivo', !i.error, i.error);
  const u = await db(`UPDATE storage.objects SET name = name WHERE bucket_id = 'documentos' AND name = $1`, [nombreReal]);
  ver('puede modificar archivos', !u.error && u.rowCount === 1, u.error || u.rowCount);
});

await c.end();

console.log('\nDESCARGA POR ENLACE PÚBLICO (HTTP real, solo cabeceras)');
const SB = 'https://xqphjvppfgwabfruyjae.supabase.co';
async function cabecera(objeto) {
  const r = await fetch(SB + '/storage/v1/object/public/documentos/' + objeto, { method: 'HEAD' });
  return r.status;
}
const objs = await fetch(SB + '/rest/v1/impresiones?select=objeto&limit=1', { headers: { apikey: env.match(/SUPABASE_SERVICE_ROLE_KEY=(\S+)/)[1], Authorization: 'Bearer ' + env.match(/SUPABASE_SERVICE_ROLE_KEY=(\S+)/)[1] } }).then(r => r.json());
if (objs[0]) ver('una receta PDF se descarga por su enlace', await cabecera(objs[0].objeto) === 200, objs[0].objeto);
ver('el instalador del agente se descarga por su enlace', await cabecera('herramientas/agente-impresion-recetas-v7.zip') === 200);

console.log('\n' + (fallas ? fallas + ' FALLA(S)' : 'Todo en orden.'));
process.exitCode = fallas ? 1 : 0;
