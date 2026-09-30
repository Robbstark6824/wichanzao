// Respaldo completo de la app, FUERA del repositorio.
//
//   node tools/respaldo-bd.mjs                 a mano, con todo el detalle en pantalla
//   node tools/respaldo-bd.mjs --programado    lo que corre cada noche (registra en respaldo.log)
//   opciones: --retener=30   cuántos respaldos con fecha se conservan (por defecto 30)
//             <carpeta>      otra carpeta base (por defecto C:\Proyectos\respaldos-wichanzao)
//
// Guarda en C:\Proyectos\respaldos-wichanzao\<fecha_hora>\:
//   · datos/<esquema>.<tabla>.json — todas las filas de cada tabla de `public`
//     y de auth.users / auth.identities (para poder rehacer las cuentas).
//   · esquema.json — columnas, restricciones, índices, políticas RLS, permisos,
//     funciones, tipos y disparadores: lo necesario para reconstruir la base.
//   · storage.json — la lista de archivos del bucket (solo nombres y tamaños).
//   · hojas/ — los Excel de gineco y de Cirugía General tal como están (xlsx).
//   · resumen.txt — cuántas filas tiene cada tabla, para comparar a simple vista.
//
// Y, aparte de las carpetas con fecha, UN espejo de los archivos del bucket:
//   storage-espejo/<ruta del archivo>   más _indice.json
//   Es incremental (cada noche baja solo lo nuevo o cambiado) y NUNCA borra: si
//   alguien borra un documento por error, sigue ahí. Ocupa ~120 MB, no 120 MB x30.
//
// Las carpetas con fecha se podan solas: quedan las últimas --retener. Una carpeta
// con un archivo _conservar.txt adentro no se toca (las pruebas usan una).
//
// El repositorio es PÚBLICO y el respaldo lleva DNI, nombres y teléfonos: por
// eso va a una carpeta hermana del proyecto y nunca dentro de él.
// Solo lee. No cambia nada en la base.
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { execFileSync } from 'child_process';

const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const PASS = (env.match(/^SUPABASE_DB_PASSWORD=(.+)$/m) || [])[1];
if (!PASS) throw new Error('Falta SUPABASE_DB_PASSWORD en .env');

const client = new pg.Client({
  host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432, database: 'postgres',
  user: 'postgres.xqphjvppfgwabfruyjae', password: PASS.trim(),
  ssl: { rejectUnauthorized: false }
});

const args = process.argv.slice(2);
const PROGRAMADO = args.includes('--programado');
const RETENER = parseInt((args.find(a => a.startsWith('--retener=')) || '--retener=30').split('=')[1], 10) || 30;
const BASE = path.resolve(args.find(a => !a.startsWith('--')) || 'C:/Proyectos/respaldos-wichanzao');
const d = new Date();
const p2 = n => String(n).padStart(2, '0');
const sello = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '_' + p2(d.getHours()) + p2(d.getMinutes());
const DEST = path.join(BASE, sello);
if (DEST.toLowerCase().startsWith(path.resolve('.').toLowerCase()))
  throw new Error('El respaldo no puede quedar dentro del repositorio: ' + DEST);
fs.mkdirSync(path.join(DEST, 'datos'), { recursive: true });

const SB_URL = 'https://xqphjvppfgwabfruyjae.supabase.co';
const SERVICE_KEY = (env.match(/^SUPABASE_SERVICE_ROLE_KEY=(\S+)/m) || [])[1];
const HOJAS = { 'gineco-hoja-antigua': '1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU', 'cirugia-general': '1XsoXl-4mv0CY1sSYi7MrLmf671rvoWC6Uf9xfXLngkc' };
const avisos = [];
const registrar = linea => {
  const t = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  try { fs.appendFileSync(path.join(BASE, 'respaldo.log'), t + '  ' + linea + '\n'); } catch (e) {}
};

const q = async (sql, params) => (await client.query(sql, params)).rows;
const guardar = (nombre, obj) => fs.writeFileSync(path.join(DEST, nombre), JSON.stringify(obj, null, 1));

