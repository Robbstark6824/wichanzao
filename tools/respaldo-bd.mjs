// Respaldo completo de la base de la app, FUERA del repositorio.
//
//   node tools/respaldo-bd.mjs
//
// Guarda en C:\Proyectos\respaldos-wichanzao\<fecha_hora>\:
//   · datos/<esquema>.<tabla>.json — todas las filas de cada tabla de `public`
//     y de auth.users / auth.identities (para poder rehacer las cuentas).
//   · esquema.json — columnas, restricciones, índices, políticas RLS, permisos,
//     funciones, tipos y disparadores: lo necesario para reconstruir la base.
//   · storage.json — la lista de archivos del bucket (solo nombres y tamaños).
//   · resumen.txt — cuántas filas tiene cada tabla, para comparar a simple vista.
//
// El repositorio es PÚBLICO y el respaldo lleva DNI, nombres y teléfonos: por
// eso va a una carpeta hermana del proyecto y nunca dentro de él.
// Solo lee. No cambia nada en la base.
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const PASS = (env.match(/^SUPABASE_DB_PASSWORD=(.+)$/m) || [])[1];
if (!PASS) throw new Error('Falta SUPABASE_DB_PASSWORD en .env');

const client = new pg.Client({
  host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432, database: 'postgres',
  user: 'postgres.xqphjvppfgwabfruyjae', password: PASS.trim(),
  ssl: { rejectUnauthorized: false }
});

const d = new Date();
const p2 = n => String(n).padStart(2, '0');
const sello = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '_' + p2(d.getHours()) + p2(d.getMinutes());
const DEST = path.resolve(process.argv[2] || 'C:/Proyectos/respaldos-wichanzao', sello);
if (DEST.toLowerCase().startsWith(path.resolve('.').toLowerCase()))
  throw new Error('El respaldo no puede quedar dentro del repositorio: ' + DEST);
fs.mkdirSync(path.join(DEST, 'datos'), { recursive: true });

const q = async (sql, params) => (await client.query(sql, params)).rows;
const guardar = (nombre, obj) => fs.writeFileSync(path.join(DEST, nombre), JSON.stringify(obj, null, 1));

await client.connect();
try {
  const tablas = await q(`
    SELECT table_schema AS s, table_name AS t FROM information_schema.tables
     WHERE table_type = 'BASE TABLE'
       AND (table_schema = 'public' OR (table_schema = 'auth' AND table_name IN ('users','identities')))
     ORDER BY 1, 2`);

  const resumen = [];
  for (const { s, t } of tablas) {
    const filas = await q(`SELECT * FROM "${s}"."${t}"`);
    guardar('datos/' + s + '.' + t + '.json', filas);
    resumen.push(s + '.' + t + ': ' + filas.length);
  }

  guardar('esquema.json', {
    columnas: await q(`SELECT table_schema, table_name, column_name, ordinal_position, data_type, udt_name,
                              is_nullable, column_default
                         FROM information_schema.columns WHERE table_schema = 'public'
                        ORDER BY table_name, ordinal_position`),
    restricciones: await q(`SELECT conrelid::regclass::text AS tabla, conname, pg_get_constraintdef(oid) AS def
                              FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2`),
    indices: await q(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1, 2`),
    politicas: await q(`SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
                          FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY 1, 2, 3`),
    rls: await q(`SELECT relname, relrowsecurity FROM pg_class
                   WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY 1`),
    permisosTabla: await q(`SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
                             WHERE table_schema = 'public' ORDER BY 2, 1, 3`),
    permisosColumna: await q(`SELECT grantee, table_name, column_name, privilege_type
                                FROM information_schema.column_privileges
                               WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
                               ORDER BY 2, 1, 3, 4`),
    funciones: await q(`SELECT p.proname, pg_get_functiondef(p.oid) AS def FROM pg_proc p
                         WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' ORDER BY 1`),
    tipos: await q(`SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS valores
                      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
                     WHERE t.typnamespace = 'public'::regnamespace GROUP BY 1 ORDER BY 1`),
    disparadores: await q(`SELECT event_object_table, trigger_name, action_timing, event_manipulation, action_statement
                             FROM information_schema.triggers WHERE trigger_schema = 'public' ORDER BY 1, 2`)
  });

  const objetos = await q(`SELECT bucket_id, name, metadata->>'size' AS bytes, created_at, updated_at
                             FROM storage.objects ORDER BY bucket_id, name`);
  guardar('storage.json', objetos);
  resumen.push('storage.objects: ' + objetos.length + ' (solo la lista, no los archivos)');

  fs.writeFileSync(path.join(DEST, 'resumen.txt'),
    'Respaldo ' + d.toISOString() + '\n\n' + resumen.join('\n') + '\n');
  console.log('Respaldo en ' + DEST + '\n\n' + resumen.join('\n'));
} finally {
  await client.end();
}
