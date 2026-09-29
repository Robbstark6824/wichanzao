// Prueba de permisos por servicio (sql/032), contra la base real, SIN guardar
// nada: cada caso corre dentro de una transacción que termina en ROLLBACK.
//
//   node tools/test-permisos-servicio.mjs
//
// Se hace pasar por usuarios reales con el mismo mecanismo que usa Supabase
// (rol `authenticated` + el JWT con su id). Para "usuario de Cirugía General"
// y "jefe de información" toma a un usuario de gineco que no es admin y, solo
// dentro de la transacción, le cambia el servicio o el rol.
import fs from 'fs';
import pg from 'pg';

const PASS = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^SUPABASE_DB_PASSWORD=(.+)$/m)[1].trim();
const c = new pg.Client({
  host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432, database: 'postgres',
  user: 'postgres.xqphjvppfgwabfruyjae', password: PASS, ssl: { rejectUnauthorized: false }
});
await c.connect();
const q = async (sql, p) => (await c.query(sql, p)).rows;

const admin = (await q(`SELECT id FROM workers WHERE is_admin LIMIT 1`))[0].id;
const comun = (await q(`SELECT id FROM workers WHERE NOT is_admin AND servicio = 'ginecologia' LIMIT 1`))[0].id;
const totalGineco = +(await q(`SELECT count(*) FROM pacientes WHERE servicio = 'ginecologia'`))[0].count;
const totalCG = +(await q(`SELECT count(*) FROM pacientes WHERE servicio = 'cirugia_general'`))[0].count;
const total = totalGineco + totalCG;
const unaGineco = (await q(`SELECT id FROM pacientes WHERE servicio = 'ginecologia' LIMIT 1`))[0].id;

let fallas = 0;
function ver(desc, ok, detalle) {
  if (!ok) fallas++;
  console.log((ok ? '  OK    ' : '  FALLA ') + desc + (detalle !== undefined ? '   ->  ' + detalle : ''));
}

