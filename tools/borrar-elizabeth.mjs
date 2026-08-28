// Elizabeth Calderón Otiniano ya fue operada (consta en el bloque histórico de
// la hoja, 24/02/2026, y lo confirmó la familia). Su ficha "actual" era la
// paciente de prueba de test(), con fechas de agosto inventadas.
//
// Se borra de la lista de espera y de los DOS bloques GERESA. NO se toca el
// bloque histórico: ahí queda su registro real, que es donde corresponde.
import fs from 'fs';

const SB = 'https://xqphjvppfgwabfruyjae.supabase.co';
const KEY = fs.readFileSync('.env', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY=(\S+)/)[1];
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbxH2ZHmkZ9d68nFD7Sww40Shbv0lQ7FibzGfeRze48Powy5qj-ygD8rYPoCZy4qiAxEhw/exec';
const TOKEN = 'WZ-GERESA-2026-Kx7mQ2p9';
const DNI = '70515665';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

const rest = async (path, opts = {}) => {
  const r = await fetch(SB + '/rest/v1/' + path, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(path + ' → HTTP ' + r.status + ' ' + t);
  return t ? JSON.parse(t) : null;
};

const [antes] = await rest('pacientes?dni=eq.' + DNI + '&select=id,nombre,estado,id_registro,fecha_cirugia');
if (!antes) { console.log('Ya no está en la base. Nada que borrar.'); process.exit(0); }
console.log('A borrar →', JSON.stringify(antes));

// 1) Las dos hojas primero: si Google falla, la ficha sigue en la app y se puede reintentar.
const resp = await fetch(SHEET_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ token: TOKEN, accion: 'borrar', dni: DNI })
});
const salida = await resp.text();
console.log('HOJAS   →', salida);
if (salida.indexOf('"ok":true') === -1) {
  console.log('\nLas hojas no confirmaron el borrado. NO se toca la base.');
  process.exit(1);
}

// 2) La base.
await rest('pacientes?dni=eq.' + DNI, { method: 'DELETE' });
const queda = await rest('pacientes?dni=eq.' + DNI + '&select=id');
console.log('BASE    →', queda.length ? 'SIGUE AHÍ (revisar)' : 'borrada');

// 3) Estado final de la lista.
const todas = await rest('pacientes?select=nombre,estado,id_registro&order=id_registro');
console.log('\nLista de espera (' + todas.length + '):');
todas.forEach(p => console.log('  ' + String(p.id_registro ?? '—').padStart(3) + ' · ' + p.nombre + ' · ' + p.estado));

const repes = {};
todas.forEach(p => { if (p.id_registro != null) repes[p.id_registro] = (repes[p.id_registro] || 0) + 1; });
const dup = Object.keys(repes).filter(k => repes[k] > 1);
console.log('\nID registro duplicados: ' + (dup.length ? dup.join(', ') : 'ninguno'));
