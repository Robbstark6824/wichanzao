// ¿De dónde salió una paciente? Cruza la base, la hoja y los inicios de sesión.
const { Client } = require('pg');

const c = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432, database: 'postgres',
  user: 'postgres.xqphjvppfgwabfruyjae', password: 'Nomejodas682425@',
  ssl: { rejectUnauthorized: false }
});
const CSV = 'https://docs.google.com/spreadsheets/d/1nEBcVRH1o3_9luexxiV_ur-CupmRX_H6qeNn4BElxzU/export?format=csv';

(async () => {
  await c.connect();
  const q = async (t, s, p) => {
    console.log('\n=== ' + t + ' ===');
    try { const r = await c.query(s, p); console.log(JSON.stringify(r.rows, null, 1)); return r.rows; }
    catch (e) { console.log('ERR', e.message); return []; }
  };

  await q('Sesiones abiertas cerca del 27/08 05:12 UTC',
    `select u.email, u.created_at as cuenta_creada, u.last_sign_in_at
       from auth.users u order by u.last_sign_in_at desc nulls last limit 15`);

  await q('Sesiones activas registradas',
    `select s.created_at, s.updated_at, u.email
       from auth.sessions s join auth.users u on u.id = s.user_id
      order by s.created_at desc limit 15`);

  await q('Huella de origen: fecha_fase2 a medianoche = vino de la hoja; con hora = la puso la app',
    `select nombre, created_at, fecha_fase2, fecha_fase3, id_registro
       from pacientes order by created_at`);

  // --- Estructura de la hoja: ¿en qué bloque cae cada aparición? -----------
  console.log('\n=== Bloques de la hoja (dónde empieza cada uno) ===');
  const filas = (await (await fetch(CSV)).text()).split('\n');
  filas.forEach((l, i) => {
    const c0 = l.split(',')[0].replace(/"/g, '').trim().toUpperCase();
    if (c0 === 'N°' || c0 === 'Nº' || c0 === 'N' || /^N.?$/.test(c0) || l.toUpperCase().includes('APELLIDOS Y NOMBRES')) {
      console.log(' fila ' + (i + 1) + ' [encabezado]: ' + l.slice(0, 150));
    }
  });
  console.log('\n Total de filas en la hoja: ' + filas.length);

  await c.end();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