// Corre fn(consulta) como el usuario `uid`, después de preparar el escenario
// como postgres. Todo se deshace al final.
async function como(uid, preparar, fn) {
  await c.query('BEGIN');
  try {
    if (preparar) await c.query(preparar, [uid]);
    const claims = JSON.stringify({ sub: uid, role: 'authenticated' });
    await c.query(`SELECT set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [claims, uid]);
    await c.query('SET LOCAL ROLE authenticated');
    await fn(async (sql, p) => {
      await c.query('SAVEPOINT s');
      try { const r = await c.query(sql, p); await c.query('RELEASE SAVEPOINT s'); return r; }
      catch (e) { await c.query('ROLLBACK TO SAVEPOINT s'); return { error: e.message }; }
    });
  } finally {
    await c.query('ROLLBACK');
  }
}
const cuenta = r => r.error ? 'error: ' + r.error : +r.rows[0].count;

console.log('Pacientes en la base: ' + totalGineco + ' de ginecología, ' + totalCG + ' de Cirugía General\n');

console.log('Usuario de GINECOLOGÍA (no admin)');
await como(comun, null, async db => {
  ver('ve a todas las pacientes de gineco', cuenta(await db(`SELECT count(*) FROM pacientes WHERE servicio = 'ginecologia'`)) === totalGineco);
  const otros = cuenta(await db(`SELECT count(*) FROM pacientes WHERE servicio <> 'ginecologia'`));
  ver('NO ve pacientes de Cirugía General', otros === 0, otros);
  const u = await db(`UPDATE pacientes SET nombre = nombre WHERE id = $1`, [unaGineco]);
  ver('puede editar una paciente de gineco', !u.error && u.rowCount === 1, u.error || u.rowCount);
  const i = await db(`INSERT INTO pacientes (dni, nombre) VALUES ('00000001', 'PRUEBA NO GUARDAR') RETURNING servicio`);
  ver('un paciente nuevo queda en ginecología', !i.error && i.rows[0].servicio === 'ginecologia', i.error || i.rows[0].servicio);
  ver('ve el historial de estados', cuenta(await db(`SELECT count(*) FROM historial_estados`)) > 0);
  ver('ve las recetas', cuenta(await db(`SELECT count(*) FROM recetas_plantillas`)) > 0);
  const w = await db(`UPDATE workers SET servicio = 'cirugia_general' WHERE id = auth.uid()`);
  ver('NO puede cambiarse de servicio', !!w.error, w.error ? w.error.slice(0, 60) : 'se cambió');
});

console.log('\nUsuario de CIRUGÍA GENERAL');
await como(comun, `UPDATE workers SET servicio = 'cirugia_general' WHERE id = $1`, async db => {
  const n = cuenta(await db(`SELECT count(*) FROM pacientes WHERE servicio = 'ginecologia'`));
  ver('NO ve a ninguna paciente de gineco', n === 0, n);
  const suyos = cuenta(await db(`SELECT count(*) FROM pacientes`));
  ver('ve a las de su servicio', suyos === totalCG, suyos + ' de ' + totalCG);
  const u = await db(`UPDATE pacientes SET nombre = nombre WHERE id = $1`, [unaGineco]);
  ver('NO puede editar una paciente de gineco', !!u.error || u.rowCount === 0, u.error || u.rowCount + ' filas');
  const d = await db(`DELETE FROM pacientes WHERE id = $1`, [unaGineco]);
  ver('NO puede borrar una paciente de gineco', !!d.error || d.rowCount === 0, d.error || d.rowCount + ' filas');
  const h = cuenta(await db(`SELECT count(*) FROM historial_estados`));
  ver('NO ve el historial de gineco', h === 0, h);
  const r = cuenta(await db(`SELECT count(*) FROM recetas_plantillas`));
  ver('NO ve las recetas de gineco', r === 0, r);
  const i = await db(`INSERT INTO pacientes (dni, nombre) VALUES ('00000002', 'PRUEBA NO GUARDAR') RETURNING servicio`);
  ver('un paciente nuevo queda en cirugía general', !i.error && i.rows[0].servicio === 'cirugia_general', i.error || i.rows[0].servicio);
  const g = await db(`INSERT INTO pacientes (dni, nombre, servicio) VALUES ('00000003', 'PRUEBA NO GUARDAR', 'ginecologia')`);
  ver('NO puede registrar un paciente en gineco', !!g.error, g.error ? g.error.slice(0, 60) : 'se registró');
});

console.log('\nJEFE DE INFORMACIÓN');
await como(comun, `UPDATE workers SET rol = 'jefe_info' WHERE id = $1`, async db => {
  ver('ve a todas las pacientes (los dos servicios)', cuenta(await db(`SELECT count(*) FROM pacientes`)) === total, total);
  const u = await db(`UPDATE pacientes SET nombre = nombre WHERE id = $1`, [unaGineco]);
  ver('NO puede editar', !!u.error || u.rowCount === 0, u.error || u.rowCount + ' filas');
  const i = await db(`INSERT INTO pacientes (dni, nombre) VALUES ('00000004', 'PRUEBA NO GUARDAR')`);
  ver('NO puede registrar pacientes', !!i.error, i.error ? i.error.slice(0, 60) : 'se registró');
});

console.log('\nCUENTA PENDIENTE (recién registrada, sin aprobar)');
await como(comun, `UPDATE workers SET aprobado = false WHERE id = $1`, async db => {
  const n = cuenta(await db(`SELECT count(*) FROM pacientes`));
  ver('NO ve pacientes', n === 0, n);
  ver('NO ve recetas', cuenta(await db(`SELECT count(*) FROM recetas_plantillas`)) === 0);
  ver('NO ve la cola de impresión', cuenta(await db(`SELECT count(*) FROM impresiones`)) === 0);
  const i = await db(`INSERT INTO pacientes (dni, nombre) VALUES ('00000005', 'PRUEBA NO GUARDAR')`);
  ver('NO puede registrar pacientes', !!i.error, i.error ? i.error.slice(0, 60) : 'se registró');
  const a = await db(`UPDATE workers SET aprobado = true WHERE id = auth.uid()`);
  ver('NO puede aprobarse a sí misma (columna)', !!a.error, a.error ? a.error.slice(0, 60) : 'se aprobó');
  const r = await db(`SELECT admin_aprobar_worker(auth.uid(), true)`);
  ver('NO puede aprobarse a sí misma (función)', !!r.error, r.error ? r.error.slice(0, 60) : 'se aprobó');
  const yo = await db(`SELECT aprobado FROM workers WHERE id = auth.uid()`);
  ver('puede leer que está pendiente (para la pantalla de espera)', !yo.error && yo.rows[0].aprobado === false, yo.error || yo.rows[0].aprobado);
});

console.log('\nADMIN aprueba una cuenta pendiente');
await como(admin, null, async db => {
  const r = await db(`SELECT admin_aprobar_worker($1, true)`, [comun]);
  ver('el admin puede aprobar', !r.error, r.error);
  const s = await db(`SELECT admin_aprobar_worker(auth.uid(), false)`);
  ver('el admin no puede quitarse la aprobación a sí mismo', !!s.error, s.error ? s.error.slice(0, 60) : 'se la quitó');
});

console.log('\nADMIN');
await como(admin, null, async db => {
  ver('ve a todas las pacientes (los dos servicios)', cuenta(await db(`SELECT count(*) FROM pacientes`)) === total, total);
  const u = await db(`UPDATE pacientes SET nombre = nombre WHERE id = $1`, [unaGineco]);
  ver('puede editar', !u.error && u.rowCount === 1, u.error || u.rowCount);
});

console.log('\nSIN SESIÓN (anon)');
await c.query('BEGIN');
await c.query('SET LOCAL ROLE anon');
try { const r = await c.query(`SELECT count(*) FROM pacientes`); ver('no ve pacientes', +r.rows[0].count === 0, r.rows[0].count); }
catch (e) { ver('no ve pacientes', true, 'sin permiso'); }
await c.query('ROLLBACK');

const quedan = +(await q(`SELECT count(*) FROM pacientes WHERE nombre = 'PRUEBA NO GUARDAR'`))[0].count;
const rolRaro = +(await q(`SELECT count(*) FROM workers WHERE rol <> 'medico' OR servicio <> 'ginecologia' OR NOT aprobado`))[0].count;
ver('\nno quedó nada de las pruebas en la base', quedan === 0 && rolRaro === 0, quedan + ' pacientes, ' + rolRaro + ' usuarios alterados');

await c.end();
console.log('\n' + (fallas ? fallas + ' FALLA(S)' : 'Todo en orden.'));
process.exitCode = fallas ? 1 : 0;
