// Reproduce, dentro de una transacción que SIEMPRE se deshace, el error que sale
// al borrar la fecha de cirugía de una paciente programada.
const { Client } = require('pg');

const c = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432, database: 'postgres',
  user: 'postgres.xqphjvppfgwabfruyjae', password: 'Nomejodas682425@',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();
  const p = (await c.query("select id, nombre, estado::text, fecha_cirugia, turno::text from pacientes where estado='programada' limit 1")).rows[0];
  if (!p) { console.log('No hay ninguna paciente programada.'); await c.end(); return; }
  console.log('Paciente de prueba:', p.nombre, '| estado:', p.estado, '| fecha:', p.fecha_cirugia);

  await c.query('BEGIN');

  console.log('\n1) Borrar la fecha dejando el estado en "programada":');
  try {
    await c.query('update pacientes set fecha_cirugia = null where id = $1', [p.id]);
    console.log('   (sin error — inesperado)');
  } catch (e) { console.log('   ✗', e.message); }

  await c.query('ROLLBACK');
  await c.query('BEGIN');

  console.log('\n2) Sacarla de programación primero, y luego borrar la fecha:');
  try {
    await c.query("update pacientes set estado = 'apta_para_sala' where id = $1", [p.id]);
    await c.query('update pacientes set fecha_cirugia = null, turno = null where id = $1', [p.id]);
    const r = (await c.query('select estado::text, fecha_cirugia, turno::text from pacientes where id = $1', [p.id])).rows[0];
    console.log('   ✓ funciona →', JSON.stringify(r));
  } catch (e) { console.log('   ✗', e.message); }

  await c.query('ROLLBACK');

  const fin = (await c.query('select estado::text, fecha_cirugia from pacientes where id = $1', [p.id])).rows[0];
  console.log('\nTras el ROLLBACK, la fila quedó intacta:', JSON.stringify(fin));
  await c.end();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