let objetos = [];
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

  objetos = await q(`SELECT bucket_id, name, metadata->>'size' AS bytes, created_at, updated_at
                       FROM storage.objects ORDER BY bucket_id, name`);
  guardar('storage.json', objetos);
  resumen.push('storage.objects: ' + objetos.length + ' (solo la lista, no los archivos)');

  // Los Excel de los dos servicios (enlaces con permiso de lectura). Si Google
  // devolviera otra cosa que un xlsx (permiso quitado), se avisa y se sigue.
  fs.mkdirSync(path.join(DEST, 'hojas'), { recursive: true });
  for (const [nombre, id] of Object.entries(HOJAS)) {
    // curl y no fetch: el fetch de Node no conecta de forma fiable con Google en
    // esta PC (falla al azar); curl sí. Hasta 3 intentos.
    const destino = path.join(DEST, 'hojas', nombre + '.xlsx');
    let ok = false, motivo = '';
    for (let i = 0; i < 3 && !ok; i++) {
      try {
        execFileSync('curl', ['-sL', '-f', '--max-time', '60', '-o', destino, 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx']);
        const b = fs.readFileSync(destino);
        if (b.subarray(0, 2).toString() !== 'PK') throw new Error('no es un xlsx (¿se quitó el permiso de lectura?)');
        resumen.push('hojas/' + nombre + '.xlsx: ' + (b.length / 1024).toFixed(0) + ' KB');
        ok = true;
      } catch (e) { motivo = String(e.message).split(/\r?\n/)[0]; }
    }
    if (!ok) { fs.rmSync(destino, { force: true }); avisos.push('no se pudo copiar el Excel ' + nombre + ': ' + motivo); }
  }

  // Espejo incremental de los archivos del bucket (nunca borra).
  const ESP = path.join(BASE, 'storage-espejo');
  fs.mkdirSync(ESP, { recursive: true });
  const idxRuta = path.join(ESP, '_indice.json');
  const indice = fs.existsSync(idxRuta) ? JSON.parse(fs.readFileSync(idxRuta, 'utf8')) : {};
  const pendientes = objetos.filter(o => o.bucket_id === 'documentos' && !o.name.endsWith('/') && !o.name.split('/').includes('..')
    && (!indice[o.name] || indice[o.name].updated_at !== String(o.updated_at) || !fs.existsSync(path.join(ESP, ...o.name.split('/')))));
  let bajados = 0, fallidos = 0, bytes = 0;
  if (!SERVICE_KEY && pendientes.length) avisos.push('falta SUPABASE_SERVICE_ROLE_KEY en .env: no se copiaron los archivos');
  else {
    const cola = pendientes.slice();
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (cola.length) {
        const o = cola.shift();
        try {
          const url = SB_URL + '/storage/v1/object/documentos/' + o.name.split('/').map(encodeURIComponent).join('/');
          const r = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const b = Buffer.from(await r.arrayBuffer());
          const destino = path.join(ESP, ...o.name.split('/'));
          fs.mkdirSync(path.dirname(destino), { recursive: true });
          fs.writeFileSync(destino, b);
          indice[o.name] = { updated_at: String(o.updated_at), bytes: b.length };
          bajados++; bytes += b.length;
        } catch (e) { fallidos++; avisos.push('no se pudo copiar ' + o.name + ': ' + e.message); }
      }
    }));
    fs.writeFileSync(idxRuta, JSON.stringify(indice));
  }
  const enBase = new Set(objetos.map(o => o.name));
  const soloEnEspejo = Object.keys(indice).filter(n => !enBase.has(n)).length;
  resumen.push('storage-espejo: ' + bajados + ' archivos nuevos o cambiados (' + (bytes / 1048576).toFixed(1) + ' MB), '
    + (Object.keys(indice).length - bajados) + ' ya estaban, ' + fallidos + ' con error'
    + (soloEnEspejo ? ', ' + soloEnEspejo + ' que ya no están en la base (se conservan)' : ''));

  fs.writeFileSync(path.join(DEST, 'resumen.txt'),
    'Respaldo ' + d.toISOString() + '\n\n' + resumen.join('\n') + (avisos.length ? '\n\nAVISOS:\n' + avisos.join('\n') : '') + '\n');

  // Poda: quedan las últimas RETENER carpetas con fecha (y las marcadas _conservar.txt).
  const carpetas = fs.readdirSync(BASE).filter(n => /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(n) && fs.statSync(path.join(BASE, n)).isDirectory()).sort();
  const sobran = carpetas.slice(0, Math.max(0, carpetas.length - RETENER)).filter(n => !fs.existsSync(path.join(BASE, n, '_conservar.txt')));
  sobran.forEach(n => fs.rmSync(path.join(BASE, n), { recursive: true, force: true }));
  if (sobran.length) resumen.push('podados ' + sobran.length + ' respaldos viejos (se conservan los últimos ' + RETENER + ')');

  const filas = resumen.filter(x => /^public\.pacientes|^auth\.users/.test(x)).join(', ');
  registrar('OK ' + sello + ' · ' + filas + ' · ' + resumen.find(x => x.startsWith('storage-espejo')) + (avisos.length ? ' · AVISOS: ' + avisos.length : ''));
  console.log('Respaldo en ' + DEST + '\n\n' + resumen.join('\n') + (avisos.length ? '\n\nAVISOS:\n' + avisos.join('\n') : ''));
} catch (e) {
  registrar('ERROR ' + sello + ' · ' + (e && e.message || e));
  console.error('El respaldo falló: ' + (e && e.message || e));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
